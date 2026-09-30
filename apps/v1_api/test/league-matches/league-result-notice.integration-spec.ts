import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { GameResultOfficialProjectionService } from '../../src/game-operations/game-result-official-projection.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

/**
 * Task 180 G7 — 리그 결과 확정 알림은 양 팀 팀장·매니저 + **그 공식 결과의 출전자**(결과 참가자 행)가 받는다.
 * 명단에서 빠져 결과 행이 없는 선수, 확정 전에 팀을 나간 출전자, 출전하지 않은 팀원은 받지 않는다.
 * 확정은 league-completion-projection 스펙과 같은 "합성 OFFICIAL 리비전 + 실제 프로젝션 핸들러" 로 만든다.
 */
const suiteId = randomUUID().slice(0, 8);
const id = (key: string) => `g7-result-${key}-${suiteId}`;

describe('리그 결과 확정 알림 수신자·문구 (Task 180 G7)', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  const users = ['admin', 'captain-h', 'scorer-h', 'dropped-h', 'left-h', 'captain-a', 'player-a', 'bench-a'];

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await prisma.v1User.createMany({
      data: users.map((key) => ({
        id: id(key),
        email: `${id(key)}@integration.test`,
        onboardingStatus: 'completed' as const,
        accountStatus: 'active' as const,
        phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
      })),
    });
    const terms = app.get(ManagedTermsRuntimeService);
    const signupTerms = await terms.currentSignupTerms();
    await terms.acceptSignupTerms(id('admin'), signupTerms.items.filter((item) => item.requirement === 'required').map((item) => item.documentId));
    await prisma.v1AdminUser.create({ data: { userId: id('admin'), adminRole: 'owner' } });
  });

  afterAll(async () => cleanup?.());

  it('팀장·매니저와 출전자가 받는 사람 팀 기준 스코어·승패(+개인 기록)를 받고, 다시 확정돼도 한 건이다', async () => {
    const sport = await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } });
    const region = await prisma.v1Region.create({ data: { code: `g7-result-region-${suiteId}`, name: 'G7 결과 지역', level: 2 } });
    const teamH = await prisma.v1Team.create({ data: { ownerUserId: id('captain-h'), sportId: sport.id, regionId: region.id, name: `마포 FC ${suiteId}` } });
    const teamA = await prisma.v1Team.create({ data: { ownerUserId: id('captain-a'), sportId: sport.id, regionId: region.id, name: `합정 유나이티드 ${suiteId}` } });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: teamH.id, userId: id('captain-h'), role: 'owner' },
        { teamId: teamH.id, userId: id('scorer-h') },
        { teamId: teamH.id, userId: id('dropped-h') },
        { teamId: teamH.id, userId: id('left-h') },
        { teamId: teamA.id, userId: id('captain-a'), role: 'owner' },
        { teamId: teamA.id, userId: id('player-a') },
        { teamId: teamA.id, userId: id('bench-a') },
      ],
    });

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', id('admin'))
      .send({
        title: `결과 알림 리그 ${suiteId}`,
        sportId: sport.id,
        regionId: region.id,
        startsOn: new Date().toISOString(),
        endsOn: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        teamIds: [teamH.id, teamA.id],
      });
    expect(createRes.status).toBe(201);
    const leagueId = createRes.body.data.leagueId as string;
    const registrations = await prisma.v1TournamentRegistration.findMany({ where: { tournamentId: leagueId } });
    const registrationOf = (teamId: string) => registrations.find((row) => row.teamId === teamId)!.id;
    await prisma.v1TournamentPlayer.createMany({
      data: [
        ...['captain-h', 'scorer-h', 'dropped-h', 'left-h'].map((key) => ({ registrationId: registrationOf(teamH.id), userId: id(key), realName: key })),
        ...['captain-a', 'player-a'].map((key) => ({ registrationId: registrationOf(teamA.id), userId: id(key), realName: key })),
      ],
    });
    const fixturesRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', id('admin'))
      .send({ weeksCount: 1 });
    expect(fixturesRes.status).toBe(201);
    const teamMatchId = fixturesRes.body.data.teamMatchIds[0] as string;

    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId }, include: { sides: true } });
    // 사이드마다 최신 라인업의 참가자 — 옛 revision 의 참가자 행은 지워지지 않고 남는다.
    const lineups = await prisma.v1GameLineup.findMany({ where: { gameId: game.id, invalidatedAt: null }, orderBy: { revision: 'desc' } });
    const latestLineupIds = game.sides.map((side) => lineups.find((lineup) => lineup.sideId === side.id)!.id);
    const participants = await prisma.v1GameParticipant.findMany({ where: { lineupId: { in: latestLineupIds } } });
    const participantOf = (key: string) => participants.find((row) => row.userId === id(key))!;
    const homeIsH = game.sides.find((side) => side.sideKey === 'HOME')!.teamId === teamH.id;
    // 마포 FC 가 2 : 1 로 이긴다 — 어느 쪽이 홈이든 같은 경기 결과가 되게 점수 방향을 맞춘다.
    const score = homeIsH ? { home: 2, away: 1 } : { home: 1, away: 2 };
    const [homeName, awayName] = homeIsH ? [teamH.name, teamA.name] : [teamA.name, teamH.name];
    const headline = `결과 알림 리그 ${suiteId} 1주차 · ${homeName} ${score.home} : ${score.away} ${awayName}`;

    // 확정 전에 팀을 나간 출전자 — 결과 행은 남지만 알림은 받지 않는다.
    await prisma.v1TeamMembership.updateMany({ where: { teamId: teamH.id, userId: id('left-h') }, data: { status: 'left' } });
    const officialAt = new Date();
    // 결과 참가자 행은 DRAFT 리비전에만 붙는다(DB 트리거) — 붙인 뒤 OFFICIAL 로 올린다.
    const revision = await prisma.v1GameResultRevision.create({
      data: {
        gameId: game.id, revision: 1, state: 'DRAFT', score, eventsHash: `g7-result-${randomUUID()}`,
        createdByActorType: 'SYSTEM', createdBySystemActor: 'G7_RESULT_NOTICE_TEST',
      },
    });
    // dropped-h 는 명단에서 빠져 결과 행이 없다.
    const played: Array<[string, number, number]> = [['captain-h', 0, 1], ['scorer-h', 2, 0], ['left-h', 0, 0], ['captain-a', 0, 0], ['player-a', 1, 0]];
    await prisma.v1GameResultParticipant.createMany({
      data: played.map(([key, goals, assists]) => {
        const participant = participantOf(key);
        return { resultRevisionId: revision.id, participantId: participant.id, sideId: participant.sideId, started: true, goals, assists, cards: [] };
      }),
    });
    await prisma.v1GameResultRevision.update({ where: { id: revision.id }, data: { state: 'OFFICIAL', submittedAt: officialAt, officialAt } });
    await prisma.v1Game.update({ where: { id: game.id }, data: { currentOfficialRevisionId: revision.id } });

    const projection = new GameResultOfficialProjectionService();
    const officialize = () => prisma.$transaction((tx) => projection.handler({ payload: { revisionId: revision.id } } as never, tx));
    await officialize();
    await officialize(); // 재시도 — 같은 (경기, 수신자) 에 두 번째 행이 생기면 안 된다.

    const rows = await prisma.v1Notification.findMany({ where: { businessKey: { startsWith: `team-match-completed:${teamMatchId}:` } } });
    const bodyOf = new Map(rows.map((row) => [row.recipientUserId, row.body]));
    expect([...bodyOf.keys()].sort()).toEqual(['captain-a', 'captain-h', 'player-a', 'scorer-h'].map(id).sort());
    expect(rows).toHaveLength(4);
    expect(bodyOf.get(id('scorer-h'))).toBe(`${headline} · 승리. 내 기록 2골이에요.`);
    expect(bodyOf.get(id('captain-h'))).toBe(`${headline} · 승리. 내 기록 1도움이에요.`);
    expect(bodyOf.get(id('captain-a'))).toBe(`${headline} · 패배.`);
    expect(bodyOf.get(id('player-a'))).toBe(`${headline} · 패배. 내 기록 1골이에요.`);
    expect(rows.every((row) => row.title === '경기 결과가 확정됐어요' && row.deepLink === `/team-matches/${teamMatchId}/result`)).toBe(true);
  });
});

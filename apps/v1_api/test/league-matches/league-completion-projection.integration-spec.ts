import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { GameResultOfficialProjectionService } from '../../src/game-operations/game-result-official-projection.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

// R6/D-3: 리그의 모든(취소되지 않은) 대진이 공식 결과를 확정 지으면 V1League.state가
// 자동으로 completed로 전이한다. 전이 훅은 LeagueCompletionProjectionService이고,
// GameResultOfficialProjectionService.handler의 트랜잭션 안에서 실행된다 --
// game-result-league-escalation.integration-spec.ts와 동일하게 그 핸들러를 직접
// 호출해 실제 프로덕션 경로(outbox 재시도까지)를 있는 그대로 검증한다.
const suiteId = randomUUID().slice(0, 8);
const ownerUserId = `t4-league-completion-owner-${suiteId}`;

describe('리그 자동 completed 전이 (R6)', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let sportId: string;
  let regionId: string;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await prisma.v1User.create({
      data: {
        id: ownerUserId,
        email: `${ownerUserId}@integration.test`,
        onboardingStatus: 'completed',
        phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        accountStatus: 'active',
      },
    });
    const termsService = app.get(ManagedTermsRuntimeService);
    const signupTerms = await termsService.currentSignupTerms();
    await termsService.acceptSignupTerms(
      ownerUserId,
      signupTerms.items.filter((item) => item.requirement === 'required').map((item) => item.documentId),
    );
    await prisma.v1AdminUser.create({ data: { userId: ownerUserId, adminRole: 'owner' } });
    const sport = await prisma.v1Sport.upsert({
      where: { code: 'futsal' },
      update: {},
      create: { code: 'futsal', name: '풋살' },
    });
    sportId = sport.id;
    const region = await prisma.v1Region.create({
      data: { code: `t4-league-completion-region-${suiteId}`, name: 'T4 리그 완료 테스트 지역', level: 2 },
    });
    regionId = region.id;
  });

  afterAll(async () => cleanup?.());

  // 실제 officialize 커맨드 대신, league-match-public.integration-spec.ts와 동일한
  // "합성 OFFICIAL 리비전" 패턴으로 game.currentOfficialRevisionId를 채운 뒤 실제
  // GameResultOfficialProjectionService.handler를 그 트랜잭션 위에서 그대로 실행한다.
  async function officializeFixture(teamMatchId: string, score: { home: number; away: number }, officialAt: Date) {
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    const revision = await prisma.v1GameResultRevision.create({
      data: {
        gameId: game.id,
        revision: 1,
        state: 'OFFICIAL',
        score,
        eventsHash: `t4-league-completion-hash-${randomUUID()}`,
        createdByActorType: 'SYSTEM',
        createdBySystemActor: 'T4_LEAGUE_COMPLETION_TEST',
        submittedAt: officialAt,
        officialAt,
      },
    });
    await prisma.v1Game.update({ where: { id: game.id }, data: { currentOfficialRevisionId: revision.id } });
    const officialProjection = new GameResultOfficialProjectionService();
    await prisma.$transaction(async (tx) => {
      await officialProjection.handler({ payload: { revisionId: revision.id } } as never, tx);
    });
    return revision;
  }

  it('마지막 남은 대진까지 공식 결과가 확정되면 리그가 자동으로 completed로 전이된다', async () => {
    const teamA = await prisma.v1Team.create({ data: { ownerUserId, sportId, regionId, name: `completion-team-a-${suiteId}` } });
    const teamB = await prisma.v1Team.create({ data: { ownerUserId, sportId, regionId, name: `completion-team-b-${suiteId}` } });

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', ownerUserId)
      .send({
        title: '자동완료 리그',
        sportId,
        regionId,
        startsOn: new Date().toISOString(),
        endsOn: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        teamIds: [teamA.id, teamB.id],
      });
    const leagueId = createRes.body.data.leagueId;
    const fixturesRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', ownerUserId)
      .send({ weeksCount: 2 });
    expect(fixturesRes.body.data.teamMatchIds).toHaveLength(2);
    const [fixture1Id, fixture2Id] = fixturesRes.body.data.teamMatchIds;

    // 대진 생성 자체가 이미 리그를 active로 전이시킨다(league-match-admin.service.ts).
    expect((await prisma.v1League.findUniqueOrThrow({ where: { id: leagueId } })).state).toBe('active');

    // 대진 1개만 확정 -- 아직 completed로 전이되면 안 된다.
    await officializeFixture(fixture1Id, { home: 2, away: 1 }, new Date('2026-08-10T12:00:00.000Z'));
    expect((await prisma.v1League.findUniqueOrThrow({ where: { id: leagueId } })).state).toBe('active');

    // 남은 마지막 대진까지 확정 -- 자동으로 completed 전이 + 시스템 상태변경 로그 1건.
    await officializeFixture(fixture2Id, { home: 0, away: 0 }, new Date('2026-08-17T12:00:00.000Z'));
    const league = await prisma.v1League.findUniqueOrThrow({ where: { id: leagueId } });
    expect(league.state).toBe('completed');

    const statusLog = await prisma.v1StatusChangeLog.findMany({
      where: { targetType: 'league_match', targetId: leagueId, toStatus: 'completed' },
    });
    expect(statusLog).toHaveLength(1);
    expect(statusLog[0].fromStatus).toBe('active');
    expect(statusLog[0].actorType).toBe('system');
  });

  it('취소된 대진은 완료 판정에서 제외된다 -- 취소되지 않은 나머지 대진만 확정돼도 completed로 전이한다', async () => {
    const teamA = await prisma.v1Team.create({ data: { ownerUserId, sportId, regionId, name: `completion-cancel-a-${suiteId}` } });
    const teamB = await prisma.v1Team.create({ data: { ownerUserId, sportId, regionId, name: `completion-cancel-b-${suiteId}` } });

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', ownerUserId)
      .send({
        title: '취소포함 리그',
        sportId,
        regionId,
        startsOn: new Date().toISOString(),
        endsOn: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        teamIds: [teamA.id, teamB.id],
      });
    const leagueId = createRes.body.data.leagueId;
    const fixturesRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', ownerUserId)
      .send({ weeksCount: 2 });
    const [fixture1Id, fixture2Id] = fixturesRes.body.data.teamMatchIds;

    await prisma.v1TeamMatch.update({ where: { id: fixture2Id }, data: { status: 'cancelled', cancelledAt: new Date() } });

    await officializeFixture(fixture1Id, { home: 1, away: 0 }, new Date('2026-08-11T12:00:00.000Z'));

    const league = await prisma.v1League.findUniqueOrThrow({ where: { id: leagueId } });
    expect(league.state).toBe('completed');
  });

  it('completed 전이는 멱등하다 -- 같은 리비전에 대해 official 프로젝션 핸들러가 재시도로 다시 불려도 상태변경 로그가 중복되지 않는다', async () => {
    const teamA = await prisma.v1Team.create({ data: { ownerUserId, sportId, regionId, name: `completion-idem-a-${suiteId}` } });
    const teamB = await prisma.v1Team.create({ data: { ownerUserId, sportId, regionId, name: `completion-idem-b-${suiteId}` } });

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', ownerUserId)
      .send({
        title: '멱등성 리그',
        sportId,
        regionId,
        startsOn: new Date().toISOString(),
        endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        teamIds: [teamA.id, teamB.id],
      });
    const leagueId = createRes.body.data.leagueId;
    const fixturesRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', ownerUserId)
      .send({ weeksCount: 1 });
    const [fixtureId] = fixturesRes.body.data.teamMatchIds;

    const revision = await officializeFixture(fixtureId, { home: 3, away: 0 }, new Date('2026-08-05T12:00:00.000Z'));
    expect((await prisma.v1League.findUniqueOrThrow({ where: { id: leagueId } })).state).toBe('completed');

    // GAME_RESULT_OFFICIAL 핸들러는 실제 운영에서도 outbox 재시도로 같은 리비전에 대해
    // 두 번 이상 불릴 수 있다(facts.project 자체가 ON CONFLICT DO NOTHING으로 멱등하게
    // 설계돼 있다) -- 리그 완료 후처리도 그 재시도 경로 위에서 안전해야 한다.
    const officialProjection = new GameResultOfficialProjectionService();
    await prisma.$transaction(async (tx) => {
      await officialProjection.handler({ payload: { revisionId: revision.id } } as never, tx);
    });

    const league = await prisma.v1League.findUniqueOrThrow({ where: { id: leagueId } });
    expect(league.state).toBe('completed');
    const statusLogCount = await prisma.v1StatusChangeLog.count({
      where: { targetType: 'league_match', targetId: leagueId, toStatus: 'completed' },
    });
    expect(statusLogCount).toBe(1);
  });
});

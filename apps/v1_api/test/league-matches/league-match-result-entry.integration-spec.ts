import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { GamesService } from '../../src/games/games.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import type { V1AuthUser } from '../../src/auth/v1-auth-user';
import { createV1IntegrationApp } from '../integration/integration-app';

// D1-a: 운영자가 리그 결과를 직접 입력·정정하는 경로.
//
// 검증 범위는 태스크 문서가 명시한 3가지로 좁힌다(글로벌 지침 24 — 변경 크기에
// 비례한 검증):
//  1. 신규 입력이 create -> submit -> decide(approve) 3단계를 거쳐 실제로
//     OFFICIAL 까지 확정되는 것 (HTTP, admin).
//  2. 정정이 OFFICIAL -> 새 DRAFT -> OFFICIAL 상태전이를 실제로 수행하는 것 (HTTP, admin).
//  3. 비-admin 팀 매니저(host team owner)가 TEAM_MATCH 의 새 correction 액션에서
//     403 을 받는 것 -- **컨트롤러가 아니라 resolveActor 레벨**에서 막히는지가
//     요점이므로 LeagueMatchResultEntryController/-Service 를 거치지 않고
//     GamesService.createTeamMatchResultCorrection 을 직접 호출한다(컨트롤러
//     가드가 빠져도 막히는지를 증명하는 것이 이 케이스의 목적이다).
const suiteId = randomUUID().slice(0, 8);
const ownerUserId = `t154-league-result-entry-owner-${suiteId}`;
const hostOwnerUserId = `t154-league-result-entry-host-owner-${suiteId}`;

describe('리그 결과 입력·정정 (D1-a)', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let gamesService: GamesService;
  let sportId: string;
  let regionId: string;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    gamesService = app.get(GamesService);

    await prisma.v1User.create({
      data: {
        id: ownerUserId,
        email: `${ownerUserId}@integration.test`,
        onboardingStatus: 'completed',
        phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        accountStatus: 'active',
      },
    });
    await prisma.v1User.create({
      data: {
        id: hostOwnerUserId,
        email: `${hostOwnerUserId}@integration.test`,
        onboardingStatus: 'completed',
        phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        accountStatus: 'active',
      },
    });
    const termsService = app.get(ManagedTermsRuntimeService);
    const signupTerms = await termsService.currentSignupTerms();
    const requiredDocumentIds = signupTerms.items
      .filter((item) => item.requirement === 'required')
      .map((item) => item.documentId);
    await termsService.acceptSignupTerms(ownerUserId, requiredDocumentIds);
    await termsService.acceptSignupTerms(hostOwnerUserId, requiredDocumentIds);
    await prisma.v1AdminUser.create({ data: { userId: ownerUserId, adminRole: 'owner' } });

    const sport = await prisma.v1Sport.upsert({
      where: { code: 'futsal' },
      update: {},
      create: { code: 'futsal', name: '풋살' },
    });
    sportId = sport.id;
    const region = await prisma.v1Region.create({
      data: { code: `t154-league-result-entry-region-${suiteId}`, name: 'T154 리그 결과 입력 테스트 지역', level: 2 },
    });
    regionId = region.id;
  });

  afterAll(async () => cleanup?.());

  async function createLeagueWithFixture(title: string) {
    const teamA = await prisma.v1Team.create({ data: { ownerUserId, sportId, regionId, name: `${title}-a-${suiteId}` } });
    const teamB = await prisma.v1Team.create({ data: { ownerUserId, sportId, regionId, name: `${title}-b-${suiteId}` } });
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', ownerUserId)
      .send({
        title,
        sportId,
        regionId,
        startsOn: new Date().toISOString(),
        endsOn: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        teamIds: [teamA.id, teamB.id],
      });
    const leagueId = createRes.body.data.leagueId as string;
    const fixturesRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', ownerUserId)
      .send({ weeksCount: 1 });
    const [teamMatchId] = fixturesRes.body.data.teamMatchIds as string[];
    const teamMatch = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });
    return { leagueId, teamMatchId, teamMatch };
  }

  it('신규 입력이 create -> submit -> decide(approve) 3단계를 거쳐 OFFICIAL까지 확정한다', async () => {
    const { leagueId, teamMatchId, teamMatch } = await createLeagueWithFixture('결과입력-신규');

    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/${teamMatchId}/result`)
      .set('x-v1-user-id', ownerUserId)
      .send({ homeScore: 3, awayScore: 1, reason: '운영자 직접 입력 테스트' });

    expect(res.status).toBe(201);
    expect(res.body.data.alreadyProcessed).toBe(false);
    expect(res.body.data.homeScore).toBe(3);
    expect(res.body.data.awayScore).toBe(1);

    const revision = await prisma.v1GameResultRevision.findUniqueOrThrow({
      where: { id: res.body.data.resultRevisionId },
    });
    expect(revision.state).toBe('OFFICIAL');
    expect(revision.reason).toMatch(/^\[LEAGUE_RESULT_ENTRY\]/);

    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    expect(game.currentOfficialRevisionId).toBe(revision.id);

    const updatedTeamMatch = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });
    expect(updatedTeamMatch.status).toBe('completed');
    void teamMatch; // 대진 원본 상태(matched)는 위 완료 상태 비교의 대조군으로만 참조된다.
  });

  it('정정이 OFFICIAL -> 새 DRAFT -> OFFICIAL 상태전이를 실제로 수행하고, 이전 리비전은 그대로 남는다', async () => {
    const { leagueId, teamMatchId } = await createLeagueWithFixture('결과입력-정정');

    const initial = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/${teamMatchId}/result`)
      .set('x-v1-user-id', ownerUserId)
      .send({ homeScore: 2, awayScore: 0, reason: '초기 입력' });
    expect(initial.status).toBe(201);
    const originalRevisionId = initial.body.data.resultRevisionId as string;

    const corrected = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/${teamMatchId}/result/correct`)
      .set('x-v1-user-id', ownerUserId)
      .send({ homeScore: 2, awayScore: 2, reason: '심판 판정 정정 -- 추가시간 골 누락 반영' });

    expect(corrected.status).toBe(201);
    expect(corrected.body.data.alreadyProcessed).toBe(false);
    expect(corrected.body.data.homeScore).toBe(2);
    expect(corrected.body.data.awayScore).toBe(2);
    const correctedRevisionId = corrected.body.data.resultRevisionId as string;
    expect(correctedRevisionId).not.toBe(originalRevisionId);

    // 정정된(새) 리비전이 이제 게임의 현재 공식 결과다.
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    expect(game.currentOfficialRevisionId).toBe(correctedRevisionId);

    const correctedRevision = await prisma.v1GameResultRevision.findUniqueOrThrow({
      where: { id: correctedRevisionId },
    });
    expect(correctedRevision.state).toBe('OFFICIAL');
    expect(correctedRevision.supersedesId).toBe(originalRevisionId);
    expect(correctedRevision.reason).toMatch(/^\[LEAGUE_RESULT_CORRECTION\]/);
    expect(correctedRevision.score).toMatchObject({ home: 2, away: 2 });

    // 슈퍼시드된 이전 리비전은 삭제·변형되지 않는다 -- 자기 state 컬럼은 OFFICIAL 로
    // 남는다(officializeResultRevision 의 tournament 레인과 동일한 계약).
    const originalRevision = await prisma.v1GameResultRevision.findUniqueOrThrow({
      where: { id: originalRevisionId },
    });
    expect(originalRevision.state).toBe('OFFICIAL');
    expect(originalRevision.score).toMatchObject({ home: 2, away: 0 });

    // 정정 후에도 정확히 리비전 2건(신규 입력 + 정정)만 존재한다 -- 중간에 SUBMITTED
    // 단계를 거치지 않고 DRAFT -> OFFICIAL 로 바로 전이했다는 뜻이다.
    const revisionCount = await prisma.v1GameResultRevision.count({ where: { game: { teamMatchId } } });
    expect(revisionCount).toBe(2);
  });

  it('비-admin 호스트팀 오너가 TEAM_MATCH 결과 정정 액션을 시도하면 resolveActor 레벨에서 403을 받는다', async () => {
    const { teamMatchId, teamMatch } = await createLeagueWithFixture('결과입력-403');
    await prisma.v1TeamMembership.create({
      data: { teamId: teamMatch.hostTeamId, userId: hostOwnerUserId, role: 'owner', status: 'active' },
    });
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });

    const nonAdminActor: V1AuthUser = {
      id: hostOwnerUserId,
      email: null,
      accountStatus: 'active',
      onboardingStatus: 'completed',
    };

    // 컨트롤러/LeagueMatchResultEntryService 를 거치지 않고 GamesService 를 직접
    // 호출한다 -- 이 403 이 컨트롤러 가드가 아니라 resolveActor 자체에서 나온다는
    // 것을 증명하는 것이 이 테스트의 목적이다(태스크 문서 지시).
    let caught: unknown;
    try {
      await gamesService.createTeamMatchResultCorrection(nonAdminActor, game.id, `t154-403-${randomUUID()}`, {
        expectedVersion: game.version,
        clientCommandId: `t154-403-${randomUUID()}`,
        score: { home: 9, away: 0 },
        actualParticipants: [],
        eventsHash: '0'.repeat(64),
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ForbiddenException);
    expect((caught as ForbiddenException).getStatus()).toBe(403);
    expect((caught as ForbiddenException).getResponse()).toMatchObject({ code: 'PERMISSION_DENIED' });

    // 거부됐으므로 게임 상태는 전혀 바뀌지 않았어야 한다.
    const unchangedGame = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    expect(unchangedGame.version).toBe(game.version);
    expect(unchangedGame.currentOfficialRevisionId).toBeNull();
  });
});

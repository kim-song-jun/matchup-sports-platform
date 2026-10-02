import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { GameResultOfficialProjectionService } from '../../src/game-operations/game-result-official-projection.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

// R11(C-6): 몰수패·부전승 결과 입력 경로. 어드민이 불참팀을 지정해
// `POST /admin/league-matches/:leagueId/fixtures/:teamMatchId/forfeit`를 호출하면
// 실제 GamesService의 create/submit/decide 3단계를 통과해 OFFICIAL 리비전이
// 생기는지, 그 리비전이 (league-completion-projection.integration-spec.ts와 동일한
// 패턴으로) outbox 프로젝션 핸들러를 거쳐 순위표·리그 자동완료에 실제로 반영되는지
// 검증한다 -- mock이 아니라 실제 프로덕션 경로(HTTP -> GamesService -> 프로젝션)를
// 그대로 태운다.
const suiteId = randomUUID().slice(0, 8);
const ownerUserId = `t152-league-forfeit-owner-${suiteId}`;

// 공개 응답에 사유 원문이 새지 않는지 고정하려면, 보낸 값과 검사하는 값이 같은 출처여야 한다.
const FORFEIT_REASON_TEXT = '원정팀 경기 시작 30분 후에도 미도착';

describe('리그 몰수패·부전승 결과 입력 (R11)', () => {
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
      data: { code: `t152-league-forfeit-region-${suiteId}`, name: 'T152 리그 몰수 테스트 지역', level: 2 },
    });
    regionId = region.id;
  });

  afterAll(async () => cleanup?.());

  // league-completion-projection.integration-spec.ts와 동일한 패턴: 실제 outbox
  // 워커 대신, 그 워커가 처리했을 revisionId를 그대로 넘겨 프로젝션 핸들러를
  // 트랜잭션 위에서 직접 실행한다(V1GameOfficialFact 생성 + 리그 자동완료 훅).
  async function projectOfficialResult(revisionId: string) {
    const officialProjection = new GameResultOfficialProjectionService();
    await prisma.$transaction(async (tx) => {
      await officialProjection.handler({ payload: { revisionId } } as never, tx);
    });
  }

  async function createLeagueWithFixture(title: string, weeksCount = 1) {
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
    const leagueId = createRes.body.data.leagueId;
    const fixturesRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', ownerUserId)
      .send({ weeksCount });
    return { leagueId, teamA, teamB, teamMatchIds: fixturesRes.body.data.teamMatchIds as string[] };
  }

  it('원정팀이 불참하면 홈팀 승리(1:0)로 공식 확정되고, 유일한 대진이면 리그도 자동 completed로 전이한다', async () => {
    const { leagueId, teamA, teamB, teamMatchIds } = await createLeagueWithFixture('몰수-원정불참');
    const [teamMatchId] = teamMatchIds;
    const teamMatch = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });
    const awayTeamId = teamMatch.approvedApplicantTeamId!;
    expect([teamA.id, teamB.id]).toContain(awayTeamId);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/${teamMatchId}/forfeit`)
      .set('x-v1-user-id', ownerUserId)
      .send({ noShowTeamId: awayTeamId, reason: FORFEIT_REASON_TEXT });

    expect(res.status).toBe(201);
    expect(res.body.data.alreadyProcessed).toBe(false);
    expect(res.body.data.homeScore).toBe(1);
    expect(res.body.data.awayScore).toBe(0);
    expect(res.body.data.winningTeamId).toBe(teamMatch.hostTeamId);

    const revision = await prisma.v1GameResultRevision.findUniqueOrThrow({
      where: { id: res.body.data.resultRevisionId },
    });
    expect(revision.state).toBe('OFFICIAL');
    expect(revision.reason).toMatch(/^\[LEAGUE_FORFEIT\]/);

    const updatedTeamMatch = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });
    expect(updatedTeamMatch.status).toBe('completed');

    // 실제 프로덕션과 동일하게 outbox 프로젝션까지 태워 공식 fact + 리그 자동완료를 검증한다.
    await projectOfficialResult(res.body.data.resultRevisionId);

    // BE-5 drop: 리그 상태는 통합 축의 status 다(`active`→`in_progress`, `completed`→`completed`).
    const league = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId } });
    expect(league.status).toBe('completed');

    const standingsRes = await request(app.getHttpServer()).get(`/api/v1/league-matches/${leagueId}/standings`);
    const hostRow = standingsRes.body.data.standings.find((row: { teamId: string }) => row.teamId === teamMatch.hostTeamId);
    const awayRow = standingsRes.body.data.standings.find((row: { teamId: string }) => row.teamId === awayTeamId);
    expect(hostRow.wins).toBe(1);
    expect(hostRow.points).toBe(3);
    expect(awayRow.losses).toBe(1);
    expect(awayRow.points).toBe(0);
    expect(standingsRes.body.data.pendingFixtures).toHaveLength(0);

    // 공개 상세는 몰수를 boolean 으로 구분해 준다. 이게 없으면 관전자에게 이 경기가
    // 실제로 치러진 1:0 승리와 완전히 같아 보인다.
    const detailRes = await request(app.getHttpServer()).get(`/api/v1/league-matches/${leagueId}`);
    expect(detailRes.status).toBe(200);
    const detailFixture = detailRes.body.data.fixtures.find(
      (row: { teamMatchId: string }) => row.teamMatchId === teamMatchId,
    );
    expect(detailFixture).toMatchObject({ homeScore: 1, awayScore: 0, isForfeit: true });

    // 몰수 사유는 운영자가 쓴 자유 텍스트라 공개 응답에 절대 실리면 안 된다 —
    // boolean 만 나가고 원문·내부 마커는 어디에도 없어야 한다(응답 전체를 훑어 고정).
    const serialized = JSON.stringify(detailRes.body);
    expect(serialized).not.toContain('LEAGUE_FORFEIT');
    expect(serialized).not.toContain(FORFEIT_REASON_TEXT);
  });

  it('같은 대진을 다시 몰수 처리하면 새 리비전을 만들지 않고 alreadyProcessed:true를 반환한다(멱등)', async () => {
    const { leagueId, teamMatchIds } = await createLeagueWithFixture('몰수-멱등', 2);
    const [teamMatchId] = teamMatchIds;
    const teamMatch = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });
    const hostTeamId = teamMatch.hostTeamId;

    const first = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/${teamMatchId}/forfeit`)
      .set('x-v1-user-id', ownerUserId)
      .send({ noShowTeamId: hostTeamId, reason: '홈팀 불참 확인' });
    expect(first.status).toBe(201);
    expect(first.body.data.alreadyProcessed).toBe(false);
    const revisionId = first.body.data.resultRevisionId;

    const second = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/${teamMatchId}/forfeit`)
      .set('x-v1-user-id', ownerUserId)
      .send({ noShowTeamId: hostTeamId, reason: '중복 클릭 재시도' });
    expect(second.status).toBe(201);
    expect(second.body.data.alreadyProcessed).toBe(true);
    expect(second.body.data.resultRevisionId).toBe(revisionId);

    const revisionCount = await prisma.v1GameResultRevision.count({
      where: { game: { teamMatchId } },
    });
    expect(revisionCount).toBe(1);

    // 대진이 2개인 리그에서 1개만 몰수 처리했으므로 아직 completed가 아니어야 한다.
    const league = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId } });
    expect(league.status).toBe('in_progress');
  });

  it('이미 실제 결과가 공식 확정된 대진은 몰수 처리를 거부한다(409)', async () => {
    const { leagueId, teamMatchIds } = await createLeagueWithFixture('몰수-이미확정');
    const [teamMatchId] = teamMatchIds;
    const teamMatch = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });

    // league-completion-projection.integration-spec.ts와 동일한 "합성 OFFICIAL 리비전"
    // 패턴으로 실제 경기 결과가 이미 확정된 상태를 만든다.
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    const realRevision = await prisma.v1GameResultRevision.create({
      data: {
        gameId: game.id,
        revision: 1,
        state: 'OFFICIAL',
        score: { home: 2, away: 1 },
        eventsHash: `t152-forfeit-real-result-${randomUUID()}`,
        createdByActorType: 'SYSTEM',
        createdBySystemActor: 'T152_FORFEIT_TEST',
        submittedAt: new Date(),
        officialAt: new Date(),
      },
    });
    await prisma.v1Game.update({ where: { id: game.id }, data: { currentOfficialRevisionId: realRevision.id } });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/${teamMatchId}/forfeit`)
      .set('x-v1-user-id', ownerUserId)
      .send({ noShowTeamId: teamMatch.hostTeamId, reason: '뒤늦은 몰수 요청' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LEAGUE_FIXTURE_RESULT_ALREADY_OFFICIAL');
  });

  it('대진에 속하지 않은 팀 ID를 noShowTeamId로 보내면 422를 반환한다', async () => {
    const { leagueId, teamMatchIds } = await createLeagueWithFixture('몰수-잘못된팀');
    const [teamMatchId] = teamMatchIds;
    const strangerTeam = await prisma.v1Team.create({
      data: { ownerUserId, sportId, regionId, name: `stranger-${suiteId}` },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/${teamMatchId}/forfeit`)
      .set('x-v1-user-id', ownerUserId)
      .send({ noShowTeamId: strangerTeam.id, reason: '엉뚱한 팀' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('LEAGUE_FORFEIT_TEAM_INVALID');
  });
});

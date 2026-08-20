import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

const suiteId = randomUUID().slice(0, 8);
const ownerUserId = `t4-league-admin-owner-${suiteId}`;
const opsUserId = `t4-league-admin-ops-${suiteId}`;
// V1AdminUser 행이 없는 일반 활성 유저 — 어드민 경계(403) 네거티브 전용 액터.
const regularUserId = `t4-league-admin-regular-${suiteId}`;

describe('POST /admin/league-matches + fixtures', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let sportId: string;
  let regionId: string;
  let teamAId: string;
  let teamBId: string;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);

    // 액터 프로비저닝은 test/admin/task7-platform-ops-boundary.integration-spec.ts의
    // seedFixtures 패턴을 그대로 따른다: active user + onboarding completed + phone
    // verified + 필수 약관 동의 + V1AdminUser(owner/ops).
    await prisma.v1User.createMany({
      data: [ownerUserId, opsUserId, regularUserId].map((id) => ({
        id,
        email: `${id}@integration.test`,
        onboardingStatus: 'completed',
        phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        accountStatus: 'active',
      })),
    });
    const termsService = app.get(ManagedTermsRuntimeService);
    const signupTerms = await termsService.currentSignupTerms();
    const requiredDocumentIds = signupTerms.items
      .filter((item) => item.requirement === 'required')
      .map((item) => item.documentId);
    await Promise.all(
      [ownerUserId, opsUserId, regularUserId].map((userId) =>
        termsService.acceptSignupTerms(userId, requiredDocumentIds),
      ),
    );
    await prisma.v1AdminUser.createMany({
      data: [
        { userId: ownerUserId, adminRole: 'owner' },
        { userId: opsUserId, adminRole: 'ops' },
      ],
    });

    const sport = await prisma.v1Sport.upsert({
      where: { code: 'futsal' },
      update: {},
      create: { code: 'futsal', name: '풋살' },
    });
    sportId = sport.id;
    const region = await prisma.v1Region.create({
      data: { code: `t4-league-region-${suiteId}`, name: 'T4 시리즈 테스트 지역', level: 2 },
    });
    regionId = region.id;
    const teamA = await prisma.v1Team.create({
      data: { ownerUserId, sportId, regionId, name: `series-team-a-${suiteId}` },
    });
    const teamB = await prisma.v1Team.create({
      data: { ownerUserId, sportId, regionId, name: `series-team-b-${suiteId}` },
    });
    teamAId = teamA.id;
    teamBId = teamB.id;
  });

  afterAll(async () => cleanup?.());

  it('시리즈를 만들고 라운드로빈 대진을 일괄 생성하면 팀매치가 matched 상태로 바로 확정된다', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', ownerUserId)
      .send({
        title: '테스트 리그',
        sportId,
        regionId,
        startsOn: new Date().toISOString(),
        endsOn: new Date(Date.now() + 7 * 7 * 86_400_000).toISOString(),
        teamIds: [teamAId, teamBId],
      });
    expect(createRes.status).toBe(201);
    const leagueId = createRes.body.data.leagueId;

    const fixturesRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', ownerUserId)
      .send({ weeksCount: 1 });
    expect(fixturesRes.status).toBe(201);
    expect(fixturesRes.body.data.teamMatchIds).toHaveLength(1);

    const teamMatch = await prisma.v1TeamMatch.findUniqueOrThrow({
      where: { id: fixturesRes.body.data.teamMatchIds[0] },
    });
    expect(teamMatch.status).toBe('matched');
    expect(teamMatch.approvedApplicantTeamId).not.toBeNull();
    expect(teamMatch.leagueId).toBe(leagueId);

    const application = await prisma.v1TeamMatchApplication.findFirst({
      where: { teamMatchId: teamMatch.id, status: 'approved' },
    });
    expect(application).not.toBeNull();

    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId: teamMatch.id } });
    expect(game.sourceType).toBe('TEAM_MATCH');
  });

  it('요일·시각·장소 템플릿을 지정하면 모든 경기가 그 요일의 그 시각(KST)·장소로 일괄 채워진다', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', ownerUserId)
      .send({
        title: '템플릿 리그',
        sportId,
        regionId,
        // 2026-08-10T00:00:00Z = KST 2026-08-10(월) 09:00.
        startsOn: '2026-08-10T00:00:00.000Z',
        endsOn: '2026-10-01T00:00:00.000Z',
        teamIds: [teamAId, teamBId],
      });
    const leagueId = createRes.body.data.leagueId;

    const fixturesRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', ownerUserId)
      .send({ weeksCount: 2, schedule: { dayOfWeek: 6, time: '18:00' }, placeName: '상암 풋살파크' });
    expect(fixturesRes.status).toBe(201);
    expect(fixturesRes.body.data.teamMatchIds).toHaveLength(2);

    const fixtures = await prisma.v1TeamMatch.findMany({
      where: { id: { in: fixturesRes.body.data.teamMatchIds } },
      orderBy: { startAt: 'asc' },
    });
    expect(fixtures.every((f) => f.placeName === '상암 풋살파크')).toBe(true);
    // 8/15(토) 18:00 KST = 09:00 UTC, 그다음 주는 8/22.
    expect(fixtures[0].startAt.toISOString()).toBe('2026-08-15T09:00:00.000Z');
    expect(fixtures[1].startAt.toISOString()).toBe('2026-08-22T09:00:00.000Z');
  });

  it(
    '대진을 아직 안 만든 새 리그를 조회하면, 같은 팀들이 과거에 뛴 다른 리그의 장소가 최근 사용 장소로 내려온다',
    async () => {
      // 다른 테스트의 실행 순서에 기대지 않도록, teamA/teamB가 '상암 풋살파크'에서 이미
      // 뛴 이력을 이 테스트 안에서 직접 만든다.
      await prisma.v1TeamMatch.create({
        data: {
          hostTeamId: teamAId,
          approvedApplicantTeamId: teamBId,
          createdByUserId: ownerUserId,
          sportId,
          regionId,
          title: `과거 대진-${suiteId}`,
          placeName: '상암 풋살파크',
          startAt: new Date('2026-07-01T09:00:00.000Z'),
          status: 'completed',
        },
      });

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/admin/league-matches')
        .set('x-v1-user-id', ownerUserId)
        .send({
          title: '장소 추천 리그',
          sportId,
          regionId,
          startsOn: new Date().toISOString(),
          endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          teamIds: [teamAId, teamBId],
        });
      const leagueId = createRes.body.data.leagueId;

      const detailRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/league-matches/${leagueId}`)
        .set('x-v1-user-id', ownerUserId);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.recentVenues).toContain('상암 풋살파크');

      // 대진을 생성하고 나면(이 화면이 더는 필요 없으므로) recentVenues는 빈 배열이다.
      await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
        .set('x-v1-user-id', ownerUserId)
        .send({ weeksCount: 1 });
      const afterGenerateRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/league-matches/${leagueId}`)
        .set('x-v1-user-id', ownerUserId);
      expect(afterGenerateRes.body.data.recentVenues).toEqual([]);
    },
  );

  it('요일·시각·장소 템플릿을 지정하지 않으면 기존 동작(시작일 그대로, 장소 미정)을 유지한다', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', ownerUserId)
      .send({
        title: '템플릿 없는 리그',
        sportId,
        regionId,
        startsOn: '2026-09-01T03:00:00.000Z',
        endsOn: '2026-10-01T00:00:00.000Z',
        teamIds: [teamAId, teamBId],
      });
    const leagueId = createRes.body.data.leagueId;

    const fixturesRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', ownerUserId)
      .send({ weeksCount: 1 });
    expect(fixturesRes.status).toBe(201);

    const fixture = await prisma.v1TeamMatch.findUniqueOrThrow({
      where: { id: fixturesRes.body.data.teamMatchIds[0] },
    });
    expect(fixture.placeName).toBe('장소 미정');
    expect(fixture.startAt.toISOString()).toBe('2026-09-01T03:00:00.000Z');
  });

  it('시각 형식이 HH:mm이 아니면 400으로 거부한다', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', ownerUserId)
      .send({
        title: '잘못된 시각 리그',
        sportId,
        regionId,
        startsOn: new Date().toISOString(),
        endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        teamIds: [teamAId, teamBId],
      });
    const leagueId = createRes.body.data.leagueId;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', ownerUserId)
      .send({ weeksCount: 1, schedule: { dayOfWeek: 6, time: '25:99' } });
    expect(res.status).toBe(400);
  });

  it('대진이 이미 생성된 시리즈에 다시 생성 요청하면 409 LEAGUE_FIXTURES_EXIST', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', ownerUserId)
      .send({
        title: '테스트 리그2',
        sportId,
        regionId,
        startsOn: new Date().toISOString(),
        endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        teamIds: [teamAId, teamBId],
      });
    const leagueId = createRes.body.data.leagueId;
    await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', ownerUserId)
      .send({ weeksCount: 1 });

    const secondRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', ownerUserId)
      .send({ weeksCount: 1 });
    expect(secondRes.status).toBe(409);
    expect(secondRes.body.code).toBe('LEAGUE_FIXTURES_EXIST');
  });

  it('팀이 1개뿐이면 422 LEAGUE_TEAM_INVALID (DTO 검증이 아니라 서비스 도메인 규칙이 걸려야 한다)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', ownerUserId)
      .send({
        title: '단독팀 리그',
        sportId,
        regionId,
        startsOn: new Date().toISOString(),
        endsOn: new Date(Date.now() + 86_400_000).toISOString(),
        teamIds: [teamAId],
      });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('LEAGUE_TEAM_INVALID');
  });

  it(
    '중복 팀ID로 요청하면(배열 길이는 2 이상이지만 dedup 후 1개) 여전히 422 LEAGUE_TEAM_INVALID',
    async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/league-matches')
        .set('x-v1-user-id', ownerUserId)
        .send({
          title: '중복팀 리그',
          sportId,
          regionId,
          startsOn: new Date().toISOString(),
          endsOn: new Date(Date.now() + 86_400_000).toISOString(),
          teamIds: [teamAId, teamAId],
        });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('LEAGUE_TEAM_INVALID');
    },
  );

  // 이 프로젝트에서 리그 admin은 AdminContextService(전역 owner/ops)만 쓰고 시리즈/대회 단위로
  // 스코프된 admin 신원이 없다(D-3). "다른 대회 admin이 남의 시리즈를 건드릴 때 거부"의
  // 실제로 존재하는 동등한 경계는 IDOR형 cross-series 스코프다: URL의 leagueId와 실제
  // teamMatchId가 속한 시리즈가 다르면 거부돼야 한다.
  it('다른 시리즈의 대진(teamMatchId)을 엉뚱한 leagueId로 수정하려 하면 404 LEAGUE_NOT_FOUND로 거부되고 아무 것도 바뀌지 않는다', async () => {
    const seriesARes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', ownerUserId)
      .send({
        title: '시리즈 A',
        sportId,
        regionId,
        startsOn: new Date().toISOString(),
        endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        teamIds: [teamAId, teamBId],
      });
    const seriesAId = seriesARes.body.data.leagueId;
    const fixturesARes = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${seriesAId}/fixtures`)
      .set('x-v1-user-id', ownerUserId)
      .send({ weeksCount: 1 });
    const teamMatchIdInSeriesA = fixturesARes.body.data.teamMatchIds[0];
    const before = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchIdInSeriesA } });

    const teamCId = (
      await prisma.v1Team.create({ data: { ownerUserId, sportId, regionId, name: `series-team-c-${suiteId}` } })
    ).id;
    const teamDId = (
      await prisma.v1Team.create({ data: { ownerUserId, sportId, regionId, name: `series-team-d-${suiteId}` } })
    ).id;
    const seriesBRes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', opsUserId)
      .send({
        title: '시리즈 B',
        sportId,
        regionId,
        startsOn: new Date().toISOString(),
        endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        teamIds: [teamCId, teamDId],
      });
    const seriesBId = seriesBRes.body.data.leagueId;

    const crossRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/league-matches/${seriesBId}/fixtures/${teamMatchIdInSeriesA}`)
      .set('x-v1-user-id', opsUserId)
      .send({ placeName: '탈취 시도 장소' });
    expect(crossRes.status).toBe(404);
    expect(crossRes.body.code).toBe('LEAGUE_NOT_FOUND');

    const after = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchIdInSeriesA } });
    expect(after.placeName).toBe(before.placeName);
  });

  it('V1AdminUser 행이 없는 일반 유저는 세 mutation 전부 403 PERMISSION_DENIED로 거부되고 아무 것도 쓰이지 않는다', async () => {
    const forbiddenTitle = `일반유저 침입 리그-${suiteId}`;
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', regularUserId)
      .send({
        title: forbiddenTitle,
        sportId,
        regionId,
        startsOn: new Date().toISOString(),
        endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        teamIds: [teamAId, teamBId],
      });
    expect(createRes.status).toBe(403);
    expect(createRes.body.code).toBe('PERMISSION_DENIED');
    expect(await prisma.v1League.count({ where: { title: forbiddenTitle } })).toBe(0);

    // 권한 검사(getMutationAdmin)가 리소스 조회보다 앞서는 것도 계약이다 — 존재하지 않는
    // id로도 404가 아니라 403이어야 비인가 사용자에게 리소스 존재 여부가 새지 않는다.
    const fixturesRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${randomUUID()}/fixtures`)
      .set('x-v1-user-id', regularUserId)
      .send({ weeksCount: 1 });
    expect(fixturesRes.status).toBe(403);
    expect(fixturesRes.body.code).toBe('PERMISSION_DENIED');

    const updateRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/league-matches/${randomUUID()}/fixtures/${randomUUID()}`)
      .set('x-v1-user-id', regularUserId)
      .send({ placeName: '침입 시도 장소' });
    expect(updateRes.status).toBe(403);
    expect(updateRes.body.code).toBe('PERMISSION_DENIED');
  });

  it('인증 헤더 없는 요청은 세 mutation 전부 401 UNAUTHENTICATED', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .send({
        title: '무인증 리그',
        sportId,
        regionId,
        startsOn: new Date().toISOString(),
        endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        teamIds: [teamAId, teamBId],
      });
    expect(createRes.status).toBe(401);
    expect(createRes.body.code).toBe('UNAUTHENTICATED');

    const fixturesRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${randomUUID()}/fixtures`)
      .send({ weeksCount: 1 });
    expect(fixturesRes.status).toBe(401);
    expect(fixturesRes.body.code).toBe('UNAUTHENTICATED');

    const updateRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/league-matches/${randomUUID()}/fixtures/${randomUUID()}`)
      .send({ placeName: '무인증 시도 장소' });
    expect(updateRes.status).toBe(401);
    expect(updateRes.body.code).toBe('UNAUTHENTICATED');
  });
});

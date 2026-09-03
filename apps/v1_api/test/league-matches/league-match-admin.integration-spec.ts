import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';
import { leagueMirrorCreateData } from '../../src/tournaments/league-competition-mirror';

const suiteId = randomUUID().slice(0, 8);
const ownerUserId = `t4-league-admin-owner-${suiteId}`;
const opsUserId = `t4-league-admin-ops-${suiteId}`;
// V1AdminUser 행이 없는 일반 활성 유저 — 어드민 경계(403) 네거티브 전용 액터.
const regularUserId = `t4-league-admin-regular-${suiteId}`;

/**
 * 대진 날짜는 **미래**여야 한다(Task 164 BE-2: 과거 날짜는 422 `LEAGUE_SCHEDULE_DATE_PAST`). 고정 날짜를 박으면
 * 그 날이 지나는 순간 이 스펙이 시간 때문에 깨지므로 오늘 기준으로 만든다.
 */
const futureDates = [7, 14].map((days) => {
  const at = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  // KST 달력 날짜로 적는다 — 서버가 그 날의 KST 벽시계로 해석한다.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(at);
});

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
      .send({ weeksCount: 2, schedule: { dates: futureDates, time: '18:00' }, placeName: '상암 풋살파크' });
    expect(fixturesRes.status).toBe(201);
    expect(fixturesRes.body.data.teamMatchIds).toHaveLength(2);

    const fixtures = await prisma.v1TeamMatch.findMany({
      where: { id: { in: fixturesRes.body.data.teamMatchIds } },
      orderBy: { startAt: 'asc' },
    });
    expect(fixtures.every((f) => f.placeName === '상암 풋살파크')).toBe(true);
    // Task 164 BE-2: 서버는 요일을 모른다 — 운영자가 고른 **날짜 목록**을 오름차순으로 쓴다.
    // 18:00 KST = 09:00 UTC.
    expect(fixtures.map((f) => f.startAt.toISOString())).toEqual(
      futureDates.map((date) => `${date}T09:00:00.000Z`),
    );
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

  it('상세 응답은 리그 시작일을 함께 내려준다 — 대진 폼이 요일을 날짜로 전개하는 기준일이다', async () => {
    // 서버는 요일을 모르고 `schedule.dates` 를 받는다(BE-2). 그래서 요일로 고르는 화면은
    // "리그 시작일 이후 매주 그 요일" 을 직접 펼쳐야 하는데, 이 값이 응답에 없으면 계산 자체가
    // 불가능하다 — 실제로 그래서 화면이 옛 `{ dayOfWeek }` 를 보내 400 이 났다.
    const startsOn = new Date(Date.now() + 3 * 86_400_000);
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', ownerUserId)
      .send({
        title: '시작일 노출 리그',
        sportId,
        regionId,
        startsOn: startsOn.toISOString(),
        endsOn: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        teamIds: [teamAId, teamBId],
      });
    expect(createRes.status).toBe(201);

    const detailRes = await request(app.getHttpServer())
      .get(`/api/v1/admin/league-matches/${createRes.body.data.leagueId}`)
      .set('x-v1-user-id', ownerUserId);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.startsOn).toBeDefined();
    // 보낸 시작일과 같은 순간이어야 한다(문자열 포맷은 다를 수 있다).
    expect(new Date(detailRes.body.data.startsOn).getTime()).toBe(startsOn.getTime());
  });

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
      .send({ weeksCount: 1, schedule: { dates: futureDates, time: '25:99' } });
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

  // R6: 결과 정정을 위한 completed -> active 운영자 역전이. 자동 전이(R6 handler) 경로는
  // league-completion-projection.integration-spec.ts가 전담하므로, 여기서는 이 리그를
  // 곧바로 completed 상태로 합성해 되돌리기 엔드포인트 자체의 계약만 검증한다.
  describe('POST /admin/league-matches/:leagueId/revert-completion', () => {
    async function createLeagueWithState(title: string, state: 'draft' | 'active' | 'completed') {
      const admin = await prisma.v1AdminUser.findUniqueOrThrow({ where: { userId: ownerUserId } });
      const league = await prisma.v1League.create({
        data: {
          title,
          sportId,
          regionId,
          createdByAdminUserId: admin.id,
          startsOn: new Date(),
          endsOn: new Date(Date.now() + 7 * 86_400_000),
          tieBreakJson: { order: ['points', 'goalDifference', 'goalsFor', 'headToHead'] },
          state,
        },
      });
      // BE-5: 리그 조회가 통합 축으로 옮겨졌다. 프로덕션에서는 리그 생성이 거울을 **항상**
      // 함께 만들므로(dual-write) 픽스처도 짝을 맞춘다 — 거울 없이 레거시 행만 만들면
      // 실제로는 존재할 수 없는 상태를 재고, 그 상태에서 404 가 나는 것은 정상이다.
      // 손으로 적지 않고 프로덕션과 **같은 헬퍼**로 만든다(id 가 같다는 계약을 픽스처에서만
      // 지키면 그 계약이 깨져도 이 테스트가 green 으로 남는다).
      const sport = await prisma.v1Sport.findUniqueOrThrow({ where: { id: sportId }, select: { code: true } });
      await prisma.v1Tournament.create({
        data: leagueMirrorCreateData({
          id: league.id,
          sportId: league.sportId,
          title: league.title,
          state: league.state,
          regionId: league.regionId,
          startsOn: league.startsOn,
          endsOn: league.endsOn,
          seriesId: league.seriesId,
          tier: league.tier,
          seasonNo: league.seasonNo,
          sportCode: sport.code,
          createdAt: league.createdAt,
        }),
      });
      return league;
    }

    it('completed 리그를 active로 되돌리고 감사 로그(admin 액션 로그 + 상태변경 로그)를 남긴다', async () => {
      const league = await createLeagueWithState(`역전이 테스트 리그-${suiteId}`, 'completed');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${league.id}/revert-completion`)
        .set('x-v1-user-id', ownerUserId)
        .send({ reason: '오심 정정' });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ leagueId: league.id, state: 'active', alreadyProcessed: false });

      const updated = await prisma.v1League.findUniqueOrThrow({ where: { id: league.id } });
      expect(updated.state).toBe('active');

      const statusLog = await prisma.v1StatusChangeLog.findFirst({
        where: { targetType: 'league_match', targetId: league.id, toStatus: 'active' },
      });
      expect(statusLog).not.toBeNull();
      expect(statusLog!.fromStatus).toBe('completed');
      expect(statusLog!.actorType).toBe('admin');
      expect(statusLog!.reason).toBe('오심 정정');

      const actionLog = await prisma.v1AdminActionLog.findFirst({
        where: { action: 'league_match.revert_completion', targetId: league.id },
      });
      expect(actionLog).not.toBeNull();
    });

    it('이미 active인 리그를 되돌리면 멱등하게 alreadyProcessed: true를 반환하고 아무 로그도 남기지 않는다', async () => {
      const league = await createLeagueWithState(`멱등 역전이 리그-${suiteId}`, 'active');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${league.id}/revert-completion`)
        .set('x-v1-user-id', ownerUserId)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ leagueId: league.id, state: 'active', alreadyProcessed: true });

      const statusLogCount = await prisma.v1StatusChangeLog.count({
        where: { targetType: 'league_match', targetId: league.id },
      });
      expect(statusLogCount).toBe(0);
    });

    it('한 번도 완료된 적 없는(draft) 리그를 되돌리려 하면 409 LEAGUE_NOT_COMPLETED로 거부된다', async () => {
      const league = await createLeagueWithState(`드래프트 리그-${suiteId}`, 'draft');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${league.id}/revert-completion`)
        .set('x-v1-user-id', ownerUserId)
        .send({});
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('LEAGUE_NOT_COMPLETED');
    });

    it('존재하지 않는 리그를 되돌리려 하면 404 LEAGUE_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${randomUUID()}/revert-completion`)
        .set('x-v1-user-id', ownerUserId)
        .send({});
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('LEAGUE_NOT_FOUND');
    });

    it('V1AdminUser 행이 없는 일반 유저는 403 PERMISSION_DENIED로 거부된다', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${randomUUID()}/revert-completion`)
        .set('x-v1-user-id', regularUserId)
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    it('인증 헤더 없는 요청은 401 UNAUTHENTICATED로 거부된다', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${randomUUID()}/revert-completion`)
        .send({});
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });
  });

  // R12: 리그 대진 전용 취소 — team-matches.service.ts의 cancel()이 호스트 자가취소에서
  // 하는 후처리(신청 반려·일정 cascade·감사 로그)를 어드민 액터로 반복하는지 검증한다.
  describe('POST /admin/league-matches/:leagueId/fixtures/:teamMatchId/cancel', () => {
    async function createLeagueWithOneFixture(title: string) {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/admin/league-matches')
        .set('x-v1-user-id', ownerUserId)
        .send({
          title,
          sportId,
          regionId,
          startsOn: new Date().toISOString(),
          endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          teamIds: [teamAId, teamBId],
        });
      const leagueId = createRes.body.data.leagueId;
      const fixturesRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
        .set('x-v1-user-id', ownerUserId)
        .send({ weeksCount: 1 });
      return { leagueId, teamMatchId: fixturesRes.body.data.teamMatchIds[0] as string };
    }

    it('대진을 취소하면 status=cancelled + cancelledAt이 남고, 감사 로그(admin 액션 로그 + 상태변경 로그)가 기록된다', async () => {
      const { leagueId, teamMatchId } = await createLeagueWithOneFixture(`취소 테스트 리그-${suiteId}`);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/${teamMatchId}/cancel`)
        .set('x-v1-user-id', ownerUserId)
        .send({ reason: '우천으로 인한 경기 취소' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ teamMatchId, status: 'cancelled', alreadyProcessed: false });

      const updated = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });
      expect(updated.status).toBe('cancelled');
      expect(updated.cancelledAt).not.toBeNull();

      const statusLog = await prisma.v1StatusChangeLog.findFirst({
        where: { targetType: 'team_match', targetId: teamMatchId, toStatus: 'cancelled' },
      });
      expect(statusLog).not.toBeNull();
      expect(statusLog!.actorType).toBe('admin');
      expect(statusLog!.reason).toBe('우천으로 인한 경기 취소');

      const actionLog = await prisma.v1AdminActionLog.findFirst({
        where: { action: 'league_match.cancel_fixture', targetId: teamMatchId },
      });
      expect(actionLog).not.toBeNull();
    });

    it('이미 취소된 대진을 다시 취소하면 멱등하게 alreadyProcessed: true를 반환하고 로그가 추가되지 않는다', async () => {
      const { leagueId, teamMatchId } = await createLeagueWithOneFixture(`멱등 취소 리그-${suiteId}`);
      await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/${teamMatchId}/cancel`)
        .set('x-v1-user-id', ownerUserId)
        .send({ reason: '최초 취소' });
      const logCountBefore = await prisma.v1AdminActionLog.count({
        where: { action: 'league_match.cancel_fixture', targetId: teamMatchId },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/${teamMatchId}/cancel`)
        .set('x-v1-user-id', ownerUserId)
        .send({ reason: '중복 취소 시도' });
      expect(res.status).toBe(200);
      // `leagueCompleted` 는 abb119c3b 에서 추가됐다 — 취소가 "남은 대진" 을 줄이는 조작이라
      // 결과 확정과 같은 완료 판정을 다시 돌린다. 멱등 경로는 **이번 호출이 리그를
      // 완료시켰는가**를 묻는 것이라 재취소에서는 항상 false 다(이미 완료된 리그여도).
      expect(res.body.data).toEqual({
        teamMatchId,
        status: 'cancelled',
        cancelledApplications: 0,
        leagueCompleted: false,
        alreadyProcessed: true,
      });

      const logCountAfter = await prisma.v1AdminActionLog.count({
        where: { action: 'league_match.cancel_fixture', targetId: teamMatchId },
      });
      expect(logCountAfter).toBe(logCountBefore);
    });

    it('다른 리그의 대진을 취소하려 하면 404 LEAGUE_NOT_FOUND로 거부되고 아무 것도 바뀌지 않는다', async () => {
      const { teamMatchId } = await createLeagueWithOneFixture(`IDOR 대상 리그-${suiteId}`);
      const { leagueId: otherLeagueId } = await createLeagueWithOneFixture(`엉뚱한 리그-${suiteId}`);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${otherLeagueId}/fixtures/${teamMatchId}/cancel`)
        .set('x-v1-user-id', ownerUserId)
        .send({ reason: '탈취 시도' });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('LEAGUE_NOT_FOUND');

      const untouched = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });
      expect(untouched.status).toBe('matched');
    });

    it('사유 없이 요청하면 400으로 거부된다', async () => {
      const { leagueId, teamMatchId } = await createLeagueWithOneFixture(`사유 누락 리그-${suiteId}`);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/${teamMatchId}/cancel`)
        .set('x-v1-user-id', ownerUserId)
        .send({});
      expect(res.status).toBe(400);
    });

    it('V1AdminUser 행이 없는 일반 유저는 403, 인증 헤더 없는 요청은 401로 거부된다', async () => {
      const { leagueId, teamMatchId } = await createLeagueWithOneFixture(`권한 경계 리그-${suiteId}`);

      const forbiddenRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/${teamMatchId}/cancel`)
        .set('x-v1-user-id', regularUserId)
        .send({ reason: '권한 없는 시도' });
      expect(forbiddenRes.status).toBe(403);
      expect(forbiddenRes.body.code).toBe('PERMISSION_DENIED');

      const unauthRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/${teamMatchId}/cancel`)
        .send({ reason: '무인증 시도' });
      expect(unauthRes.status).toBe(401);
      expect(unauthRes.body.code).toBe('UNAUTHENTICATED');

      const untouched = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });
      expect(untouched.status).toBe('matched');
    });
  });

  // R13: 참가팀 조회 — 팀 이름/상태를 붙여 돌려주는지 확인한다.
  describe('GET /admin/league-matches/:leagueId/teams', () => {
    it('참가팀 id·이름·상태·멤버 수를 돌려준다', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/admin/league-matches')
        .set('x-v1-user-id', ownerUserId)
        .send({
          title: `참가팀 조회 리그-${suiteId}`,
          sportId,
          regionId,
          startsOn: new Date().toISOString(),
          endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          teamIds: [teamAId, teamBId],
        });
      const leagueId = createRes.body.data.leagueId;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/league-matches/${leagueId}/teams`)
        .set('x-v1-user-id', ownerUserId);
      expect(res.status).toBe(200);
      expect(res.body.data.leagueId).toBe(leagueId);
      expect(res.body.data.teams).toHaveLength(2);
      // createMany로 등록된 두 리그팀 행은 createdAt이 같은 트랜잭션 타임스탬프를 공유할 수
      // 있어(F1 주석 참고) teamId(무작위 UUID) tie-break 순서가 입력 순서와 다를 수 있다 —
      // 그래서 정렬 순서가 아니라 "두 팀이 다 나오는지"와 각 필드의 형태만 검증한다.
      const teamIds = res.body.data.teams.map((t: { teamId: string }) => t.teamId);
      expect(new Set(teamIds)).toEqual(new Set([teamAId, teamBId]));
      const teamA = res.body.data.teams.find((t: { teamId: string }) => t.teamId === teamAId);
      expect(teamA).toMatchObject({ teamId: teamAId, status: 'active' });
      expect(typeof teamA.name).toBe('string');
      expect(teamA.name.length).toBeGreaterThan(0);
    });

    it('V1AdminUser 행이 없는 일반 유저는 403, 인증 헤더 없는 요청은 401로 거부된다', async () => {
      const forbiddenRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/league-matches/${randomUUID()}/teams`)
        .set('x-v1-user-id', regularUserId);
      expect(forbiddenRes.status).toBe(403);
      expect(forbiddenRes.body.code).toBe('PERMISSION_DENIED');

      const unauthRes = await request(app.getHttpServer()).get(`/api/v1/admin/league-matches/${randomUUID()}/teams`);
      expect(unauthRes.status).toBe(401);
      expect(unauthRes.body.code).toBe('UNAUTHENTICATED');
    });
  });

  // R13: 대진 재생성 — generateFixtures()와 동일한 계약(라운드로빈·시각/장소 템플릿)으로 새
  // 대진을 만들되, 기존 대진은 전부 취소하고 공식 결과가 확정된 대진이 있으면 거부한다.
  describe('POST /admin/league-matches/:leagueId/fixtures/regenerate', () => {
    async function officializeFixture(teamMatchId: string, score: { home: number; away: number }) {
      const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
      const revision = await prisma.v1GameResultRevision.create({
        data: {
          gameId: game.id,
          revision: 1,
          state: 'OFFICIAL',
          score,
          eventsHash: `t4-league-regenerate-hash-${randomUUID()}`,
          createdByActorType: 'SYSTEM',
          createdBySystemActor: 'T4_LEAGUE_REGENERATE_TEST',
          submittedAt: new Date(),
          officialAt: new Date(),
        },
      });
      await prisma.v1Game.update({ where: { id: game.id }, data: { currentOfficialRevisionId: revision.id } });
      return revision;
    }

    it('기존 대진을 전부 취소하고 같은 팀 로스터로 새 대진을 만든다', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/admin/league-matches')
        .set('x-v1-user-id', ownerUserId)
        .send({
          title: `재생성 리그-${suiteId}`,
          sportId,
          regionId,
          startsOn: new Date().toISOString(),
          endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          teamIds: [teamAId, teamBId],
        });
      const leagueId = createRes.body.data.leagueId;
      const firstGenRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
        .set('x-v1-user-id', ownerUserId)
        .send({ weeksCount: 1 });
      const originalFixtureId = firstGenRes.body.data.teamMatchIds[0] as string;

      const regenRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/regenerate`)
        .set('x-v1-user-id', ownerUserId)
        .send({ weeksCount: 1, reason: '팀 로스터 변경으로 재생성' });
      expect(regenRes.status).toBe(201);
      expect(regenRes.body.data.cancelledCount).toBe(1);
      expect(regenRes.body.data.teamMatchIds).toHaveLength(1);
      const newFixtureId = regenRes.body.data.teamMatchIds[0] as string;
      expect(newFixtureId).not.toBe(originalFixtureId);

      const original = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: originalFixtureId } });
      expect(original.status).toBe('cancelled');
      const created = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: newFixtureId } });
      expect(created.status).toBe('matched');
      expect(created.leagueId).toBe(leagueId);

      const actionLog = await prisma.v1AdminActionLog.findFirst({
        where: { action: 'league_match.regenerate_fixtures', targetId: leagueId },
      });
      expect(actionLog).not.toBeNull();
      expect(actionLog!.reason).toBe('팀 로스터 변경으로 재생성');
    });

    it('공식 결과가 확정된 대진이 하나라도 있으면 409 LEAGUE_FIXTURES_HAVE_OFFICIAL_RESULTS로 거부되고 아무 것도 바뀌지 않는다', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/admin/league-matches')
        .set('x-v1-user-id', ownerUserId)
        .send({
          title: `확정결과 재생성 거부 리그-${suiteId}`,
          sportId,
          regionId,
          startsOn: new Date().toISOString(),
          endsOn: new Date(Date.now() + 14 * 86_400_000).toISOString(),
          teamIds: [teamAId, teamBId],
        });
      const leagueId = createRes.body.data.leagueId;
      const fixturesRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
        .set('x-v1-user-id', ownerUserId)
        .send({ weeksCount: 2 });
      const [fixture1Id] = fixturesRes.body.data.teamMatchIds;
      await officializeFixture(fixture1Id, { home: 3, away: 1 });

      const regenRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/regenerate`)
        .set('x-v1-user-id', ownerUserId)
        .send({ weeksCount: 2, reason: '실수로 재생성 시도' });
      expect(regenRes.status).toBe(409);
      expect(regenRes.body.code).toBe('LEAGUE_FIXTURES_HAVE_OFFICIAL_RESULTS');

      const fixtureCount = await prisma.v1TeamMatch.count({ where: { leagueId } });
      expect(fixtureCount).toBe(2);
      const untouched = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: fixture1Id } });
      expect(untouched.status).toBe('matched');
    });

    it('사유 없이 요청하면 400으로 거부된다', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/admin/league-matches')
        .set('x-v1-user-id', ownerUserId)
        .send({
          title: `사유 누락 재생성 리그-${suiteId}`,
          sportId,
          regionId,
          startsOn: new Date().toISOString(),
          endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          teamIds: [teamAId, teamBId],
        });
      const leagueId = createRes.body.data.leagueId;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/regenerate`)
        .set('x-v1-user-id', ownerUserId)
        .send({ weeksCount: 1 });
      expect(res.status).toBe(400);
    });

    it('대진이 아직 없는 리그에서도(팀 2개 이상이면) 재생성 요청이 그대로 첫 생성처럼 동작한다', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/admin/league-matches')
        .set('x-v1-user-id', ownerUserId)
        .send({
          title: `대진 없는 리그 재생성-${suiteId}`,
          sportId,
          regionId,
          startsOn: new Date().toISOString(),
          endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          teamIds: [teamAId, teamBId],
        });
      const leagueId = createRes.body.data.leagueId;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/regenerate`)
        .set('x-v1-user-id', ownerUserId)
        .send({ weeksCount: 1, reason: '최초 생성을 재생성 경로로' });
      expect(res.status).toBe(201);
      expect(res.body.data.cancelledCount).toBe(0);
      expect(res.body.data.teamMatchIds).toHaveLength(1);
    });

    it('V1AdminUser 행이 없는 일반 유저는 403, 인증 헤더 없는 요청은 401로 거부된다', async () => {
      const forbiddenRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${randomUUID()}/fixtures/regenerate`)
        .set('x-v1-user-id', regularUserId)
        .send({ weeksCount: 1, reason: '권한 없는 시도' });
      expect(forbiddenRes.status).toBe(403);
      expect(forbiddenRes.body.code).toBe('PERMISSION_DENIED');

      const unauthRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${randomUUID()}/fixtures/regenerate`)
        .send({ weeksCount: 1, reason: '무인증 시도' });
      expect(unauthRes.status).toBe(401);
      expect(unauthRes.body.code).toBe('UNAUTHENTICATED');
    });
  });

  // placeAddress: UpdateLeagueFixtureDto에는 이미 있었지만 실제 저장 경로를 검증하는
  // 테스트가 없었다(어드민 표에 입력 컬럼도 없었다 — 이 태스크에서 함께 추가).
  describe('PATCH /admin/league-matches/:leagueId/fixtures/:teamMatchId — placeAddress', () => {
    it('placeAddress를 보내면 저장되고, 응답에 그대로 반영된다', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/admin/league-matches')
        .set('x-v1-user-id', ownerUserId)
        .send({
          title: `주소 저장 리그-${suiteId}`,
          sportId,
          regionId,
          startsOn: new Date().toISOString(),
          endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          teamIds: [teamAId, teamBId],
        });
      const leagueId = createRes.body.data.leagueId;
      const fixturesRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
        .set('x-v1-user-id', ownerUserId)
        .send({ weeksCount: 1 });
      const teamMatchId = fixturesRes.body.data.teamMatchIds[0];

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/league-matches/${leagueId}/fixtures/${teamMatchId}`)
        .set('x-v1-user-id', ownerUserId)
        .send({ placeAddress: '서울 마포구 상암동 1600' });
      expect(res.status).toBe(200);
      expect(res.body.data.placeAddress).toBe('서울 마포구 상암동 1600');

      const updated = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });
      expect(updated.placeAddress).toBe('서울 마포구 상암동 1600');

      // detail()도 placeAddress를 내려줘야 어드민 표가 기존 값을 채워 보여줄 수 있다 —
      // updateFixture()는 이미 이 필드를 저장하고 있었는데 조회 경로(select)가 빠져 있었다.
      const detailRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/league-matches/${leagueId}`)
        .set('x-v1-user-id', ownerUserId);
      expect(detailRes.status).toBe(200);
      const fixture = detailRes.body.data.fixtures.find((f: { teamMatchId: string }) => f.teamMatchId === teamMatchId);
      expect(fixture.placeAddress).toBe('서울 마포구 상암동 1600');
    });
  });
});

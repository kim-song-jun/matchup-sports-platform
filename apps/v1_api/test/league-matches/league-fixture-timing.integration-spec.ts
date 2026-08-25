import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

// 리그 대진 timing(경기 시간·휴식·팀당 하루 경기 수) — "한 구장 순차 진행" 모델.
// 운영자 요구(2026-08-25): 22시 리그에 한 경기장을 쓰면 4팀이 15분 경기·5분 휴식으로
// 22:00~00:00 사이 하루 6경기(팀당 3경기)를 치른다. 기존 생성기는 같은 주차의 모든
// 경기를 동일 시각으로 저장했으므로, timing 지정 시 경기별 순차 시각·endAt·제목 순번이
// 실제로 저장되는지가 이 스펙의 검증 대상이다.
const suiteId = randomUUID().slice(0, 8);
const ownerUserId = `lft-owner-${suiteId}`;

describe('리그 대진 timing(경기 시간·휴식·팀당 하루 경기 수)', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let sportId: string;
  let regionId: string;
  let teamIds: string[];

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
    const requiredDocumentIds = signupTerms.items
      .filter((item) => item.requirement === 'required')
      .map((item) => item.documentId);
    await termsService.acceptSignupTerms(ownerUserId, requiredDocumentIds);
    await prisma.v1AdminUser.create({ data: { userId: ownerUserId, adminRole: 'owner' } });

    const sport = await prisma.v1Sport.upsert({
      where: { code: 'futsal' },
      update: {},
      create: { code: 'futsal', name: '풋살' },
    });
    sportId = sport.id;
    const region = await prisma.v1Region.create({
      data: { code: `lft-region-${suiteId}`, name: 'LFT 타이밍 테스트 지역', level: 2 },
    });
    regionId = region.id;

    // 카톡 시나리오 그대로 4팀 리그.
    const teams = await Promise.all(
      ['a', 'b', 'c', 'd'].map((suffix) =>
        prisma.v1Team.create({ data: { ownerUserId, sportId, regionId, name: `lft-team-${suffix}-${suiteId}` } }),
      ),
    );
    teamIds = teams.map((team) => team.id);
  });

  afterAll(async () => cleanup?.());

  async function createLeague(title: string): Promise<string> {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', ownerUserId)
      .send({
        title,
        sportId,
        regionId,
        // 2026-08-31T00:00:00Z = KST 8/31(월) 09:00 → 수요일(3) 템플릿이면 첫 매치데이는 9/2(수).
        startsOn: '2026-08-31T00:00:00.000Z',
        endsOn: '2026-12-01T00:00:00.000Z',
        teamIds,
      });
    expect(createRes.status).toBe(201);
    return createRes.body.data.leagueId as string;
  }

  const kakaoTiming = { gameDurationMinutes: 15, breakMinutes: 5, gamesPerTeamPerDay: 3 };
  const wednesday22 = { dayOfWeek: 3, time: '22:00' };
  const expectedStartAts = [
    '2026-09-02T13:00:00.000Z', // 22:00 KST
    '2026-09-02T13:20:00.000Z',
    '2026-09-02T13:40:00.000Z',
    '2026-09-02T14:00:00.000Z',
    '2026-09-02T14:20:00.000Z',
    '2026-09-02T14:40:00.000Z', // 23:40 KST
  ];

  it('timing을 지정하면 하루 6경기가 20분 간격으로 저장되고 endAt·제목 순번까지 채워진다', async () => {
    const leagueId = await createLeague('타이밍 리그');
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', ownerUserId)
      .send({ weeksCount: 1, schedule: wednesday22, placeName: '베이컨 풋살장', timing: kakaoTiming });
    expect(res.status).toBe(201);
    expect(res.body.data.teamMatchIds).toHaveLength(6);

    const fixtures = await prisma.v1TeamMatch.findMany({
      where: { id: { in: res.body.data.teamMatchIds } },
      orderBy: { startAt: 'asc' },
    });
    expect(fixtures.map((f) => f.startAt.toISOString())).toEqual(expectedStartAts);
    expect(fixtures[0].endAt?.toISOString()).toBe('2026-09-02T13:15:00.000Z');
    expect(fixtures[5].endAt?.toISOString()).toBe('2026-09-02T14:55:00.000Z'); // 마지막 경기 23:55 KST 종료
    expect(fixtures.map((f) => f.title)).toEqual(
      [1, 2, 3, 4, 5, 6].map((order) => `타이밍 리그 1주차 ${order}경기`),
    );
    expect(fixtures.every((f) => f.placeName === '베이컨 풋살장')).toBe(true);
  });

  it('preview도 같은 timing 계산으로 endAt·매치데이 정보를 내려준다(DB 무변경)', async () => {
    const leagueId = await createLeague('타이밍 미리보기 리그');
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/preview`)
      .set('x-v1-user-id', ownerUserId)
      .send({ weeksCount: 1, schedule: wednesday22, timing: kakaoTiming });
    expect(res.status).toBe(201);
    expect(res.body.data.fixtureCount).toBe(6);
    expect(res.body.data.matchdayCount).toBe(1);
    expect(res.body.data.fixtures.map((f: { startAt: string }) => f.startAt)).toEqual(expectedStartAts);
    const first = res.body.data.fixtures[0];
    expect(first.endAt).toBe('2026-09-02T13:15:00.000Z');
    expect(first.matchday).toBe(1);
    expect(first.orderInDay).toBe(1);
    expect(await prisma.v1TeamMatch.count({ where: { leagueId } })).toBe(0);
  });

  it('timing 없이 생성하면 기존 계약 그대로다(같은 주차 동시 시작·endAt 없음·주차 제목)', async () => {
    const leagueId = await createLeague('레거시 리그');
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', ownerUserId)
      .send({ weeksCount: 1, schedule: wednesday22 });
    expect(res.status).toBe(201);

    const fixtures = await prisma.v1TeamMatch.findMany({ where: { leagueId } });
    expect(fixtures).toHaveLength(2); // 4팀 1라운드 = 2경기
    expect(new Set(fixtures.map((f) => f.startAt.toISOString())).size).toBe(1);
    expect(fixtures.every((f) => f.endAt === null)).toBe(true);
    expect(fixtures.every((f) => f.title === '레거시 리그 1주차')).toBe(true);
  });

  it('경기 시간 없이 팀당 하루 경기 수만 보내면 400으로 거부한다', async () => {
    const leagueId = await createLeague('불완전 타이밍 리그');
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', ownerUserId)
      .send({ weeksCount: 1, timing: { gamesPerTeamPerDay: 3 } });
    expect(res.status).toBe(400);
  });

  it('주차 수 × 팀당 하루 경기 수가 총 라운드 상한을 넘으면 422로 거부한다', async () => {
    const leagueId = await createLeague('상한 초과 리그');
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', ownerUserId)
      .send({ weeksCount: 52, timing: { gameDurationMinutes: 15, gamesPerTeamPerDay: 3 } });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('LEAGUE_FIXTURE_LIMIT_EXCEEDED');
    expect(await prisma.v1TeamMatch.count({ where: { leagueId } })).toBe(0);
  });
});

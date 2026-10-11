import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import request = require('supertest');
import { kstDayRange } from '../../src/common/pagination/list-facets';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createV1IntegrationApp } from '../integration/integration-app';

const DAY = 24 * 60 * 60 * 1000;
const host = randomUUID();

describe('개인 매치 목록 totalCount·facets HTTP/DB 계약', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let db: PrismaService;
  let sportA: string;
  let sportB: string;
  let regionId: string;
  let soonIsToday: boolean;

  const list = async (params: Record<string, string | number | boolean> = {}) => {
    const response = await request(app.getHttpServer()).get('/api/v1/matches').query({ regionId, limit: 50, ...params }).expect(200);
    return response.body.data as {
      items: Array<{ matchId: string }>;
      pageInfo: { totalCount?: number; nextCursor: string | null };
      facets?: { sports: Array<{ sportId: string; count: number }>; today: number; recruiting: number };
    };
  };
  const row = (sportId: string, over: Partial<Prisma.V1MatchCreateManyInput> = {}): Prisma.V1MatchCreateManyInput => ({
    hostUserId: host, sportId, regionId, title: '건수 검증', placeName: '서울 운동장', maxParticipants: 4,
    startAt: new Date(Date.now() + 3 * DAY), ...over,
  });

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    db = app.get(PrismaService);
    await db.v1User.create({ data: { id: host, email: `${host}@integration.test`, accountStatus: 'active', onboardingStatus: 'completed' } });
    sportA = (await db.v1Sport.create({ data: { code: `facet-a-${host}`, name: '풋살' } })).id;
    sportB = (await db.v1Sport.create({ data: { code: `facet-b-${host}`, name: '러닝' } })).id;
    regionId = (await db.v1Region.create({ data: { code: `facet-${host}`, name: '건수 지역', level: 2 } })).id;

    const soon = new Date(Date.now() + 60_000);
    const { gte, lt } = kstDayRange(new Date());
    soonIsToday = soon >= gte && soon < lt;
    await db.v1Match.createMany({
      data: [
        row(sportA, { startAt: soon }), // A 모집 중, 곧 시작(오늘일 수 있음)
        row(sportA), // A 모집 중
        row(sportA, { status: 'closed' }), // A 마감: 목록·종목 건수엔 포함, 모집 중 건수엔 제외
        row(sportA, { deletedAt: new Date() }), // 삭제: 어디에도 안 셈
        row(sportA, { status: 'cancelled' }), // 취소: 기본 목록에 없으므로 안 셈
        row(sportB), // B 모집 중
        row(sportB, { deadlineAt: new Date(Date.now() - 1000) }), // B 마감 시각 지남: 목록엔 있고 모집 중 건수엔 제외
      ],
    });
  });

  afterAll(async () => {
    await db.v1Match.deleteMany({ where: { hostUserId: host } });
    await db.v1User.delete({ where: { id: host } });
    await db.v1Region.delete({ where: { id: regionId } });
    await db.v1Sport.deleteMany({ where: { id: { in: [sportA, sportB] } } });
    await cleanup?.();
  });

  it('필터 없는 첫 페이지: 전체 건수는 보이는 목록 크기와 같고, 삭제·취소는 어떤 건수에도 없다', async () => {
    const body = await list();

    expect(body.items).toHaveLength(5);
    expect(body.pageInfo.totalCount).toBe(5);
    expect(body.facets?.sports).toEqual([{ sportId: sportA, count: 3 }, { sportId: sportB, count: 2 }]);
    expect(body.facets?.today).toBe(soonIsToday ? 1 : 0);
    expect(body.facets?.recruiting).toBe(3);
  });

  it('종목 필터: 전체 건수는 그 종목만 세지만 다른 종목 칩 건수는 그대로 남는다', async () => {
    const body = await list({ sportId: sportB });

    expect(body.items).toHaveLength(2);
    expect(body.pageInfo.totalCount).toBe(2);
    expect(body.facets?.sports).toEqual([{ sportId: sportA, count: 3 }, { sportId: sportB, count: 2 }]);
    expect(body.facets?.recruiting).toBe(1); // 종목 B 중 마감 시각이 지나지 않은 모집 중
    expect(body.facets?.today).toBe(0); // 오늘 시작하는 경기는 종목 A 뿐
  });

  it('모집 중 토글: 목록·전체 건수·종목 건수는 줄고, 모집 중 칩 건수는 토글 유무와 같다', async () => {
    const body = await list({ recruitingOnly: true });

    expect(body.items).toHaveLength(3);
    expect(body.pageInfo.totalCount).toBe(3);
    expect(body.facets?.sports).toEqual([{ sportId: sportA, count: 2 }, { sportId: sportB, count: 1 }]);
    expect(body.facets?.recruiting).toBe(3);
    expect(body.facets?.today).toBe(soonIsToday ? 1 : 0);
  });

  it('오늘 토글: 오늘 시작하지 않는 경기는 빠지고 오늘 칩 건수는 토글 전(오늘 경기 수)이다', async () => {
    const body = await list({ today: true });

    expect(body.pageInfo.totalCount).toBe(soonIsToday ? 1 : 0);
    expect(body.items).toHaveLength(soonIsToday ? 1 : 0);
    expect(body.facets?.today).toBe(soonIsToday ? 1 : 0);
    expect(body.facets?.recruiting).toBe(soonIsToday ? 1 : 0);
  });

  it('다음 페이지는 건수를 싣지 않고, 첫 페이지 건수는 limit 과 무관하게 전체 크기다', async () => {
    const first = await list({ limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.pageInfo.totalCount).toBe(5);

    const second = await list({ limit: 2, cursor: first.pageInfo.nextCursor! });
    expect(second.pageInfo).not.toHaveProperty('totalCount');
    expect(second).not.toHaveProperty('facets');
  });

  it('잘못된 토글 값은 400 이다', async () => {
    await request(app.getHttpServer()).get('/api/v1/matches').query({ today: 'yes' }).expect(400);
  });
});

import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { createV1IntegrationApp } from '../integration/integration-app';
import { KST_TODAY_FIXTURE_TIMEOUT_MS, startAtLaterTodayKst } from './kst-today-fixture';

const DAY = 24 * 60 * 60 * 1000;
const host = randomUUID();

describe('개인 매치 목록 totalCount·facets HTTP/DB 계약', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let db: PrismaService;
  let sportA: string;
  let sportB: string;
  let regionId: string;

  const list = async (params: Record<string, string | number | boolean> = {}) => {
    const response = await request(app.getHttpServer()).get('/api/v1/matches').query({ regionId, limit: 50, includeFacets: true, ...params }).expect(200);
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

    const laterToday = await startAtLaterTodayKst();
    await db.v1Match.createMany({
      data: [
        row(sportA, { startAt: laterToday }), // A 모집 중, KST 오늘 안에 아직 시작 전(유일한 오늘 경기)
        row(sportA), // A 모집 중
        row(sportA, { status: 'closed' }), // A 마감: 목록·종목 건수엔 포함, 모집 중 건수엔 제외
        row(sportA, { deletedAt: new Date() }), // 삭제: 어디에도 안 셈
        row(sportA, { status: 'cancelled' }), // 취소: 기본 목록에 없으므로 안 셈
        row(sportB), // B 모집 중
        row(sportB, { deadlineAt: new Date(Date.now() - 1000) }), // B 마감 시각 지남: 목록엔 있고 모집 중 건수엔 제외
      ],
    });
  }, KST_TODAY_FIXTURE_TIMEOUT_MS);

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
    expect(body.facets?.today).toBe(1);
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
    expect(body.facets?.today).toBe(1);
  });

  it('오늘 토글: 오늘 시작하지 않는 경기는 빠지고 오늘 칩 건수는 토글 전(오늘 경기 수)이다', async () => {
    const body = await list({ today: true });

    expect(body.pageInfo.totalCount).toBe(1);
    expect(body.items).toHaveLength(1);
    expect(body.facets?.today).toBe(1);
    expect(body.facets?.recruiting).toBe(1);
  });

  it('다음 페이지는 건수를 싣지 않고, 첫 페이지 건수는 limit 과 무관하게 전체 크기다', async () => {
    const first = await list({ limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.pageInfo.totalCount).toBe(5);

    const second = await list({ limit: 2, cursor: first.pageInfo.nextCursor! });
    expect(second.pageInfo).not.toHaveProperty('totalCount');
    expect(second).not.toHaveProperty('facets');
  });

  it('includeFacets 를 요청하지 않으면 건수를 싣지 않는다(폴링·부가 조회 경로)', async () => {
    const body = await list({ includeFacets: false });

    expect(body.items).toHaveLength(5);
    expect(body.pageInfo).not.toHaveProperty('totalCount');
    expect(body).not.toHaveProperty('facets');
  });

  it('잘못된 토글 값은 400 이다', async () => {
    await request(app.getHttpServer()).get('/api/v1/matches').query({ today: 'yes' }).expect(400);
  });
});

describe('개인 매치 모집 중 건수 — 정원 찬 글 제외(raw SQL 계약)', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let db: PrismaService;
  let sportId: string;
  let regionId: string;
  const hostId = randomUUID();
  const userIds = Array.from({ length: 4 }, () => randomUUID());
  let fullId: string;
  let freeSlotId: string;
  let cancelledSeatId: string;

  const list = async (params: Record<string, string | number | boolean> = {}) => {
    const response = await request(app.getHttpServer()).get('/api/v1/matches').query({ regionId, limit: 50, includeFacets: true, ...params }).expect(200);
    return response.body.data as { items: Array<{ matchId: string }>; pageInfo: { totalCount?: number }; facets?: { recruiting: number } };
  };
  const ids = (body: { items: Array<{ matchId: string }> }) => body.items.map((item) => item.matchId);

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    db = app.get(PrismaService);
    for (const id of [hostId, ...userIds]) {
      await db.v1User.create({ data: { id, email: `${id}@integration.test`, accountStatus: 'active', onboardingStatus: 'completed' } });
    }
    sportId = (await db.v1Sport.create({ data: { code: `full-${hostId}`, name: '풋살' } })).id;
    regionId = (await db.v1Region.create({ data: { code: `full-${hostId}`, name: '정원 지역', level: 2 } })).id;
    const startAt = new Date(Date.now() + 3 * DAY);
    const make = async (title: string, seats: Array<{ userId: string; status: 'active' | 'completed' | 'cancelled' | 'removed' }>) => {
      const match = await db.v1Match.create({ data: { hostUserId: hostId, sportId, regionId, title, placeName: '서울 운동장', maxParticipants: 2, startAt } });
      await db.v1MatchParticipant.createMany({ data: seats.map((seat) => ({ matchId: match.id, ...seat })) });
      return match.id;
    };
    // 같은 종목·같은 시각, 정원 2명. active + completed 두 명이면 가득 찬 글이다.
    fullId = await make('정원 찬 글', [{ userId: userIds[0], status: 'active' }, { userId: userIds[1], status: 'completed' }]);
    freeSlotId = await make('한 자리 남은 글', [{ userId: userIds[0], status: 'active' }]);
    // 취소·제외된 참가자는 자리를 차지하지 않는다.
    cancelledSeatId = await make('취소 좌석 글', [{ userId: userIds[0], status: 'active' }, { userId: userIds[1], status: 'cancelled' }, { userId: userIds[2], status: 'removed' }]);
  });

  afterAll(async () => {
    await db.v1Match.deleteMany({ where: { hostUserId: hostId } });
    await db.v1User.deleteMany({ where: { id: { in: [hostId, ...userIds] } } });
    await db.v1Region.delete({ where: { id: regionId } });
    await db.v1Sport.delete({ where: { id: sportId } });
    await cleanup?.();
  });

  it('필터 없는 목록과 전체 건수에는 정원 찬 글도 그대로 있고, 모집 중 칩만 뺀다', async () => {
    const body = await list();

    expect(ids(body)).toEqual(expect.arrayContaining([fullId, freeSlotId, cancelledSeatId]));
    expect(body.pageInfo.totalCount).toBe(3);
    expect(body.facets?.recruiting).toBe(2);
  });

  it('recruitingOnly 는 정원 찬 글을 빼고 한 자리 남은 글·취소 좌석 글은 남긴다', async () => {
    const body = await list({ recruitingOnly: true });

    expect(ids(body)).not.toContain(fullId);
    expect(ids(body).sort()).toEqual([freeSlotId, cancelledSeatId].sort());
    expect(body.pageInfo.totalCount).toBe(2);
    expect(body.facets?.recruiting).toBe(2);
  });
});

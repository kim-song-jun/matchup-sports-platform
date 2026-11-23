import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TournamentsReadService } from '../../src/tournaments/tournaments-read.service';
import { createV1IntegrationApp } from '../integration/integration-app';

/**
 * 활동 지역 우선("내 지역 먼저"): 대회·리그 목록의 상태 묶음 순서는 그대로 두고, 각 묶음 안에서 내 지역(시/도의 구/군 포함)이
 * 먼저 온다. 지역이 없는 행은 내 지역이 아니다. 걸러 내지 않는다. 순서는 DB 가 정하므로(`tournament-list-query.ts`)
 * ORDER BY·keyset 비교가 틀리면 보이는 순서가 바뀐다 — 그래서 DB 로 잰다.
 */
describe('대회 공개 목록 활동 지역 우선 DB 계약', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let db: PrismaService;
  let read: TournamentsReadService;
  let sportId: string;
  let provinceId: string;
  let districtId: string;
  let otherRegionId: string;
  const prefix = randomUUID().slice(0, 8);
  const id = (name: string) => `${prefix}-${name}`;
  const day = (d: number) => new Date(Date.UTC(2026, 9, d));

  type Seed = {
    name: string;
    status: 'open' | 'in_progress' | 'completed';
    region: 'province' | 'district' | 'other' | 'none';
    /** 등록 시각(분). 클수록 최신 — 진행 중·모집 중 묶음은 최신 등록이 먼저다. */
    created: number;
    /** 끝난 대회는 끝난 시각이 최신인 순서다. */
    end?: Date;
  };
  const seeds: Seed[] = [
    { name: 'ip-other', status: 'in_progress', region: 'other', created: 1 },
    { name: 'ip-mine', status: 'in_progress', region: 'district', created: 0 },
    { name: 'o-other-new', status: 'open', region: 'other', created: 5 },
    { name: 'o-none', status: 'open', region: 'none', created: 4 },
    { name: 'o-mine-p', status: 'open', region: 'province', created: 3 },
    { name: 'o-mine-d', status: 'open', region: 'district', created: 2 },
    { name: 'c-other', status: 'completed', region: 'other', created: 6, end: day(9) },
    { name: 'c-mine', status: 'completed', region: 'district', created: 7, end: day(3) },
  ];
  // 상태 묶음(진행 중 → 모집 중 → 끝남)은 지역과 무관하게 이 순서다. 묶음 안은 최신 등록(끝난 대회는 최신 종료)이 먼저다.
  const DEFAULT_ORDER = ['ip-other', 'ip-mine', 'o-other-new', 'o-none', 'o-mine-p', 'o-mine-d', 'c-other', 'c-mine'];
  const PREFERRED_ORDER = ['ip-mine', 'ip-other', 'o-mine-p', 'o-mine-d', 'o-other-new', 'o-none', 'c-mine', 'c-other'];

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    db = app.get(PrismaService);
    read = app.get(TournamentsReadService);
    sportId = (await db.v1Sport.create({ data: { code: `list-region-${prefix}`, name: '풋살' } })).id;
    provinceId = (await db.v1Region.create({ data: { code: `list-region-p-${prefix}`, name: '우선 시도', level: 1 } })).id;
    districtId = (await db.v1Region.create({ data: { code: `list-region-d-${prefix}`, name: '우선 구군', level: 2, parentId: provinceId } })).id;
    otherRegionId = (await db.v1Region.create({ data: { code: `list-region-o-${prefix}`, name: '다른 시도', level: 1 } })).id;
    const regionOf = { province: provinceId, district: districtId, other: otherRegionId, none: null } as const;
    for (const seed of seeds) {
      await db.v1Tournament.create({
        data: {
          id: id(seed.name),
          createdAt: new Date(Date.UTC(2026, 8, 1, 0, seed.created)),
          sportId,
          regionId: regionOf[seed.region],
          title: seed.name,
          status: seed.status,
          kind: 'regular_tournament',
          scheduledAt: seed.end ? day(1) : day(20),
          scheduledEndAt: seed.end ?? null,
          isPublic: true,
          teamCount: 8,
        },
      });
    }
  });

  afterAll(async () => {
    await db.v1Tournament.deleteMany({ where: { sportId } });
    await db.v1Region.delete({ where: { id: districtId } });
    await db.v1Region.deleteMany({ where: { id: { in: [provinceId, otherRegionId] } } });
    await db.v1Sport.delete({ where: { id: sportId } });
    await cleanup?.();
  });

  const list = (query: Record<string, unknown>) => read.list({ sportId, ...query } as never);
  const ids = (res: { items: Array<{ id: string }> }) => res.items.map((item) => item.id.slice(prefix.length + 1));

  it('지역을 주지 않으면 지금 순서 그대로다', async () => {
    expect(ids(await list({ limit: 50 }))).toEqual(DEFAULT_ORDER);
  });

  it('상태 묶음 순서는 그대로 두고 각 묶음 안에서 내 지역(시/도의 구/군 포함)이 먼저다 — 지역 없는 대회는 그 밖 무리다', async () => {
    expect(ids(await list({ limit: 50, preferRegionId: provinceId }))).toEqual(PREFERRED_ORDER);
  });

  it('구/군을 주면 그 구/군만 내 지역이다 — 같은 시/도 전체로 등록된 대회는 아니다', async () => {
    expect(ids(await list({ limit: 50, preferRegionId: districtId }))).toEqual([
      'ip-mine', 'ip-other', 'o-mine-d', 'o-other-new', 'o-none', 'o-mine-p', 'c-mine', 'c-other',
    ]);
  });

  it('어느 대회와도 맞지 않는 지역이면 순서를 바꾸지 않고 걸러 내지도 않는다', async () => {
    expect(ids(await list({ limit: 50, preferRegionId: randomUUID() }))).toEqual(DEFAULT_ORDER);
  });

  it.each([1, 2, 3, 5])('내 지역 순서로 커서를 이어 읽어도(limit %i) 한 번에 읽은 순서와 같고 겹치거나 빠지지 않는다', async (limit) => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 20; guard += 1) {
      const page = await list({ limit, cursor, preferRegionId: provinceId });
      seen.push(...ids(page));
      expect(page.pageInfo.hasNext).toBe(page.pageInfo.nextCursor !== null);
      cursor = page.pageInfo.nextCursor ?? undefined;
      if (!cursor) break;
    }
    expect(seen).toEqual(PREFERRED_ORDER);
  });

  it('쪽 번호로 읽어도 같은 순서다', async () => {
    const seen: string[] = [];
    for (let page = 1; page <= 3; page += 1) {
      const res = await list({ limit: 3, page, preferRegionId: provinceId });
      expect(res.pageInfo).toMatchObject({ page, total: PREFERRED_ORDER.length });
      seen.push(...ids(res));
    }
    expect(seen).toEqual(PREFERRED_ORDER);
  });

  it('지역을 준 목록의 커서를 지역 없이 쓰면(그 반대도) 빈 페이지다 — 순서가 다른 커서를 이어 읽지 않는다', async () => {
    const withPreference = await list({ limit: 2, preferRegionId: provinceId });
    const withoutPreference = await list({ limit: 2 });

    const mixedA = await list({ limit: 2, cursor: withPreference.pageInfo.nextCursor });
    const mixedB = await list({ limit: 2, cursor: withoutPreference.pageInfo.nextCursor, preferRegionId: provinceId });

    for (const res of [mixedA, mixedB]) {
      expect(res.items).toEqual([]);
      expect(res.pageInfo).toEqual({ nextCursor: null, hasNext: false });
    }
  });

  it('필터와 함께 써도 걸러 내는 건 필터뿐이다 — 상태 필터를 걸면 그 묶음 안에서만 내 지역이 먼저다', async () => {
    expect(ids(await list({ limit: 50, status: 'open', preferRegionId: provinceId }))).toEqual(['o-mine-p', 'o-mine-d', 'o-other-new', 'o-none']);
  });
});

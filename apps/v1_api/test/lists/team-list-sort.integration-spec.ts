import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { createV1IntegrationApp } from '../integration/integration-app';

const owner = randomUUID();
const PAGE = 2;

describe('팀 목록 정렬 HTTP/DB 계약', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let db: PrismaService;
  let sportId: string;
  let regionId: string;
  // 지역 우선 검증용 — 시/도(level 1) 아래 구/군(level 2)에 활동이 없는 팀 하나.
  let provinceId: string;
  let districtId: string;
  let localTeamId: string;
  const ids: Record<string, string> = {};

  type Page = { items: Array<{ id: string }>; pageInfo: { nextCursor: string | null; hasNext: boolean } };
  const fetchPage = async (params: Record<string, string | number>) => {
    const response = await request(app.getHttpServer()).get('/api/v1/teams').query({ regionId, ...params }).expect(200);
    return response.body.data as Page;
  };
  const names = (items: Array<{ id: string }>) => items.map((item) => Object.keys(ids).find((name) => ids[name] === item.id));
  const readAllByCursor = async (sort: string) => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard += 1) {
      const page = await fetchPage({ sort, limit: PAGE, ...(cursor ? { cursor } : {}) });
      seen.push(...page.items.map((item) => item.id));
      if (!page.pageInfo.hasNext) return seen;
      cursor = page.pageInfo.nextCursor ?? undefined;
    }
    throw new Error('커서가 끝나지 않아요.');
  };
  const create = async (name: string, over: Record<string, unknown> = {}) => {
    const team = await db.v1Team.create({
      data: { ownerUserId: owner, sportId, regionId, name: `${name}-${owner.slice(0, 8)}`, createdAt: new Date('2026-01-01T00:00:00Z'), ...over },
    });
    ids[name] = team.id;
    return team;
  };
  const hostMatch = (hostTeamId: string, over: Record<string, unknown> = {}) =>
    db.v1TeamMatch.create({
      data: { hostTeamId, createdByUserId: owner, sportId, regionId, title: '정렬 검증', placeName: '서울 운동장', startAt: new Date(Date.now() + 86_400_000), ...over },
    });

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    db = app.get(PrismaService);
    await db.v1User.create({ data: { id: owner, email: `${owner}@integration.test`, accountStatus: 'active', onboardingStatus: 'completed' } });
    sportId = (await db.v1Sport.create({ data: { code: `team-sort-${owner}`, name: '풋살' } })).id;
    regionId = (await db.v1Region.create({ data: { code: `team-sort-${owner}`, name: '정렬 지역', level: 2 } })).id;

    // 같은 시각에 만든 팀 5개(시드와 같은 모양)가 커서 경계를 넘나든다 — 활동·멤버 수가 같으면 id 로만 가려진다.
    await create('heavy', { memberCount: 2 });
    await create('light', { memberCount: 9 });
    await create('quiet-a', { memberCount: 2 });
    await create('quiet-b', { memberCount: 2 });
    await create('quiet-c', { memberCount: 2 });
    await create('newest', { memberCount: 2, createdAt: new Date('2026-06-01T00:00:00Z') });
    // 취소·삭제된 매치만 가진 팀 — 세는 정책이면 heavy(3)보다 앞서고, 빼면 맨 뒤 무리에 섞인다.
    await create('cancelled-only', { memberCount: 2 });
    await create('deleted-only', { memberCount: 2 });
    provinceId = (await db.v1Region.create({ data: { code: `team-sort-p-${owner}`, name: '정렬 시도', level: 1 } })).id;
    districtId = (await db.v1Region.create({ data: { code: `team-sort-d-${owner}`, name: '정렬 구군', level: 2, parentId: provinceId } })).id;
    // regionId 필터로 읽는 위 테스트들에는 섞이지 않는다(다른 지역). ids 에도 넣지 않아 "전부 한 번씩" 검증에 끼지 않는다.
    localTeamId = (await db.v1Team.create({
      data: { ownerUserId: owner, sportId, regionId: districtId, name: `local-${owner.slice(0, 8)}`, createdAt: new Date('2026-02-01T00:00:00Z'), memberCount: 2 },
    })).id;
    for (let i = 0; i < 3; i += 1) await hostMatch(ids.heavy);
    await hostMatch(ids.light);
    await hostMatch(ids.light, { status: 'cancelled' });
    for (let i = 0; i < 4; i += 1) await hostMatch(ids['cancelled-only'], { status: 'cancelled' });
    for (let i = 0; i < 4; i += 1) await hostMatch(ids['deleted-only'], { deletedAt: new Date() });
  });

  afterAll(async () => {
    await db.v1TeamMatch.deleteMany({ where: { createdByUserId: owner } });
    await db.v1Team.deleteMany({ where: { ownerUserId: owner } });
    await db.v1User.delete({ where: { id: owner } });
    await db.v1Region.delete({ where: { id: districtId } });
    await db.v1Region.delete({ where: { id: provinceId } });
    await db.v1Region.delete({ where: { id: regionId } });
    await db.v1Sport.delete({ where: { id: sportId } });
    await cleanup?.();
  });

  it('activity: 취소·삭제된 매치는 빼고 팀 매치를 많이 올린 팀이 앞에 오며, 같은 횟수는 최근 등록순이다', async () => {
    const page = await fetchPage({ sort: 'activity', limit: 50 });

    // light 는 취소 1건을 빼면 1건이다. 취소·삭제만 가진 팀은 활동 0이라 아무 매치도 없는 팀과 같은 무리다.
    expect(names(page.items).slice(0, 3)).toEqual(['heavy', 'light', 'newest']);
  });

  it('activity + preferRegionId: 그 시/도(하위 구/군 포함)의 팀이 활동이 없어도 앞에 오고, 나머지는 걸러 내지 않고 활동순으로 이어진다', async () => {
    // 지역 필터(regionId)는 걸지 않는다 — 지역 우선은 "걸러 내기"가 아니라 순서만 바꾸는 것이다. 종목으로만 이 스펙의 팀을 모은다.
    const read = async (extra: Record<string, string | number>) =>
      (await request(app.getHttpServer()).get('/api/v1/teams').query({ sportId, sort: 'activity', limit: 50, ...extra }).expect(200)).body.data as Page;

    const plain = await read({});
    const preferred = await read({ preferRegionId: provinceId });

    // 지역을 주지 않으면 활동 0인 local 은 활동 0 무리 안에서 최근 등록순(newest 다음)이다.
    expect(plain.items.map((item) => item.id).indexOf(localTeamId)).toBe(3);
    // 시/도를 주면 구/군 소속 local 이 맨 앞이고, 뒤는 기존 활동순 그대로다.
    expect(preferred.items[0].id).toBe(localTeamId);
    expect(names(preferred.items.slice(1, 4))).toEqual(['heavy', 'light', 'newest']);
    expect(preferred.items).toHaveLength(plain.items.length);
  });

  it('activity + preferRegionId: 더 보기로 이어 읽어도 중복·누락이 없다', async () => {
    const whole = await request(app.getHttpServer()).get('/api/v1/teams').query({ sportId, sort: 'activity', preferRegionId: provinceId, limit: 50 }).expect(200);
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard += 1) {
      const page = (await request(app.getHttpServer()).get('/api/v1/teams')
        .query({ sportId, sort: 'activity', preferRegionId: provinceId, limit: PAGE, ...(cursor ? { cursor } : {}) }).expect(200)).body.data as Page;
      seen.push(...page.items.map((item) => item.id));
      if (!page.pageInfo.hasNext) break;
      cursor = page.pageInfo.nextCursor ?? undefined;
    }

    expect(seen).toEqual((whole.body.data as Page).items.map((item) => item.id));
    expect(seen[0]).toBe(localTeamId);
  });

  it('latest(기본): 활동·멤버 수와 무관하게 최근 등록순이다', async () => {
    const page = await fetchPage({ sort: 'latest', limit: 50 });
    const byDefault = await fetchPage({ limit: 50 });

    expect(names(page.items)[0]).toBe('newest');
    expect(byDefault.items.map((item) => item.id)).toEqual(page.items.map((item) => item.id));
  });

  it('member_count: 멤버가 많은 팀이 앞에 온다', async () => {
    const page = await fetchPage({ sort: 'member_count', limit: 50 });

    expect(names(page.items)[0]).toBe('light');
  });

  it.each(['activity', 'member_count', 'latest'])('%s: 더 보기로 이어 읽어도 중복·누락 없이 한 번에 읽은 순서와 같다', async (sort) => {
    const whole = await fetchPage({ sort, limit: 50 });
    const stitched = await readAllByCursor(sort);

    expect(stitched).toEqual(whole.items.map((item) => item.id));
    expect(new Set(stitched).size).toBe(Object.keys(ids).length);
  });

  it.each(['recommended', 'trust', 'deadline'])('걷어 낸 정렬값(%s)은 400 이다', async (sort) => {
    await request(app.getHttpServer()).get('/api/v1/teams').query({ regionId, sort }).expect(400);
  });
});

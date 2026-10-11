import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { v1Get } from '@/lib/api-client';
import { v1MswHandlers } from './handlers';

type FacetPage = {
  items: { id: string }[];
  pageInfo?: { totalCount?: number };
  facets: { today: number; recruiting: number; sports: { sportId: string; count: number }[] };
};

const server = setupServer(...v1MswHandlers);

describe('MSW /team-matches 모집 중 칩', () => {
  beforeAll(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
    server.listen({ onUnhandledRequest: 'error' });
  });
  afterAll(() => {
    server.close();
    vi.unstubAllEnvs();
  });

  afterEach(() => vi.useRealTimers());

  it('종목 필터를 유지한 채 센다 — 팀 매치가 없는 종목이면 0건', async () => {
    const other = await v1Get<FacetPage>('/team-matches', { sportId: 'sport-futsal', includeFacets: true });
    expect(other.items).toHaveLength(0);
    expect(other.facets.recruiting).toBe(0);

    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-05-22T16:00:00.000Z') });
    const soccer = await v1Get<FacetPage>('/team-matches', { sportId: 'sport-soccer', includeFacets: true });
    expect(soccer.facets.recruiting).toBe(soccer.items.length);
    expect(soccer.items.length).toBeGreaterThan(0);
  });

  it.each(['/matches', '/teams', '/team-matches'])('%s 종목 칩 건수는 sport 객체 없는 픽스처 행도 sportName 으로 센다', async (path) => {
    const page = await v1Get<FacetPage>(path, { includeFacets: true });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.facets.sports.length).toBeGreaterThan(0);
    expect(page.facets.sports.reduce((sum, item) => sum + item.count, 0)).toBe(page.items.length);
  });

  // 픽스처: match-1 은 KST 2026-05-19 05:00, team-match-1 은 KST 2026-05-23 06:00 시작.
  describe.each([
    { path: '/matches', id: 'match-1', todayNow: '2026-05-18T16:00:00.000Z', otherDayNow: '2026-05-20T01:00:00.000Z' },
    { path: '/team-matches', id: 'team-match-1', todayNow: '2026-05-22T16:00:00.000Z', otherDayNow: '2026-05-25T01:00:00.000Z' },
  ])('$path 토글', ({ path, id, todayNow, otherDayNow }) => {
    it('today=true 는 KST 오늘 시작하는 행만 돌려주고 totalCount 가 facets.today 와 같다', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(todayNow) });
      const page = await v1Get<FacetPage>(path, { today: true, includeFacets: true });
      expect(page.items.map((item) => item.id)).toEqual([id]);
      expect(page.pageInfo?.totalCount).toBe(page.facets.today);
      expect(page.facets.today).toBe(1);

      vi.setSystemTime(new Date(otherDayNow));
      const other = await v1Get<FacetPage>(path, { today: true, includeFacets: true });
      expect(other.items).toHaveLength(0);
      expect(other.pageInfo?.totalCount).toBe(0);
      expect(other.facets.today).toBe(0);
    });

    it('recruitingOnly=true 는 지금 신청할 수 있는 행만 돌려주고 totalCount 가 facets.recruiting 과 같다', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(todayNow) });
      const page = await v1Get<FacetPage>(path, { recruitingOnly: true, includeFacets: true });
      expect(page.items.map((item) => item.id)).toEqual([id]);
      expect(page.pageInfo?.totalCount).toBe(page.facets.recruiting);

      // 시작 시각이 지나면 신청할 수 없다.
      vi.setSystemTime(new Date('2026-06-30T00:00:00.000Z'));
      const past = await v1Get<FacetPage>(path, { recruitingOnly: true, includeFacets: true });
      expect(past.items).toHaveLength(0);
      expect(past.facets.recruiting).toBe(0);
    });

    it('각 칩은 자기 토글만 빼고 센다 — 다른 토글은 유지', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(todayNow) });
      const page = await v1Get<FacetPage>(path, { today: true, includeFacets: true });
      expect(page.facets.recruiting).toBe(1);
      vi.setSystemTime(new Date('2026-06-30T00:00:00.000Z'));
      const both = await v1Get<FacetPage>(path, { recruitingOnly: true, includeFacets: true });
      expect(both.facets.today).toBe(0);
    });

    it('커서 요청이나 includeFacets 없는 요청에는 totalCount·facets 를 싣지 않는다', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(todayNow) });
      const noFacets = await v1Get<FacetPage>(path, { today: true });
      expect(noFacets.facets).toBeUndefined();
      const cursor = await v1Get<FacetPage>(path, { today: true, includeFacets: true, cursor: 'c1' });
      expect(cursor.facets).toBeUndefined();
    });
  });
});

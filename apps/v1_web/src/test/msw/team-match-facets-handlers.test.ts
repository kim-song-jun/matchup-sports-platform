import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { v1Get } from '@/lib/api-client';
import { v1MswHandlers } from './handlers';

type FacetPage = { items: unknown[]; facets: { recruiting: number; sports: { sportId: string; count: number }[] } };

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

  it('종목 필터를 유지한 채 센다 — 팀 매치가 없는 종목이면 0건', async () => {
    const other = await v1Get<FacetPage>('/team-matches', { sportId: 'sport-futsal', includeFacets: true });
    expect(other.items).toHaveLength(0);
    expect(other.facets.recruiting).toBe(0);

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
});

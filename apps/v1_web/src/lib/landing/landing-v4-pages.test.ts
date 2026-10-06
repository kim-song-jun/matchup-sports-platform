import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchSeoSeed = vi.fn();
vi.mock('@/lib/seo-list', () => ({ fetchSeoSeed: (...args: unknown[]) => fetchSeoSeed(...args) }));

const { fetchAllPages } = await import('./landing-v4-data');

function page(ids: string[], nextCursor: string | null) {
  return { items: ids.map((id) => ({ id })), nextCursor: null, pageInfo: { nextCursor, hasNext: nextCursor !== null } };
}

describe('fetchAllPages', () => {
  beforeEach(() => fetchSeoSeed.mockReset());

  it('pageInfo.nextCursor 를 따라 끝 페이지까지 이어 붙이고 "더 있음"을 끈다', async () => {
    fetchSeoSeed.mockResolvedValueOnce(page(['a', 'b'], 'c1')).mockResolvedValueOnce(page(['c'], null));
    const merged = await fetchAllPages<{ id: string }>('/teams', 'teams');
    expect(merged?.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(merged?.pageInfo.hasNext).toBe(false);
    expect(fetchSeoSeed.mock.calls[1][0]).toBe('/teams?limit=50&cursor=c1');
  });

  it('publication-sensitive landing lists pass no-store through to their API reads', async () => {
    fetchSeoSeed.mockResolvedValue(page([], null));

    await fetchAllPages('/team-matches', 'landing-v4 team-matches', { cache: 'no-store' });

    expect(fetchSeoSeed).toHaveBeenCalledWith('/team-matches?limit=50', 'landing-v4 team-matches', { cache: 'no-store' });
  });

  it('4페이지에서 멈추고 "더 있음"을 남긴다', async () => {
    fetchSeoSeed.mockImplementation(async () => page(['x'], 'next'));
    const merged = await fetchAllPages<{ id: string }>('/teams', 'teams');
    expect(fetchSeoSeed).toHaveBeenCalledTimes(4);
    expect(merged?.items).toHaveLength(4);
    expect(merged?.pageInfo.hasNext).toBe(true);
  });

  it('첫 페이지 실패는 null, 중간 실패는 받은 데까지 + "더 있음"', async () => {
    fetchSeoSeed.mockResolvedValueOnce(null);
    expect(await fetchAllPages('/teams', 'teams')).toBeNull();

    fetchSeoSeed.mockReset();
    fetchSeoSeed.mockResolvedValueOnce(page(['a'], 'c1')).mockResolvedValueOnce(null);
    const partial = await fetchAllPages<{ id: string }>('/teams', 'teams');
    expect(partial?.items.map((i) => i.id)).toEqual(['a']);
    expect(partial?.pageInfo.hasNext).toBe(true);
  });
});

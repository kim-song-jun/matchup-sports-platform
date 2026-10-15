import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBLIC_SITE_ROUTES } from '@/lib/public-site/routes';
import { fetchPublicV1 } from '@/lib/seo';

// 목록 API 는 전부 404(null) — 정적 경로만 남는 상황에서도 공개 도움말 페이지는 빠지면 안 된다.
vi.mock('@/lib/seo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/seo')>()),
  fetchPublicV1: vi.fn(async () => null),
}));

const { default: sitemap } = await import('./sitemap');

describe('sitemap', () => {
  it('indexes canonical league detail without historical aliases', async () => {
    vi.mocked(fetchPublicV1).mockImplementation(async (path) => path.startsWith('/league-matches?') ? { items: [{ leagueId: 'league-1' }], pageInfo: { hasNext: false, nextCursor: null } } : null);
    const urls = (await sitemap()).map(entry => entry.url);
    expect(urls).toContain('https://teameet.co.kr/tournaments/league-1');
    expect(urls).not.toContain('https://teameet.co.kr/league-matches/league-1');
  });
  beforeEach(() => {
    vi.mocked(fetchPublicV1).mockReset().mockResolvedValue(null);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('리그 경기는 최종 상세 주소로 싣고 친선 경기는 기존 주소를 유지한다', async () => {
    vi.mocked(fetchPublicV1).mockImplementation(async (path) => path.startsWith('/team-matches?') ? {
      items: [
        { teamMatchId: 'fixture-1', league: { leagueId: 'league-1' } },
        { teamMatchId: 'friendly-1', league: null },
      ], nextCursor: null,
    } : null);
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain('https://teameet.co.kr/league-matches/league-1/fixtures/fixture-1');
    expect(urls).not.toContain('https://teameet.co.kr/team-matches/fixture-1');
    expect(urls).toContain('https://teameet.co.kr/team-matches/friendly-1');
  });

  it('공개 대회에 실제 생성된 경기만 기존 상세 주소로 싣는다', async () => {
    vi.mocked(fetchPublicV1).mockImplementation(async (path) => {
      if (path.startsWith('/tournaments?')) return {
        items: [{ id: 'cup-1', title: '풋살컵', sport: { name: '풋살' }, kind: 'regular_tournament', status: 'completed' }],
        pageInfo: { hasNext: false, nextCursor: null },
      };
      if (path === '/tournaments/cup-1') return { fixtures: [{ id: 'game-1' }] };
      return null;
    });
    expect((await sitemap()).map((entry) => entry.url)).toContain('https://teameet.co.kr/tournaments/cup-1/matches/game-1');
  });

  it('도움말·이용 대상·문의 페이지를 전부 싣고, 콘텐츠 갱신일을 lastModified 로 준다', async () => {
    const entries = await sitemap();
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]));

    for (const route of PUBLIC_SITE_ROUTES) {
      const entry = byUrl.get(`https://teameet.co.kr${route.path}`);
      expect(entry, `${route.path} 가 sitemap 에 없다`).toBeDefined();
      if (route.lastModified) expect(entry!.lastModified).toEqual(new Date(route.lastModified));
      else expect(entry).not.toHaveProperty('lastModified');
    }
  });
});

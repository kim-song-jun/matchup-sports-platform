import { afterEach, describe, expect, it, vi } from 'vitest';
import sitemap from '@/app/sitemap';
import { collectPublicTournamentDetails } from './public-competition-discovery';
import type { V1TournamentListItem } from '@/types/api';

const page = (items: unknown[]) => ({ items, pageInfo: { hasNext: false, nextCursor: null } });
const response = (data: unknown) => new Response(JSON.stringify({ status: 'success', data }), { status: 200 });
const item = (id: string, status = 'completed') => ({ id, status, kind: 'regular_tournament', title: id, sport: { name: '풋살' } }) as V1TournamentListItem;
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('공개 대회 발견성 HTTP 계약', () => {
  it('리그 후기도 발견하고, 상세는 캐시하되 최신 공개 목록에서 숨겨지면 즉시 제외한다', async () => {
    vi.stubEnv('INTERNAL_API_ORIGIN', 'http://seo-api.test');
    let published = true;
    const reads: Array<{ path: string; query: URLSearchParams; init: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit) => {
      const url = new URL(input); const path = url.pathname.replace('/api/v1', '');
      reads.push({ path, query: url.searchParams, init });
      if (path === '/tournaments') return response(page(published && url.searchParams.get('kind') === 'all'
        ? [{ ...item('league'), kind: 'regular_league' }] : []));
      if (path === '/league-matches') return response(page(published ? [{ leagueId: 'league' }] : []));
      if (path === '/tournaments/league') return response({ fixtures: [], reviewsTotalCount: 1 });
      if (path === '/notices') return response({ notices: [] });
      if (['/matches', '/teams', '/team-matches'].includes(path)) return response(page([]));
      throw new Error(`Unexpected public request: ${path}`);
    }));

    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain('https://teameet.co.kr/tournaments/league/reviews');
    const detailReads = reads.filter((r) => r.path === '/tournaments/league');
    expect(detailReads).toHaveLength(1);
    expect(detailReads[0]?.init.next).toEqual({ revalidate: 300 });
    expect(detailReads[0]?.init.cache).toBeUndefined();
    expect(reads.find((r) => r.path === '/tournaments')?.init.cache).toBe('no-store');

    // 상세 캐시가 남아 있어도 최신 공개 목록에서 숨겨진 페이지는 발행하지 않는다.
    published = false; reads.length = 0;
    expect((await sitemap()).some((entry) => entry.url.includes('/tournaments/league'))).toBe(false);
    expect(reads.some((r) => r.path === '/tournaments/league')).toBe(false);
  });

  it('동시 상세 조회를 두 건으로 제한하고 완료 순서와 무관하게 목록 순서를 보존한다', async () => {
    let active = 0; let peak = 0; let drain = false;
    const started: string[] = [];
    const releases = new Map<string, () => void>();
    vi.stubGlobal('fetch', vi.fn((input: string) => {
      const id = new URL(input).pathname.split('/').at(-1)!;
      started.push(id);
      if (drain) return Promise.resolve(response({ fixtures: [] }));
      active += 1; peak = Math.max(peak, active);
      return new Promise<Response>((resolve) => releases.set(id, () => {
        releases.delete(id); active -= 1; resolve(response({ fixtures: [] }));
      }));
    }));
    const pending = collectPublicTournamentDetails([item('a'), item('b'), item('c'), item('draft', 'draft')]);
    try {
      expect([...started]).toEqual(['a', 'b']);
      releases.get('b')!();
      await vi.waitFor(() => expect(started).toContain('c'));
      expect(peak).toBe(2);
      releases.get('c')!(); releases.get('a')!();
      expect((await pending).items?.map(({ item: row }) => row.id)).toEqual(['a', 'b', 'c']);
      expect(started).not.toContain('draft');
    } finally {
      drain = true; for (const release of [...releases.values()]) release(); await pending;
    }
  });
});

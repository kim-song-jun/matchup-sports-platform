import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBLIC_SITE_ROUTES } from '@/lib/public-site/routes';
import { fetchPublicV1 } from '@/lib/seo';

vi.mock('@/lib/seo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/seo')>()),
  fetchPublicV1: vi.fn(),
}));

const emptyPage = { items: [], nextCursor: null, pageInfo: { hasNext: false, nextCursor: null } };

// 공개 목록이 비어 있는 정상 응답. 상세 엔드포인트는 이 기본값에서 404(null)다.
function emptyApi(path: string) {
  if (path.startsWith('/notices')) return { notices: [] };
  if (/^\/(matches|team-matches|teams|tournaments|league-matches)\?/.test(path)) return emptyPage;
  return null;
}

const { default: sitemap } = await import('./sitemap');

describe('sitemap', () => {
  it('기존 대회 유형별 대표 주소는 싣고, 빈 후기와 통합 전 리그 중복은 싣지 않는다', async () => {
    vi.mocked(fetchPublicV1).mockImplementation(async (path) => {
      if (path.startsWith('/tournaments?')) return {
        // 실제 API는 kind가 없으면 정규 대회만 반환한다.
        items: [{ id: 'cup' }, { id: 'empty' }, ...(new URL(path, 'https://api.test').searchParams.get('kind') === 'all'
          ? [{ id: 'league', kind: 'regular_league' }] : [])],
        pageInfo: { hasNext: false, nextCursor: null },
      };
      if (path.startsWith('/league-matches?')) return {
        items: [{ leagueId: 'league' }], pageInfo: { hasNext: false, nextCursor: null },
      };
      if (path === '/tournaments/cup') return { fixtures: [], reviewsTotalCount: 2 };
      if (path === '/tournaments/empty') return { fixtures: [], reviewsTotalCount: 0 };
      if (path === '/tournaments/league') return { fixtures: [], reviewsTotalCount: 1 };
      return emptyApi(path);
    });
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain('https://teameet.co.kr/tournaments?kind=tournament');
    expect(urls).toContain('https://teameet.co.kr/tournaments?kind=league');
    expect(urls).toContain('https://teameet.co.kr/tournaments/cup/reviews');
    expect(urls).not.toContain('https://teameet.co.kr/tournaments/empty/reviews');
    expect(urls).toContain('https://teameet.co.kr/tournaments/league/reviews');
    for (const subroute of ['bracket', 'results', 'awards']) {
      expect(urls).not.toContain(`https://teameet.co.kr/tournaments/league/${subroute}`);
    }
    expect(urls.filter((url) => url === 'https://teameet.co.kr/tournaments/league')).toHaveLength(1);
    for (const id of ['cup', 'empty', 'league']) {
      const reads = vi.mocked(fetchPublicV1).mock.calls.filter(([path]) => path === `/tournaments/${id}`);
      expect(reads, `${id} 상세를 대진·후기 확인에 중복 조회하면 안 된다`).toHaveLength(1);
    }
  });
  it('indexes canonical league detail without historical aliases', async () => {
    vi.mocked(fetchPublicV1).mockImplementation(async (path) => path.startsWith('/league-matches?')
      ? { items: [{ leagueId: 'league-1' }], pageInfo: { hasNext: false, nextCursor: null } } : emptyApi(path));
    const urls = (await sitemap()).map(entry => entry.url);
    expect(urls).toContain('https://teameet.co.kr/tournaments/league-1');
    expect(urls).not.toContain('https://teameet.co.kr/league-matches/league-1');
  });
  beforeEach(() => {
    vi.mocked(fetchPublicV1).mockReset().mockImplementation(async (path) => emptyApi(path));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('리그 경기는 최종 상세 주소로 싣고 친선 경기는 기존 주소를 유지한다', async () => {
    vi.mocked(fetchPublicV1).mockImplementation(async (path) => path.startsWith('/team-matches?') ? {
      items: [
        { teamMatchId: 'fixture-1', league: { leagueId: 'league-1' } },
        { teamMatchId: 'friendly-1', league: null },
      ], nextCursor: null,
    } : emptyApi(path));
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
      return emptyApi(path);
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

const page = (items: unknown[]) => ({ items, nextCursor: null, pageInfo: { hasNext: false, nextCursor: null } });
const siteUrl = (path: string) => `https://teameet.co.kr${path}`;

function apiFailing(isFailing: (path: string) => boolean, mode: 'throw' | '404') {
  vi.mocked(fetchPublicV1).mockImplementation(async (path) => {
    if (!isFailing(path)) return emptyApi(path);
    if (mode === 'throw') throw new Error(`SEO metadata request failed: ${path} (500)`);
    return null;
  });
}

describe('sitemap 공개 목록 조회 실패', () => {
  beforeEach(() => {
    vi.mocked(fetchPublicV1).mockReset().mockImplementation(async (path) => emptyApi(path));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  const sources: Array<[string, (path: string) => boolean]> = [
    ['매치', (path) => path.startsWith('/matches?')],
    ['팀', (path) => path.startsWith('/teams?')],
    ['팀 매치', (path) => path.startsWith('/team-matches?')],
    ['대회', (path) => path.startsWith('/tournaments?')],
    ['공지', (path) => path.startsWith('/notices')],
    ['리그', (path) => path.startsWith('/league-matches?')],
  ];

  it.each(sources)('%s 목록 조회가 예외를 던지면 일부만 담은 사이트맵을 내지 않고 실패한다', async (_name, isFailing) => {
    apiFailing(isFailing, 'throw');
    await expect(sitemap()).rejects.toThrow();
  });

  it.each(sources)('%s 목록 엔드포인트의 404 는 빈 목록이 아니라 오류다', async (_name, isFailing) => {
    apiFailing(isFailing, '404');
    await expect(sitemap()).rejects.toThrow();
  });

  it('매치 상태별 조회 하나만 실패해도 나머지 상태 결과로 대신하지 않는다', async () => {
    apiFailing((path) => path.startsWith('/matches?') && path.includes('status=expired'), 'throw');
    await expect(sitemap()).rejects.toThrow();
  });

  it('전부 성공하면 정적 주소와 공개 도움말 주소가 나온다', async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain(siteUrl('/landing'));
    for (const route of PUBLIC_SITE_ROUTES) expect(urls).toContain(siteUrl(route.path));
  });
});

describe('sitemap 대회 상세 조회 재시도', () => {
  const tournament = (id: string) => ({ id, kind: 'regular_tournament', status: 'open' });
  const detailReads = (id: string) =>
    vi.mocked(fetchPublicV1).mock.calls.filter(([path]) => path === `/tournaments/${id}`);

  function flakyDetail(failuresBeforeSuccess: number) {
    let failures = 0;
    vi.mocked(fetchPublicV1).mockImplementation(async (path) => {
      if (path.startsWith('/tournaments?')) return page([tournament('a'), tournament('b'), tournament('c')]);
      if (path === '/tournaments/b' && failures < failuresBeforeSuccess) {
        failures += 1;
        throw new Error('SEO metadata request failed: /tournaments/b (503)');
      }
      if (path.startsWith('/tournaments/')) return { fixtures: [], reviewsTotalCount: 1 };
      return emptyApi(path);
    });
  }

  beforeEach(() => {
    vi.mocked(fetchPublicV1).mockReset().mockImplementation(async (path) => emptyApi(path));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('상세 한 건이 한 번 실패했다 성공하면 정상 목록을 내고 그 한 건만 다시 읽는다', async () => {
    flakyDetail(1);
    const urls = (await sitemap()).map((entry) => entry.url);
    for (const id of ['a', 'b', 'c']) expect(urls).toContain(siteUrl(`/tournaments/${id}/reviews`));
    expect(detailReads('b')).toHaveLength(2);
    expect(detailReads('a')).toHaveLength(1);
    expect(detailReads('c')).toHaveLength(1);
  });

  it('다시 읽어도 실패하면 일부만 담지 않고 실패한다', async () => {
    flakyDetail(2);
    await expect(sitemap()).rejects.toThrow();
    expect(detailReads('b')).toHaveLength(2);
  });

  it('상세가 404 인 대회는 실패가 아니다 — 다시 읽지 않고 대회·대진 주소는 싣고 후기 주소만 뺀다', async () => {
    vi.mocked(fetchPublicV1).mockImplementation(async (path) => {
      if (path.startsWith('/tournaments?')) return page([tournament('a'), tournament('b')]);
      if (path === '/tournaments/a') return { fixtures: [], reviewsTotalCount: 1 };
      return emptyApi(path);
    });
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain(siteUrl('/tournaments/b'));
    expect(urls).toContain(siteUrl('/tournaments/b/bracket'));
    expect(urls).not.toContain(siteUrl('/tournaments/b/reviews'));
    expect(urls).toContain(siteUrl('/tournaments/a/reviews'));
    expect(detailReads('b')).toHaveLength(1);
  });
});

describe('sitemap 대회 하위 주소와 갱신 시각', () => {
  beforeEach(() => {
    vi.mocked(fetchPublicV1).mockReset().mockImplementation(async (path) => emptyApi(path));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('결과·시상 주소는 끝난 대회에만 싣고 대진은 모두 싣는다', async () => {
    vi.mocked(fetchPublicV1).mockImplementation(async (path) => {
      if (path.startsWith('/tournaments?')) return page([
        { id: 'done', kind: 'regular_tournament', status: 'completed' },
        { id: 'live', kind: 'regular_tournament', status: 'in_progress' },
        { id: 'open', kind: 'regular_tournament', status: 'open' },
      ]);
      if (path.startsWith('/tournaments/')) return { fixtures: [], reviewsTotalCount: 0 };
      return emptyApi(path);
    });
    const urls = (await sitemap()).map((entry) => entry.url);
    for (const id of ['done', 'live', 'open']) {
      expect(urls).toContain(siteUrl(`/tournaments/${id}`));
      expect(urls).toContain(siteUrl(`/tournaments/${id}/bracket`));
    }
    for (const subroute of ['results', 'awards']) {
      expect(urls).toContain(siteUrl(`/tournaments/done/${subroute}`));
      expect(urls).not.toContain(siteUrl(`/tournaments/live/${subroute}`));
      expect(urls).not.toContain(siteUrl(`/tournaments/open/${subroute}`));
    }
  });

  it('목록 응답이 갱신 시각을 주는 대회에만 lastModified 를 싣고 주지 않는 팀·매치·리그에는 지어내 싣지 않는다', async () => {
    vi.mocked(fetchPublicV1).mockImplementation(async (path) => {
      if (path.startsWith('/tournaments?')) return page([
        { id: 'cup', kind: 'regular_tournament', status: 'open', updatedAt: '2026-11-01T03:00:00.000Z' },
      ]);
      if (path.startsWith('/teams?')) return page([{ id: 'team-1' }]);
      if (path.startsWith('/matches?')) return page([{ id: 'match-1' }]);
      if (path.startsWith('/team-matches?')) return page([{ teamMatchId: 'tm-1', league: null }]);
      if (path.startsWith('/league-matches?')) return page([{ leagueId: 'league-1' }]);
      if (path.startsWith('/tournaments/')) return { fixtures: [], reviewsTotalCount: 0 };
      return emptyApi(path);
    });
    const byUrl = new Map((await sitemap()).map((entry) => [entry.url, entry]));
    expect(byUrl.get(siteUrl('/tournaments/cup'))?.lastModified).toEqual(new Date('2026-11-01T03:00:00.000Z'));
    for (const path of ['/teams/team-1', '/matches/match-1', '/team-matches/tm-1', '/tournaments/league-1']) {
      expect(byUrl.get(siteUrl(path)), `${path} 가 사이트맵에 없다`).toBeDefined();
      expect(byUrl.get(siteUrl(path))).not.toHaveProperty('lastModified');
    }
  });
});

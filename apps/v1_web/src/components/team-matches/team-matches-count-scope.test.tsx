import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSyncExternalStore, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CursorPage, V1TeamMatch } from '@/types/api';
import { TeamMatchListPageClient } from './team-matches-client';

// 실제 client/view와 API hook을 사용한다. Next 탐색과 HTTP 전송 경계만 대체한다.
const { apiGet, router } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  router: {
    push: vi.fn((href: string) => {
      window.history.pushState({}, '', href);
      window.dispatchEvent(new Event('count-scope-navigation'));
    }),
    replace: vi.fn((href: string) => {
      window.history.replaceState({}, '', href);
      window.dispatchEvent(new Event('count-scope-navigation'));
    }),
  },
}));
vi.mock('@/lib/api-client', async (original) => ({
  ...await original<typeof import('@/lib/api-client')>(), v1Get: apiGet,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('next/link', () => ({
  default: ({ href, onClick, prefetch: _prefetch, scroll: _scroll, ...props }: ComponentProps<'a'> & { href: string; prefetch?: boolean; scroll?: boolean }) => (
    <a {...props} href={href} onClick={(event) => {
      onClick?.(event);
      if (!event.defaultPrevented && event.button === 0) {
        event.preventDefault();
        router.push(href);
      }
    }} />
  ),
}));

type Filters = Record<string, string | number | boolean | undefined>;
let client: QueryClient;
let response: (filters?: Filters) => CursorPage<V1TeamMatch> | Promise<CursorPage<V1TeamMatch>>;

function page(items: V1TeamMatch[], nextCursor: string | null): CursorPage<V1TeamMatch> {
  return { items, nextCursor, pageInfo: { nextCursor, hasNext: nextCursor !== null } };
}

function fixtures(): V1TeamMatch[] {
  const startsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  return Array.from({ length: 60 }, (_, index) => {
    const sport = index < 12 ? { sportId: 'futsal', name: '풋살' } : { sportId: 'basketball', name: '농구' };
    return {
      id: `count-${index}`, teamMatchId: `count-${index}`, title: `합성 경기 ${index}`,
      sportName: sport.name, sport, startsAt, placeName: '합성 구장', capacityText: '2팀',
      // 앞 50건은 모집 중, 뒤 10건은 신청 마감이다 — '모집 중 N' 토글이 실제로 좁히는지 본다.
      status: index < 50 ? 'recruiting' : 'closed', viewerState: 'guest',
    };
  });
}

/** 서버가 센 건수(includeFacets). 종목 건수는 종목 필터만 뺀 나머지 필터로 센다. */
function facetPage(matches: V1TeamMatch[], filters: Filters): CursorPage<V1TeamMatch> {
  const pool = matches.filter((match) => (filters.recruitingOnly ? match.status === 'recruiting' : true) && (filters.query === '없는' ? false : true));
  const scoped = filters.sportId ? pool.filter((match) => match.sport?.sportId === filters.sportId) : pool;
  const sports = ['futsal', 'basketball'].map((sportId) => ({ sportId, count: pool.filter((match) => match.sport?.sportId === sportId).length }));
  return {
    items: scoped.slice(0, 1),
    nextCursor: null,
    pageInfo: { nextCursor: null, hasNext: false, totalCount: scoped.length },
    facets: { sports, today: 0, recruiting: scoped.filter((match) => match.status === 'recruiting').length },
  };
}

function subscribe(listener: () => void) {
  window.addEventListener('count-scope-navigation', listener);
  return () => window.removeEventListener('count-scope-navigation', listener);
}
function ListRoute() {
  useSyncExternalStore(subscribe, () => window.location.href);
  return <TeamMatchListPageClient />;
}
function mount() {
  return render(<QueryClientProvider client={client}><ListRoute /></QueryClientProvider>);
}
function matchLinks() {
  return screen.queryAllByRole('link').filter((link) => /^\/team-matches\/count-\d/.test(link.getAttribute('href') ?? ''));
}
async function expectLoaded(count: number) {
  await waitFor(() => expect(matchLinks()).toHaveLength(count));
  expect(new Set(matchLinks().map((link) => link.getAttribute('href'))).size).toBe(count);
}
async function expectSummary(total: number, recruiting: number) {
  await waitFor(() => expect(document.querySelector('.tm-match-summary-row')).toHaveTextContent(`${total}개 · 오늘 0`));
  expect(screen.getByRole('link', { name: `모집 중 ${recruiting}` })).toBeVisible();
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/team-matches');
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const matches = fixtures();
  response = (filters) => {
    if (filters?.includeFacets) return facetPage(matches, filters);
    if (filters?.query === '없는') return page([], null);
    if (filters?.sportId === 'futsal') return page(matches.slice(0, 12), null);
    if (filters?.recruitingOnly) return page(matches.slice(0, 20), 'page-20');
    if (filters?.cursor === 'page-20') return page(matches.slice(20, 40), 'page-40');
    if (filters?.cursor === 'page-40') return page(matches.slice(40), null);
    return page(matches.slice(0, 20), 'page-20');
  };
  apiGet.mockImplementation((path: string, filters?: Filters) => {
    if (path === '/team-matches') return response(filters);
    if (path === '/master/sports') return [{ id: 'futsal', name: '풋살' }, { id: 'basketball', name: '농구' }];
    if (path === '/search/recent') return { items: [] };
    throw new Error(`Unexpected API path: ${path}`);
  });
});
afterEach(() => { cleanup(); client.clear(); });

// MD-QA #30: 칩·요약 숫자가 불러온 20건만 세어 "전체 20"처럼 보였다. 2026-10-21 부터 서버가 센 전체 건수(includeFacets)를
// 쓰므로 "불러온 목록 기준" 안내 문구는 없앴다.
describe('MD-QA #30 팀매치 건수 — 서버가 센 전체 건수', () => {
  it('첫 화면부터 전체 건수를 보이고, 더 보기를 눌러도 숫자가 바뀌지 않는다', async () => {
    mount();
    await expectLoaded(20);
    await expectSummary(60, 50);
    expect(screen.getByRole('link', { name: '전체 60' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '풋살 12' })).toBeVisible();
    expect(screen.getByRole('link', { name: '농구 48' })).toBeVisible();
    expect(screen.queryByText('전체·종목별 건수는 불러온 목록 기준이에요')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    await expectLoaded(40);
    await expectSummary(60, 50);
    expect(screen.getByRole('link', { name: '전체 60' })).toBeVisible();
    expect(screen.getByRole('link', { name: '농구 48' })).toBeVisible();
  });

  it('종목을 고르면 요약은 그 종목 건수이고, 다른 종목 칩은 전체 건수를 유지한다', async () => {
    mount();
    await expectLoaded(20);
    fireEvent.click(await screen.findByRole('link', { name: '풋살 12' }));
    await expectLoaded(12);
    expect(new URLSearchParams(window.location.search).get('sportId')).toBe('futsal');
    await expectSummary(12, 12);
    expect(screen.getByRole('link', { name: '전체 60' })).toBeVisible();
    expect(screen.getByRole('link', { name: '풋살 12' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '농구 48' })).toBeVisible();
  });

  it("'모집 중 N'을 누르면 신청 가능한 매치만 조회하고, 다시 누르면 푼다", async () => {
    mount();
    await expectLoaded(20);
    await expectSummary(60, 50);

    fireEvent.click(screen.getByRole('link', { name: '모집 중 50' }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('recruitingOnly')).toBe('1'));
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/team-matches', expect.objectContaining({ recruitingOnly: true })));
    await expectSummary(50, 50);
    expect(screen.getByRole('link', { name: '모집 중 50' })).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getByRole('link', { name: '모집 중 50' }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('recruitingOnly')).toBeNull());
    await expectSummary(60, 50);
  });

  it('검색 결과 0건이면 요약도 0건이다', async () => {
    window.history.replaceState({}, '', '/team-matches?q=없는');
    mount();
    await screen.findByText('조건에 맞는 팀매치가 없어요');
    await expectLoaded(0);
    await expectSummary(0, 0);
    expect(screen.getByRole('textbox', { name: '팀매치 검색어' })).toHaveValue('없는');
    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
  });

  it('첫 로딩 중에는 실제 카드·빈 상태를 만들어내지 않는다', () => {
    response = () => new Promise(() => {});
    mount();
    expect(document.querySelector('.tm-skeleton-page')).toBeInTheDocument();
    expect(matchLinks()).toHaveLength(0);
    expect(screen.queryByText('조건에 맞는 팀매치가 없어요')).not.toBeInTheDocument();
  });
});

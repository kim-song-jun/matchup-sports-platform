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
      status: 'recruiting', viewerState: 'guest',
    };
  });
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
  expect(document.querySelector('.tm-match-summary-row')).toHaveTextContent(`${count}개 · 오늘 0 · 모집 중 ${count}`);
}
function expectScopeNotes() {
  expect(screen.getByText('전체·종목별 건수는 불러온 목록 기준이에요')).toBeVisible();
  const scope = screen.getByText('현재 목록 기준');
  expect(scope).toBeVisible();
  expect(document.querySelector('.tm-match-summary-row')).toContainElement(scope);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/team-matches');
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const matches = fixtures();
  response = (filters) => {
    if (filters?.query === '없는') return page([], null);
    if (filters?.sportId === 'futsal') return page(matches.slice(0, 12), null);
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

describe('MD-QA #30 팀매치 건수의 불러온 목록 범위', () => {
  it('최초 20건과 더 보기 후 40건의 배지·요약을 보존하면서 범위를 설명한다', async () => {
    mount();
    await expectLoaded(20);
    expect(screen.getByRole('link', { name: '전체 20' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '풋살 12' })).toBeVisible();
    expect(screen.getByRole('link', { name: '농구 8' })).toBeVisible();
    expectScopeNotes();

    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    await expectLoaded(40);
    expect(screen.getByRole('link', { name: '전체 40' })).toBeVisible();
    expect(screen.getByRole('link', { name: '풋살 12' })).toBeVisible();
    expect(screen.getByRole('link', { name: '농구 28' })).toBeVisible();
    expectScopeNotes();
    expect(screen.getByRole('button', { name: '더 보기' })).toBeEnabled();
  });

  it('종목 선택 후 비교용 배지 20건과 선택 목록 요약 12건의 범위를 각각 설명한다', async () => {
    mount();
    await expectLoaded(20);
    fireEvent.click(screen.getByRole('link', { name: '풋살 12' }));
    await expectLoaded(12);
    expect(new URLSearchParams(window.location.search).get('sportId')).toBe('futsal');
    expect(screen.getByRole('link', { name: '전체 20' })).toBeVisible();
    expect(screen.getByRole('link', { name: '풋살 12' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '농구 8' })).toBeVisible();
    expectScopeNotes();
  });

  it('검색 결과 0건에도 안내와 실제 빈 목록 요약을 유지한다', async () => {
    window.history.replaceState({}, '', '/team-matches?q=없는');
    mount();
    await screen.findByText('조건에 맞는 팀매치가 없어요');
    await expectLoaded(0);
    expect(await screen.findByRole('link', { name: '전체 0' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: '팀매치 검색어' })).toHaveValue('없는');
    expectScopeNotes();
    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
  });

  it('첫 로딩 중에도 안내를 보이고 실제 카드·빈 상태를 만들어내지 않는다', () => {
    response = () => new Promise(() => {});
    mount();
    expect(document.querySelector('.tm-skeleton-page')).toBeInTheDocument();
    expect(matchLinks()).toHaveLength(0);
    expect(screen.queryByText('조건에 맞는 팀매치가 없어요')).not.toBeInTheDocument();
    expectScopeNotes();
  });
});

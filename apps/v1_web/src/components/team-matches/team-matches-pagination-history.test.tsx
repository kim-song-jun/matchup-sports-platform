import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1QueryClient } from '@/lib/query-client';
import { clearV1IdentityCache, v1Keys } from '@/lib/query-keys';
import { shouldPersistQuery } from '@/lib/query-persist';
import { __resetNavigationHistoryForTests, installNavigationHistory } from '@/lib/navigation-history';
import type { CursorPage, V1TeamMatch } from '@/types/api';
import { TeamMatchDetailPageClient, TeamMatchListPageClient } from './team-matches-client';

// 실제 client/view/API hook/cache를 유지한다. Next의 soft navigation만 jsdom history로,
// HTTP 전송 경계만 합성 응답으로 대체한다. 실제 alpha/viewport QA를 뜻하지 않는다.
const { apiGet, apiPost, router } = vi.hoisted(() => ({
  apiGet: vi.fn(), apiPost: vi.fn(),
  router: {
    push: vi.fn((href: string) => { window.history.pushState({}, '', href); window.dispatchEvent(new Event('test-navigation')); }),
    replace: vi.fn((href: string) => { window.history.replaceState({}, '', href); window.dispatchEvent(new Event('test-navigation')); }),
    back: vi.fn(() => window.history.back()),
    forward: vi.fn(() => window.history.forward()),
    prefetch: vi.fn(),
  },
}));
vi.mock('@/lib/api-client', async (original) => ({ ...await original<typeof import('@/lib/api-client')>(), v1Get: apiGet, v1Post: apiPost }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('next/link', () => ({
  default: ({ href, onClick, prefetch: _prefetch, scroll: _scroll, ...props }: ComponentProps<'a'> & { href: string; prefetch?: boolean; scroll?: boolean }) => (
    <a {...props} href={href} onClick={(event) => {
      onClick?.(event);
      if (!event.defaultPrevented && event.button === 0) { event.preventDefault(); router.push(href); }
    }} />
  ),
}));

type Filters = Record<string, string | number | boolean | undefined>;
let client: QueryClient;
let response: (filters?: Filters) => CursorPage<V1TeamMatch> | Promise<CursorPage<V1TeamMatch>>;

function match(index: number, prefix = 'tm'): V1TeamMatch {
  return {
    id: `${prefix}-${index}`, teamMatchId: `${prefix}-${index}`, title: `합성 경기 ${prefix}-${index}`,
    sportName: '풋살', sport: { sportId: 'futsal', name: '풋살' }, placeName: '합성 구장',
    startsAt: '2030-10-01T10:00:00.000Z', capacityText: '2팀', status: 'recruiting', viewerState: 'guest',
    minLevelCode: 'beginner', maxLevelCode: 'advanced',
    minLevel: { code: 'beginner', name: '입문' }, maxLevel: { code: 'advanced', name: '고수' },
  };
}
function page(start: number, length: number, next: string | null, prefix = 'tm'): CursorPage<V1TeamMatch> {
  return { items: Array.from({ length }, (_, i) => match(start + i, prefix)), nextCursor: next, pageInfo: { nextCursor: next, hasNext: next !== null } };
}
function defaultResponse(filters?: Filters) {
  const offset = Number(String(filters?.cursor ?? 'page-0').split('-')[1]);
  const next = offset + 20 < 69 ? `page-${offset + 20}` : null;
  return page(offset, Math.min(20, 69 - offset), next);
}
function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener); window.addEventListener('test-navigation', listener);
  return () => { window.removeEventListener('popstate', listener); window.removeEventListener('test-navigation', listener); };
}
function Routes() {
  const href = useSyncExternalStore(subscribe, () => window.location.href);
  const url = new URL(href);
  const id = url.pathname.split('/')[2];
  return id ? <TeamMatchDetailPageClient key={id} teamMatchId={id} /> : <TeamMatchListPageClient />;
}
function mount() { return render(<QueryClientProvider client={client}><Routes /></QueryClientProvider>); }
function cards() { return Array.from(document.querySelectorAll<HTMLAnchorElement>('a.tm-match-row')); }
async function expectCards(count: number) {
  await waitFor(() => expect(cards()).toHaveLength(count));
  expect(new Set(cards().map((item) => item.href)).size).toBe(count);
  expect(document.querySelector('.tm-match-summary-row')).toHaveTextContent(`${count}개`);
}
async function loadTo(count: 40 | 69) {
  await expectCards(20);
  for (const target of count === 40 ? [40] : [40, 60, 69]) {
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    await expectCards(target);
    await waitFor(() => expect(client.isFetching()).toBe(0));
  }
}
async function openDetail() {
  fireEvent.click(cards()[0]);
  await waitFor(() => expect(window.location.pathname).toMatch(/^\/team-matches\/tm-/));
  await screen.findAllByRole('link', { name: '뒤로가기' });
}
async function browserBack() {
  await act(async () => {
    const pop = new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }));
    router.back(); await pop;
  });
}
async function appBack(kind: 'mobile' | 'desktop') {
  const selector = kind === 'mobile' ? '.tm-hero-button[aria-label="뒤로가기"]' : '.tm-desktop-back';
  fireEvent.click(document.querySelector<HTMLAnchorElement>(selector)!);
  await waitFor(() => expect(window.location.pathname).toBe('/team-matches'));
}

beforeEach(() => {
  __resetNavigationHistoryForTests(); window.sessionStorage.clear();
  window.history.replaceState({}, '', '/team-matches'); installNavigationHistory();
  vi.clearAllMocks();
  client = createV1QueryClient(); client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } });
  response = defaultResponse;
  apiGet.mockImplementation((path: string, filters?: Filters) => {
    if (path === '/team-matches') return response(filters);
    if (path.startsWith('/team-matches/')) return match(Number(path.split('-').at(-1)));
    if (path === '/master/sports') return [{ sportId: 'futsal', name: '풋살' }];
    if (path === '/search/recent') return { items: [] };
    throw new Error(`Unexpected API path: ${path}`);
  });
  apiPost.mockResolvedValue({});
});
afterEach(() => { cleanup(); client.clear(); __resetNavigationHistoryForTests(); });

describe('#1568 실제 팀매치 목록 누적 상태와 상세 복귀', () => {
  it.each([
    ['browser', 40], ['browser', 69], ['mobile', 40], ['mobile', 69], ['desktop', 40], ['desktop', 69],
  ] as const)('%s 복귀에서 %i건과 더보기 상태를 보존한다', async (back, count) => {
    mount(); await loadTo(count); await openDetail();
    if (back === 'browser') await browserBack(); else await appBack(back);
    await expectCards(count);
    if (count === 69) expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
    else { fireEvent.click(screen.getByRole('button', { name: '더 보기' })); await expectCards(60); }
  });

  it('q+kind+sort URL을 보존하고 Back→Forward→Back 반복에도 누적 목록을 유지한다', async () => {
    router.replace('/team-matches?q=합성&kind=friendly&sort=latest');
    mount(); await loadTo(40);
    expect(cards()[0].getAttribute('href')).toContain(encodeURIComponent('/team-matches?q=%ED%95%A9%EC%84%B1&kind=friendly&sort=latest'));
    await openDetail(); await browserBack(); await expectCards(40);
    expect(window.location.search).toBe('?q=%ED%95%A9%EC%84%B1&kind=friendly&sort=latest');
    await act(async () => {
      const pop = new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }));
      router.forward(); await pop;
    });
    await screen.findAllByRole('link', { name: '뒤로가기' });
    await appBack('desktop'); await expectCards(40);
  });

  it.each([['mobile', ''], ['browser', '&sort=latest']] as const)('대회 유형+리그 검색의 35건을 %s 복귀에서도 보존한다', async (back, sort) => {
    router.replace(`/team-matches?kind=competition&q=리그${sort}`);
    response = (filters) => filters?.cursor ? page(20, 15, null) : page(0, 20, 'page-20');
    mount(); await expectCards(20);
    fireEvent.click(screen.getByRole('button', { name: '더 보기' })); await expectCards(35);
    await openDetail();
    if (back === 'browser') await browserBack(); else await appBack(back);
    await expectCards(35);
    expect(new URLSearchParams(window.location.search).get('kind')).toBe('competition');
    expect(new URLSearchParams(window.location.search).get('q')).toBe('리그');
    expect(screen.getByPlaceholderText('지역, 팀 이름, 경기조건 검색')).toHaveValue('리그');
    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
  });

  it.each(['sportId=futsal', 'genderRule=남', 'levelCodes=beginner', 'kind=friendly', 'sort=latest', 'view=compact', 'q=다음'])('조건 %s로 바꿀 때 이전 cursor·카드가 섞이지 않는다', async (search) => {
    mount(); await loadTo(40); const previousCalls = apiGet.mock.calls.length;
    response = (filters) => filters && Object.keys(filters).some((key) => key !== 'cursor') ? page(0, 3, null, 'new') : defaultResponse(filters);
    act(() => router.replace(`/team-matches?${search}`));
    await waitFor(() => expect(document.querySelectorAll('a.tm-match-row, a.tm-team-match-compact-row')).toHaveLength(3));
    expect(document.body).not.toHaveTextContent('합성 경기 tm-');
    const requests = apiGet.mock.calls.slice(previousCalls).filter(([path, filters]) => path === '/team-matches' && filters && Object.keys(filters).some((key) => key !== 'cursor'));
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every(([, filters]) => filters.cursor === undefined)).toBe(true);
  });

  it('빠른 조건 변경·이전 조건 재방문은 각각 새 첫 페이지로 시작한다', async () => {
    mount(); await loadTo(40);
    let resolveOld!: (value: CursorPage<V1TeamMatch>) => void;
    response = (filters) => filters?.query === '첫째'
      ? new Promise((resolve) => { resolveOld = resolve; })
      : filters?.query === '둘째' ? page(0, 2, null, 'second') : defaultResponse(filters);
    act(() => router.replace('/team-matches?q=첫째'));
    await waitFor(() => expect(resolveOld).toBeDefined());
    act(() => router.replace('/team-matches?q=둘째&kind=friendly'));
    await expectCards(2);
    await act(async () => resolveOld(page(0, 5, null, 'first')));
    await expectCards(2);
    act(() => router.replace('/team-matches'));
    await expectCards(20);
  });

  it('pending 더보기의 이전 페이지 placeholder를 성공 snapshot으로 저장하지 않는다', async () => {
    mount(); await loadTo(40);
    let finish!: (value: CursorPage<V1TeamMatch>) => void;
    response = (filters) => filters?.cursor ? new Promise((resolve) => { finish = resolve; }) : defaultResponse(filters);
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    expect(screen.getByRole('button', { name: '불러오는 중…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '불러오는 중…' }));
    await openDetail();
    await act(async () => finish(page(40, 20, 'page-60')));
    await browserBack(); await expectCards(40);
    fireEvent.click(screen.getByRole('button', { name: '더 보기' })); await expectCards(60);
  });

  it('더보기 실패는 실제 오류를 보이고 같은 cursor 재시도로 성공한 누적 목록을 보존한다', async () => {
    mount(); await loadTo(40);
    response = (filters) => filters?.cursor === 'page-40' ? Promise.reject(new Error('합성 조회 실패')) : defaultResponse(filters);
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    await screen.findByRole('button', { name: '다시 불러오기' });
    response = defaultResponse;
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' })); await expectCards(60);
    await openDetail(); await browserBack(); await expectCards(60);
  });

  it('서버 페이지에 중복 ID가 있어도 카드와 복귀 후 누적 수를 중복하지 않는다', async () => {
    response = (filters) => filters?.cursor ? { ...page(20, 20, null), items: [match(0), ...page(20, 20, null).items] } : page(0, 20, 'page-20');
    mount(); await loadTo(40); await openDetail(); await browserBack(); await expectCards(40);
  });

  it('실패한 페이지를 남긴 채 상세로 이동해도 복귀 시 마지막 성공 40건부터 다시 더볼 수 있다', async () => {
    mount(); await loadTo(40);
    response = (filters) => filters?.cursor === 'page-40' ? Promise.reject(new Error('합성 조회 실패')) : defaultResponse(filters);
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    await screen.findByRole('button', { name: '다시 불러오기' });
    act(() => router.push('/team-matches/tm-0'));
    await screen.findAllByRole('link', { name: '뒤로가기' });
    response = defaultResponse;
    await browserBack(); await expectCards(40);
    fireEvent.click(screen.getByRole('button', { name: '더 보기' })); await expectCards(60);
  });

  it.each(['removed', 'invalidated'] as const)('저장된 cursor의 실제 페이지 캐시가 %s 상태면 첫 페이지부터 조회한다', async (state) => {
    const rendered = mount(); await loadTo(40); rendered.unmount();
    const key = v1Keys.teamMatches({ cursor: 'page-20' });
    if (state === 'removed') client.removeQueries({ queryKey: key, exact: true });
    else await client.invalidateQueries({ queryKey: key, exact: true, refetchType: 'none' });
    mount(); await expectCards(20);
  });

  it('캐시 초기화 후 직접 상세에서 돌아오면 첫 페이지이고 pagination은 영구 저장하지 않는다', async () => {
    const rendered = mount(); await loadTo(40);
    for (const query of client.getQueryCache().findAll({ queryKey: v1Keys.teamMatchesAll() })) expect(shouldPersistQuery(query)).toBe(false);
    rendered.unmount(); clearV1IdentityCache(client);
    router.replace('/team-matches/tm-0'); mount(); await screen.findAllByRole('link', { name: '뒤로가기' });
    await appBack('desktop'); await expectCards(20);
    expect(screen.getByRole('button', { name: '더 보기' })).toBeEnabled();
  });
});

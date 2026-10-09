import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSyncExternalStore, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CursorPage, V1TeamMatch } from '@/types/api';
import { TeamMatchListPageClient } from './team-matches-client';

// 실제 client/view/API hook을 유지한다. replace는 URL 커밋 전 대기시켜 Next 탐색 지연을 재현한다.
const { apiGet, apiPost, navigation, router } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  navigation: { pendingReplace: undefined as string | undefined, routeHref: '' },
  router: {
    push: vi.fn((href: string) => {
      window.history.pushState({}, '', href);
      window.dispatchEvent(new Event('search-sync-navigation'));
    }),
    replace: vi.fn(),
    back: vi.fn(() => window.history.back()),
    forward: vi.fn(() => window.history.forward()),
  },
}));
vi.mock('@/lib/api-client', async (original) => ({
  ...await original<typeof import('@/lib/api-client')>(), v1Get: apiGet, v1Post: apiPost,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => new URL(navigation.routeHref || window.location.href).pathname,
  useSearchParams: () => new URL(navigation.routeHref || window.location.href).searchParams,
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

function fixtures(): V1TeamMatch[] {
  return Array.from({ length: 20 }, (_, index) => {
    const sport = index < 12 ? { sportId: 'futsal', name: '풋살' } : { sportId: 'basketball', name: '농구' };
    return {
      id: `search-sync-${index}`, teamMatchId: `search-sync-${index}`, title: `합성 경기 ${index}`,
      sportName: sport.name, sport, startsAt: '2030-10-01T10:00:00.000Z', placeName: '합성 구장',
      capacityText: '2팀', status: 'recruiting', viewerState: 'guest',
    };
  });
}
function page(items: V1TeamMatch[]): CursorPage<V1TeamMatch> {
  return { items, nextCursor: null, pageInfo: { nextCursor: null, hasNext: false } };
}
function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}
function subscribe(listener: () => void) {
  window.addEventListener('search-sync-navigation', listener);
  window.addEventListener('popstate', listener);
  return () => {
    window.removeEventListener('search-sync-navigation', listener);
    window.removeEventListener('popstate', listener);
  };
}
function ListRoute() {
  useSyncExternalStore(subscribe, () => window.location.href);
  return <TeamMatchListPageClient />;
}
function mount() {
  return render(<QueryClientProvider client={client}><ListRoute /></QueryClientProvider>);
}
function cards() {
  return document.querySelectorAll('a.tm-match-row');
}
async function expectCards(count: number) {
  await waitFor(() => expect(cards()).toHaveLength(count));
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(document.querySelector('.tm-match-summary-row')).toHaveTextContent(`${count}개`);
}
function queryIn(link: HTMLElement) {
  return new URL(link.getAttribute('href') ?? '', window.location.origin).searchParams.get('q');
}
async function browserNavigate(direction: 'back' | 'forward') {
  await act(async () => {
    const pop = new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }));
    router[direction]();
    await pop;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  navigation.pendingReplace = undefined;
  navigation.routeHref = '';
  router.replace.mockImplementation((href: string) => { navigation.pendingReplace = href; });
  window.history.replaceState({}, '', '/team-matches?q=이전검색');
  client = newClient();
  const matches = fixtures();
  response = (filters) => {
    let items = filters?.query === '이전검색' ? [] : filters?.query === '새검색' ? matches.slice(11, 14) : matches;
    if (filters?.sportId) items = items.filter((match) => match.sport?.sportId === filters.sportId);
    return page(items);
  };
  apiGet.mockImplementation((path: string, filters?: Filters) => {
    if (path === '/team-matches') return response(filters);
    if (path === '/master/sports') return [{ id: 'futsal', name: '풋살' }, { id: 'basketball', name: '농구' }];
    if (path === '/search/recent') return { items: [] };
    throw new Error(`Unexpected API path: ${path}`);
  });
  apiPost.mockResolvedValue({});
});
afterEach(() => { cleanup(); client.clear(); });

describe('MD-QA #30 검색 적용과 탐색 URL 동기화', () => {
  it('검색 X 직후 전체를 클릭하고 새로고침해도 지운 검색어와 0건 결과가 되살아나지 않는다', async () => {
    // Given: 이전 검색 URL은 커밋되어 있고 replace 갱신만 아직 완료되지 않는다.
    const view = mount();
    await screen.findByText('조건에 맞는 팀매치가 없어요');
    // When: 실제 X와 전체 링크를 연속 클릭한 URL을 새 클라이언트로 다시 읽는다.
    fireEvent.click(screen.getByRole('button', { name: '검색어 지우기' }));
    expect(navigation.pendingReplace).toBe('/team-matches');
    expect(new URLSearchParams(window.location.search).get('q')).toBe('이전검색');
    fireEvent.click(screen.getByRole('link', { name: /^전체 / }));
    view.unmount();
    client.clear();
    client = newClient();
    mount();
    // Then: URL, 실제 입력, 렌더된 목록 모두 빈 검색 조건이다.
    expect(new URLSearchParams(window.location.search).get('q')).toBeNull();
    expect(screen.getByRole('textbox', { name: '팀매치 검색어' })).toHaveValue('');
    await expectCards(20);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('검색 X 직후 다른 종목으로 이동해도 이전 검색어 없이 해당 종목 목록을 불러온다', async () => {
    // Given
    mount();
    await screen.findByText('조건에 맞는 팀매치가 없어요');
    // When
    fireEvent.click(screen.getByRole('button', { name: '검색어 지우기' }));
    fireEvent.click(screen.getByRole('link', { name: /^농구 / }));
    // Then
    expect(new URLSearchParams(window.location.search).get('q')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('sportId')).toBe('basketball');
    await expectCards(8);
    expect(screen.getByRole('textbox', { name: '팀매치 검색어' })).toHaveValue('');
  });

  it('새 검색 제출 직후 종목과 필터 링크는 새 검색어를 유지하고 실제 조회에도 적용한다', async () => {
    // Given
    mount();
    await screen.findByText('조건에 맞는 팀매치가 없어요');
    // When
    fireEvent.change(screen.getByRole('textbox', { name: '팀매치 검색어' }), { target: { value: ' 새검색 ' } });
    fireEvent.click(screen.getByRole('button', { name: '검색' }));
    // Then: URL은 아직 이전 검색이지만 적용한 조건으로 모든 후속 링크를 만든다.
    await expectCards(3);
    expect(new URLSearchParams(window.location.search).get('q')).toBe('이전검색');
    const navigationLinks = screen.getAllByRole('link').filter((link) => link.matches('.tm-sport-chip-row a, .tm-list-filter-button'));
    expect(navigationLinks).toHaveLength(4);
    for (const link of navigationLinks) {
      expect(queryIn(link)).toBe('새검색');
    }
    const basketball = screen.getByRole('link', { name: /^농구 / });
    expect(queryIn(basketball)).toBe('새검색');
    fireEvent.click(basketball);
    await expectCards(2);
    expect(new URLSearchParams(window.location.search).get('q')).toBe('새검색');
    expect(screen.getByRole('textbox', { name: '팀매치 검색어' })).toHaveValue('새검색');
    expect(apiGet.mock.calls.some(([path, filters]) => path === '/team-matches' && filters?.query === '새검색' && filters?.sportId === 'basketball')).toBe(true);
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith('/search/recent', { query: '새검색', filters: { domain: 'team-matches', source: 'team-matches' } });
  });

  it('제출하지 않은 입력 draft는 종목 탐색과 목록 조회에 적용하지 않는다', async () => {
    // Given
    window.history.replaceState({}, '', '/team-matches?q=합성');
    mount();
    await expectCards(20);
    // When
    fireEvent.change(screen.getByRole('textbox', { name: '팀매치 검색어' }), { target: { value: '새검색' } });
    fireEvent.click(screen.getByRole('link', { name: /^농구 / }));
    // Then
    expect(new URLSearchParams(window.location.search).get('q')).toBe('합성');
    await expectCards(8);
    expect(apiGet.mock.calls.some(([path, filters]) => path === '/team-matches' && filters?.query === '새검색')).toBe(false);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('최초 로딩 중 검색 X도 종목과 필터 링크에서 이전 검색어를 제거한다', async () => {
    // Given
    response = () => new Promise(() => {});
    mount();
    await screen.findByRole('link', { name: /^농구 / });
    // When
    fireEvent.click(screen.getByRole('button', { name: '검색어 지우기' }));
    // Then
    expect(document.querySelector('.tm-skeleton-page')).toBeInTheDocument();
    expect(cards()).toHaveLength(0);
    expect(queryIn(screen.getByRole('link', { name: /^전체 / }))).toBeNull();
    expect(queryIn(screen.getByRole('link', { name: /^농구 / }))).toBeNull();
    expect(queryIn(screen.getByRole('link', { name: '필터' }))).toBeNull();
  });

  it.each(['지우기', '제출'] as const)('필터 시트가 열린 상태의 검색 %s는 시트의 모든 후속 링크에 반영한다', async (action) => {
    // Given
    window.history.replaceState({}, '', '/team-matches?q=이전검색&filter=1');
    mount();
    await screen.findByText('조건에 맞는 팀매치가 없어요');
    // When
    if (action === '지우기') fireEvent.click(screen.getByRole('button', { name: '검색어 지우기' }));
    else {
      fireEvent.change(screen.getByRole('textbox', { name: '팀매치 검색어' }), { target: { value: '새검색' } });
      fireEvent.click(screen.getByRole('button', { name: '검색' }));
    }
    // Then: 실제 시트의 정렬/구분/성별/레벨/초기화/적용/닫기 링크를 검증한다.
    const sheet = screen.getByRole('dialog', { name: '팀매치 필터' });
    const links = within(sheet).getAllByRole('link');
    expect(links.length).toBeGreaterThan(10);
    for (const link of links) expect(queryIn(link)).toBe(action === '지우기' ? null : '새검색');
  });

  it.each(['지우기', '제출'] as const)('검색 %s 직후 실제 상세 카드의 복귀 URL도 적용한 검색 조건과 기존 맥락을 유지한다', async (action) => {
    // Given: 외부 출처·구분·정렬·앵커가 있는 검색 목록이고 URL replace만 지연된다.
    const outerFrom = '/my?tab=matches#saved';
    window.history.replaceState({}, '', `/team-matches?q=이전검색&kind=friendly&sort=latest&from=${encodeURIComponent(outerFrom)}#list`);
    const view = mount();
    await screen.findByText('조건에 맞는 팀매치가 없어요');
    // When: 실제 검색 동작으로 렌더한 카드의 상세 URL에서 실제 복귀 주소를 읽는다.
    if (action === '지우기') fireEvent.click(screen.getByRole('button', { name: '검색어 지우기' }));
    else {
      fireEvent.change(screen.getByRole('textbox', { name: '팀매치 검색어' }), { target: { value: '새검색' } });
      fireEvent.click(screen.getByRole('button', { name: '검색' }));
    }
    await expectCards(action === '지우기' ? 20 : 3);
    const detailHref = cards()[0].getAttribute('href');
    const detail = new URL(detailHref ?? '', window.location.origin);
    expect(detail.pathname).toMatch(/^\/team-matches\/search-sync-\d+$/);
    const from = detail.searchParams.get('from');
    if (!from) throw new Error('Actual team-match card has no return target');
    const returned = new URL(from, window.location.origin);
    // Then: 생성된 복귀 URL을 새 목록 마운트에 그대로 사용해 reload 경계를 검증한다.
    expect(returned.pathname).toBe('/team-matches');
    expect(returned.searchParams.get('q')).toBe(action === '지우기' ? null : '새검색');
    expect(returned.searchParams.get('kind')).toBe('friendly');
    expect(returned.searchParams.get('sort')).toBe('latest');
    expect(returned.searchParams.get('from')).toBe(outerFrom);
    expect(returned.hash).toBe('#list');
    view.unmount();
    client.clear();
    client = newClient();
    window.history.replaceState({}, '', from);
    mount();
    expect(screen.getByRole('textbox', { name: '팀매치 검색어' })).toHaveValue(action === '지우기' ? '' : '새검색');
    await expectCards(action === '지우기' ? 20 : 3);
  });

  it('검색 조건 없는 기본 목록의 상세 카드는 불필요한 from을 추가하지 않는다', async () => {
    // Given / When
    window.history.replaceState({}, '', '/team-matches');
    mount();
    await expectCards(20);
    // Then
    for (const card of cards()) {
      const href = new URL(card.getAttribute('href') ?? '', window.location.origin);
      expect(href.searchParams.has('from')).toBe(false);
    }
  });

  it('커밋된 검색 URL의 Back/Forward는 입력과 종목 링크 및 목록 조건을 다시 hydrate한다', async () => {
    // Given
    window.history.replaceState({}, '', '/team-matches?q=합성');
    mount();
    await expectCards(20);
    act(() => router.push('/team-matches?q=새검색&sportId=basketball'));
    await expectCards(2);
    // When
    await browserNavigate('back');
    // Then
    await expectCards(20);
    expect(screen.getByRole('textbox', { name: '팀매치 검색어' })).toHaveValue('합성');
    expect(queryIn(screen.getByRole('link', { name: /^농구 / }))).toBe('합성');
    await browserNavigate('forward');
    await expectCards(2);
    expect(screen.getByRole('textbox', { name: '팀매치 검색어' })).toHaveValue('새검색');
    expect(queryIn(screen.getByRole('link', { name: /^전체 / }))).toBe('새검색');
    expect(apiPost).not.toHaveBeenCalled();
  });

  it.each(['back', 'forward'] as const)('검색 replace 커밋 전 실제 %s는 q가 같은 복귀 URL의 입력·목록·링크를 복원한다', async (direction) => {
    // Given: 두 history 항목의 q는 모두 없고 종목만 다르다. replace는 아직 커밋되지 않는다.
    const outerFrom = '/my?tab=matches#saved';
    const allHref = `/team-matches?kind=friendly&sort=latest&from=${encodeURIComponent(outerFrom)}#list`;
    const sportHref = `/team-matches?kind=friendly&sort=latest&from=${encodeURIComponent(outerFrom)}&sportId=futsal#list`;
    window.history.replaceState({}, '', direction === 'back' ? sportHref : allHref);
    act(() => router.push(direction === 'back' ? allHref : sportHref));
    if (direction === 'forward') await browserNavigate('back');
    mount();
    await expectCards(20);
    fireEvent.change(screen.getByRole('textbox', { name: '팀매치 검색어' }), { target: { value: '새검색' } });
    fireEvent.click(screen.getByRole('button', { name: '검색' }));
    await expectCards(3);
    expect(new URL(navigation.pendingReplace ?? '', window.location.origin).searchParams.get('q')).toBe('새검색');
    expect(new URLSearchParams(window.location.search).get('q')).toBeNull();
    // When: replace 전에 실제 브라우저 history 항목으로 복귀한다.
    await browserNavigate(direction);
    // Then: 같은 q 값이어도 취소한 검색어를 적용하거나 후속 링크로 다시 전파하지 않는다.
    expect(new URLSearchParams(window.location.search).get('q')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('sportId')).toBe('futsal');
    expect(screen.getByRole('textbox', { name: '팀매치 검색어' })).toHaveValue('');
    await expectCards(12);
    for (const link of screen.getAllByRole('link').filter((link) => link.matches('.tm-sport-chip-row a, .tm-list-filter-button'))) {
      expect(queryIn(link)).toBeNull();
    }
    for (const card of cards()) {
      const detail = new URL(card.getAttribute('href') ?? '', window.location.origin);
      const from = detail.searchParams.get('from');
      expect(from).not.toBeNull();
      const returned = new URL(from ?? '', window.location.origin);
      expect(returned.searchParams.get('q')).toBeNull();
      expect(returned.searchParams.get('sportId')).toBe('futsal');
      expect(returned.searchParams.get('kind')).toBe('friendly');
      expect(returned.searchParams.get('sort')).toBe('latest');
      expect(returned.searchParams.get('from')).toBe(outerFrom);
      expect(returned.hash).toBe('#list');
    }
  });

  it('검색 지우기 replace 커밋 전 Back은 동일한 q의 다른 필터 항목도 다시 hydrate한다', async () => {
    // Given: 두 history 항목은 같은 검색어지만 종목만 다르다.
    window.history.replaceState({}, '', '/team-matches?q=이전검색&sportId=futsal');
    act(() => router.push('/team-matches?q=이전검색'));
    mount();
    await screen.findByText('조건에 맞는 팀매치가 없어요');
    fireEvent.click(screen.getByRole('button', { name: '검색어 지우기' }));
    await expectCards(20);
    expect(navigation.pendingReplace).toBe('/team-matches');
    // When
    await browserNavigate('back');
    // Then: 지우기 요청이 취소되면 URL에 남은 기존 검색을 실제 목록과 링크에 복원한다.
    expect(new URLSearchParams(window.location.search).get('q')).toBe('이전검색');
    expect(screen.getByRole('textbox', { name: '팀매치 검색어' })).toHaveValue('이전검색');
    await screen.findByText('조건에 맞는 팀매치가 없어요');
    await expectCards(0);
    expect(queryIn(screen.getByRole('link', { name: /^전체 \d+$/ }))).toBe('이전검색');
    expect(queryIn(screen.getByRole('link', { name: '필터' }))).toBe('이전검색');
  });

  it.each(['/search?q=새검색', '/team-matches/search-sync-0?q=이전검색'])('다른 경로 %s로 Back할 때 unmount 대기 중인 목록은 외부 검색을 적용하거나 조회하지 않는다', async (destination) => {
    // Given: 목록이 아직 마운트된 상태에서 Next가 다음 route tree로 교체하기 전이다.
    window.history.replaceState({}, '', destination);
    act(() => router.push('/team-matches?q=합성'));
    mount();
    await expectCards(20);
    navigation.routeHref = window.location.href;
    const previousCalls = apiGet.mock.calls.length;
    // When: 실제 history는 이동하지만 Next route context는 unmount 전까지 현재 목록이다.
    await browserNavigate('back');
    // Then: 외부 경로의 q 때문에 불필요한 목록 요청·입력·결과 변경이 발생하지 않는다.
    expect(window.location.pathname).toBe(new URL(destination, window.location.origin).pathname);
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(apiGet.mock.calls.slice(previousCalls).filter(([path]) => path === '/team-matches')).toHaveLength(0);
    expect(screen.getByRole('textbox', { name: '팀매치 검색어' })).toHaveValue('합성');
    await expectCards(20);
  });
});

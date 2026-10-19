/**
 * /teams는 서버(SEO 프리렌더)가 현재 URL 필터와 일치하는 첫 페이지를 seed로 클라이언트에 넘긴다.
 *
 * useV1TeamDetail의 seed(placeholderData) 패턴을 그대로 재사용해 이 화면도 서버가 이미
 * 가진 값을 첫 화면부터 보여주게 한다. URL 필터가 있으면 동일하게 정규화된 API 쿼리의
 * seed만 사용하고, 쿼리가 바뀐 동안에는 이전 결과를 필터된 화면처럼 보여주지 않는다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1Sport, V1Team } from '@/types/api';
import { TEAM_LIST_SEED_PATH, teamListSeedPath } from '@/lib/public-list-seed';

const searchParamsMock = vi.hoisted(() => ({ value: new URLSearchParams('') }));

const hookMocks = vi.hoisted(() => ({
  // 인자 있는 초기 구현을 주지 않는다 — 주면 TS가 시그니처를 그 초기 구현으로 좁혀
  // mock.calls 원소 타입이 좁아진다(teams-list-no-n1.test.tsx와 같은 이유). 기본
  // 반환값은 아래 beforeEach의 mockReturnValue로 준다.
  useV1TeamPages: vi.fn(),
  useV1MasterSports: vi.fn(),
  useV1RecentSearches: vi.fn(() => ({ data: { items: [] }, isLoading: false })),
  useV1RecordSearch: vi.fn(() => ({ mutate: vi.fn() })),
}));
vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...hookMocks,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/teams',
  useSearchParams: () => searchParamsMock.value,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

import { TeamListPageClient } from './teams-client';

function render(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function seedTeam(index: number): V1Team {
  return {
    id: `seed-${index}`,
    teamId: `seed-${index}`,
    name: `서버시드팀 ${index}`,
    sportName: '풋살',
    regionName: '서울 마포구',
    memberCount: 5,
  } as unknown as V1Team;
}

const seedSport = { id: 'sport-futsal', name: '풋살', code: 'futsal' } as unknown as V1Sport;
const seedSoccer = { id: 'sport-soccer', name: '축구', code: 'soccer' } as unknown as V1Sport;

describe('TeamListPageClient — 서버 seed 연결', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsMock.value = new URLSearchParams('');
    hookMocks.useV1TeamPages.mockReturnValue({
      data: { pages: [{ items: [], nextCursor: null, pageInfo: { nextCursor: null, hasNext: false, totalCount: 0 } }] },
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    });
    hookMocks.useV1MasterSports.mockReturnValue({ data: [] });
  });

  it('필터 없이 들어오면 seed를 useV1TeamPages/useV1MasterSports에 초기 페이지로 넘긴다', () => {
    const page = { items: [seedTeam(0), seedTeam(1)], nextCursor: 'seed-1', pageInfo: { nextCursor: 'seed-1', hasNext: true, totalCount: 52 } };
    const seed = { page, sports: [seedSport], query: TEAM_LIST_SEED_PATH };

    render(<TeamListPageClient seed={seed} />);

    const [, teamsOptions] = hookMocks.useV1TeamPages.mock.calls[0] as [unknown, { seed?: unknown }];
    expect(teamsOptions.seed).toEqual(page);
    const [sportsOptions] = hookMocks.useV1MasterSports.mock.calls[0] as [{ seed?: unknown }];
    expect(sportsOptions.seed).toEqual(seed.sports);
  });

  it('필터된 cursor seed는 UI URL dialect를 보존하고 일반 클릭은 기존 append를 유지한다', () => {
    searchParamsMock.value = new URLSearchParams('sportId=sport-futsal&regionId=region-seoul&sort=deadline&q=%20%20%EB%A7%88%ED%8F%AC%20FC%20%20&cursor=opaque-page-2');
    const page = { items: [seedTeam(20)], nextCursor: 'opaque/cursor +2', pageInfo: { nextCursor: 'opaque/cursor +2', hasNext: true, totalCount: 52 } };
    const fetchNextPage = vi.fn();
    hookMocks.useV1TeamPages.mockReturnValue({
      data: { pages: [page] },
      isPending: false,
      isError: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      isPlaceholderData: false,
      fetchNextPage,
    });
    const seed = { page, sports: [seedSport], query: teamListSeedPath({ sportId: 'sport-futsal', regionId: 'region-seoul', sort: 'deadline', q: '마포 FC', cursor: 'opaque-page-2' }), cursor: 'opaque-page-2' };

    render(<TeamListPageClient seed={seed} />);

    const continuation = screen.getByRole('link', { name: '더 보기' });
    const href = new URL(continuation.getAttribute('href') ?? '', 'https://teameet.test');
    expect(href.pathname).toBe('/teams');
    expect(href.searchParams.get('sportId')).toBe('sport-futsal');
    expect(href.searchParams.get('regionId')).toBe('region-seoul');
    expect(href.searchParams.get('sort')).toBe('deadline');
    expect(href.searchParams.get('q')).toBe('마포 FC');
    expect(href.searchParams.get('query')).toBeNull();
    expect(href.searchParams.get('joinPolicy')).toBeNull();
    expect(href.searchParams.get('cursor')).toBe('opaque/cursor +2');

    const [apiFilters, hookOptions] = hookMocks.useV1TeamPages.mock.calls[0] as [Record<string, unknown>, { seed?: unknown; initialCursor?: string }];
    expect(apiFilters).toMatchObject({ sportId: 'sport-futsal', regionId: 'region-seoul', query: '마포 FC', joinPolicy: 'approval_required' });
    expect(hookOptions.seed).toEqual(page);
    expect(hookOptions.initialCursor).toBe('opaque-page-2');

    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    continuation.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it('직접 진입한 필터 cursor seed의 레코드와 시작 커서를 그대로 화면과 query에 사용한다', () => {
    searchParamsMock.value = new URLSearchParams('sportId=sport-futsal&regionId=region-seoul&sort=deadline&q=%20%20%EB%A7%88%ED%8F%AC%20FC%20%20&cursor=opaque-page-2');
    hookMocks.useV1MasterSports.mockReturnValue({ data: [seedSport, seedSoccer] });
    const secondPage = {
      items: [{ ...seedTeam(20), id: 'team-page-2', teamId: 'team-page-2', name: '두 번째 페이지 팀' }],
      nextCursor: 'opaque-page-3',
      pageInfo: { nextCursor: 'opaque-page-3', hasNext: true, totalCount: 52 },
    };
    const metadata = {
      items: [],
      nextCursor: null,
      pageInfo: { nextCursor: null, hasNext: true, totalCount: 105 },
      facets: { sports: [{ sportId: 'sport-futsal', count: 94 }, { sportId: 'sport-soccer', count: 11 }] },
    };
    hookMocks.useV1TeamPages.mockReturnValue({
      data: { pages: [secondPage] },
      listMetadata: metadata,
      isPending: false,
      isError: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      isPlaceholderData: false,
      fetchNextPage: vi.fn(),
    });
    const seed = { page: secondPage, sports: [seedSport, seedSoccer], query: teamListSeedPath({ sportId: 'sport-futsal', regionId: 'region-seoul', sort: 'deadline', q: '마포 FC', cursor: 'opaque-page-2' }), cursor: 'opaque-page-2', metadata };

    render(<TeamListPageClient seed={seed} />);

    expect(screen.getByRole('link', { name: /두 번째 페이지 팀/ }).getAttribute('href')).toMatch(/^\/teams\/team-page-2\?from=/);
    expect(document.querySelector('.tm-team-summary-bar')?.textContent).toContain('105팀');
    expect(screen.getByRole('link', { name: /풋살\s+94/ })).toBeInTheDocument();
    const sportLink = new URL(screen.getByRole('link', { name: /풋살\s+94/ }).getAttribute('href') ?? '', 'https://teameet.test');
    expect(sportLink.searchParams.has('cursor')).toBe(false);
    const nextPageLink = new URL(screen.getByRole('link', { name: '더 보기' }).getAttribute('href') ?? '', 'https://teameet.test');
    expect(nextPageLink.searchParams.get('cursor')).toBe('opaque-page-3');
    expect(nextPageLink.searchParams.get('sportId')).toBe('sport-futsal');
    expect(nextPageLink.searchParams.get('regionId')).toBe('region-seoul');
    expect(nextPageLink.searchParams.get('sort')).toBe('deadline');
    expect(nextPageLink.searchParams.get('q')).toBe('마포 FC');
    expect(nextPageLink.searchParams.get('query')).toBeNull();
    expect(nextPageLink.searchParams.get('joinPolicy')).toBeNull();
    const [apiFilters, options] = hookMocks.useV1TeamPages.mock.calls[0] as [Record<string, unknown>, { seed?: unknown; initialCursor?: string; metadataSeed?: unknown }];
    expect(apiFilters).toMatchObject({ sportId: 'sport-futsal', regionId: 'region-seoul', query: '마포 FC', joinPolicy: 'approval_required' });
    expect(options.seed).toEqual(secondPage);
    expect(options.initialCursor).toBe('opaque-page-2');
    expect(options.metadataSeed).toEqual(metadata);
  });

  it('필터 초기화 링크는 직접 진입 cursor를 제거한다', () => {
    searchParamsMock.value = new URLSearchParams('cursor=opaque-page-2&regionId=region-seoul&sort=latest&filter=1');
    const page = { items: [seedTeam(20)], nextCursor: 'opaque-page-3', pageInfo: { nextCursor: 'opaque-page-3', hasNext: true, totalCount: 52 } };
    hookMocks.useV1TeamPages.mockReturnValue({
      data: { pages: [page] },
      isPending: false,
      isError: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      isPlaceholderData: false,
      fetchNextPage: vi.fn(),
    });
    const seed = { page, sports: [seedSport], query: teamListSeedPath({ regionId: 'region-seoul', sort: 'latest', cursor: 'opaque-page-2' }) };

    render(<TeamListPageClient seed={seed} />);

    const reset = new URL(screen.getByRole('link', { name: '초기화' }).getAttribute('href') ?? '', 'https://teameet.test');
    expect(reset.searchParams.has('cursor')).toBe(false);
    expect(reset.searchParams.has('regionId')).toBe(false);
    expect(reset.searchParams.has('sort')).toBe(false);
  });

  it('마지막 cursor의 metadata 실패 때 전체·종목 수를 추정하지 않고 재조회 후 복구한다', () => {
    searchParamsMock.value = new URLSearchParams('cursor=opaque-page-2');
    hookMocks.useV1MasterSports.mockReturnValue({ data: [seedSport, seedSoccer] });
    const page = { items: [seedTeam(20)], nextCursor: null, pageInfo: { nextCursor: null, hasNext: false } };
    hookMocks.useV1TeamPages.mockReturnValue({
      data: { pages: [page] },
      listMetadata: undefined,
      isListMetadataPending: false,
      isListMetadataError: true,
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      isPlaceholderData: false,
      fetchNextPage: vi.fn(),
    });
    const seed = { page, sports: [seedSport], query: teamListSeedPath({ cursor: 'opaque-page-2' }), cursor: 'opaque-page-2' };

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrappedClient = (node: ReactElement) => <QueryClientProvider client={client}>{node}</QueryClientProvider>;
    const view = rtlRender(wrappedClient(<TeamListPageClient seed={seed} />));

    expect(screen.getByRole('status')).toHaveTextContent('팀 수 정보를 불러오지 못했어요');
    expect(screen.queryByText('1팀')).not.toBeInTheDocument();
    const failedChips = screen.getByRole('group', { name: '종목 필터' });
    expect(failedChips.textContent).toBe('전체풋살축구');

    const metadata = {
      items: [],
      pageInfo: { hasNext: true, totalCount: 105 },
      facets: { sports: [{ sportId: 'sport-futsal', count: 94 }, { sportId: 'sport-soccer', count: 11 }] },
    };
    hookMocks.useV1TeamPages.mockReturnValue({
      data: { pages: [page] },
      listMetadata: metadata,
      isListMetadataPending: false,
      isListMetadataError: false,
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      isPlaceholderData: false,
      fetchNextPage: vi.fn(),
    });
    view.rerender(wrappedClient(<TeamListPageClient seed={seed} />));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(document.querySelector('.tm-team-summary-bar')?.textContent).toContain('105팀');
    expect(screen.getByRole('link', { name: /풋살\s+94/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /축구\s+11/ })).toBeInTheDocument();
  });

  it('SSR 첫 페이지 20팀과 hasNextPage 미정 상태에서도 전체 105·풋살 94·축구 11의 facet 건수를 보인다', () => {
    const page = {
      items: [
        ...Array.from({ length: 18 }, (_, index) => ({ ...seedTeam(index), sport: { sportId: 'sport-futsal', name: '풋살' } } as V1Team)),
        ...Array.from({ length: 2 }, (_, index) => ({ ...seedTeam(index + 18), sport: { sportId: 'sport-soccer', name: '축구' }, sportName: '축구' } as V1Team)),
      ],
      nextCursor: 'seed-1',
      pageInfo: { nextCursor: 'seed-1', hasNext: true, totalCount: 105 },
      facets: { sports: [{ sportId: 'sport-futsal', count: 94 }, { sportId: 'sport-soccer', count: 11 }] },
    };
    const seed = { page, sports: [seedSport, seedSoccer], query: TEAM_LIST_SEED_PATH };
    hookMocks.useV1TeamPages.mockReturnValue({
      data: { pages: [page] },
      isPending: false,
      isError: false,
      hasNextPage: undefined,
      isFetchingNextPage: false,
      isPlaceholderData: false,
      fetchNextPage: vi.fn(),
    });
    hookMocks.useV1MasterSports.mockReturnValue({ data: seed.sports });

    render(<TeamListPageClient seed={seed} />);

    const links = Array.from(screen.getByRole('group', { name: '종목 필터' }).querySelectorAll('a'));
    expect(links.map((link) => link.textContent?.replace(/\s+/g, '').trim())).toEqual(['전체105', '풋살94', '축구11']);
  });

  it('facet가 없고 SSR의 다음 페이지 여부가 미정이면 부분 목록 건수를 숨긴다', () => {
    const page = {
      items: [seedTeam(0), seedTeam(1)],
      nextCursor: 'seed-1',
      pageInfo: { nextCursor: 'seed-1', hasNext: true, totalCount: 52 },
    };
    const seed = { page, sports: [seedSport], query: TEAM_LIST_SEED_PATH };
    hookMocks.useV1TeamPages.mockReturnValue({
      data: { pages: [page] },
      isPending: false,
      isError: false,
      hasNextPage: undefined,
      isFetchingNextPage: false,
      isPlaceholderData: false,
      fetchNextPage: vi.fn(),
    });
    hookMocks.useV1MasterSports.mockReturnValue({ data: seed.sports });

    render(<TeamListPageClient seed={seed} />);

    const links = Array.from(screen.getByRole('group', { name: '종목 필터' }).querySelectorAll('a'));
    expect(links.map((link) => link.textContent?.replace(/\s+/g, '').trim())).toEqual(['전체', '풋살']);
  });

  it('유효한 종목 필터와 같은 query seed를 첫 렌더에 쓴다', () => {
    searchParamsMock.value = new URLSearchParams('sportId=sport-futsal');
    const page = { items: [seedTeam(0)], nextCursor: null, pageInfo: { nextCursor: null, hasNext: false, totalCount: 1 } };
    const seed = { page, sports: [seedSport], query: teamListSeedPath({ sportId: 'sport-futsal' }) };

    render(<TeamListPageClient seed={seed} />);

    const [, teamsOptions] = hookMocks.useV1TeamPages.mock.calls[0] as [unknown, { seed?: unknown }];
    expect(teamsOptions.seed).toEqual(page);
    const [sportsOptions] = hookMocks.useV1MasterSports.mock.calls[0] as [{ seed?: unknown }];
    expect(sportsOptions.seed).toEqual(seed.sports);
  });

  it('현재 URL과 seed query가 다르면 팀 목록 seed를 사용하지 않는다', () => {
    searchParamsMock.value = new URLSearchParams('sportId=sport-basketball');
    const seed = { page: { items: [seedTeam(0)], nextCursor: null, pageInfo: { nextCursor: null, hasNext: false, totalCount: 1 } }, sports: [seedSport], query: teamListSeedPath({ sportId: 'sport-futsal' }) };

    render(<TeamListPageClient seed={seed} />);

    const [, teamsOptions] = hookMocks.useV1TeamPages.mock.calls[0] as [unknown, { seed?: unknown }];
    expect(teamsOptions.seed).toBeUndefined();
  });

  it('seed prop이 없으면(예: seed 없이 렌더) 두 훅 다 seed: undefined로 부른다', () => {
    render(<TeamListPageClient />);

    const [, teamsOptions] = hookMocks.useV1TeamPages.mock.calls[0] as [unknown, { seed?: unknown }];
    expect(teamsOptions.seed).toBeUndefined();
    const [sportsOptions] = hookMocks.useV1MasterSports.mock.calls[0] as [{ seed?: unknown }];
    expect(sportsOptions.seed).toBeUndefined();
  });

  it('서버 전체 건수와 현재 표시 건수를 구분하고 다음 커서 페이지를 요청한다', () => {
    const fetchNextPage = vi.fn();
    hookMocks.useV1TeamPages.mockReturnValue({
      data: {
        pages: [{
          items: [seedTeam(0), seedTeam(1)],
          nextCursor: 'seed-1',
          pageInfo: { nextCursor: 'seed-1', hasNext: true, totalCount: 52 },
        }],
      },
      isPending: false,
      isError: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage,
    });

    render(<TeamListPageClient />);

    expect(screen.getByText('52')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: '더 보기' }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  const twoTeams = {
    pages: [{ items: [seedTeam(0), seedTeam(1)], nextCursor: 'seed-1', pageInfo: { nextCursor: 'seed-1', hasNext: true, total: 52 } }],
  };

  it('다음 페이지 요청이 실패해도 쌓은 팀 목록을 지우지 않고 다시 불러오기를 보여 준다', () => {
    const fetchNextPage = vi.fn();
    hookMocks.useV1TeamPages.mockReturnValue({
      data: twoTeams, isPending: false, isError: true, isFetchNextPageError: true, hasNextPage: true, isFetchingNextPage: false, isPlaceholderData: false, fetchNextPage,
    });

    render(<TeamListPageClient />);

    expect(screen.getByText('서버시드팀 0')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('다음 목록을 불러오지 못했어요');
    fireEvent.click(screen.getByRole('link', { name: '다시 불러오기' }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('배경 재검증만 실패했으면(isFetchNextPageError=false) 목록을 유지하고 다음 목록 오류를 띄우지 않는다', () => {
    hookMocks.useV1TeamPages.mockReturnValue({
      data: twoTeams, isPending: false, isError: true, isFetchNextPageError: false, hasNextPage: true, isFetchingNextPage: false, isPlaceholderData: false, fetchNextPage: vi.fn(),
    });

    render(<TeamListPageClient />);

    expect(screen.getByText('서버시드팀 0')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '더 보기' })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('대조군 — 첫 페이지 자체가 실패하면 전체 에러 화면이다', () => {
    hookMocks.useV1TeamPages.mockReturnValue({
      data: undefined, isPending: false, isError: true, hasNextPage: false, isFetchingNextPage: false, isPlaceholderData: false, fetchNextPage: vi.fn(),
    });

    render(<TeamListPageClient />);

    expect(screen.queryByText('서버시드팀 0')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '더 보기' })).not.toBeInTheDocument();
  });

  it('seed(placeholder)가 떠 있는 동안에는 더 보기가 잠겨 낡은 커서를 따라가지 않는다', () => {
    const fetchNextPage = vi.fn();
    hookMocks.useV1TeamPages.mockReturnValue({
      data: twoTeams, isPending: false, isError: false, hasNextPage: true, isFetchingNextPage: false, isPlaceholderData: true, fetchNextPage,
    });

    render(<TeamListPageClient />);

    const button = screen.getByRole('button', { name: '더 보기' });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('tm-load-more', 'tm-btn-md');
    expect(screen.queryByRole('link', { name: '더 보기' })).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(fetchNextPage).not.toHaveBeenCalled();
  });
});

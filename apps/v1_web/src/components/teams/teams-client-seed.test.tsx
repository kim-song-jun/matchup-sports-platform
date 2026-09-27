/**
 * /teams는 서버(SEO 프리렌더)가 이미 받아 둔 무필터 목록을 seed로 클라이언트에 넘긴다.
 *
 * useV1TeamDetail의 seed(placeholderData) 패턴을 그대로 재사용해 이 화면도 서버가 이미
 * 가진 값을 첫 화면부터 보여주게 한다. 단, URL에 필터(종목/성별/레벨/검색어/정렬)가
 * 걸려 있으면 seed(무필터 스냅샷)를 넘기지 않는다 — 필터링 안 된 결과를 필터링된
 * 화면인 것처럼 잠깐 보여주는 쪽이 빈 스켈레톤보다 나쁘다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1Sport, V1Team } from '@/types/api';

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

describe('TeamListPageClient — 서버 seed 연결', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsMock.value = new URLSearchParams('');
    hookMocks.useV1TeamPages.mockReturnValue({
      data: { pages: [{ items: [], nextCursor: null, pageInfo: { nextCursor: null, hasNext: false, total: 0 } }] },
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    });
    hookMocks.useV1MasterSports.mockReturnValue({ data: [] });
  });

  it('필터 없이 들어오면 seed를 useV1TeamPages/useV1MasterSports에 초기 페이지로 넘긴다', () => {
    const page = { items: [seedTeam(0), seedTeam(1)], nextCursor: 'seed-1', pageInfo: { nextCursor: 'seed-1', hasNext: true, total: 52 } };
    const seed = { page, sports: [seedSport] };

    render(<TeamListPageClient seed={seed} />);

    const [, teamsOptions] = hookMocks.useV1TeamPages.mock.calls[0] as [unknown, { seed?: unknown }];
    expect(teamsOptions.seed).toEqual(page);
    const [sportsOptions] = hookMocks.useV1MasterSports.mock.calls[0] as [{ seed?: unknown }];
    expect(sportsOptions.seed).toEqual(seed.sports);
  });

  it('URL에 종목 필터가 걸려 있으면 무필터 목록 seed는 넘기지 않는다(종목 목록 seed는 그대로 넘긴다)', () => {
    searchParamsMock.value = new URLSearchParams('sportId=sport-futsal');
    const seed = { page: { items: [seedTeam(0)], nextCursor: null, pageInfo: { nextCursor: null, hasNext: false, total: 1 } }, sports: [seedSport] };

    render(<TeamListPageClient seed={seed} />);

    const [, teamsOptions] = hookMocks.useV1TeamPages.mock.calls[0] as [unknown, { seed?: unknown }];
    expect(teamsOptions.seed).toBeUndefined();
    const [sportsOptions] = hookMocks.useV1MasterSports.mock.calls[0] as [{ seed?: unknown }];
    expect(sportsOptions.seed).toEqual(seed.sports);
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
          pageInfo: { nextCursor: 'seed-1', hasNext: true, total: 52 },
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
    fireEvent.click(screen.getByRole('button', { name: '팀 더 보기' }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});

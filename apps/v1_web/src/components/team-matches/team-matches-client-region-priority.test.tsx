/**
 * /team-matches "내 지역 먼저" — 저장한 활동 지역을 목록 요청에 싣는지, 목록 머리 안내가 맞는지.
 * 지역 판정 자체는 lib/list-region-preference.test.ts, 순서는 API(team-matches.service.spec.ts)가 맡는다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const searchParamsMock = vi.hoisted(() => ({ value: new URLSearchParams('') }));

const hookMocks = vi.hoisted(() => ({
  useV1TeamMatches: vi.fn(),
  useV1MasterSports: vi.fn(),
  useV1MasterRegions: vi.fn(),
  useV1AuthMe: vi.fn(),
  useV1Profile: vi.fn(),
  useV1RecentSearches: vi.fn(() => ({ data: { items: [] }, isLoading: false })),
  useV1RecordSearch: vi.fn(() => ({ mutate: vi.fn() })),
}));
vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...hookMocks,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/team-matches',
  useSearchParams: () => searchParamsMock.value,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

import { TeamMatchListPageClient } from './team-matches-client';

function render(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const regions = [
  { id: 'r-seoul', name: '서울', parentId: null },
  { id: 'r-mapo', name: '마포구', parentId: 'r-seoul' },
];

/** 이 목록을 읽은 모든 조회의 필터(첫 인자). */
const listCalls = () => hookMocks.useV1TeamMatches.mock.calls.map(([filters]) => filters as Record<string, unknown> | undefined);

describe('TeamMatchListPageClient — 내 지역 먼저', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsMock.value = new URLSearchParams('');
    hookMocks.useV1TeamMatches.mockReturnValue({
      data: { items: [], nextCursor: null, pageInfo: { hasNext: false, nextCursor: null, totalCount: 0 }, facets: { sports: [], today: 0, recruiting: 0 } },
      isPending: false, isError: false, isSuccess: true, isFetching: false, isPlaceholderData: false, dataUpdatedAt: 1,
    });
    hookMocks.useV1MasterSports.mockReturnValue({ data: [] });
    hookMocks.useV1MasterRegions.mockReturnValue({ data: regions, isPending: false });
    hookMocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'u1' } }, isPending: false });
    hookMocks.useV1Profile.mockReturnValue({ data: { regions: [{ regionId: 'r-mapo', regionName: '서울 마포구', primary: true }] }, isPending: false, isError: false });
  });

  it('저장한 활동 지역(구/군)의 시/도를 목록 요청에 싣고, 안내만 한다', () => {
    render(<TeamMatchListPageClient />);

    expect(listCalls().some((filters) => filters?.preferRegionId === 'r-seoul')).toBe(true);
    expect(screen.getByText('내 활동 지역(서울)의 팀 매치를 먼저 보여 줘요')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /지역 설정/ })).toBeNull();
  });

  it('건수(facets) 조회에는 내 지역을 싣지 않는다 — 순서와 무관한 숫자라 seed 를 그대로 쓴다', () => {
    render(<TeamMatchListPageClient />);

    const facetCalls = listCalls().filter((filters) => filters?.includeFacets === true);
    expect(facetCalls.length).toBeGreaterThan(0);
    for (const filters of facetCalls) expect(filters).not.toHaveProperty('preferRegionId');
  });

  it('정렬·종류 필터를 바꿔도 내 지역을 싣는다 — 현재 정렬은 그대로 두고 묶음 안에서만 내 지역이 먼저다', () => {
    searchParamsMock.value = new URLSearchParams('sort=deadline&kind=friendly');
    render(<TeamMatchListPageClient />);

    expect(listCalls().some((filters) => filters?.sort === 'deadline' && filters?.kind === 'friendly' && filters?.preferRegionId === 'r-seoul')).toBe(true);
  });

  it('저장한 활동 지역이 없는 로그인 사용자는 요청을 그대로 두고 "지역 설정" 알약을 본다', () => {
    hookMocks.useV1Profile.mockReturnValue({ data: { regions: [] }, isPending: false, isError: false });
    render(<TeamMatchListPageClient />);

    expect(listCalls().some((filters) => filters?.preferRegionId !== undefined)).toBe(false);
    expect(screen.getByText('활동 지역을 정하면 가까운 팀 매치를 먼저 보여 줘요')).toBeTruthy();
    expect(screen.getByRole('link', { name: '지역 설정' }).getAttribute('href')).toBe('/my/settings/location');
  });

  it('비로그인은 지금과 같고 안내도 없다', () => {
    hookMocks.useV1AuthMe.mockReturnValue({ data: undefined, isPending: false });
    render(<TeamMatchListPageClient />);

    expect(listCalls().some((filters) => filters?.preferRegionId !== undefined)).toBe(false);
    expect(screen.queryByText(/먼저 보여 줘요/)).toBeNull();
  });

  it('프로필을 아직 못 받았으면 요청에도 싣지 않고 설정도 권하지 않는다', () => {
    hookMocks.useV1Profile.mockReturnValue({ data: undefined, isPending: true, isError: false });
    render(<TeamMatchListPageClient />);

    expect(listCalls().some((filters) => filters?.preferRegionId !== undefined)).toBe(false);
    expect(screen.queryByText(/먼저 보여 줘요/)).toBeNull();
  });
});

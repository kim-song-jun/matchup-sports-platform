/**
 * /tournaments "내 지역 먼저" — 저장한 활동 지역을 목록 요청에 싣는지, 목록 머리 안내가 유형(대회·리그)에 맞는지.
 * 지역 판정 자체는 lib/list-region-preference.test.ts, 순서는 API(tournament-list-query.spec.ts)가 맡는다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listMock = vi.hoisted(() => vi.fn());
const searchMock = vi.hoisted(() => ({ value: '' }));

const hookMocks = vi.hoisted(() => ({
  useV1AllTournaments: vi.fn(),
  useV1MasterSports: vi.fn(),
  useV1MasterRegions: vi.fn(),
  useV1AuthMe: vi.fn(),
  useV1Profile: vi.fn(),
}));
vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...hookMocks,
}));
vi.mock('@/hooks/use-competition-discovery', () => ({
  useCompetitionDiscovery: (...args: unknown[]) => listMock(...args),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchMock.value),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { TournamentsListPageClient } from './tournaments-list-client';

function render(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const regions = [
  { id: 'r-seoul', name: '서울', parentId: null },
  { id: 'r-mapo', name: '마포구', parentId: 'r-seoul' },
];

/** 목록 조회에 나간 모든 필터(첫 인자). */
const listCalls = () => listMock.mock.calls.map(([filters]) => filters as Record<string, unknown>);

describe('TournamentsListPageClient — 내 지역 먼저', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchMock.value = '';
    listMock.mockReturnValue({
      data: { items: [], pageInfo: { hasNext: false, nextCursor: null, total: 0, totalPages: 1, page: 1 } },
      isPending: false, isError: false, isFetching: false, isPlaceholderData: false, isSuccess: true, dataUpdatedAt: 1, refetch: vi.fn(),
    });
    hookMocks.useV1AllTournaments.mockReturnValue({ data: [], isPending: false, isError: false, refetch: vi.fn() });
    hookMocks.useV1MasterSports.mockReturnValue({ data: [] });
    hookMocks.useV1MasterRegions.mockReturnValue({ data: regions, isPending: false });
    hookMocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'u1' } }, isPending: false });
    hookMocks.useV1Profile.mockReturnValue({ data: { regions: [{ regionId: 'r-mapo', regionName: '서울 마포구', primary: true }] }, isPending: false, isError: false });
  });

  it('저장한 활동 지역(구/군)의 시/도를 목록 요청에 싣고, 대회·리그 안내만 한다', () => {
    render(<TournamentsListPageClient />);

    expect(listCalls().some((filters) => filters.preferRegionId === 'r-seoul')).toBe(true);
    expect(screen.getByText('내 활동 지역(서울)의 대회·리그를 먼저 보여 줘요')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /지역 설정/ })).toBeNull();
  });

  it.each([
    ['kind=tournament', '대회를'],
    ['kind=league', '리그를'],
  ])('유형(%s)에 맞는 이름으로 안내한다', (query, withParticle) => {
    searchMock.value = query;
    render(<TournamentsListPageClient />);

    expect(screen.getByText(`내 활동 지역(서울)의 ${withParticle} 먼저 보여 줘요`)).toBeTruthy();
    expect(listCalls().some((filters) => filters.preferRegionId === 'r-seoul')).toBe(true);
  });

  it('다른 필터와 함께 써도 내 지역을 싣는다 — 걸러 내는 건 필터뿐이다', () => {
    searchMock.value = 'stage=recruiting';
    render(<TournamentsListPageClient />);

    expect(listCalls().some((filters) => filters.stage === 'recruiting' && filters.preferRegionId === 'r-seoul')).toBe(true);
  });

  it('저장한 활동 지역이 없는 로그인 사용자는 요청을 그대로 두고 "지역 설정" 알약을 본다', () => {
    hookMocks.useV1Profile.mockReturnValue({ data: { regions: [] }, isPending: false, isError: false });
    render(<TournamentsListPageClient />);

    expect(listCalls().some((filters) => filters.preferRegionId !== undefined)).toBe(false);
    expect(screen.getByText('활동 지역을 정하면 가까운 대회·리그를 먼저 보여 줘요')).toBeTruthy();
    expect(screen.getByRole('link', { name: '지역 설정' }).getAttribute('href')).toBe('/my/settings/location');
  });

  it('비로그인은 지금과 같고 안내도 없다', () => {
    hookMocks.useV1AuthMe.mockReturnValue({ data: undefined, isPending: false });
    render(<TournamentsListPageClient />);

    expect(listCalls().some((filters) => filters.preferRegionId !== undefined)).toBe(false);
    expect(screen.queryByText(/먼저 보여 줘요/)).toBeNull();
  });

  it('프로필을 아직 못 받았으면 요청에도 싣지 않고 설정도 권하지 않는다', () => {
    hookMocks.useV1Profile.mockReturnValue({ data: undefined, isPending: true, isError: false });
    render(<TournamentsListPageClient />);

    expect(listCalls().some((filters) => filters.preferRegionId !== undefined)).toBe(false);
    expect(screen.queryByText(/먼저 보여 줘요/)).toBeNull();
  });
});

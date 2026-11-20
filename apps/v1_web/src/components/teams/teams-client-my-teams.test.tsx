/** /teams 맨 위 "내 팀" 줄: 로그인했고 팀이 있을 때만, 검색·필터가 없을 때만 보인다. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const searchParamsMock = vi.hoisted(() => ({ value: new URLSearchParams('') }));

const hookMocks = vi.hoisted(() => ({
  useV1TeamPages: vi.fn(),
  useV1MasterSports: vi.fn(),
  useV1MasterRegions: vi.fn(),
  useV1AuthMe: vi.fn(),
  useV1Profile: vi.fn(),
  useV1MyTeams: vi.fn(),
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

const myTeam = {
  teamId: 'my-1', membershipId: 'm-1', name: '내가 속한 FC', role: 'owner', status: 'active', logoUrl: null,
  sport: { sportId: 's1', name: '풋살' }, region: null, memberCount: 8,
};

describe('TeamListPageClient — 내 팀 줄', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsMock.value = new URLSearchParams('');
    hookMocks.useV1TeamPages.mockReturnValue({
      data: { pages: [{ items: [], nextCursor: null, pageInfo: { nextCursor: null, hasNext: false, totalCount: 0 } }] },
      isPending: false, isError: false, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(),
    });
    hookMocks.useV1MasterSports.mockReturnValue({ data: [] });
    hookMocks.useV1MasterRegions.mockReturnValue({ data: [], isPending: false });
    hookMocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'u1' } }, isPending: false });
    hookMocks.useV1Profile.mockReturnValue({ data: { regions: [] }, isPending: false, isError: false });
    hookMocks.useV1MyTeams.mockReturnValue({ data: [myTeam] });
  });

  it('내 팀이 있으면 맨 위에 팀 이름·종목·역할이 보이고 상세로 이어진다', () => {
    render(<TeamListPageClient />);
    const link = screen.getByRole('link', { name: /내가 속한 FC/ });
    expect(link.getAttribute('href')).toBe('/teams/my-1');
    expect(link.textContent).toContain('풋살 · 팀장');
    expect(hookMocks.useV1MyTeams).toHaveBeenLastCalledWith(undefined, { enabled: true });
  });

  it('로그인하지 않았으면 내 팀을 묻지도 보이지도 않는다', () => {
    hookMocks.useV1AuthMe.mockReturnValue({ data: undefined, isPending: false });
    hookMocks.useV1MyTeams.mockReturnValue({ data: undefined });
    render(<TeamListPageClient />);
    expect(screen.queryByLabelText('내 팀')).toBeNull();
    expect(hookMocks.useV1MyTeams).toHaveBeenLastCalledWith(undefined, { enabled: false });
  });

  it.each(['q=마포', 'sort=latest', 'sportId=s1&genderRule=남'])('검색·필터(%s) 중에는 내 팀 줄을 걷는다', (search) => {
    searchParamsMock.value = new URLSearchParams(search);
    render(<TeamListPageClient />);
    expect(screen.queryByLabelText('내 팀')).toBeNull();
  });

  it('속한 팀이 없으면 줄 자체를 그리지 않는다', () => {
    hookMocks.useV1MyTeams.mockReturnValue({ data: [] });
    render(<TeamListPageClient />);
    expect(screen.queryByLabelText('내 팀')).toBeNull();
  });
});

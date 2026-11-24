/**
 * /teams 기본 정렬(활동 많은순)의 "내 지역 팀 먼저" — 어느 지역을 요청에 싣는지, 목록 머리의 한 줄 안내,
 * 이어 보기 주소가 같은 기준을 잇는지를 화면 단위로 확인한다. 지역 판정 자체는 team-list-region-preference.test.ts 가 맡는다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1Team } from '@/types/api';
import { TEAM_LIST_SEED_PATH } from '@/lib/public-list-seed';

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

const regions = [
  { id: 'r-seoul', name: '서울', parentId: null },
  { id: 'r-mapo', name: '마포구', parentId: 'r-seoul' },
  { id: 'r-gg', name: '경기', parentId: null },
  { id: 'r-seongnam', name: '성남시', parentId: 'r-gg' },
];

const team = (index: number) => ({ id: `t-${index}`, teamId: `t-${index}`, name: `팀 ${index}`, sportName: '풋살', regionName: '서울 마포구', memberCount: 5 }) as unknown as V1Team;

const myTeam = (regionId: string | null) => ({
  teamId: 'my-1', membershipId: 'm-1', name: '내가 속한 FC', role: 'owner', status: 'active', logoUrl: null,
  sport: { sportId: 's1', name: '풋살' }, region: regionId ? { regionId, name: 'x', parentName: null } : null, memberCount: 8,
});

function lastFilters() {
  return hookMocks.useV1TeamPages.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
}

describe('TeamListPageClient — 내 지역 팀 먼저', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsMock.value = new URLSearchParams('');
    hookMocks.useV1TeamPages.mockReturnValue({
      data: { pages: [{ items: [team(0)], pageInfo: { nextCursor: null, hasNext: false, totalCount: 1 } }] },
      isPending: false, isError: false, isPlaceholderData: false, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(),
    });
    hookMocks.useV1MasterSports.mockReturnValue({ data: [] });
    hookMocks.useV1MasterRegions.mockReturnValue({ data: regions, isPending: false });
    hookMocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'u1' } }, isPending: false });
    hookMocks.useV1Profile.mockReturnValue({ data: { regions: [{ regionId: 'r-mapo', regionName: '서울 마포구', primary: true }] }, isPending: false, isError: false });
    hookMocks.useV1MyTeams.mockReturnValue({ data: [] });
  });

  it('저장한 활동 지역(구/군)의 시/도를 요청에 싣고, 안내만 한다', () => {
    render(<TeamListPageClient />);

    expect(lastFilters()).toMatchObject({ sort: 'activity', preferRegionId: 'r-seoul' });
    expect(screen.getByText('내 활동 지역(서울)의 팀을 먼저 보여 줘요')).toBeTruthy();
    // 설정 링크는 활동 지역이 아직 없는 사람에게만 보인다 — 이미 정한 사람에게는 어떤 이름으로도 없다.
    expect(screen.queryByRole('link', { name: /지역 설정/ })).toBeNull();
    expect(document.querySelector('.tm-list-region-notice-action')).toBeNull();
  });

  it('활동 지역을 정한 사람은 내 팀이 다른 지역에 있어도 저장한 지역을 쓰고 설정 링크가 없다', () => {
    hookMocks.useV1MyTeams.mockReturnValue({ data: [myTeam('r-seongnam')] });
    render(<TeamListPageClient />);

    expect(lastFilters()).toMatchObject({ preferRegionId: 'r-seoul' });
    expect(screen.getByText('내 활동 지역(서울)의 팀을 먼저 보여 줘요')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /지역 설정/ })).toBeNull();
  });

  // 활동 지역을 정하지 않은 사람은 소속 팀이 있든 없든 똑같다 — 소속 팀의 지역으로 대신하지 않는다.
  it.each([
    ['소속 팀이 없는', []],
    ['소속 팀이 있는', [myTeam('r-seongnam')]],
    ['지역을 모르는 팀만 있는', [myTeam(null)]],
  ])('활동 지역이 없는 사용자(%s)는 기본 순서 그대로 요청하고 설정을 권한다', (_label, teams) => {
    hookMocks.useV1Profile.mockReturnValue({ data: { regions: [] }, isPending: false, isError: false });
    hookMocks.useV1MyTeams.mockReturnValue({ data: teams });
    render(<TeamListPageClient />);

    expect(lastFilters()).not.toHaveProperty('preferRegionId');
    expect(screen.getByText(/내 지역 팀을 먼저 보려면/)).toBeTruthy();
    // 안내 글은 왼쪽, "지역 설정" 알약 버튼은 오른쪽 — 같은 줄(.tm-list-region-notice-action)에 있고 설정 화면으로 이어진다.
    const link = screen.getByRole('link', { name: '지역 설정' });
    expect(link.getAttribute('href')).toBe('/my/settings/location');
    expect(link.classList.contains('tm-list-region-notice-link')).toBe(true);
    expect(link.closest('.tm-list-region-notice-action')?.textContent).toContain('내 지역 팀을 먼저 보려면');
    expect(link.querySelector('.tm-list-region-notice-pill svg')).not.toBeNull();
    expect(screen.queryByText(/내 팀이 있는 지역/)).toBeNull();
  });

  it('프로필을 아직 못 받았으면 요청에도 싣지 않고 설정도 권하지 않는다', () => {
    hookMocks.useV1Profile.mockReturnValue({ data: undefined, isPending: true, isError: false });
    render(<TeamListPageClient />);

    expect(lastFilters()).not.toHaveProperty('preferRegionId');
    expect(screen.queryByText(/먼저 보여 줘요/)).toBeNull();
  });

  it('비로그인은 기본 순서 그대로이고 안내도 없다', () => {
    hookMocks.useV1AuthMe.mockReturnValue({ data: undefined, isPending: false });
    hookMocks.useV1MyTeams.mockReturnValue({ data: undefined });
    render(<TeamListPageClient />);

    expect(lastFilters()).not.toHaveProperty('preferRegionId');
    expect(screen.queryByText(/먼저 보여 줘요/)).toBeNull();
  });

  it.each(['sort=member_count', 'sort=latest', 'regionId=r-gg'])('활동순이 아니거나 지역을 직접 고른 목록(%s)에는 싣지도 안내하지도 않는다', (params) => {
    searchParamsMock.value = new URLSearchParams(params);
    render(<TeamListPageClient />);

    expect(lastFilters()).not.toHaveProperty('preferRegionId');
    expect(screen.queryByText(/먼저 보여 줘요/)).toBeNull();
  });

  it('이어 보기 주소는 첫 페이지의 기준(near)을 그대로 쓰고, 다음 이어 보기 주소에도 싣는다', () => {
    searchParamsMock.value = new URLSearchParams('near=r-gg&cursor=opaque-2');
    hookMocks.useV1TeamPages.mockReturnValue({
      data: { pages: [{ items: [team(20)], pageInfo: { nextCursor: 'opaque-3', hasNext: true } }] },
      isPending: false, isError: false, isPlaceholderData: false, hasNextPage: true, isFetchingNextPage: false, fetchNextPage: vi.fn(),
    });
    render(<TeamListPageClient />);

    // 내 활동 지역(서울)이 아니라 주소가 싣고 온 경기를 쓴다 — 커서는 그 순서에서 나온 것이다.
    expect(lastFilters()).toMatchObject({ preferRegionId: 'r-gg' });
    const href = new URL(screen.getByRole('link', { name: '더 보기' }).getAttribute('href') ?? '', 'https://teameet.test');
    expect(href.searchParams.get('near')).toBe('r-gg');
    expect(href.searchParams.get('cursor')).toBe('opaque-3');
  });

  it('기준 없이 커서만 있는 주소는 지역을 새로 얹지 않는다 — 기본 순서의 커서이기 때문이다', () => {
    searchParamsMock.value = new URLSearchParams('cursor=opaque-2');
    render(<TeamListPageClient />);

    expect(lastFilters()).not.toHaveProperty('preferRegionId');
  });

  it('내 지역 순서를 읽는 첫 페이지의 이어 보기 주소에 기준을 싣고, 시드를 보여 주는 동안에는 싣지 않는다', () => {
    const page = (placeholder: boolean) => ({
      data: { pages: [{ items: [team(0)], pageInfo: { nextCursor: 'c-1', hasNext: true } }] },
      isPending: false, isError: false, isPlaceholderData: placeholder, hasNextPage: true, isFetchingNextPage: false, fetchNextPage: vi.fn(),
    });

    hookMocks.useV1TeamPages.mockReturnValue(page(false));
    const first = render(<TeamListPageClient />);
    const hrefOf = () => new URL(screen.getByRole('link', { name: '더 보기' }).getAttribute('href') ?? '', 'https://teameet.test');
    expect(hrefOf().searchParams.get('near')).toBe('r-seoul');
    first.unmount();

    // 새 순서가 도착하기 전 시드(기본 순서)의 커서에는 기준이 없다.
    hookMocks.useV1TeamPages.mockReturnValue(page(true));
    const seedPage = { items: [team(0)], pageInfo: { nextCursor: 'c-1', hasNext: true } };
    render(<TeamListPageClient seed={{ page: seedPage as never, sports: [], query: TEAM_LIST_SEED_PATH }} />);
    expect(hrefOf().searchParams.has('near')).toBe(false);
    expect(hrefOf().searchParams.get('cursor')).toBe('c-1');
  });

  it('설정 알약은 눈에 보이는 높이 32px, 누르는 영역 44px 이고 토큰만 쓴다', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
    const rule = (selector: string) => css.match(new RegExp(`\\n${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';

    expect(rule('.tm-list-region-notice-link')).toMatch(/min-height:\s*var\(--spacing-11\)/);
    expect(rule('.tm-list-region-notice-pill')).toMatch(/height:\s*var\(--spacing-8\)/);
    expect(rule('.tm-list-region-notice-pill')).toMatch(/border-radius:\s*var\(--radius-pill\)/);
    expect(rule('.tm-list-region-notice-pill')).toMatch(/background:\s*var\(--blue50\)/);
    expect(rule('.tm-list-region-notice-pill')).toMatch(/color:\s*var\(--blue700\)/);
  });

  it('안내 문구는 알약 옆에서 두 줄로 접혀도 어절 단위로만 줄바꿈하고 짧은 마지막 줄을 피한다', () => {
    // 390 폭에서 문구 영역은 224px 라 한 줄에 다 들어가지 않는다 — 기본 줄바꿈은 "보|여", 마지막 "요" 한 글자에서 끊겼다.
    const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
    const notice = css.match(/\n\.tm-list-region-notice\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(notice).toMatch(/word-break:\s*keep-all/);
    expect(notice).toMatch(/text-wrap:\s*pretty/);
  });
});

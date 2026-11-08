/**
 * /teams 필터 시트의 지역·정렬 섹션.
 *
 * - 지역: 저장해 둔 활동 지역(프로필)을 시/도 단위 '내 지역' 칩으로 올린다. 위치 권한은 쓰지 않는다.
 * - 정렬: 서버에서 실제로 순서가 다른 세 가지(최근 등록순·멤버 많은순·활동 많은순)만 둔다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const searchParamsMock = vi.hoisted(() => ({ value: new URLSearchParams('filter=1') }));
const hookMocks = vi.hoisted(() => ({
  useV1TeamPages: vi.fn(),
  useV1MasterSports: vi.fn(() => ({ data: [] })),
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
  usePathname: () => '/teams',
  useSearchParams: () => searchParamsMock.value,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

import { TeamListPageClient } from './teams-client';

const MASTER = [
  { id: 'r-seoul', name: '서울', parentId: null },
  { id: 'r-gg', name: '경기', parentId: null },
  { id: 'r-incheon', name: '인천', parentId: null },
  { id: 'r-gg-seongnam', name: '성남시', parentId: 'r-gg' },
  { id: 'r-seoul-mapo', name: '마포구', parentId: 'r-seoul' },
];

function render(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function signedIn(regions: Array<{ regionId: string; regionName: string; primary: boolean }> | undefined) {
  hookMocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'user-1' } }, isPending: false });
  hookMocks.useV1Profile.mockReturnValue({ data: { regions }, isPending: false });
}

function signedOut() {
  hookMocks.useV1AuthMe.mockReturnValue({ data: undefined, isPending: false, isError: true, error: new Error('401') });
  hookMocks.useV1Profile.mockReturnValue({ data: undefined, isPending: false });
}

function section(title: string) {
  const heading = screen.getByText(title, { selector: '.tm-text-label' });
  return heading.closest('.tm-filter-section') as HTMLElement;
}

function chipLabels(title: string) {
  return Array.from(section(title).querySelectorAll('a.tm-chip')).map((link) => link.textContent);
}

function chip(title: string, label: string) {
  return within(section(title)).getByRole('link', { name: label });
}

describe('TeamListPageClient — 필터 시트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsMock.value = new URLSearchParams('filter=1');
    hookMocks.useV1TeamPages.mockReturnValue({
      data: { pages: [{ items: [], nextCursor: null, pageInfo: { nextCursor: null, hasNext: false, totalCount: 0 } }] },
      isPending: false, isError: false, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(),
    });
    hookMocks.useV1MasterRegions.mockReturnValue({ data: MASTER, isPending: false });
  });

  describe('지역 — 내 지역 칩', () => {
    it('저장한 구/군 활동 지역을 시/도 칩으로 올리고, 같은 시/도의 일반 칩은 목록에서 뺀다', () => {
      signedIn([{ regionId: 'r-gg-seongnam', regionName: '성남시', primary: true }]);
      render(<TeamListPageClient />);

      expect(chipLabels('지역')).toEqual(['전체', '내 지역 · 경기', '서울', '인천']);
      expect(new URL(chip('지역', '내 지역 · 경기').getAttribute('href')!, 'https://t.test').searchParams.get('regionId')).toBe('r-gg');
      expect(screen.getByText(/설정한 활동 지역\(경기 성남시\)을 시\/도 단위로 보여 줘요/)).toBeTruthy();
      expect(screen.getByRole('link', { name: '바꾸기' }).getAttribute('href')).toBe('/my/settings/location');
    });

    it('대조군 — 다른 시/도를 저장한 사용자는 그 시/도로 칩이 바뀌고 경기는 일반 칩으로 남는다', () => {
      signedIn([{ regionId: 'r-seoul-mapo', regionName: '마포구', primary: true }]);
      render(<TeamListPageClient />);

      expect(chipLabels('지역')).toEqual(['전체', '내 지역 · 서울', '경기', '인천']);
      expect(screen.getByText(/설정한 활동 지역\(서울 마포구\)/)).toBeTruthy();
    });

    it('활동 지역이 시/도 자체로 저장돼 있으면 그대로 쓴다', () => {
      signedIn([{ regionId: 'r-incheon', regionName: '인천', primary: true }]);
      render(<TeamListPageClient />);

      expect(chipLabels('지역')).toEqual(['전체', '내 지역 · 인천', '서울', '경기']);
      expect(screen.getByText(/설정한 활동 지역\(인천\)/)).toBeTruthy();
    });

    it('활동 지역이 둘이면 기본(primary) 한 곳만 반영한다', () => {
      signedIn([
        { regionId: 'r-seoul-mapo', regionName: '마포구', primary: false },
        { regionId: 'r-gg-seongnam', regionName: '성남시', primary: true },
      ]);
      render(<TeamListPageClient />);

      expect(chipLabels('지역')[1]).toBe('내 지역 · 경기');
    });

    it('내 지역 칩을 켠 상태에서는 선택 표시가 켜지고, 다시 누르면 지역 필터가 풀린다', () => {
      searchParamsMock.value = new URLSearchParams('filter=1&regionId=r-gg&sportId=sport-futsal');
      signedIn([{ regionId: 'r-gg-seongnam', regionName: '성남시', primary: true }]);
      render(<TeamListPageClient />);

      const mine = chip('지역', '내 지역 · 경기');
      expect(mine.getAttribute('aria-current')).toBe('page');
      const next = new URL(mine.getAttribute('href')!, 'https://t.test').searchParams;
      expect(next.has('regionId')).toBe(false);
      expect(next.get('sportId')).toBe('sport-futsal');
      expect(chip('지역', '전체').getAttribute('aria-current')).toBeNull();
    });

    it('활동 지역을 정하지 않은 로그인 사용자는 칩 대신 설정 링크를 보고 시/도 17곳은 그대로다', () => {
      signedIn([]);
      render(<TeamListPageClient />);

      expect(chipLabels('지역')).toEqual(['전체', '서울', '경기', '인천']);
      expect(screen.getByRole('link', { name: /활동 지역 설정하기/ }).getAttribute('href')).toBe('/my/settings/location');
    });

    it('비로그인도 설정 링크를 본다', () => {
      signedOut();
      render(<TeamListPageClient />);

      expect(chipLabels('지역')).toEqual(['전체', '서울', '경기', '인천']);
      expect(screen.getByRole('link', { name: /활동 지역 설정하기/ })).toBeTruthy();
    });

    it('프로필을 아직 못 받았으면 안내 링크도 내 지역 칩도 내지 않는다', () => {
      hookMocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'user-1' } }, isPending: false });
      hookMocks.useV1Profile.mockReturnValue({ data: undefined, isPending: true });
      render(<TeamListPageClient />);

      expect(chipLabels('지역')).toEqual(['전체', '서울', '경기', '인천']);
      expect(screen.queryByRole('link', { name: /활동 지역 설정하기/ })).toBeNull();
    });

    it('프로필 조회가 실패하면 저장한 지역을 모르는 것이라 설정 유도 링크를 내지 않는다', () => {
      hookMocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'user-1' } }, isPending: false });
      hookMocks.useV1Profile.mockReturnValue({ data: undefined, isPending: false, isError: true });
      render(<TeamListPageClient />);

      expect(chipLabels('지역')).toEqual(['전체', '서울', '경기', '인천']);
      expect(screen.queryByRole('link', { name: /활동 지역 설정하기/ })).toBeNull();
    });

    it('위치 권한을 부르지 않는다', () => {
      const getCurrentPosition = vi.fn();
      vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
      signedIn([{ regionId: 'r-gg-seongnam', regionName: '성남시', primary: true }]);
      render(<TeamListPageClient />);

      expect(getCurrentPosition).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  describe('정렬 — 실제로 다른 순서만', () => {
    beforeEach(() => signedOut());

    it('기본에서는 최근 등록순이 켜져 있고 메뉴는 서버가 구분하는 세 가지뿐이다', () => {
      render(<TeamListPageClient />);

      expect(chipLabels('정렬')).toEqual(['최근 등록순', '멤버 많은순', '활동 많은순']);
      expect(chip('정렬', '최근 등록순').getAttribute('aria-current')).toBe('page');
      expect(screen.queryByRole('link', { name: '추천순' })).toBeNull();
      expect(screen.queryByRole('link', { name: '가입 가능' })).toBeNull();
      expect(screen.queryByRole('link', { name: '최신순' })).toBeNull();
    });

    it.each([['member_count', '멤버 많은순'], ['activity', '활동 많은순']])('sort=%s 이면 %s 만 켜지고, 같은 칩을 다시 누르면 기본으로 돌아간다', (value, label) => {
      searchParamsMock.value = new URLSearchParams(`filter=1&sort=${value}`);
      render(<TeamListPageClient />);

      expect(chip('정렬', label).getAttribute('aria-current')).toBe('page');
      expect(chip('정렬', '최근 등록순').getAttribute('aria-current')).toBeNull();
      expect(new URL(chip('정렬', label).getAttribute('href')!, 'https://t.test').searchParams.has('sort')).toBe(false);
    });

    it('정렬 칩은 URL 의 sort 값과 API 요청을 같은 값으로 바꾼다', () => {
      render(<TeamListPageClient />);

      const hrefs = Object.fromEntries(['멤버 많은순', '활동 많은순'].map((label) => [label, new URL(chip('정렬', label).getAttribute('href')!, 'https://t.test').searchParams.get('sort')]));
      expect(hrefs).toEqual({ '멤버 많은순': 'member_count', '활동 많은순': 'activity' });
    });

    it.each(['recommended', 'latest', 'deadline'])('공유돼 있던 옛 링크(sort=%s)는 기본 순서로 열리고 정렬 배지·API 정렬에 잡히지 않는다', (old) => {
      searchParamsMock.value = new URLSearchParams(`filter=1&sort=${old}`);
      render(<TeamListPageClient />);

      expect(chip('정렬', '최근 등록순').getAttribute('aria-current')).toBe('page');
      const [filters] = hookMocks.useV1TeamPages.mock.calls[0] as [Record<string, unknown>];
      expect(filters).not.toHaveProperty('sort');
      expect(filters).not.toHaveProperty('joinPolicy');
      expect(screen.queryByLabelText('필터')?.textContent ?? '').not.toMatch(/1/);
    });

    it('정렬을 고르면 필터 개수 배지가 1 올라간다', () => {
      searchParamsMock.value = new URLSearchParams('sort=activity');
      render(<TeamListPageClient />);

      expect(screen.getByLabelText('필터').textContent).toBe('1');
    });
  });
});

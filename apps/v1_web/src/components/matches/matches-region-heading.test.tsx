import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MatchListPageClient } from './matches-client';

const BUSAN = 'a75f6cce-70da-4082-88fc-8f28a62c0aa2';
const SEOUL = 'seoul-control';
const state = vi.hoisted(() => ({
  search: '', pending: false, error: false, hasItems: false,
  matches: vi.fn(), replace: vi.fn(), back: vi.fn(), refetch: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(state.search),
  usePathname: () => '/matches',
  useRouter: () => ({ replace: state.replace, push: vi.fn(), back: state.back }),
}));
vi.mock('@/components/v1-ui/shell-override', () => ({ useShellOverride: () => undefined }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1Matches: (...args: unknown[]) => state.matches(...args),
  useV1MasterSports: () => ({ data: [] }),
  useV1MasterRegions: () => ({ data: [
    { id: BUSAN, name: '부산', parentId: null },
    { id: SEOUL, name: '서울', parentId: null },
  ] }),
  useV1RecentSearches: () => ({ data: { items: [] }, isLoading: false }),
  useV1RecordSearch: () => ({ mutate: vi.fn() }),
}));

beforeEach(() => {
  Object.assign(state, { search: '', pending: false, error: false, hasItems: false });
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/matches');
  state.matches.mockImplementation(() => ({
    data: state.pending ? undefined : {
      items: state.hasItems ? [{
        id: 'busan-control', matchId: 'busan-control', title: '지역 대조 매치',
        sport: { sportId: 'sport-futsal', name: '풋살' },
        place: { name: '합성 QA 구장', addressText: '합성 QA 주소' },
        startsAt: '2026-10-02T10:00:00.000Z', status: 'open',
        participantCount: 1, capacity: 4, imageUrl: null,
      }] : [],
      pageInfo: { hasNext: false, nextCursor: null },
    },
    isPending: state.pending, isError: state.error, isFetching: false, refetch: state.refetch,
  }));
});
afterEach(() => window.history.replaceState(null, '', '/matches'));

// region/server 결과를 생성하는 hook만 경계 fixture로 둔다. 실제 client→view-model→
// H2/필터/카드 렌더를 사용하므로 제품의 고정 서울 제목이 다시 들어오면 실패한다.
describe('#1544 개인 매치의 지역에 독립적인 목록 제목', () => {
  describe.each([false, true])('결과 카드 있음: %s', (hasItems) => {
    it.each([BUSAN, SEOUL, 'unknown-region', null])('%s 지역의 H2·요청·결과·복귀 의미를 유지한다', (regionId) => {
      state.hasItems = hasItems;
      state.search = regionId ? new URLSearchParams({ regionId }).toString() : '';
      render(<MatchListPageClient />);

      expect(screen.getByRole('heading', { level: 2, name: '개인 매치' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /서울 전체/ })).not.toBeInTheDocument();
      if (regionId) {
        expect(state.matches.mock.calls.some(([filters]) => filters?.regionId === regionId)).toBe(true);
      } else {
        expect(state.matches.mock.calls.every(([filters]) => !filters?.regionId)).toBe(true);
      }
      expect(screen.getByText(new RegExp(`^${hasItems ? 1 : 0}개 · 오늘`))).toBeInTheDocument();
      if (hasItems) {
        const link = screen.getByRole('link', { name: /지역 대조 매치/ });
        const href = new URL(link.getAttribute('href')!, 'https://example.test');
        expect(href.pathname).toBe('/matches/busan-control');
        expect(href.searchParams.get('from')).toBe(regionId ? `/matches?${state.search}` : null);
        expect(screen.queryByText('조건에 맞는 매치가 없어요')).not.toBeInTheDocument();
      } else {
        expect(screen.getByText('조건에 맞는 매치가 없어요')).toBeInTheDocument();
        if (regionId) expect(screen.getByRole('link', { name: '전체 매치 보기' })).toHaveAttribute('href', '/matches');
      }
    });
  });

  it('필터 재개·지역 변경·닫기·초기화가 선택 조건과 중립 제목을 유지한다', () => {
    state.search = `regionId=${BUSAN}&filter=1`;
    const { rerender } = render(<MatchListPageClient />);
    let dialog = screen.getByRole('dialog', { name: '매치 필터' });
    expect(within(dialog).getByRole('link', { name: '부산' })).toHaveAttribute('aria-current', 'true');
    const apply = within(dialog).getByRole('link', { name: '적용하기' });
    expect(apply).toHaveAttribute('href', `/matches?regionId=${BUSAN}`);
    expect(within(dialog).getByRole('link', { name: '닫기' })).toHaveAttribute('href', `/matches?regionId=${BUSAN}`);
    const reset = new URL(within(dialog).getByRole('link', { name: '초기화' }).getAttribute('href')!, 'https://example.test');
    expect(reset.searchParams.has('regionId')).toBe(false);
    expect(reset.searchParams.get('filter')).toBe('1');

    const seoul = new URL(within(dialog).getByRole('link', { name: '서울' }).getAttribute('href')!, 'https://example.test');
    state.search = seoul.searchParams.toString();
    rerender(<MatchListPageClient />);
    dialog = screen.getByRole('dialog', { name: '매치 필터' });
    expect(within(dialog).getByRole('link', { name: '서울' })).toHaveAttribute('aria-current', 'true');
    expect(within(dialog).getByRole('link', { name: '부산' })).not.toHaveAttribute('aria-current');
    state.search = `regionId=${SEOUL}`;
    rerender(<MatchListPageClient />);
    expect(screen.getByRole('heading', { level: 2, name: '개인 매치' })).toBeInTheDocument();
    state.search = reset.searchParams.toString();
    rerender(<MatchListPageClient />);
    dialog = screen.getByRole('dialog', { name: '매치 필터' });
    const regions = within(dialog).getByText('지역').parentElement!;
    expect(within(regions).getByRole('link', { name: '전체' })).toHaveAttribute('aria-current', 'true');
    state.search = '';
    rerender(<MatchListPageClient />);
    expect(screen.getByRole('heading', { level: 2, name: '개인 매치' })).toBeInTheDocument();
  });

  it('부산 조건으로 재마운트해도 제목과 필터 링크가 유지된다', () => {
    state.search = `regionId=${BUSAN}`;
    const first = render(<MatchListPageClient />);
    expect(screen.getByRole('heading', { level: 2, name: '개인 매치' })).toBeInTheDocument();
    first.unmount();
    render(<MatchListPageClient />);
    expect(screen.getByRole('heading', { level: 2, name: '개인 매치' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /필터/ })).toHaveAttribute('href', `/matches?regionId=${BUSAN}&filter=1`);
  });

  it('초기 로딩도 중립 H2를 보여주며 빈 결과로 위장하지 않는다', () => {
    state.pending = true;
    state.search = `regionId=${BUSAN}`;
    render(<MatchListPageClient />);
    expect(screen.getByRole('heading', { level: 2, name: '개인 매치' })).toBeInTheDocument();
    expect(screen.queryByText('조건에 맞는 매치가 없어요')).not.toBeInTheDocument();
  });

  it('API 실패는 기존 오류와 재시도를 유지한다', () => {
    state.error = true;
    state.search = `regionId=${BUSAN}`;
    render(<MatchListPageClient />);
    expect(screen.getByRole('alert')).toHaveTextContent('매치 목록을 불러오지 못했어요');
    expect(screen.queryByText('조건에 맞는 매치가 없어요')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
});

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import LeagueMatchesListClient from './league-matches-list-client';

const routerReplace = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
  useSearchParams: () => currentSearchParams,
}));

const useV1LeagueMatchesMock = vi.fn();
const useV1MasterSportsMock = vi.fn();

vi.mock('@/hooks/use-v1-api', () => ({
  useV1LeagueMatches: (...args: unknown[]) => useV1LeagueMatchesMock(...args),
  useV1MasterSports: (...args: unknown[]) => useV1MasterSportsMock(...args),
}));

function league(over: Partial<{
  leagueId: string;
  title: string;
  state: 'draft' | 'active' | 'completed';
  startsOn: string;
  endsOn: string;
  sportCode: string;
  sportName: string;
  regionName: string;
  teamCount: number;
}>) {
  return {
    leagueId: over.leagueId ?? 'league-1',
    title: over.title ?? '가을 풋살 리그',
    state: over.state ?? 'active',
    startsOn: over.startsOn ?? '2026-09-01T00:00:00.000Z',
    endsOn: over.endsOn ?? '2026-10-20T00:00:00.000Z',
    sport: { sportId: 'sport-1', code: over.sportCode ?? 'futsal', name: over.sportName ?? '풋살' },
    region: { regionId: 'region-1', name: over.regionName ?? '성수동' },
    teamCount: over.teamCount ?? 6,
  };
}

describe('LeagueMatchesListClient', () => {
  beforeEach(() => {
    routerReplace.mockClear();
    currentSearchParams = new URLSearchParams();
    useV1MasterSportsMock.mockReturnValue({ data: [{ id: 'sport-1', name: '풋살' }, { id: 'sport-2', name: '농구' }] });
  });

  it('리그 카드가 제목·상태·종목·지역·기간·참가팀 수를 보여주고 상세로 링크한다', () => {
    useV1LeagueMatchesMock.mockReturnValue({
      data: { items: [league({})], pageInfo: { nextCursor: null, hasNext: false } },
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    render(<LeagueMatchesListClient />);

    const link = screen.getByRole('link', { name: '가을 풋살 리그 상세로 이동' });
    expect(link).toHaveAttribute('href', '/league-matches/league-1');
    // 카드 안쪽으로 범위를 좁힌다 -- '풋살'은 종목 필터 칩에도 같은 문자열로 렌더되므로
    // screen.getByText만 쓰면 "여러 요소 매치"로 항상 실패한다.
    expect(within(link).getByText('진행 중')).toBeInTheDocument();
    expect(within(link).getByText('풋살')).toBeInTheDocument();
    expect(within(link).getByText('성수동')).toBeInTheDocument();
    expect(within(link).getByText('6팀 참가')).toBeInTheDocument();

    // 대회 카드와 **같은 골격**을 쓰는지 — 종목 아이덴티티(썸네일 글리프 + 종목 칩)가
    // 리그 카드에도 있어야 한다. 통합 전 리그 카드는 색 점 하나뿐이라 같은 "대회" 탭
    // 안에서 두 종류가 다른 물건처럼 보였다. 이 단언이 그 회귀를 막는다.
    // 종목 칩 — 전에는 색 점 + 라벨뿐이라 `aria-label` 이 없었다(색으로만 알리는 상태).
    expect(within(link).getByLabelText('종목: 풋살')).toBeInTheDocument();
    // 썸네일 — SportGlyph 는 aria-hidden SVG 라 접근성 쿼리로 안 잡힌다. 그렇다고
    // `link.querySelector('svg')` 로 두면 **카드 어디의 svg 라도 통과**한다 — 지금은
    // 카드에 svg 가 썸네일뿐이라 결과가 같지만, 다른 svg 가 하나라도 늘면 썸네일이
    // 사라져도 green 이 된다(Copilot #887 지적). 썸네일을 정확히 집는다.
    const thumbnail = within(link).getByTestId('competition-thumbnail');
    expect(thumbnail.querySelector('svg')).not.toBeNull();
  });

  it('결과가 0건이면 EmptyState를 렌더한다', () => {
    useV1LeagueMatchesMock.mockReturnValue({
      data: { items: [], pageInfo: { nextCursor: null, hasNext: false } },
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    render(<LeagueMatchesListClient />);

    expect(screen.getByText('조건에 맞는 리그가 없어요')).toBeInTheDocument();
  });

  it('실패하면 ErrorState를 렌더하고 재시도 버튼이 refetch를 호출한다', async () => {
    const refetch = vi.fn();
    useV1LeagueMatchesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('network'),
      isFetching: false,
      refetch,
    });

    render(<LeagueMatchesListClient />);

    const retryButton = screen.getByRole('button', { name: /다시 시도/ });
    await userEvent.click(retryButton);
    expect(refetch).toHaveBeenCalled();
  });

  it('로딩 중에는 스켈레톤을 보여주고 목록을 렌더하지 않는다', () => {
    useV1LeagueMatchesMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      isFetching: true,
      refetch: vi.fn(),
    });

    render(<LeagueMatchesListClient />);

    expect(screen.getByLabelText('리그 목록 불러오는 중')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '리그 목록' })).not.toBeInTheDocument();
  });

  it('종목 칩을 누르면 sportId를 쿼리스트링에 담아 이동하고, 필터가 훅에 실제로 전달된다', async () => {
    useV1LeagueMatchesMock.mockReturnValue({
      data: { items: [league({})], pageInfo: { nextCursor: null, hasNext: false } },
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    render(<LeagueMatchesListClient />);

    await userEvent.click(screen.getByRole('button', { name: '농구 종목만 보기' }));

    expect(routerReplace).toHaveBeenCalledWith('/league-matches?sportId=sport-2', { scroll: false });
  });

  it('상태 필터가 draft/active/completed 갱신을 쿼리스트링에 반영한다', async () => {
    useV1LeagueMatchesMock.mockReturnValue({
      data: { items: [league({})], pageInfo: { nextCursor: null, hasNext: false } },
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    render(<LeagueMatchesListClient />);

    await userEvent.click(screen.getByRole('button', { name: '종료 리그만 보기' }));

    expect(routerReplace).toHaveBeenCalledWith('/league-matches?state=completed', { scroll: false });
  });

  it('hasNext가 true면 더 보기 버튼이 다음 커서로 useV1LeagueMatches를 다시 호출한다', async () => {
    useV1LeagueMatchesMock.mockReturnValue({
      data: { items: [league({})], pageInfo: { nextCursor: 'league-2', hasNext: true } },
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    render(<LeagueMatchesListClient />);

    useV1LeagueMatchesMock.mockClear();
    await userEvent.click(screen.getByRole('button', { name: '더 보기' }));

    // cursor가 상태로 반영되어 다음 렌더에서 훅이 새 커서로 재호출된다 — 이 값이 커밋되지
    // 않으면 "더 보기"를 눌러도 항상 같은 첫 페이지만 반복 요청하는 버그가 재현되지 않는다.
    expect(useV1LeagueMatchesMock).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: 'league-2' }),
    );
  });

  it('티어 리그는 목록에서 "N부" 뱃지와 시리즈명을 함께 보여주고, 단발 리그는 뱃지가 없다', () => {
    // 이 화면은 "자기 수준의 리그를 고르는" 곳이라(Task 153 시나리오 3) 상세에 들어가야만
    // 몇 부인지 알 수 있으면 고를 수가 없다. 제목에 "1부"가 들어 있어서 읽히는 것에
    // 기대면 안 된다 — 제목은 운영자 자유 입력이다.
    useV1MasterSportsMock.mockReturnValue({ data: [] });
    useV1LeagueMatchesMock.mockReturnValue({
      data: {
        items: [
          { ...league({ leagueId: 'tiered', title: '강남 리그 1시즌' }), tier: 1, tierLabel: '1부', seasonNo: 1, seriesTitle: '강남 풋살 리그' },
          { ...league({ leagueId: 'standalone', title: '동네 리그' }), tier: null, tierLabel: null, seasonNo: null, seriesTitle: null },
        ],
        pageInfo: { nextCursor: null, hasNext: false },
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    render(<LeagueMatchesListClient />);

    const tiered = screen.getByRole('link', { name: /강남 리그 1시즌 상세로 이동/ });
    expect(within(tiered).getByText('1부')).toBeInTheDocument();
    expect(within(tiered).getByText(/강남 풋살 리그/)).toBeInTheDocument();

    const standalone = screen.getByRole('link', { name: /동네 리그 상세로 이동/ });
    expect(within(standalone).queryByText('1부')).not.toBeInTheDocument();
  });
});

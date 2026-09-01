import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/analytics';
import type { MatchDetailViewModel, MatchListViewModel } from './matches.types';
import { MatchDetailPageClient, MatchListPageClient } from './matches-client';

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

const {
  applyMatchMutateAsync,
  withdrawMatchMutateAsync,
  routerPush,
  useV1MatchMock,
  useV1MatchApplicationEligibilityMock,
  useV1MatchesMock,
} = vi.hoisted(() => ({
  applyMatchMutateAsync: vi.fn(),
  withdrawMatchMutateAsync: vi.fn(),
  routerPush: vi.fn(),
  useV1MatchMock: vi.fn(),
  useV1MatchApplicationEligibilityMock: vi.fn(),
  useV1MatchesMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1Match: useV1MatchMock,
  useV1MatchApplicationEligibility: useV1MatchApplicationEligibilityMock,
  useV1ApplyMatch: () => ({ mutateAsync: applyMatchMutateAsync, isPending: false }),
  useV1WithdrawMatchApplication: () => ({ mutateAsync: withdrawMatchMutateAsync, isPending: false }),
  useV1ResolveChatRoom: () => ({ mutate: vi.fn(), isPending: false }),
  useV1Matches: useV1MatchesMock,
  useV1MasterSports: () => ({ data: [] }),
  useV1RecentSearches: () => ({ data: { items: [] }, isLoading: false }),
  useV1RecordSearch: () => ({ mutate: vi.fn() }),
}));

vi.mock('./matches-page', () => ({
  MatchDetailPageSkeleton: () => <div data-testid="detail-skeleton" />,
  MatchDetailPageView: ({ model }: { model: MatchDetailViewModel }) => (
    <div>
      {model.onApply && <button onClick={model.onApply}>참가 신청</button>}
      {model.reviewAction && <a href={model.reviewAction.href}>{model.reviewAction.label}</a>}
      <div data-testid="address">{model.match.address}</div>
      <div data-testid="description">{model.match.description}</div>
      <div data-testid="title">{model.match.title}</div>
      <div data-testid="status-label">{model.statusLabel}</div>
      <div data-testid="apply-label">{model.applyLabel}</div>
      <div data-testid="rules">{model.match.rules.join('|')}</div>
      <div data-testid="participants">{model.match.participants.map((p) => p.name).join('|')}</div>
    </div>
  ),
  MatchListPageView: ({ model }: { model: MatchListViewModel }) => (
    <div>
      <span data-testid="match-count">{model.matches.length}</span>
      {model.hasNext && model.onLoadMore ? <button onClick={model.onLoadMore}>더 보기</button> : null}
    </div>
  ),
  MatchStatePageView: () => null,
}));

// place는 실제 detail API 응답 모양(`{ name, addressText }`) 그대로 둔다 — 예전 fixture는
// 실API가 절대 주지 않는 top-level `placeName`을 심어 뒀고, matches-client.tsx의
// `?? query.data.placeName` 폴백 가지가 이 fixture 때문에만 값을 갖게 되어 실제로는 목업
// fallback까지 내려가는 결함(2026-08-27 감사 M-A-personal-match-state)을 가리고 있었다.
const baseMatch = {
  id: 'match-1',
  matchId: 'match-1',
  title: '풋살 매치',
  sportName: '풋살',
  sport: { sportId: 'sport-futsal', name: '풋살' },
  place: { name: '서울 풋살장', addressText: '서울 마포구 월드컵로 1' },
  startsAt: '2026-08-01T10:00:00.000Z',
  capacityText: '3/10',
  status: 'open' as const,
};

describe('MatchDetailPageClient — GA events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useV1MatchMock.mockReturnValue({
      data: { ...baseMatch, viewerState: 'none' },
      isError: false,
    });
    useV1MatchApplicationEligibilityMock.mockReturnValue({ data: { eligible: true, applicationId: null } });
    applyMatchMutateAsync.mockResolvedValue({ applicationId: 'app-1' });
    withdrawMatchMutateAsync.mockResolvedValue({ applicationId: 'app-1' });
  });

  it('fires match_view exactly once when the match detail loads', () => {
    const { rerender } = render(<MatchDetailPageClient matchId="match-1" />);
    rerender(<MatchDetailPageClient matchId="match-1" />);

    expect(trackEvent).toHaveBeenCalledWith('match_view', { matchId: 'match-1', sportType: '풋살' });
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it('fires match_join_complete after a successful apply', async () => {
    render(<MatchDetailPageClient matchId="match-1" />);

    fireEvent.click(screen.getByRole('button', { name: '참가 신청' }));

    await waitFor(() => {
      expect(applyMatchMutateAsync).toHaveBeenCalledWith({ message: null });
    });
    expect(trackEvent).toHaveBeenCalledWith('match_join_complete', { matchId: 'match-1', sportType: '풋살' });
  });

  it('fires match_leave after a successful withdraw', async () => {
    useV1MatchMock.mockReturnValue({
      data: {
        ...baseMatch,
        viewerState: 'requested',
        viewer: { state: 'requested', applicationId: 'app-1', participantId: null, canApply: false },
      },
      isError: false,
    });
    useV1MatchApplicationEligibilityMock.mockReturnValue({ data: { eligible: false, applicationId: 'app-1' } });

    render(<MatchDetailPageClient matchId="match-1" />);

    fireEvent.click(screen.getByRole('button', { name: '참가 신청' }));

    await waitFor(() => {
      expect(withdrawMatchMutateAsync).toHaveBeenCalledWith({ reason: 'applicant_withdrawn_from_v1_web' });
    });
    expect(trackEvent).toHaveBeenCalledWith('match_leave', { matchId: 'match-1' });
  });
});

describe('MatchDetailPageClient — 주소·설명 목업 폴백 (2026-08-27 감사 M-A-personal-match-state)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useV1MatchApplicationEligibilityMock.mockReturnValue({ data: { eligible: true, applicationId: null } });
  });

  it('상세 주소·설명 없이 만든 매치는 목업 문자열("서울 양천구 안양천로 939" 등)로 채워지지 않는다', () => {
    useV1MatchMock.mockReturnValue({
      data: {
        ...baseMatch,
        place: { name: '성수 실내체육관', addressText: null },
        description: null,
        descriptionPreview: null,
        viewerState: 'none',
      },
      isError: false,
    });

    render(<MatchDetailPageClient matchId="match-1" />);

    expect(screen.getByTestId('address')).toHaveTextContent('');
    expect(screen.getByTestId('description')).toHaveTextContent('');
  });

  it('상세 주소·설명이 있는 매치는 실제 API 값을 그대로 보여준다', () => {
    useV1MatchMock.mockReturnValue({
      data: {
        ...baseMatch,
        place: { name: '성수 실내체육관', addressText: '서울 성동구 아차산로 17' },
        description: '초보 환영 농구 매치예요.',
        viewerState: 'none',
      },
      isError: false,
    });

    render(<MatchDetailPageClient matchId="match-1" />);

    expect(screen.getByTestId('address')).toHaveTextContent('서울 성동구 아차산로 17');
    expect(screen.getByTestId('description')).toHaveTextContent('초보 환영 농구 매치예요.');
  });
});

// 매치 상세에서 후기로 가는 유일한 진입점. 이게 없던 동안 완료 알림(match_completed)이
// 매치 상세로 보내는데 거기서 더 갈 곳이 없어 후기를 쓸 수 없는 막다른 길이었다.
describe('MatchDetailPageClient — 후기 진입점', () => {
  function mockMatch(viewerState: string, status: string) {
    useV1MatchMock.mockReturnValue({
      data: { ...baseMatch, status, displayState: status, viewer: { state: viewerState } },
      isError: false,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    useV1MatchApplicationEligibilityMock.mockReturnValue({ data: undefined, isSuccess: false });
  });

  it('완료된 매치의 참가자에게 후기 진입점이 보인다', () => {
    mockMatch('approved', 'completed');

    render(<MatchDetailPageClient matchId="match-1" />);

    expect(screen.getByRole('link', { name: '후기 남기기' })).toHaveAttribute(
      'href',
      '/my/reviews/match/match-1',
    );
  });

  it('호스트에게도 보인다', () => {
    mockMatch('host', 'completed');

    render(<MatchDetailPageClient matchId="match-1" />);

    expect(screen.getByRole('link', { name: '후기 남기기' })).toBeInTheDocument();
  });

  it('아직 안 끝난 매치에는 보이지 않는다', () => {
    mockMatch('approved', 'open');

    render(<MatchDetailPageClient matchId="match-1" />);

    expect(screen.queryByRole('link', { name: '후기 남기기' })).not.toBeInTheDocument();
  });

  it('참가하지 않은 사용자에게는 보이지 않는다', () => {
    mockMatch('none', 'completed');

    render(<MatchDetailPageClient matchId="match-1" />);

    expect(screen.queryByRole('link', { name: '후기 남기기' })).not.toBeInTheDocument();
  });
});

// 20건 컷오프 페이지네이션 결함 회귀 방지(2026-08-27 감사) — 서버 커서 응답의 두 번째
// 페이지가 "더 보기" 클릭 후 첫 페이지에 이어 붙는지, 중복 없이 누적되는지 확인한다.
describe('MatchListPageClient — 커서 페이지네이션 누적', () => {
  function page(items: Array<{ id: string; title: string }>, nextCursor: string | null) {
    return {
      data: {
        items: items.map((item) => ({
          id: item.id,
          matchId: item.id,
          title: item.title,
          sportName: '풋살',
          startsAt: '2026-09-01T10:00:00.000Z',
          status: 'open' as const,
        })),
        nextCursor,
        pageInfo: { nextCursor, hasNext: nextCursor !== null },
      },
      isError: false,
      isFetching: false,
      isLoading: false,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    useV1MatchesMock.mockImplementation((filters?: { cursor?: string }, options?: { enabled?: boolean }) => {
      // countMatches/filteredMatches는 필터가 없을 때 enabled:false로 호출된다 — 목록에
      // 쓰이는 allMatches 호출(옵션 없음)만 페이지 데이터를 흉내낸다.
      if (options && options.enabled === false) {
        return { data: undefined, isError: false, isFetching: false, isLoading: false };
      }
      if (!filters?.cursor) {
        return page([{ id: 'm1', title: '매치 1' }], 'cursor-page-2');
      }
      return page([{ id: 'm2', title: '매치 2' }], null);
    });
  });

  it('첫 페이지는 hasNext=true로 "더 보기"를 보여주고, 클릭하면 두 번째 페이지가 이어 붙는다', () => {
    render(<MatchListPageClient />);

    expect(screen.getByTestId('match-count')).toHaveTextContent('1');
    const loadMore = screen.getByRole('button', { name: '더 보기' });

    fireEvent.click(loadMore);

    // cursor state 갱신 → 재렌더 → useV1Matches가 cursor-page-2로 다시 호출되어 2페이지를
    // 받고, 누적 로직이 1페이지 위에 이어 붙인다.
    expect(screen.getByTestId('match-count')).toHaveTextContent('2');
    // 마지막 페이지(nextCursor: null)라 "더 보기"가 사라진다.
    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
  });
});

describe('MatchDetailPageClient — 로딩 중 목업 노출 방지', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useV1MatchApplicationEligibilityMock.mockReturnValue({ data: { eligible: true, applicationId: null } });
  });

  it('매치를 아직 못 받았으면 목업 상세 대신 스켈레톤을 렌더한다', () => {
    useV1MatchMock.mockReturnValue({ data: undefined, isError: false });

    render(<MatchDetailPageClient matchId="match-1" />);

    expect(screen.getByTestId('detail-skeleton')).toBeTruthy();
    // 목업 매치(matches.view-model.ts)의 어떤 필드도 화면에 닿지 않아야 한다.
    expect(screen.queryByTestId('address')).toBeNull();
    expect(screen.queryByTestId('participants')).toBeNull();
  });

  it('규칙을 안 준 매치에 목업 규칙("풋살화 착용" 등)을 붙이지 않는다', () => {
    useV1MatchMock.mockReturnValue({
      data: { ...baseMatch, rulesText: null, viewerState: 'none' },
      isError: false,
    });

    render(<MatchDetailPageClient matchId="match-1" />);

    expect(screen.getByTestId('rules').textContent).toBe('');
  });

  it('참가자·호스트를 안 준 매치의 참가자 이름이 목업 이름("김정민")으로 채워지지 않는다', () => {
    useV1MatchMock.mockReturnValue({
      data: { ...baseMatch, participantsPreview: [], host: null, viewerState: 'none' },
      isError: false,
    });

    render(<MatchDetailPageClient matchId="match-1" />);

    expect(screen.getByTestId('participants').textContent).toBe('호스트');
  });
});

describe('MatchDetailPageClient — 목록 캐시 승계(placeholder) 중 행동 잠금', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useV1MatchApplicationEligibilityMock.mockReturnValue({ data: { eligible: true, applicationId: null } });
  });

  it('목록에서 승계한 데이터로 그리는 동안 제목은 보여주되 참가 신청은 잠근다', () => {
    // 목록 응답에는 뷰어 상태가 없다 — 그 상태로 CTA를 그리면 이미 신청한 매치에도
    // "참가 신청"이 떠서 사용자를 잘못 이끈다.
    useV1MatchMock.mockReturnValue({
      data: { ...baseMatch, viewerState: undefined, viewer: undefined },
      isError: false,
      isPlaceholderData: true,
    });

    render(<MatchDetailPageClient matchId="match-1" />);

    expect(screen.getByTestId('title').textContent).toBe('풋살 매치');
    expect(screen.getByTestId('apply-label').textContent).toBe('불러오는 중');
    expect(screen.getByTestId('status-label').textContent).toBe('');
    expect(screen.queryByRole('button', { name: '참가 신청' })).toBeNull();
  });

  it('실제 응답이 도착하면(placeholder 해제) 참가 신청이 다시 열린다', () => {
    useV1MatchMock.mockReturnValue({
      data: { ...baseMatch, viewerState: 'none' },
      isError: false,
      isPlaceholderData: false,
    });

    render(<MatchDetailPageClient matchId="match-1" />);

    expect(screen.getByRole('button', { name: '참가 신청' })).toBeTruthy();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/analytics';
import type { MatchDetailViewModel } from './matches.types';
import { MatchDetailPageClient } from './matches-client';

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

const {
  applyMatchMutateAsync,
  withdrawMatchMutateAsync,
  routerPush,
  useV1MatchMock,
  useV1MatchApplicationEligibilityMock,
} = vi.hoisted(() => ({
  applyMatchMutateAsync: vi.fn(),
  withdrawMatchMutateAsync: vi.fn(),
  routerPush: vi.fn(),
  useV1MatchMock: vi.fn(),
  useV1MatchApplicationEligibilityMock: vi.fn(),
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
}));

vi.mock('./matches-page', () => ({
  MatchDetailPageView: ({ model }: { model: MatchDetailViewModel }) => (
    <div>
      {model.onApply && <button onClick={model.onApply}>참가 신청</button>}
      {model.reviewAction && <a href={model.reviewAction.href}>{model.reviewAction.label}</a>}
      <div data-testid="address">{model.match.address}</div>
      <div data-testid="description">{model.match.description}</div>
    </div>
  ),
  MatchListPageView: () => null,
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

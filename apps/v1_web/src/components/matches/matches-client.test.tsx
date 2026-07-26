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
    </div>
  ),
  MatchListPageView: () => null,
  MatchStatePageView: () => null,
}));

const baseMatch = {
  id: 'match-1',
  matchId: 'match-1',
  title: '풋살 매치',
  sportName: '풋살',
  sport: { sportId: 'sport-futsal', name: '풋살' },
  placeName: '서울 풋살장',
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

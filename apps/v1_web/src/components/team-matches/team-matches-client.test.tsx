import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/analytics';
import type { TeamMatchDetailViewModel } from './team-matches.types';
import { TeamMatchDetailPageClient } from './team-matches-client';

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

const {
  applyTeamMatchMutateAsync,
  routerPush,
  useV1TeamMatchMock,
  useV1TeamMatchEligibilityMock,
} = vi.hoisted(() => ({
  applyTeamMatchMutateAsync: vi.fn(),
  routerPush: vi.fn(),
  useV1TeamMatchMock: vi.fn(),
  useV1TeamMatchEligibilityMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1TeamMatch: useV1TeamMatchMock,
  useV1TeamMatchEligibility: useV1TeamMatchEligibilityMock,
  useV1TeamMatchApplications: () => ({ data: undefined, isPending: false }),
  useV1ApplyTeamMatch: () => ({ mutateAsync: applyTeamMatchMutateAsync, isPending: false }),
  useV1ApproveTeamMatchApplication: () => ({ mutate: vi.fn(), isPending: false }),
  useV1RejectTeamMatchApplication: () => ({ mutate: vi.fn(), isPending: false }),
  useV1CloseTeamMatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1ReopenTeamMatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1CompleteTeamMatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1CancelTeamMatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1ResolveChatRoom: () => ({ mutate: vi.fn(), isPending: false }),
  useV1WithdrawTeamMatchApplication: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('./team-matches-page', () => ({
  TeamMatchDetailPageView: ({ model }: { model: TeamMatchDetailViewModel }) => (
    <div>
      {model.onApply && <button onClick={model.onApply}>상대팀 신청</button>}
    </div>
  ),
  TeamMatchListPageView: () => null,
  TeamMatchStatePageView: () => null,
}));

describe('TeamMatchDetailPageClient — GA events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useV1TeamMatchMock.mockReturnValue({
      data: {
        id: 'team-match-1',
        teamMatchId: 'team-match-1',
        title: '풋살 팀매치',
        sportName: '풋살',
        sport: { sportId: 'sport-futsal', name: '풋살' },
        placeName: '서울 풋살장',
        startsAt: '2026-08-01T10:00:00.000Z',
        capacityText: '1/2',
        status: 'open',
        viewerState: 'none',
        hostTeam: { teamId: 'team-host', name: '호스트 팀' },
      },
      isError: false,
    });
    useV1TeamMatchEligibilityMock.mockReturnValue({
      data: {
        teamMatchId: 'team-match-1',
        requiresApproval: true,
        requiresPayment: false,
        teams: [
          { teamId: 'team-mine', name: '내 팀', role: 'owner', eligible: true, reasonCode: '', applicationId: null },
        ],
      },
      isSuccess: true,
    });
    applyTeamMatchMutateAsync.mockResolvedValue({ applicationId: 'app-1' });
  });

  it('fires team_match_apply_complete after a successful opponent-team application', async () => {
    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    fireEvent.click(screen.getByRole('button', { name: '상대팀 신청' }));

    await waitFor(() => {
      expect(applyTeamMatchMutateAsync).toHaveBeenCalledWith({ applicantTeamId: 'team-mine', message: null });
    });
    expect(trackEvent).toHaveBeenCalledWith('team_match_apply_complete', { teamMatchId: 'team-match-1' });
  });
});

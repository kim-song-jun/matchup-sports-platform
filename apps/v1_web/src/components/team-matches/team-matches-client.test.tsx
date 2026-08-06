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
      <span data-testid="team-match-image">{model.match.imageUrl}</span>
      <span data-testid="team-match-mode">{model.mode}</span>
      <span data-testid="team-match-status-label">{model.statusLabel}</span>
      <span data-testid="team-match-apply-label">{model.applyLabel}</span>
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
        imageUrl: '/uploads/team-match-cover.webp',
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

  it('maps the API image URL into the detail view model', () => {
    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    expect(screen.getByTestId('team-match-image')).toHaveTextContent('/uploads/team-match-cover.webp');
  });

  it('does not present an unrelated viewer as approved after another team is matched', () => {
    useV1TeamMatchMock.mockReturnValue({
      data: {
        id: 'team-match-1',
        teamMatchId: 'team-match-1',
        title: '풋살 팀매치',
        sportName: '풋살',
        placeName: '서울 풋살장',
        startsAt: '2026-08-10T10:00:00.000Z',
        status: 'matched',
        viewerState: 'rejected',
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
          { teamId: 'team-mine', name: '내 팀', role: 'owner', eligible: false, reasonCode: 'MATCHED_ALREADY', applicationId: 'app-rejected' },
        ],
      },
      isSuccess: true,
    });

    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    expect(screen.getByTestId('team-match-mode')).toHaveTextContent('default');
    expect(screen.getByTestId('team-match-status-label')).toHaveTextContent('상대팀 확정');
    expect(screen.getByTestId('team-match-apply-label')).toHaveTextContent('신청 불가');
    expect(screen.queryByText('승인 완료')).not.toBeInTheDocument();
  });
});

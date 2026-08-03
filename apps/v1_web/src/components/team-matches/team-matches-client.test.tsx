import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/analytics';
import type { V1TeamMatchViewerState } from '@/types/api';
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
  // 라인업 CTA(Task 15) 계산용 — 이 스위트는 GA 이벤트만 검증하므로 소속 팀 없음으로 고정.
  useV1MyTeams: () => ({ data: undefined, isPending: false }),
  useV1ApplyTeamMatch: () => ({ mutateAsync: applyTeamMatchMutateAsync, isPending: false }),
  useV1ApproveTeamMatchApplication: () => ({ mutate: vi.fn(), isPending: false }),
  useV1RejectTeamMatchApplication: () => ({ mutate: vi.fn(), isPending: false }),
  useV1CloseTeamMatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1ReopenTeamMatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1CancelTeamMatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1ResolveChatRoom: () => ({ mutate: vi.fn(), isPending: false }),
  useV1WithdrawTeamMatchApplication: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('./team-matches-page', () => ({
  TeamMatchDetailPageView: ({ model }: { model: TeamMatchDetailViewModel }) => (
    <div>
      {model.onApply && <button onClick={model.onApply}>상대팀 신청</button>}
      {model.resultAction && <a href={model.resultAction.href}>{model.resultAction.label}</a>}
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

// Task 17: buildResultAction() is the sole routing gate between the host's
// result-entry screen (/team-matches/:id/result) and the opponent's
// approval screen (/team-matches/:id/result/approval). Only the destination
// screens had coverage before this — nothing failed if the gate itself was
// reverted (e.g. both roles routed to /result, or an unrelated viewer got a
// CTA at all). These tests pin the three-way split directly against the
// rendered CTA so a regression in buildResultAction's role/viewerState
// branching trips a real assertion.
describe('TeamMatchDetailPageClient — result action routing gate (Task 17)', () => {
  function mockMatchedTeamMatch(viewer: { state: V1TeamMatchViewerState; manageableHostTeam?: boolean }) {
    useV1TeamMatchMock.mockReturnValue({
      data: {
        id: 'team-match-1',
        teamMatchId: 'team-match-1',
        title: '풋살 팀매치',
        sportName: '풋살',
        sport: { sportId: 'sport-futsal', name: '풋살' },
        placeName: '서울 풋살장',
        startsAt: '2026-08-01T10:00:00.000Z',
        capacityText: '2/2',
        displayState: 'matched',
        status: 'matched',
        viewer: { state: viewer.state, manageableHostTeam: viewer.manageableHostTeam ?? false },
        hostTeam: { teamId: 'team-host', name: '호스트 팀' },
      },
      isError: false,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    applyTeamMatchMutateAsync.mockResolvedValue({ applicationId: 'app-1' });
    useV1TeamMatchEligibilityMock.mockReturnValue({ data: undefined, isSuccess: false });
  });

  it('shows the host the result-entry CTA routed to /result', () => {
    mockMatchedTeamMatch({ state: 'host_team', manageableHostTeam: true });

    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    const link = screen.getByRole('link', { name: '경기 결과 입력' });
    expect(link).toHaveAttribute('href', '/team-matches/team-match-1/result');
    expect(screen.queryByText('경기 결과 대기')).not.toBeInTheDocument();
    expect(screen.queryByText('경기 결과 확인/승인')).not.toBeInTheDocument();
  });

  it('shows the approved opponent the approval CTA routed to /result/approval, never the entry CTA', () => {
    mockMatchedTeamMatch({ state: 'approved', manageableHostTeam: false });

    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    const link = screen.getByRole('link', { name: '경기 결과 대기' });
    expect(link).toHaveAttribute('href', '/team-matches/team-match-1/result/approval');
    expect(screen.queryByRole('link', { name: '경기 결과 입력' })).not.toBeInTheDocument();
  });

  it('shows an unrelated viewer neither the entry nor the approval CTA', () => {
    mockMatchedTeamMatch({ state: 'none', manageableHostTeam: false });

    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    expect(screen.queryByRole('link', { name: '경기 결과 입력' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '경기 결과 대기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '경기 결과 확인/승인' })).not.toBeInTheDocument();
  });
});

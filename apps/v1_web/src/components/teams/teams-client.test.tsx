import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/analytics';
import { TeamDetailPageClient, TeamMembersPageClient } from './teams-client';

const teamApiMocks = vi.hoisted(() => ({
  useV1TeamDetail: vi.fn(),
  useV1TeamJoinEligibility: vi.fn(),
  useV1CreateTeamJoinApplication: vi.fn(),
  useV1WithdrawTeamJoinApplication: vi.fn(),
  useV1ResolveChatRoom: vi.fn(),
  useV1TeamMatches: vi.fn(),
  useV1TeamMembers: vi.fn(),
  useV1MyTeams: vi.fn(() => ({ data: undefined })),
  useV1TeamJoinApplications: vi.fn(),
  useV1ChangeTeamMembershipRole: vi.fn(),
  useV1RemoveTeamMembership: vi.fn(),
  useV1ApproveTeamJoinApplication: vi.fn(),
  useV1RejectTeamJoinApplication: vi.fn(),
  useV1SendTeamInvitation: vi.fn(),
  useV1CancelTeamInvitation: vi.fn(),
  useV1TeamInvitations: vi.fn(),
  useV1LeaveTeam: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...teamApiMocks,
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/teams/team-1',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('TeamDetailPageClient GA events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tracks team_apply_complete when a non-member successfully applies to join', async () => {
    const joinMutateAsync = vi.fn().mockResolvedValue({ status: 'requested' });

    teamApiMocks.useV1TeamDetail.mockReturnValue({
      data: {
        teamId: 'team-1',
        name: '성수 풋살 크루',
        status: 'active',
        visibility: 'public',
        sport: { sportId: 'sport-futsal', name: '풋살' },
        region: { regionId: 'region-seoul', name: '서울', parentName: null },
        joinPolicy: 'approval_required',
        membersVisibilityEnabled: true,
        canViewMembers: true,
        profile: {
          logoUrl: null,
          coverImageUrl: null,
          introduction: '',
          activityAreaText: null,
          activityDays: [],
          activityFrequency: null,
          activityTimeSlots: [],
          activityTypes: [],
          activityMemo: null,
          activitySummary: null,
          skillLevelText: null,
          genderRule: '성별 무관',
          joinPolicy: 'approval_required',
          memberGoalCount: 20,
        },
        owner: { userId: 'user-owner', displayName: '김도윤', profileImageUrl: null },
        membersPreview: [],
        memberCount: 7,
        managerCount: 1,
        trust: { trustState: 'none', score: null },
        viewer: {
          role: 'none',
          membershipId: null,
          joinState: 'none',
          canRequestJoin: true,
          disabledReason: null,
          manageRoute: null,
        },
      },
      isError: false,
    });
    teamApiMocks.useV1TeamJoinEligibility.mockReturnValue({
      data: { eligible: true, joinState: 'none', message: '' },
    });
    teamApiMocks.useV1CreateTeamJoinApplication.mockReturnValue({
      mutateAsync: joinMutateAsync,
      isPending: false,
    });
    teamApiMocks.useV1WithdrawTeamJoinApplication.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    teamApiMocks.useV1ResolveChatRoom.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    });
    teamApiMocks.useV1TeamMatches.mockReturnValue({ data: { items: [] }, isLoading: false });

    render(<TeamDetailPageClient teamId="team-1" />);

    const [applyButton] = await screen.findAllByRole('button', { name: '가입 신청' });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(joinMutateAsync).toHaveBeenCalledWith({ message: null });
      expect(trackEvent).toHaveBeenCalledWith('team_apply_complete', { teamId: 'team-1' });
    });
  });
});

describe('TeamMembersPageClient GA events', () => {
  const approveMutate = vi.fn();
  const rejectMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    teamApiMocks.useV1TeamDetail.mockReturnValue({
      data: {
        name: '성수 풋살 크루',
        canViewMembers: true,
        viewer: { role: 'owner', membershipId: 'membership-owner' },
      },
      isError: false,
    });
    teamApiMocks.useV1TeamMembers.mockReturnValue({
      data: {
        items: [
          {
            membershipId: 'membership-owner',
            userId: 'user-owner',
            displayName: '김도윤',
            role: 'owner',
            status: 'active',
            joinedAt: '2026-01-01T00:00:00.000Z',
            canChangeRole: false,
            canRemove: false,
          },
        ],
        summary: { ownerCount: 1, managerCount: 0, memberCount: 1 },
        viewerRole: 'owner',
        pageInfo: { nextCursor: null, hasNext: false },
      },
      isError: false,
    });
    teamApiMocks.useV1TeamJoinApplications.mockReturnValue({
      data: {
        items: [
          {
            applicationId: 'application-1',
            status: 'requested',
            message: null,
            createdAt: '2026-07-01T00:00:00.000Z',
            applicant: { userId: 'user-applicant', displayName: '이서준' },
          },
        ],
      },
    });
    teamApiMocks.useV1TeamInvitations.mockReturnValue({ data: { items: [] }, isLoading: false });
    teamApiMocks.useV1ChangeTeamMembershipRole.mockReturnValue({ isPending: false, mutate: vi.fn() });
    teamApiMocks.useV1RemoveTeamMembership.mockReturnValue({ isPending: false, mutate: vi.fn() });
    teamApiMocks.useV1ApproveTeamJoinApplication.mockReturnValue({ isPending: false, mutate: approveMutate });
    teamApiMocks.useV1RejectTeamJoinApplication.mockReturnValue({ isPending: false, mutate: rejectMutate });
    teamApiMocks.useV1SendTeamInvitation.mockReturnValue({ isPending: false, mutate: vi.fn() });
    teamApiMocks.useV1CancelTeamInvitation.mockReturnValue({ isPending: false, mutate: vi.fn() });
    teamApiMocks.useV1LeaveTeam.mockReturnValue({ isPending: false, mutate: vi.fn() });
  });

  it('tracks team_application_accept once the approval mutation succeeds', async () => {
    approveMutate.mockImplementation((_vars, options) => {
      options?.onSuccess?.();
    });

    render(<TeamMembersPageClient teamId="team-1" />);

    fireEvent.click(screen.getByRole('button', { name: /^가입 신청/ }));
    fireEvent.click(screen.getByRole('button', { name: '관리' }));
    fireEvent.click(screen.getByRole('button', { name: '승인' }));
    const approveDialog = screen.getByRole('dialog', { name: '가입 신청 승인' });
    fireEvent.click(within(approveDialog).getByRole('button', { name: '승인' }));

    await waitFor(() => {
      expect(approveMutate).toHaveBeenCalledWith(
        { applicationId: 'application-1', note: null },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
      expect(trackEvent).toHaveBeenCalledWith('team_application_accept', { teamId: 'team-1' });
    });
  });

  it('tracks team_application_reject once the rejection mutation succeeds', async () => {
    rejectMutate.mockImplementation((_vars, options) => {
      options?.onSuccess?.();
    });

    render(<TeamMembersPageClient teamId="team-1" />);

    fireEvent.click(screen.getByRole('button', { name: /^가입 신청/ }));
    fireEvent.click(screen.getByRole('button', { name: '관리' }));
    fireEvent.click(screen.getByRole('button', { name: '거절' }));
    const rejectDialog = screen.getByRole('dialog', { name: '가입 신청 거절' });
    fireEvent.click(within(rejectDialog).getByRole('button', { name: '거절' }));

    await waitFor(() => {
      expect(rejectMutate).toHaveBeenCalledWith(
        { applicationId: 'application-1', reason: 'rejected_from_v1_web_member_page' },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
      expect(trackEvent).toHaveBeenCalledWith('team_application_reject', { teamId: 'team-1' });
    });
  });
});

describe('TeamDetailPageClient — 주요 멤버 미리보기', () => {
  function baseTeamDetail(overrides: Record<string, unknown> = {}) {
    return {
      teamId: 'team-1',
      name: '성수 풋살 크루',
      status: 'active',
      visibility: 'public',
      sport: { sportId: 'sport-futsal', name: '풋살' },
      region: { regionId: 'region-seoul', name: '서울', parentName: null },
      joinPolicy: 'approval_required',
      membersVisibilityEnabled: true,
      canViewMembers: true,
      profile: {
        logoUrl: null,
        coverImageUrl: null,
        introduction: '',
        activityAreaText: null,
        activityDays: [],
        activityFrequency: null,
        activityTimeSlots: [],
        activityTypes: [],
        activityMemo: null,
        activitySummary: null,
        skillLevelText: null,
        genderRule: '성별 무관',
        joinPolicy: 'approval_required',
        memberGoalCount: 20,
      },
      owner: { userId: 'user-owner', displayName: '김도윤', profileImageUrl: null },
      membersPreview: [],
      memberCount: 0,
      managerCount: 1,
      trust: { trustState: 'none', score: null },
      viewer: {
        role: 'none',
        membershipId: null,
        joinState: 'none',
        canRequestJoin: true,
        disabledReason: null,
        manageRoute: null,
      },
      ...overrides,
    };
  }

  function member(index: number) {
    return { membershipId: `mem-${index}`, userId: `user-${index}`, displayName: `멤버${index}`, role: 'member' };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    teamApiMocks.useV1TeamJoinEligibility.mockReturnValue({ data: { eligible: false, joinState: 'none', message: '가입 불가' } });
    teamApiMocks.useV1CreateTeamJoinApplication.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    teamApiMocks.useV1WithdrawTeamJoinApplication.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    teamApiMocks.useV1ResolveChatRoom.mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
    teamApiMocks.useV1TeamMatches.mockReturnValue({ data: { items: [] }, isLoading: false });
  });

  it('총원이 미리보기(8명)보다 많으면 정확한 남은 인원 수로 "+ n명 더보기" CTA가 뜨고 전체 멤버 목록으로 연결된다', () => {
    teamApiMocks.useV1TeamDetail.mockReturnValue({
      data: baseTeamDetail({
        memberCount: 12,
        membersPreview: Array.from({ length: 8 }, (_, i) => member(i)),
      }),
      isError: false,
    });

    render(<TeamDetailPageClient teamId="team-1" />);

    // 총원 12 - 미리보기 8 = 4명이 남아야 한다.
    const moreLinks = screen.getAllByRole('link', { name: /\+ 4명 더보기/ });
    expect(moreLinks.length).toBeGreaterThanOrEqual(2); // 데스크톱·모바일 레이아웃 둘 다 렌더
    moreLinks.forEach((link) => expect(link).toHaveAttribute('href', '/teams/team-1/members'));
  });

  it('총원이 미리보기 인원 이하면 더보기 CTA가 없다', () => {
    teamApiMocks.useV1TeamDetail.mockReturnValue({
      data: baseTeamDetail({
        memberCount: 6,
        membersPreview: Array.from({ length: 6 }, (_, i) => member(i)),
      }),
      isError: false,
    });

    render(<TeamDetailPageClient teamId="team-1" />);

    expect(screen.queryByText(/더보기/)).not.toBeInTheDocument();
  });

  it('미리보기 멤버를 누르면 해당 멤버의 공개 프로필(/users/{userId})로 이동한다', () => {
    teamApiMocks.useV1TeamDetail.mockReturnValue({
      data: baseTeamDetail({
        memberCount: 2,
        membersPreview: [
          { membershipId: 'mem-owner', userId: 'user-owner-42', displayName: '박서준', role: 'owner' },
          member(1),
        ],
      }),
      isError: false,
    });

    render(<TeamDetailPageClient teamId="team-1" />);

    const memberLinks = screen.getAllByRole('link', { name: /박서준/ });
    expect(memberLinks.length).toBeGreaterThanOrEqual(2);
    memberLinks.forEach((link) => expect(link).toHaveAttribute('href', '/users/user-owner-42'));
  });

  it('멤버 목록이 비공개인 팀에서는 미리보기도 더보기 CTA도 노출되지 않는다', () => {
    teamApiMocks.useV1TeamDetail.mockReturnValue({
      data: baseTeamDetail({
        membersVisibilityEnabled: false,
        canViewMembers: false,
        memberCount: 12,
        membersPreview: [],
      }),
      isError: false,
    });

    render(<TeamDetailPageClient teamId="team-1" />);

    expect(screen.queryByText(/더보기/)).not.toBeInTheDocument();
    expect(screen.getAllByText('멤버 목록은 비공개예요. 팀에 속한 멤버만 볼 수 있어요.').length).toBeGreaterThan(0);
  });
});

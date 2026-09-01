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
  // 반환 타입을 vi.fn()의 첫 구현으로 좁히지 않는다 — 좁히면 아래 테스트가 items를 담은
  // 값을 돌려줄 때 tsc가 undefined 할당으로 잡는다(다른 훅 목들과 같은 형태로 맞춘다).
  useV1LeagueMatches: vi.fn(),
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

// useV1LeagueMatches 는 팀 상세가 항상 호출한다("내 리그" 섹션). describe 마다 채우면
// 하나만 빠져도 그 블록 전체가 "myLeaguesQuery 가 undefined" 로 깨지므로 파일 레벨에서
// 한 번만 기본값을 준다. 값이 필요한 테스트는 각자 mockReturnValue 로 덮어쓴다.
beforeEach(() => {
  teamApiMocks.useV1LeagueMatches.mockReturnValue({ data: undefined, isLoading: false });
});

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

/**
 * "내 리그" (R4) — GET /league-matches?teamId= 로 참가 테이블을 직접 읽는다.
 *
 * 2026-08-21 이전에는 GET /team-matches?teamId= 응답의 league 필드에서 distinct 로
 * 역산했는데, 그러면 **대진이 생기기 전에는 아무것도 뜨지 않았다** — 운영자가 팀을 리그에
 * 넣은 시점부터 대진을 만들 때까지 팀은 자기 참가 사실을 알 수 없었다(재감사에서 alpha 의
 * draft 티어 리그 참가팀이 team-matches 0건인 것으로 확인). D-2 가 "참가 인지는 노출로
 * 푼다"고 확정한 이상 이 경로는 참가 테이블을 봐야 한다.
 */
describe('TeamDetailPageClient — 내 리그', () => {
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

  beforeEach(() => {
    vi.clearAllMocks();
    teamApiMocks.useV1TeamJoinEligibility.mockReturnValue({ data: { eligible: false, joinState: 'none', message: '가입 불가' } });
    teamApiMocks.useV1CreateTeamJoinApplication.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    teamApiMocks.useV1WithdrawTeamJoinApplication.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    teamApiMocks.useV1ResolveChatRoom.mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  });

  it('대진이 하나도 없는 리그도 "내 리그"에 보여준다', () => {
    // 이게 이 변경의 핵심이다 — 예전 방식(팀매치 역산)에서는 이 케이스가 통째로 비었다.
    teamApiMocks.useV1TeamDetail.mockReturnValue({ data: baseTeamDetail(), isError: false });
    teamApiMocks.useV1TeamMatches.mockReturnValue({ data: { items: [] }, isLoading: false });
    teamApiMocks.useV1LeagueMatches.mockReturnValue({
      data: {
        items: [{ leagueId: 'lg-1', title: '가을 리그', state: 'draft' }],
        pageInfo: { nextCursor: null, hasNext: false },
      },
      isLoading: false,
    });

    render(<TeamDetailPageClient teamId="team-1" />);

    // 데스크톱·모바일 레이아웃당 1개씩 = 2개.
    const leagueLinks = screen.getAllByRole('link', { name: /가을 리그/ });
    expect(leagueLinks).toHaveLength(2);
    leagueLinks.forEach((link) => expect(link).toHaveAttribute('href', '/league-matches/lg-1'));
  });

  it('참가 중인 리그가 없으면 "내 리그" 섹션 자체가 없다', () => {
    teamApiMocks.useV1TeamDetail.mockReturnValue({ data: baseTeamDetail(), isError: false });
    teamApiMocks.useV1TeamMatches.mockReturnValue({ data: { items: [] }, isLoading: false });
    teamApiMocks.useV1LeagueMatches.mockReturnValue({
      data: { items: [], pageInfo: { nextCursor: null, hasNext: false } },
      isLoading: false,
    });

    render(<TeamDetailPageClient teamId="team-1" />);

    expect(screen.queryByText('내 리그')).not.toBeInTheDocument();
  });

  it('리그 목록을 teamId 필터로 조회한다 (팀매치 역산이 아니라)', () => {
    teamApiMocks.useV1TeamDetail.mockReturnValue({ data: baseTeamDetail(), isError: false });
    teamApiMocks.useV1TeamMatches.mockReturnValue({ data: { items: [] }, isLoading: false });
    teamApiMocks.useV1LeagueMatches.mockReturnValue({
      data: { items: [], pageInfo: { nextCursor: null, hasNext: false } },
      isLoading: false,
    });

    render(<TeamDetailPageClient teamId="team-1" />);

    expect(teamApiMocks.useV1LeagueMatches).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'team-1' }),
    );
  });
});

describe('TeamDetailPageClient — 로딩 중 목업 노출 방지', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    teamApiMocks.useV1TeamJoinEligibility.mockReturnValue({ data: { eligible: false, joinState: 'none', message: '가입 불가' } });
    teamApiMocks.useV1CreateTeamJoinApplication.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    teamApiMocks.useV1WithdrawTeamJoinApplication.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    teamApiMocks.useV1ResolveChatRoom.mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
    teamApiMocks.useV1TeamMatches.mockReturnValue({ data: { items: [] }, isLoading: false });
  });

  it('팀을 아직 못 받았으면 목업 팀("성수 러너스 FC")을 실제 팀처럼 보여주지 않는다', () => {
    teamApiMocks.useV1TeamDetail.mockReturnValue({ data: undefined, isError: false });

    render(<TeamDetailPageClient teamId="team-1" />);

    // 목업 팀(teams.view-model.ts)의 이름·지역·태그 어느 것도 화면에 닿으면 안 된다.
    expect(screen.queryByText('성수 러너스 FC')).not.toBeInTheDocument();
    expect(screen.queryByText('서울 성동')).not.toBeInTheDocument();
  });
});

describe('TeamDetailPageClient — 서버 seed 로 그리는 동안 뷰어 의존 UI 잠금', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    teamApiMocks.useV1TeamJoinEligibility.mockReturnValue({ data: undefined });
    teamApiMocks.useV1CreateTeamJoinApplication.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    teamApiMocks.useV1WithdrawTeamJoinApplication.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    teamApiMocks.useV1ResolveChatRoom.mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
    teamApiMocks.useV1TeamMatches.mockReturnValue({ data: { items: [] }, isLoading: false });
  });

  function seededDetail() {
    return {
      teamId: 'team-1',
      name: '성수 풋살 크루',
      status: 'active',
      visibility: 'public',
      sport: { sportId: 'sport-futsal', name: '풋살' },
      region: { regionId: 'region-seoul', name: '서울', parentName: null },
      regionName: '서울 성동구',
      joinPolicy: 'approval_required',
      membersVisibilityEnabled: true,
      canViewMembers: true,
      memberCount: 4,
      managerCount: 1,
      profile: { logoUrl: null, coverImageUrl: null, introduction: '', activityAreaText: null, activityDays: [], activityFrequency: null, activityTimeSlots: [], ageRange: null, genderRule: null, memberGoalCount: null },
      membersPreview: [],
      owner: null,
      trust: null,
      trustState: null,
      // 비인증 응답이 실제로 주는 모양 — 로그인한 owner 가 이 값을 그대로 보면 안 된다.
      viewer: { role: 'none', membershipId: null, joinState: 'none', canRequestJoin: false, disabledReason: 'LOGIN_REQUIRED', manageRoute: null },
    };
  }

  it('seed 로 그리는 동안 팀 이름은 보여주되 가입 CTA 는 잠근다', () => {
    teamApiMocks.useV1TeamDetail.mockReturnValue({
      data: seededDetail(),
      isError: false,
      isPlaceholderData: true,
    });

    render(<TeamDetailPageClient teamId="team-1" />);

    // 팀 정보는 즉시 보인다.
    expect(screen.getAllByText('성수 풋살 크루').length).toBeGreaterThan(0);
    // 뷰어 판정은 아직 남의 것(비로그인)이므로 행동은 막고, 막힌 이유를 로딩이라고 말한다.
    const cta = screen.getAllByRole('button', { name: '불러오는 중' })[0];
    expect(cta).toBeTruthy();
    expect(cta).toBeDisabled();
    // '처리 중'(= 내 신청 처리 중)으로 새면 로딩을 잘못 설명한다.
    expect(screen.queryByRole('button', { name: '처리 중' })).toBeNull();
    // 비로그인 판정에서 나오던 '가입 신청'도 뜨면 안 된다.
    expect(screen.queryByRole('button', { name: '가입 신청' })).toBeNull();
  });

  it('실응답이 도착하면(placeholder 해제) 뷰어 판정에 따른 CTA 가 열린다', () => {
    teamApiMocks.useV1TeamDetail.mockReturnValue({
      data: { ...seededDetail(), viewer: { role: 'none', membershipId: null, joinState: 'none', canRequestJoin: true, disabledReason: null, manageRoute: null } },
      isError: false,
      isPlaceholderData: false,
    });
    teamApiMocks.useV1TeamJoinEligibility.mockReturnValue({ data: { eligible: true, joinState: 'none', message: null } });

    render(<TeamDetailPageClient teamId="team-1" />);

    expect(screen.queryByRole('button', { name: '불러오는 중' })).toBeNull();
  });
});

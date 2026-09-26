import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/analytics';
import { V1ApiError } from '@/lib/api-client';
import type { V1AuthMe } from '@/types/api';
import { useShellOverrideForRoute } from '@/components/v1-ui/shell-override';
import { TeamDetailPageClient, TeamMembersPageClient } from './teams-client';

type AuthProbeFixture = Partial<Pick<ReturnType<typeof import('@/hooks/use-v1-api').useV1AuthMe>,
  'data' | 'error' | 'isPending' | 'isFetching' | 'isError'>> & {
  refetch?: () => Promise<{ data?: V1AuthMe; error?: Error | null }>;
};

const teamApiMocks = vi.hoisted(() => ({
  useV1AuthMe: vi.fn((): AuthProbeFixture => ({ data: undefined })),
  useV1TeamDetail: vi.fn(),
  useV1TeamJoinEligibility: vi.fn(),
  useV1CreateTeamJoinApplication: vi.fn(),
  useV1WithdrawTeamJoinApplication: vi.fn(),
  useV1ResolveChatRoom: vi.fn(),
  useV1TeamMatches: vi.fn(),
  useV1TeamUpcomingGames: vi.fn(() => ({ data: { items: [] }, isLoading: false, isError: false })),
  // 반환 타입을 vi.fn()의 첫 구현으로 좁히지 않는다 — 좁히면 아래 테스트가 items를 담은
  // 값을 돌려줄 때 tsc가 undefined 할당으로 잡는다(다른 훅 목들과 같은 형태로 맞춘다).
  useV1LeagueMatches: vi.fn(),
  useV1TeamMembers: vi.fn(),
  useV1MyTeams: vi.fn(() => ({ data: undefined })),
  useV1TeamContactSummary: vi.fn((): { data: unknown } => ({ data: undefined })),
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

const routerMocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const navigationMocks = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...teamApiMocks,
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/teams/team-1',
  useRouter: () => routerMocks,
  useSearchParams: () => navigationMocks.searchParams,
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return rtlRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

// useV1LeagueMatches 는 팀 상세가 항상 호출한다("내 리그" 섹션). describe 마다 채우면
// 하나만 빠져도 그 블록 전체가 "myLeaguesQuery 가 undefined" 로 깨지므로 파일 레벨에서
// 한 번만 기본값을 준다. 값이 필요한 테스트는 각자 mockReturnValue 로 덮어쓴다.
beforeEach(() => {
  teamApiMocks.useV1LeagueMatches.mockReturnValue({ data: undefined, isLoading: false });
  navigationMocks.searchParams = new URLSearchParams();
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

  // 팀 상세(내 팀에서 들어옴) → 멤버 목록 → 뒤로 → 팀 상세 → 뒤로가 내 팀으로 이어져야 한다.
  it('팀 상세가 넘긴 출처를 뒤로가기와 멤버 프로필 링크에 이어 싣는다', () => {
    const detailHref = '/teams/team-1?from=%2Fmy%2Fteams';
    navigationMocks.searchParams = new URLSearchParams({ from: detailHref });
    let published: ReturnType<typeof useShellOverrideForRoute> = {};
    function ShellProbe() {
      published = useShellOverrideForRoute('/teams/team-1');
      return null;
    }

    render(<><ShellProbe /><TeamMembersPageClient teamId="team-1" /></>);

    // backHref는 더 이상 게시하지 않는다 — AppBackLink가 `?from=`을 직접 읽는다.
    expect(published).toEqual({});
    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', detailHref);
    const membersHref = `/teams/team-1/members?from=${encodeURIComponent(detailHref)}`;
    screen.getAllByRole('link', { name: /김도윤/ }).forEach((link) =>
      expect(link).toHaveAttribute('href', `/users/user-owner?from=${encodeURIComponent(membersHref)}`),
    );
  });

  it('비공개 팀이면 상태 제목과 받은 출처를 함께 게시한다', () => {
    navigationMocks.searchParams = new URLSearchParams({ from: '/teams/team-1?from=%2Fmy%2Fteams' });
    teamApiMocks.useV1TeamDetail.mockReturnValue({
      data: { name: '성수 풋살 크루', canViewMembers: false, viewer: { role: null, membershipId: null } },
      isError: false,
    });
    let published: ReturnType<typeof useShellOverrideForRoute> = {};
    function ShellProbe() {
      published = useShellOverrideForRoute('/teams/team-1');
      return null;
    }

    render(<><ShellProbe /><TeamMembersPageClient teamId="team-1" /></>);

    // backHref는 더 이상 게시하지 않는다 — AppBackLink가 `?from=`을 직접 읽는다.
    expect(published).toEqual({ title: '멤버 목록이 비공개예요' });
  });

  it('출처 없이 들어오면 팀 상세로 돌아가는 기본값을 그대로 쓴다', () => {
    let published: ReturnType<typeof useShellOverrideForRoute> = {};
    function ShellProbe() {
      published = useShellOverrideForRoute('/teams/team-1');
      return null;
    }

    render(<><ShellProbe /><TeamMembersPageClient teamId="team-1" /></>);

    expect(published).toEqual({});
    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', '/teams/team-1');
    screen.getAllByRole('link', { name: /김도윤/ }).forEach((link) =>
      expect(link).toHaveAttribute('href', '/users/user-owner?from=%2Fteams%2Fteam-1%2Fmembers'),
    );
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

  it('removes stale review controls when the live viewer role changes to member', async () => {
    const ownerDetail = {
      name: '성수 풋살 크루',
      canViewMembers: true,
      viewer: { role: 'owner', membershipId: 'membership-owner' },
    };
    const memberDetail = {
      name: '성수 풋살 크루',
      canViewMembers: true,
      viewer: { role: 'member', membershipId: 'membership-owner' },
    };
    teamApiMocks.useV1TeamDetail
      .mockReset()
      .mockReturnValue({ data: ownerDetail, isError: false });
    teamApiMocks.useV1TeamMembers.mockReturnValue({
      data: {
        items: [{
          membershipId: 'membership-owner',
          userId: 'user-owner',
          displayName: '김도윤',
          role: 'member',
          status: 'active',
          joinedAt: '2026-01-01T00:00:00.000Z',
          canChangeRole: false,
          canRemove: false,
        }],
        summary: { ownerCount: 0, managerCount: 0, memberCount: 1 },
        viewerRole: 'member',
        pageInfo: { nextCursor: null, hasNext: false },
      },
      isError: false,
    });

    const rendered = render(<TeamMembersPageClient teamId="team-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /^가입 신청/ }));
    expect(screen.getByText('이서준')).toBeInTheDocument();

    teamApiMocks.useV1TeamDetail.mockReturnValue({ data: memberDetail, isError: false });
    rendered.rerender(<TeamMembersPageClient teamId="team-1" />);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^가입 신청/ })).toBeNull();
      expect(screen.queryByText('이서준')).toBeNull();
      expect(screen.queryByText('권한 규칙')).toBeNull();
      expect(screen.queryByRole('button', { name: '관리' })).toBeNull();
      expect(screen.getByRole('heading', { name: '성수 풋살 크루 · 멤버 목록' })).toBeInTheDocument();
      expect(teamApiMocks.useV1TeamJoinApplications).toHaveBeenLastCalledWith(
        'team-1',
        { status: 'requested', limit: 50 },
        { enabled: false },
      );
      expect(teamApiMocks.useV1TeamInvitations).toHaveBeenLastCalledWith('team-1', { enabled: false });
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

  it('운영진이면 운영 메뉴에 "받은 컨택" 행이 팀컨택 필터 채팅 목록으로 연결되고 대기 건수가 배지로 붙는다', () => {
    teamApiMocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'owner-user', email: null, onboardingStatus: 'complete' }, profile: { displayName: '운영자' } }, isPending: false, isFetching: false, isError: false });
    teamApiMocks.useV1TeamDetail.mockReturnValue({
      data: baseTeamDetail({ viewer: { role: 'owner', membershipId: 'mem-owner', joinState: 'member', canRequestJoin: false, disabledReason: null, manageRoute: null } }),
      isError: false,
    });
    teamApiMocks.useV1TeamContactSummary.mockReturnValue({
      data: { pendingInbound: 3, byTeam: [{ teamId: 'team-1', pendingInbound: 2 }, { teamId: 'team-9', pendingInbound: 1 }] },
    });

    render(<TeamDetailPageClient teamId="team-1" />);

    const links = screen.getAllByRole('link', { name: /받은 컨택/ });
    expect(links[0]).toHaveAttribute('href', '/chat?category=team_contact');
    // 이 팀(team-1)의 대기 건수만 배지로 — 다른 팀 건은 섞지 않는다.
    expect(screen.getAllByLabelText('답장을 기다리는 컨택 2건').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('답장을 기다리는 컨택 3건')).not.toBeInTheDocument();
  });

  it('"팀매치 만들기" 는 이 팀 상세로 돌아오도록 항상 from= 을 담는다 (받은 출처가 없어도)', () => {
    teamApiMocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'owner-user', email: null, onboardingStatus: 'complete' }, profile: { displayName: '운영자' } }, isPending: false, isFetching: false, isError: false });
    teamApiMocks.useV1TeamDetail.mockReturnValue({
      data: baseTeamDetail({ viewer: { role: 'owner', membershipId: 'mem-owner', joinState: 'member', canRequestJoin: false, disabledReason: null, manageRoute: null } }),
      isError: false,
    });
    teamApiMocks.useV1TeamContactSummary.mockReturnValue({ data: { pendingInbound: 0, byTeam: [] } });

    render(<TeamDetailPageClient teamId="team-1" />);

    const links = screen.getAllByRole('link', { name: /팀매치 만들기/ });
    expect(links.length).toBeGreaterThan(0);
    // 자연스러운 뒤로가기는 (외부에서 받은 출처가 아니라) 이 팀 상세 자신이다.
    links.forEach((link) => expect(link).toHaveAttribute('href', '/team-matches/new/team?from=%2Fteams%2Fteam-1'));
    // 회귀 방지: from 이 빠지면 팀매치 생성 완료 후 팀 상세로 못 돌아온다.
    links.forEach((link) => expect(link.getAttribute('href')).not.toBe('/team-matches/new/team'));
  });

  it('"팀매치 만들기" 는 팀 상세 자체가 받은 출처(selfHref 의 from)도 함께 실어 나른다', () => {
    navigationMocks.searchParams = new URLSearchParams('from=%2Fmy%2Fteams');
    teamApiMocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'owner-user', email: null, onboardingStatus: 'complete' }, profile: { displayName: '운영자' } }, isPending: false, isFetching: false, isError: false });
    teamApiMocks.useV1TeamDetail.mockReturnValue({
      data: baseTeamDetail({ viewer: { role: 'owner', membershipId: 'mem-owner', joinState: 'member', canRequestJoin: false, disabledReason: null, manageRoute: null } }),
      isError: false,
    });
    teamApiMocks.useV1TeamContactSummary.mockReturnValue({ data: { pendingInbound: 0, byTeam: [] } });

    render(<TeamDetailPageClient teamId="team-1" />);

    const [link] = screen.getAllByRole('link', { name: /팀매치 만들기/ });
    expect(link).toHaveAttribute('href', '/team-matches/new/team?from=%2Fteams%2Fteam-1%3Ffrom%3D%252Fmy%252Fteams');
  });

  it('cached verified owner keeps management, member CTA, and protected queries during auth background fetching', () => {
    teamApiMocks.useV1AuthMe.mockReturnValue({
      data: { user: { id: 'owner-user', email: null, onboardingStatus: 'complete' }, profile: { displayName: '운영자' } },
      isPending: false,
      isFetching: true,
      isError: false,
    });
    teamApiMocks.useV1TeamDetail.mockReturnValue({
      data: baseTeamDetail({
        viewer: { role: 'owner', membershipId: 'mem-owner', joinState: 'member', canRequestJoin: false, disabledReason: null, manageRoute: null },
      }),
      isError: false,
      isPlaceholderData: false,
    });
    teamApiMocks.useV1TeamContactSummary.mockReturnValue({ data: { pendingInbound: 0, byTeam: [] } });

    render(<TeamDetailPageClient teamId="team-1" />);

    expect(screen.queryByRole('button', { name: '로그인 상태 확인 중' })).toBeNull();
    expect(screen.getAllByRole('link', { name: /^팀 정보 수정/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /받은 컨택/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '팀 채팅' }).length).toBeGreaterThan(0);
    expect(teamApiMocks.useV1TeamContactSummary).toHaveBeenLastCalledWith({ enabled: true });
    expect(teamApiMocks.useV1TeamJoinEligibility).toHaveBeenLastCalledWith('team-1', { enabled: true });
    expect(teamApiMocks.useV1MyTeams).toHaveBeenLastCalledWith(undefined, { enabled: true });
    expect(teamApiMocks.useV1TeamUpcomingGames).toHaveBeenCalledWith('team-1');
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

  it('작은 팀의 멤버에게도 전체 멤버 목록 진입점이 있다', () => {
    teamApiMocks.useV1TeamDetail.mockReturnValue({
      data: baseTeamDetail({
        memberCount: 6,
        membersPreview: Array.from({ length: 6 }, (_, i) => member(i)),
        viewer: { role: 'member', membershipId: 'mem-0', joinState: 'member', canRequestJoin: false, disabledReason: null, manageRoute: null },
      }),
      isError: false,
    });

    render(<TeamDetailPageClient teamId="team-1" />);

    const memberListLinks = screen.getAllByRole('link', { name: '멤버 목록 보기' });
    expect(memberListLinks.length).toBeGreaterThanOrEqual(2); // 데스크톱·모바일 레이아웃 둘 다 렌더
    memberListLinks.forEach((link) => expect(link).toHaveAttribute('href', '/teams/team-1/members'));
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
    // 뒤로가기가 이 팀 상세로 돌아오도록 `?from=`을 함께 실어 보낸다(QA 피드백 #1).
    memberLinks.forEach((link) => expect(link).toHaveAttribute('href', '/users/user-owner-42?from=%2Fteams%2Fteam-1'));
  });

  // 데스크톱 "팀 목록으로" 헤더 링크(AppBackLink)도 모바일 셸과 마찬가지로 `?from=`을 직접 읽는다.
  it('내 팀 목록에서 들어오면 데스크톱 뒤로가기 링크도 그 화면으로 돌아간다', () => {
    navigationMocks.searchParams = new URLSearchParams('from=%2Fmy%2Fteams');
    teamApiMocks.useV1TeamDetail.mockReturnValue({ data: baseTeamDetail(), isError: false });

    render(<TeamDetailPageClient teamId="team-1" />);

    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', '/my/teams');
  });

  it('받은 출처를 하위 화면(멤버 목록·팀 전적)과 프로필 링크에 이어 싣는다', () => {
    navigationMocks.searchParams = new URLSearchParams('from=%2Fmy%2Fteams');
    teamApiMocks.useV1TeamDetail.mockReturnValue({
      data: baseTeamDetail({ memberCount: 2, membersPreview: [{ membershipId: 'mem-owner', userId: 'user-owner-42', displayName: '박서준', role: 'owner' }, member(1)] }),
      isError: false,
    });

    render(<TeamDetailPageClient teamId="team-1" />);

    const selfFrom = encodeURIComponent('/teams/team-1?from=%2Fmy%2Fteams');
    screen.getAllByRole('link', { name: '멤버 목록 보기' }).forEach((link) =>
      expect(link).toHaveAttribute('href', `/teams/team-1/members?from=${selfFrom}`),
    );
    screen.getAllByRole('link', { name: /박서준/ }).forEach((link) =>
      expect(link).toHaveAttribute('href', `/users/user-owner-42?from=${selfFrom}`),
    );
    const recordLinks = screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/teams/team-1/records'));
    expect(recordLinks.length).toBeGreaterThan(0);
    recordLinks.forEach((link) => expect(link).toHaveAttribute('href', `/teams/team-1/records?from=${selfFrom}`));
  });

  it('출처가 없으면 데스크톱 뒤로가기 링크는 전체 팀 목록으로 돌아간다', () => {
    teamApiMocks.useV1TeamDetail.mockReturnValue({ data: baseTeamDetail(), isError: false });

    render(<TeamDetailPageClient teamId="team-1" />);

    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', '/teams');
  });

  // override store는 한 칸이라, 부모(TeamDetailPageClient)가 게시한 backHref가 자식
  // 에러 뷰의 제목을 덮어쓰면 셸 제목이 route-chrome 기본값('팀 상세')으로 돌아간다.
  it('상세를 못 불러오면 셸에 에러 제목과 출처 뒤로가기를 함께 게시한다', () => {
    navigationMocks.searchParams = new URLSearchParams('from=%2Fmy%2Fteams');
    teamApiMocks.useV1TeamDetail.mockReturnValue({ data: undefined, isError: true });
    let published: ReturnType<typeof useShellOverrideForRoute> = {};
    function ShellProbe() {
      published = useShellOverrideForRoute('/teams/team-1');
      return null;
    }

    render(<><ShellProbe /><TeamDetailPageClient teamId="team-1" /></>);

    // backHref는 더 이상 게시하지 않는다 — AppBackLink가 `?from=`을 직접 읽는다.
    expect(published).toEqual({ title: '팀 목록을 불러오지 못했어요' });
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
    // 뒤로가기가 이 팀 상세로 돌아오도록 `?from=`을 함께 실어 보낸다(QA 피드백 #1).
    leagueLinks.forEach((link) => expect(link).toHaveAttribute('href', '/league-matches/lg-1?from=%2Fteams%2Fteam-1'));
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
    teamApiMocks.useV1AuthMe.mockReturnValue({ data: undefined });
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

  it('guest does not request protected eligibility and gets a login return CTA', async () => {
    teamApiMocks.useV1TeamDetail.mockReturnValue({ data: seededDetail(), isError: false, isPlaceholderData: false });
    teamApiMocks.useV1TeamJoinEligibility.mockReturnValue({ data: undefined, isError: false });

    render(<TeamDetailPageClient teamId="team-1" />);

    await waitFor(() => expect(teamApiMocks.useV1TeamJoinEligibility).toHaveBeenLastCalledWith('team-1', { enabled: false }));
    const cta = screen.getAllByRole('button', { name: '로그인 후 가입 신청' })[0];
    fireEvent.click(cta);
    await waitFor(() => expect(routerMocks.push).toHaveBeenCalledWith('/login?redirect=%2Fteams%2Fteam-1'));
  });

  it('hydrated authenticated user keeps eligible and denied server decisions', () => {
    const detail = seededDetail();
    teamApiMocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'user-1', email: null, onboardingStatus: 'complete' }, profile: { displayName: '테스트 사용자' } } });
    teamApiMocks.useV1TeamDetail.mockReturnValue({ data: { ...detail, viewer: { ...detail.viewer, disabledReason: null, canRequestJoin: true } }, isError: false, isPlaceholderData: false });
    teamApiMocks.useV1TeamJoinEligibility.mockReturnValue({ data: { eligible: true, joinState: 'none', message: '가입 신청할 수 있어요.' }, isError: false });

    render(<TeamDetailPageClient teamId="team-1" />);

    expect(teamApiMocks.useV1TeamJoinEligibility).toHaveBeenLastCalledWith('team-1', { enabled: true });
    expect(screen.getAllByRole('button', { name: '가입 신청' }).length).toBeGreaterThan(0);
  });

  it('hydrated authenticated user keeps an ineligible server decision disabled', () => {
    const detail = seededDetail();
    teamApiMocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'user-1', email: null, onboardingStatus: 'complete' }, profile: { displayName: '테스트 사용자' } } });
    teamApiMocks.useV1TeamDetail.mockReturnValue({ data: { ...detail, viewer: { ...detail.viewer, disabledReason: null, canRequestJoin: true } }, isError: false, isPlaceholderData: false });
    teamApiMocks.useV1TeamJoinEligibility.mockReturnValue({ data: { eligible: false, joinState: 'none', message: '가입이 마감된 팀이에요.' }, isError: false });

    render(<TeamDetailPageClient teamId="team-1" />);

    expect(teamApiMocks.useV1TeamJoinEligibility).toHaveBeenLastCalledWith('team-1', { enabled: true });
    expect(screen.getAllByRole('button', { name: '가입이 마감된 팀이에요.' })[0]).toBeDisabled();
  });

  it('authenticated eligibility errors do not invoke the join mutation', () => {
    const detail = seededDetail();
    const joinMutateAsync = vi.fn();
    teamApiMocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'user-1', email: null, onboardingStatus: 'complete' }, profile: { displayName: '테스트 사용자' } } });
    teamApiMocks.useV1TeamDetail.mockReturnValue({ data: { ...detail, viewer: { ...detail.viewer, disabledReason: null, canRequestJoin: true } }, isError: false, isPlaceholderData: false });
    teamApiMocks.useV1TeamJoinEligibility.mockReturnValue({ data: undefined, isError: true, error: new Error('temporary failure') });
    teamApiMocks.useV1CreateTeamJoinApplication.mockReturnValue({ mutateAsync: joinMutateAsync, isPending: false });

    render(<TeamDetailPageClient teamId="team-1" />);

    expect(teamApiMocks.useV1TeamJoinEligibility).toHaveBeenLastCalledWith('team-1', { enabled: true });
    expect(screen.queryByRole('button', { name: '가입 신청' })).toBeNull();
    expect(joinMutateAsync).not.toHaveBeenCalled();
  });

  it('auth pending locks the CTA and both protected queries', () => {
    const detail = seededDetail();
    const resolveChat = vi.fn();
    teamApiMocks.useV1ResolveChatRoom.mockReturnValue({ mutate: resolveChat, mutateAsync: vi.fn(), isPending: false });
    teamApiMocks.useV1AuthMe.mockReturnValue({ data: undefined, isPending: true, isFetching: true, isError: false });
    teamApiMocks.useV1TeamDetail.mockReturnValue({ data: { ...detail, viewer: { ...detail.viewer, role: 'member', disabledReason: null } }, isError: false, isPlaceholderData: false });

    render(<TeamDetailPageClient teamId="team-1" />);

    expect(screen.getAllByRole('button', { name: '로그인 상태 확인 중' })[0]).toBeDisabled();
    expect(screen.queryByRole('button', { name: '처리 중' })).toBeNull();
    expect(resolveChat).not.toHaveBeenCalled();
    expect(teamApiMocks.useV1TeamContactSummary).toHaveBeenLastCalledWith({ enabled: false });
    expect(teamApiMocks.useV1TeamJoinEligibility).toHaveBeenLastCalledWith('team-1', { enabled: false });
    expect(teamApiMocks.useV1MyTeams).toHaveBeenLastCalledWith(undefined, { enabled: false });
  });

  it('cold valid cookie with no local hint enables both protected queries from verified auth', async () => {
    const detail = seededDetail();
    teamApiMocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'cold-user', email: null, onboardingStatus: 'complete' }, profile: { displayName: '콜드 사용자' } }, isPending: false, isFetching: false, isError: false });
    teamApiMocks.useV1TeamDetail.mockReturnValue({ data: { ...detail, viewer: { ...detail.viewer, disabledReason: null } }, isError: false, isPlaceholderData: false });
    teamApiMocks.useV1TeamJoinEligibility.mockReturnValue({ data: { eligible: true, joinState: 'none', message: null }, isError: false });

    render(<TeamDetailPageClient teamId="team-1" />);

    await waitFor(() => {
      expect(teamApiMocks.useV1TeamJoinEligibility).toHaveBeenLastCalledWith('team-1', { enabled: true });
      expect(teamApiMocks.useV1MyTeams).toHaveBeenLastCalledWith(undefined, { enabled: true });
    });
  });

  it('auth 401 overrides cached auth data and stale member viewer state', () => {
    const detail = seededDetail();
    const resolveChat = vi.fn();
    teamApiMocks.useV1ResolveChatRoom.mockReturnValue({ mutate: resolveChat, mutateAsync: vi.fn(), isPending: false });
    const expired = new V1ApiError({ status: 'error', statusCode: 401, code: 'UNAUTHENTICATED', message: 'expired', timestamp: '' });
    teamApiMocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'cached-user', email: null, onboardingStatus: 'complete' }, profile: { displayName: '캐시 사용자' } }, isPending: false, isFetching: false, isError: true, error: expired });
    teamApiMocks.useV1TeamDetail.mockReturnValue({ data: { ...detail, viewer: { ...detail.viewer, role: 'member', disabledReason: null } }, isError: false, isPlaceholderData: false });

    render(<TeamDetailPageClient teamId="team-1" />);

    expect(screen.getAllByRole('button', { name: '로그인 후 가입 신청' })[0]).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '팀 채팅' })).toBeNull();
    expect(resolveChat).not.toHaveBeenCalled();
    expect(teamApiMocks.useV1TeamContactSummary).toHaveBeenLastCalledWith({ enabled: false });
    expect(teamApiMocks.useV1TeamJoinEligibility).toHaveBeenLastCalledWith('team-1', { enabled: false });
    expect(teamApiMocks.useV1MyTeams).toHaveBeenLastCalledWith(undefined, { enabled: false });
  });

  it('auth 500 exposes an awaited auth retry and accepts a later verified result', async () => {
    const detail = seededDetail();
    let authState: AuthProbeFixture = { data: undefined, isPending: false, isFetching: false, isError: true };
    const serverError = new V1ApiError({ status: 'error', statusCode: 500, code: 'INTERNAL_SERVER_ERROR', message: 'temporary', timestamp: '' });
    const retryAuth = vi.fn().mockImplementation(async () => {
      authState = { data: { user: { id: 'recovered-user', email: null, onboardingStatus: 'complete' }, profile: { displayName: '복구 사용자' } }, isPending: false, isFetching: false, isError: false };
      return { data: authState.data, error: null };
    });
    teamApiMocks.useV1AuthMe.mockImplementation(() => ({ ...authState, error: authState.isError ? serverError : undefined, refetch: retryAuth }));
    teamApiMocks.useV1TeamDetail.mockReturnValue({ data: { ...detail, viewer: { ...detail.viewer, disabledReason: null } }, isError: false, isPlaceholderData: false });
    teamApiMocks.useV1TeamJoinEligibility.mockReturnValue({ data: { eligible: true, joinState: 'none', message: null }, isError: false });

    const rendered = render(<TeamDetailPageClient teamId="team-1" />);

    fireEvent.click(screen.getAllByRole('button', { name: '로그인 상태 다시 확인' })[0]);
    await waitFor(() => expect(retryAuth).toHaveBeenCalledTimes(1));
    rendered.rerender(<TeamDetailPageClient teamId="team-1" />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: '가입 신청' }).length).toBeGreaterThan(0));
  });

  it('auth retry returning 401 stays guest without an error or join success', async () => {
    const detail = seededDetail();
    const expired = new V1ApiError({ status: 'error', statusCode: 401, code: 'UNAUTHENTICATED', message: 'expired', timestamp: '' });
    const retryAuth = vi.fn().mockResolvedValue({ data: undefined, error: expired });
    teamApiMocks.useV1AuthMe.mockReturnValue({ data: undefined, isPending: false, isFetching: false, isError: true, error: new V1ApiError({ status: 'error', statusCode: 500, code: 'INTERNAL_SERVER_ERROR', message: 'temporary auth failure', timestamp: '' }), refetch: retryAuth });
    teamApiMocks.useV1TeamDetail.mockReturnValue({ data: { ...detail, viewer: { ...detail.viewer, disabledReason: null } }, isError: false, isPlaceholderData: false });

    const rendered = render(<TeamDetailPageClient teamId="team-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: '로그인 상태 다시 확인' })[0]);
    await waitFor(() => expect(retryAuth).toHaveBeenCalledTimes(1));
    teamApiMocks.useV1AuthMe.mockReturnValue({ data: undefined, isPending: false, isFetching: false, isError: true, error: expired, refetch: retryAuth });
    rendered.rerender(<TeamDetailPageClient teamId="team-1" />);

    await waitFor(() => expect(screen.getAllByRole('button', { name: '로그인 후 가입 신청' })[0]).toBeEnabled());
    expect(screen.getAllByRole('button', { name: '로그인 후 가입 신청' })[0]).toBeInTheDocument();
    expect(screen.queryByText('expired')).toBeNull();
    expect(screen.queryByText('temporary auth failure')).toBeNull();
    expect(screen.queryByText('신청을 완료했어요.')).toBeNull();
    expect(teamApiMocks.useV1TeamJoinEligibility).toHaveBeenLastCalledWith('team-1', { enabled: false });
  });

  it('auth retry returning 500 surfaces the actual error and keeps retry available', async () => {
    const detail = seededDetail();
    const serverError = new V1ApiError({ status: 'error', statusCode: 500, code: 'INTERNAL_SERVER_ERROR', message: 'temporary auth failure', timestamp: '' });
    const retryAuth = vi.fn().mockResolvedValue({ data: undefined, error: serverError });
    teamApiMocks.useV1AuthMe.mockReturnValue({ data: undefined, isPending: false, isFetching: false, isError: true, error: serverError, refetch: retryAuth });
    teamApiMocks.useV1TeamDetail.mockReturnValue({ data: { ...detail, viewer: { ...detail.viewer, disabledReason: null } }, isError: false, isPlaceholderData: false });

    render(<TeamDetailPageClient teamId="team-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: '로그인 상태 다시 확인' })[0]);
    await waitFor(() => expect(retryAuth).toHaveBeenCalledTimes(1));
    expect((await screen.findAllByText('temporary auth failure')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '로그인 상태 다시 확인' })[0]).toBeEnabled();
    expect(screen.queryByText('신청을 완료했어요.')).toBeNull();
  });

  it('cached owner with auth 401 hides management, contact, private members, chat mutation, and upcoming matches fetch', () => {
    const detail = seededDetail();
    const expired = new V1ApiError({ status: 'error', statusCode: 401, code: 'UNAUTHENTICATED', message: 'expired', timestamp: '' });
    const resolveChatMutate = vi.fn();
    teamApiMocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'cached-owner', email: null, onboardingStatus: 'complete' }, profile: { displayName: '캐시 운영자' } }, isPending: false, isFetching: false, isError: true, error: expired });
    teamApiMocks.useV1TeamDetail.mockReturnValue({ data: { ...detail, membersVisibilityEnabled: false, membersPreview: [{ membershipId: 'm1', userId: 'u1', displayName: '비공개 멤버', role: 'member' }], viewer: { ...detail.viewer, role: 'owner', disabledReason: null } }, isError: false, isPlaceholderData: false });
    teamApiMocks.useV1ResolveChatRoom.mockReturnValue({ mutate: resolveChatMutate, mutateAsync: vi.fn(), isPending: false });
    teamApiMocks.useV1TeamMatches.mockReturnValue({ data: { items: [] }, isLoading: false });

    render(<TeamDetailPageClient teamId="team-1" />);

    expect(screen.queryByText('비공개 멤버')).toBeNull();
    expect(screen.queryByRole('link', { name: '팀 정보 수정' })).toBeNull();
    expect(screen.queryByRole('link', { name: '컨택 보내기' })).toBeNull();
    expect(resolveChatMutate).not.toHaveBeenCalled();
    expect(teamApiMocks.useV1TeamUpcomingGames).not.toHaveBeenCalled();
    // Recruiting matches are public; only the member-only upcoming-games query is blocked.
    expect(teamApiMocks.useV1TeamMatches).toHaveBeenLastCalledWith({ teamId: 'team-1', status: 'recruiting', limit: 5 }, { enabled: true });
  });

  it('public members remain visible for a guest while private cached members stay hidden', () => {
    const detail = seededDetail();
    const expired = new V1ApiError({ status: 'error', statusCode: 401, code: 'UNAUTHENTICATED', message: 'expired', timestamp: '' });
    teamApiMocks.useV1AuthMe.mockReturnValue({ data: undefined, isPending: false, isFetching: false, isError: true, error: expired });
    teamApiMocks.useV1TeamDetail.mockReturnValue({ data: { ...detail, membersVisibilityEnabled: true, membersPreview: [{ membershipId: 'm1', userId: 'u1', displayName: '공개 멤버', role: 'member' }] }, isError: false, isPlaceholderData: false });

    render(<TeamDetailPageClient teamId="team-1" />);

    expect(screen.getAllByText('공개 멤버').length).toBeGreaterThan(0);
  });

  it('verified member keeps chat action ahead of an eligibility error', async () => {
    const detail = seededDetail();
    const chatMutateAsync = vi.fn().mockResolvedValue({ roomId: 'room-1', route: 'team' });
    teamApiMocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'member-user', email: null, onboardingStatus: 'complete' }, profile: { displayName: '멤버' } }, isPending: false, isFetching: false, isError: false });
    teamApiMocks.useV1TeamDetail.mockReturnValue({ data: { ...detail, viewer: { ...detail.viewer, role: 'member', disabledReason: null } }, isError: false, isPlaceholderData: false });
    teamApiMocks.useV1TeamJoinEligibility.mockReturnValue({ data: undefined, isError: true, error: new Error('temporary') });
    teamApiMocks.useV1ResolveChatRoom.mockReturnValue({ mutate: vi.fn(), mutateAsync: chatMutateAsync, isPending: false });

    render(<TeamDetailPageClient teamId="team-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: '팀 채팅' })[0]);
    await waitFor(() => expect(chatMutateAsync).toHaveBeenCalledWith({ targetType: 'team', targetId: 'team-1' }));
    expect(teamApiMocks.useV1TeamUpcomingGames).toHaveBeenCalledWith('team-1');
  });

  function renderPendingMember(eligibility: Record<string, unknown>) {
    const detail = seededDetail();
    const withdrawMutateAsync = vi.fn().mockResolvedValue({ status: 'withdrawn' });
    teamApiMocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'pending-user', email: null, onboardingStatus: 'complete' }, profile: { displayName: '대기 사용자' } }, isPending: false, isFetching: false, isError: false });
    teamApiMocks.useV1TeamDetail.mockReturnValue({ data: { ...detail, viewer: { ...detail.viewer, joinState: 'requested', disabledReason: null } }, isError: false, isPlaceholderData: false });
    teamApiMocks.useV1TeamJoinEligibility.mockReturnValue(eligibility);
    teamApiMocks.useV1WithdrawTeamJoinApplication.mockReturnValue({ mutateAsync: withdrawMutateAsync, isPending: false });
    render(<TeamDetailPageClient teamId="team-1" />);
    return { withdrawMutateAsync };
  }

  it('verified pending member cancels with the eligibility application id', async () => {
    const { withdrawMutateAsync } = renderPendingMember({
      data: { eligible: false, joinState: 'requested', applicationId: 'application-7', message: '승인을 기다리고 있어요.', requestedAt: null },
      isError: false,
    });

    fireEvent.click(screen.getAllByRole('button', { name: '신청 취소' })[0]);
    await waitFor(() => expect(withdrawMutateAsync).toHaveBeenCalledWith({ reason: 'team_join_withdrawn_from_v1_web' }));
    expect(teamApiMocks.useV1WithdrawTeamJoinApplication).toHaveBeenLastCalledWith('team-1', 'application-7');
  });

  it('pending member with an eligibility error retries instead of withdrawing without an application id', async () => {
    const refetch = vi.fn().mockResolvedValue({ error: null });
    const { withdrawMutateAsync } = renderPendingMember({ data: undefined, isError: true, error: new Error('temporary'), refetch });

    expect(screen.queryByRole('button', { name: '신청 취소' })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: '다시 시도' })[0]);
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    expect(withdrawMutateAsync).not.toHaveBeenCalled();
  });

  it('pending member waits for eligibility before offering cancellation', () => {
    const { withdrawMutateAsync } = renderPendingMember({ data: undefined, isError: false });

    expect(screen.getAllByRole('button', { name: '신청 상태 확인 중' })[0]).toBeDisabled();
    expect(screen.queryByRole('button', { name: '신청 취소' })).toBeNull();
    expect(withdrawMutateAsync).not.toHaveBeenCalled();
  });

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

  // eligibility 는 인증 API 이고 `enabled: Boolean(query.data)` 라, seed 가 있으면 곧바로
  // 실행돼 **팀 상세 실응답보다 먼저 도착할 수 있다.** 그때 CTA 를 열어 두면 라벨은
  // "불러오는 중"인데 누르면 진짜 가입 신청이 나가 — 라벨과 동작이 어긋난다.
  it('eligibility 가 seed 보다 먼저 도착해도 CTA 는 눌리지 않는다', () => {
    teamApiMocks.useV1TeamDetail.mockReturnValue({
      data: seededDetail(),
      isError: false,
      isPlaceholderData: true,
    });
    teamApiMocks.useV1TeamJoinEligibility.mockReturnValue({
      data: { eligible: true, joinState: 'none', message: null },
    });

    render(<TeamDetailPageClient teamId="team-1" />);

    const cta = screen.getAllByRole('button', { name: '불러오는 중' })[0];
    expect(cta).toBeDisabled();
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

describe('TeamMembersPageClient 초대 폼', () => {
  const inviteMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // 초대 폼은 canManageInvitations(운영진 이상) 뒤에 가려 있다 — owner 로 렌더해야 나온다.
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
        items: [],
        summary: { ownerCount: 1, managerCount: 0, memberCount: 1 },
        viewerRole: 'owner',
        pageInfo: { nextCursor: null, hasNext: false },
      },
      isError: false,
    });
    teamApiMocks.useV1TeamJoinApplications.mockReturnValue({ data: { items: [] } });
    teamApiMocks.useV1TeamInvitations.mockReturnValue({ data: { items: [] }, isLoading: false });
    teamApiMocks.useV1ChangeTeamMembershipRole.mockReturnValue({ isPending: false, mutate: vi.fn() });
    teamApiMocks.useV1RemoveTeamMembership.mockReturnValue({ isPending: false, mutate: vi.fn() });
    teamApiMocks.useV1ApproveTeamJoinApplication.mockReturnValue({ isPending: false, mutate: vi.fn() });
    teamApiMocks.useV1RejectTeamJoinApplication.mockReturnValue({ isPending: false, mutate: vi.fn() });
    teamApiMocks.useV1SendTeamInvitation.mockReturnValue({ isPending: false, mutate: inviteMutate });
    teamApiMocks.useV1CancelTeamInvitation.mockReturnValue({ isPending: false, mutate: vi.fn() });
    teamApiMocks.useV1LeaveTeam.mockReturnValue({ isPending: false, mutate: vi.fn() });
  });

  function rejectWithValidationError(field: string, messages: string[] = []) {
    inviteMutate.mockImplementation((_vars, options) => {
      options?.onError?.(new V1ApiError({
        status: 'error',
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: '입력값을 다시 확인해 주세요.',
        details: [{ field, messages }],
        timestamp: '',
      }));
    });
  }

  function submitInvitation() {
    render(<TeamMembersPageClient teamId="team-1" />);

    fireEvent.click(screen.getByRole('button', { name: /^초대/ }));
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'owner@teameet.v1' } });
    fireEvent.click(screen.getByRole('button', { name: '초대 보내기' }));
  }

  it('이메일 필드가 거절되면 서버가 보낸 제약 안내를 그대로 보여준다', async () => {
    rejectWithValidationError('invitedEmail', ['이메일 형식이 올바르지 않아요.']);

    submitInvitation();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('이메일 형식이 올바르지 않아요.');
    });
    expect(screen.queryByText('입력값을 다시 확인해 주세요.')).toBeNull();
  });

  it('길이 초과는 형식 오류로 바꿔 말하지 않는다', async () => {
    rejectWithValidationError('invitedEmail', ['이메일이 너무 길어요.']);

    submitInvitation();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('이메일이 너무 길어요.');
    });
    expect(screen.queryByText('이메일 형식을 확인해 주세요.')).toBeNull();
  });

  it('서버가 제약 문구를 주지 않으면 이메일 형식 안내로 떨어진다', async () => {
    rejectWithValidationError('invitedEmail');

    submitInvitation();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('이메일 형식을 확인해 주세요.');
    });
  });

  it('메시지 필드가 거절되면 이메일 탓으로 돌리지 않는다', async () => {
    rejectWithValidationError('message');

    submitInvitation();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('초대 메시지는 200자까지 쓸 수 있어요.');
    });
    expect(screen.queryByText('이메일 형식을 확인해 주세요.')).toBeNull();
  });
});

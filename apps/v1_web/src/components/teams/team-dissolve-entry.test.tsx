/**
 * 팀 해체 입구(Task 180 H3 A-1) — 누가 어디서 해체 화면으로 갈 수 있는가.
 * 팀장 혼자면 멤버 관리에 이유+다음 행동 카드가, 멤버가 있으면 팀 수정 맨 아래 "팀 관리"가 입구다.
 * 매니저·멤버에게는 어느 쪽 입구도 없다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { fireEvent, render as rtlRender, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamMembersPageClient } from './teams-client';
import { TeamEditPageClient } from './teams-form-client';

const hooks = vi.hoisted(() => ({
  useV1TeamDetail: vi.fn(),
  useV1TeamMembers: vi.fn(),
  useV1TeamJoinApplications: vi.fn(() => ({ data: { items: [] } })),
  useV1TeamInvitations: vi.fn(() => ({ data: { items: [] }, isLoading: false, isError: false })),
  useV1ChangeTeamMembershipRole: vi.fn(() => ({ isPending: false, mutate: vi.fn() })),
  useV1RemoveTeamMembership: vi.fn(() => ({ isPending: false, mutate: vi.fn() })),
  useV1ApproveTeamJoinApplication: vi.fn(() => ({ isPending: false, mutate: vi.fn() })),
  useV1RejectTeamJoinApplication: vi.fn(() => ({ isPending: false, mutate: vi.fn() })),
  useV1SendTeamInvitation: vi.fn(() => ({ isPending: false, mutate: vi.fn() })),
  useV1CancelTeamInvitation: vi.fn(() => ({ isPending: false, mutate: vi.fn() })),
  useV1LeaveTeam: vi.fn(() => ({ isPending: false, mutate: vi.fn() })),
  useV1MasterSports: vi.fn(() => ({ data: [{ id: 'sport-futsal', name: '풋살' }], isPending: false })),
  useV1MasterRegions: vi.fn(() => ({ data: [] })),
  useV1UpdateTeam: vi.fn(() => ({ isPending: false, mutateAsync: vi.fn() })),
  useV1UploadImages: vi.fn(() => ({ isPending: false, mutateAsync: vi.fn() })),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...hooks,
}));

vi.mock('@/hooks/use-v1-game-roster', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-game-roster')>()),
  useV1MemberUnavailability: () => ({ data: undefined, isError: false }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/teams/team-1/members',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return rtlRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  });
}

function member(role: 'owner' | 'manager' | 'member', index: number) {
  return {
    membershipId: `membership-${index}`,
    userId: `user-${index}`,
    displayName: `선수${index}`,
    role,
    status: 'active',
    joinedAt: '2026-09-30T00:00:00.000Z',
    canChangeRole: role !== 'owner',
    canRemove: role !== 'owner',
  };
}

function setTeam(viewerRole: 'owner' | 'manager' | 'member', roles: Array<'owner' | 'manager' | 'member'>) {
  const items = roles.map((role, index) => member(role, index + 1));
  const viewer = items.find((item) => item.role === viewerRole) ?? items[0];
  hooks.useV1TeamDetail.mockReturnValue({
    data: { name: 'QA0929 팀관리 테스트', canViewMembers: true, managerCount: 0, viewer: { role: viewerRole, membershipId: viewer.membershipId } },
    isError: false,
  });
  hooks.useV1TeamMembers.mockReturnValue({
    data: {
      items,
      summary: {
        ownerCount: roles.filter((role) => role === 'owner').length,
        managerCount: roles.filter((role) => role === 'manager').length,
        memberCount: roles.length,
      },
      viewerRole,
      pageInfo: { nextCursor: null, hasNext: false },
    },
    isError: false,
  });
}

describe('멤버 관리 — 팀장 혼자 남은 팀의 해체 입구(A-1)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('팀장 혼자면 나갈 수 없는 이유와 멤버 초대·팀 해체 입구를 보여 준다', () => {
    setTeam('owner', ['owner']);
    render(<TeamMembersPageClient teamId="team-1" />);

    expect(screen.getByText('혼자 남은 팀이에요')).toBeInTheDocument();
    expect(screen.getByText(/위임할 매니저가 없어서 팀 나가기는 쓸 수 없어요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '팀 해체' })).toHaveAttribute(
      'href',
      '/teams/team-1/dissolve?from=%2Fteams%2Fteam-1%2Fmembers',
    );
  });

  it('"멤버 초대"는 초대 탭으로 바꿔 준다', () => {
    setTeam('owner', ['owner']);
    render(<TeamMembersPageClient teamId="team-1" />);

    fireEvent.click(screen.getByRole('button', { name: '멤버 초대' }));

    const tabs = within(screen.getByRole('group', { name: '멤버 탭 선택' }));
    expect(tabs.getByRole('button', { name: /초대/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('혼자 남은 팀이에요')).not.toBeInTheDocument();
  });

  it('멤버가 있으면 팀장에게도 이 카드는 없다(해체 입구는 팀 수정 쪽)', () => {
    setTeam('owner', ['owner', 'member', 'member']);
    render(<TeamMembersPageClient teamId="team-1" />);

    expect(screen.queryByText('혼자 남은 팀이에요')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '팀 해체' })).not.toBeInTheDocument();
  });

  it.each([['manager' as const], ['member' as const]])('%s 에게는 인원이 한 명이어도 입구가 없다', (role) => {
    setTeam(role, [role]);
    render(<TeamMembersPageClient teamId="team-1" />);

    expect(screen.queryByText('혼자 남은 팀이에요')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '팀 해체' })).not.toBeInTheDocument();
  });
});

function editDetail(role: 'owner' | 'manager') {
  return {
    teamId: 'team-1',
    name: 'QA0929 팀관리 테스트',
    status: 'active',
    visibility: 'public',
    sport: { sportId: 'sport-futsal', name: '풋살' },
    region: null,
    membersVisibilityEnabled: false,
    canViewMembers: true,
    memberCount: 18,
    managerCount: 1,
    version: '2026-09-30T00:00:00.000Z',
    profile: {
      logoUrl: null,
      coverImageUrl: null,
      introduction: '',
      activityAreaText: null,
      skillLevelText: null,
      levelLabel: null,
      genderRule: null,
      joinPolicy: 'approval_required',
      memberGoalCount: 24,
      activityDays: [],
      activityFrequency: null,
      activityTimeSlots: [],
      activityTypes: [],
      activityMemo: null,
      activitySummary: null,
    },
    viewer: { role, membershipId: 'membership-1', joinState: 'member', canRequestJoin: false, disabledReason: null, manageRoute: null },
  };
}

describe('팀 수정 — 멤버가 있는 팀의 해체 입구("팀 관리")', () => {
  beforeEach(() => vi.clearAllMocks());

  it('팀장에게는 팀 수정 맨 아래에 해체 화면으로 가는 입구가 있다', () => {
    hooks.useV1TeamDetail.mockReturnValue({ data: editDetail('owner'), isError: false, isLoading: false });
    render(<TeamEditPageClient teamId="team-1" />);

    expect(screen.getByRole('heading', { name: '팀 관리' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '팀 해체하기' })).toHaveAttribute(
      'href',
      '/teams/team-1/dissolve?from=%2Fteams%2Fteam-1%2Fedit',
    );
  });

  it('매니저는 팀 정보를 고칠 수 있어도 해체 입구는 없다', () => {
    hooks.useV1TeamDetail.mockReturnValue({ data: editDetail('manager'), isError: false, isLoading: false });
    render(<TeamEditPageClient teamId="team-1" />);

    expect(screen.getByRole('textbox', { name: '팀 이름' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '팀 관리' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '팀 해체하기' })).not.toBeInTheDocument();
  });
});

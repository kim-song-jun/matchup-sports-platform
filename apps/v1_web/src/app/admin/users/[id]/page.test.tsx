import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AdminUserDetailPage from './page';

const state = vi.hoisted(() => ({ noMatches: false, withOwnedOnlyTeam: true }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'user-1' }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => true }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1DeleteAdminUser: () => ({ mutate: vi.fn(), isPending: false }),
  useV1AdminUser: () => ({
    data: {
      userId: 'user-1',
      email: 'qa@example.test',
      displayName: 'QA 계정',
      nickname: null,
      accountStatus: 'active',
      phone: '010-****-1234',
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      birthDate: null,
      displayRegion: null,
      bio: null,
      deletedAt: null,
      createdAt: '2026-09-12T00:00:00.000Z',
      lastLoginAt: null,
      adminRole: null,
      authProviders: [],
      gender: null,
      onboardingStatus: 'completed',
      withdrawalRequest: null,
      reputationSummary: null,
      hostedMatchCount: 1,
      ownedTeamCount: 2,
      teamRoleCounts: { owner: 1, manager: 1, member: 0 },
      hostedMatches: state.noMatches
        ? []
        : [{ matchId: 'match 1', title: 'QA 리그 1경기', status: 'completed', startAt: '2026-09-30T10:00:00.000Z' }],
      ownedTeams: [
        { teamId: 'team-a', name: 'QA 팀A', status: 'active', memberCount: 12 },
        ...(state.withOwnedOnlyTeam
          ? [{ teamId: 'team-c', name: '소유만 한 팀', status: 'archived', memberCount: 1 }]
          : []),
      ],
      teamMemberships: [
        { membershipId: 'm-1', teamId: 'team-a', name: 'QA 팀A', status: 'active', memberCount: 12, role: 'owner', joinedAt: null },
        { membershipId: 'm-2', teamId: 'team-b', name: '매니저로 속한 팀', status: 'active', memberCount: 5, role: 'manager', joinedAt: null },
      ],
    },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

describe('AdminUserDetailPage — 팀 한 번만, 상세 링크, 한국어 상태', () => {
  it('같은 팀이 여러 목록에 되풀이되지 않고 역할은 태그로 합쳐진다', () => {
    render(<AdminUserDetailPage />);

    expect(screen.getAllByText('QA 팀A')).toHaveLength(1);
    const teamA = screen.getByRole('link', { name: 'QA 팀A' }).closest('li') as HTMLElement;
    expect(within(teamA).getByText('소유자')).toBeInTheDocument();
    expect(within(teamA).getByText('팀장')).toBeInTheDocument();

    const managed = screen.getByRole('link', { name: '매니저로 속한 팀' }).closest('li') as HTMLElement;
    expect(within(managed).getByText('매니저')).toBeInTheDocument();
    expect(within(managed).queryByText('소유자')).not.toBeInTheDocument();

    const ownedOnly = screen.getByRole('link', { name: '소유만 한 팀' }).closest('li') as HTMLElement;
    expect(within(ownedOnly).getByText('소유자')).toBeInTheDocument();
    expect(screen.getByText('소속 팀 3개')).toBeInTheDocument();
  });

  it('팀명·매치명은 어드민 관리 상세로 연결된다', () => {
    render(<AdminUserDetailPage />);

    expect(screen.getByRole('link', { name: 'QA 팀A' })).toHaveAttribute('href', '/admin/teams/team-a');
    expect(screen.getByRole('link', { name: 'QA 리그 1경기' })).toHaveAttribute('href', '/admin/matches/match%201');
    expect(screen.getByRole('link', { name: /팀 관리/ })).toHaveAttribute('href', '/admin/teams');
    expect(screen.getByRole('link', { name: /매치 관리/ })).toHaveAttribute('href', '/admin/matches');
  });

  it('상태는 영문 원문 없이 한국어 라벨로 보인다', () => {
    render(<AdminUserDetailPage />);

    for (const raw of ['active', 'completed', 'archived']) {
      expect(screen.queryByText(raw)).not.toBeInTheDocument();
    }
    const match = screen.getByRole('link', { name: 'QA 리그 1경기' }).closest('li') as HTMLElement;
    expect(within(match).getByText('완료')).toBeInTheDocument();
    const ownedOnly = screen.getByRole('link', { name: '소유만 한 팀' }).closest('li') as HTMLElement;
    expect(within(ownedOnly).getByText('보관')).toBeInTheDocument();
  });

  it('매치 섹션 제목은 개수를 붙이고, 0건이면 개수 없이 빈 안내를 보인다', () => {
    const { unmount } = render(<AdminUserDetailPage />);
    expect(screen.getByRole('heading', { name: '최근 매치 1개' })).toBeInTheDocument();
    unmount();

    state.noMatches = true;
    render(<AdminUserDetailPage />);
    expect(screen.getByRole('heading', { name: '최근 매치' })).toBeInTheDocument();
    expect(screen.getByText('최근 생성한 매치가 없어요.')).toBeInTheDocument();
    state.noMatches = false;
  });

  it('소속팀 전체는 소유만 한 팀을 빼고 역할별 행 합과 같다', () => {
    const summaryValue = (label: string) =>
      Number(screen.getByText(label).parentElement?.querySelector('dd')?.textContent);
    const roleSum = () => summaryValue('팀장 팀') + summaryValue('매니저 팀') + summaryValue('일반 멤버 팀');

    const { unmount } = render(<AdminUserDetailPage />);
    expect(screen.getByText('소속 팀 3개')).toBeInTheDocument();
    expect(summaryValue('소속팀 전체')).toBe(2);
    expect(summaryValue('소속팀 전체')).toBe(roleSum());
    unmount();

    state.withOwnedOnlyTeam = false;
    render(<AdminUserDetailPage />);
    expect(summaryValue('소속팀 전체')).toBe(roleSum());
    state.withOwnedOnlyTeam = true;
  });
});

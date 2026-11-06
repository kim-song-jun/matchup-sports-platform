import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import AdminUserDetailPage from './page';

const manyOwnedMemberships = vi.hoisted(() =>
  Array.from({ length: 12 }, (_, i) => ({
    membershipId: `mo-${i}`,
    teamId: `many-${i}`,
    name: `다수 팀 ${i}`,
    status: 'active',
    memberCount: 3,
    role: 'owner' as const,
    joinedAt: null,
  })),
);
const state = vi.hoisted(() => ({
  noMatches: false,
  withOwnedOnlyTeam: true,
  manyOwned: false,
  canWrite: true,
  phone: '01012345678' as string | null,
  deletedAt: null as string | null,
  releasePending: false,
  releaseCalls: [] as Array<{ reason: string }>,
  deleteCalls: [] as Array<{ reason: string }>,
  releaseOutcome: { kind: 'success' } as { kind: 'success' } | { kind: 'error'; error: unknown },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'user-1' }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => state.canWrite }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1DeleteAdminUser: () => ({
    isPending: false,
    mutate: (vars: { reason: string }, options: { onSuccess?: () => void }) => {
      state.deleteCalls.push(vars);
      options.onSuccess?.();
    },
  }),
  // TanStack 의 mutate 처럼 호출마다 옵션 콜백으로 결과를 알린다.
  useV1ReleaseAdminUserPhone: () => ({
    isPending: state.releasePending,
    mutate: (
      vars: { reason: string },
      options: { onSuccess?: () => void; onError?: (error: unknown) => void },
    ) => {
      state.releaseCalls.push(vars);
      if (state.releaseOutcome.kind === 'success') options.onSuccess?.();
      else options.onError?.(state.releaseOutcome.error);
    },
  }),
  useV1AdminUser: () => ({
    data: {
      userId: 'user-1',
      email: 'qa@example.test',
      displayName: 'QA 계정',
      nickname: null,
      accountStatus: 'active',
      phone: state.phone,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      birthDate: null,
      displayRegion: null,
      bio: null,
      deletedAt: state.deletedAt,
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
        ...(state.manyOwned ? manyOwnedMemberships : []),
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
    expect(within(teamA).getByText('팀장')).toBeInTheDocument();

    const managed = screen.getByRole('link', { name: '매니저로 속한 팀' }).closest('li') as HTMLElement;
    expect(within(managed).getByText('매니저')).toBeInTheDocument();

    const ownedOnly = screen.getByRole('link', { name: '소유만 한 팀' }).closest('li') as HTMLElement;
    expect(within(ownedOnly).getByText('팀장')).toBeInTheDocument();
    expect(screen.queryByText('소유자')).not.toBeInTheDocument();
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

  it('팀장인 팀이 서버 소유 팀 한도(5건)보다 많아도 모든 팀이 같은 역할 라벨을 가진다', () => {
    state.manyOwned = true;
    render(<AdminUserDetailPage />);
    state.manyOwned = false;

    const manyRows = screen.getAllByRole('link', { name: /^다수 팀/ });
    expect(manyRows).toHaveLength(12);
    for (const link of manyRows) {
      expect(within(link.closest('li') as HTMLElement).getByText('팀장')).toBeInTheDocument();
    }
    expect(screen.queryByText('소유자')).not.toBeInTheDocument();
  });
});

describe('AdminUserDetailPage — 휴대폰 번호 해제', () => {
  afterEach(() => {
    state.canWrite = true;
    state.phone = '01012345678';
    state.deletedAt = null;
    state.releasePending = false;
    state.releaseCalls = [];
    state.deleteCalls = [];
    state.releaseOutcome = { kind: 'success' };
  });

  const releaseButton = () => screen.queryByRole('button', { name: '휴대폰 번호 해제' });

  it('번호가 있는 회원에게만 해제 버튼을 보여 준다', () => {
    const { unmount } = render(<AdminUserDetailPage />);
    expect(releaseButton()).toBeEnabled();
    unmount();

    state.phone = null;
    render(<AdminUserDetailPage />);
    expect(releaseButton()).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '휴대폰 번호 해제' })).not.toBeInTheDocument();
  });

  it('완전히 삭제된 계정에는 해제 버튼이 없고, 읽기 전용 운영자는 누를 수 없다', () => {
    state.deletedAt = '2026-10-01T00:00:00.000Z';
    state.phone = 'deleted-user-1';
    const { unmount } = render(<AdminUserDetailPage />);
    expect(releaseButton()).not.toBeInTheDocument();
    unmount();

    state.deletedAt = null;
    state.phone = '01012345678';
    state.canWrite = false;
    render(<AdminUserDetailPage />);
    expect(releaseButton()).toBeDisabled();
  });

  it('모달은 번호를 가려서 보여 주고 무엇이 바뀌는지 분명히 적는다', async () => {
    const user = userEvent.setup();
    render(<AdminUserDetailPage />);

    await user.click(releaseButton() as HTMLElement);

    const dialog = await screen.findByRole('dialog', { name: '휴대폰 번호 해제' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText(/010-\*\*\*\*-5678/)).toBeInTheDocument();
    expect(dialog.textContent).not.toContain('01012345678');
    expect(within(dialog).getByText('번호가 이 계정에서 지워져요.')).toBeInTheDocument();
    expect(within(dialog).getByText('계정은 그대로 남지만, 휴대폰 번호를 다시 인증해야 해요.')).toBeInTheDocument();
    expect(within(dialog).getByText('해제한 번호로 다른 사람이 가입할 수 있어요.')).toBeInTheDocument();
  });

  it('사유 없이는 보내지 않고, 사유를 쓰면 공백을 뺀 값으로 보낸 뒤 닫고 알린다', async () => {
    const user = userEvent.setup();
    render(<AdminUserDetailPage />);
    await user.click(releaseButton() as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: '휴대폰 번호 해제' });

    await user.click(within(dialog).getByRole('button', { name: '번호 해제' }));
    expect(state.releaseCalls).toEqual([]);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('사유를 입력해 주세요.');

    await user.type(within(dialog).getByLabelText('해제 사유'), '  번호가 재할당됨  ');
    await user.click(within(dialog).getByRole('button', { name: '번호 해제' }));

    expect(state.releaseCalls).toEqual([{ reason: '번호가 재할당됨' }]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('휴대폰 번호를 해제했어요.')).toBeInTheDocument();
  });

  it('서버가 거절하면 모달을 연 채로 서버 메시지를 알린다', async () => {
    state.releaseOutcome = {
      kind: 'error',
      error: new V1ApiError({
        status: 'error',
        statusCode: 409,
        code: 'PHONE_NOT_SET',
        message: '해제할 휴대폰 번호가 없어요.',
        timestamp: '2026-11-01T00:00:00.000Z',
      }),
    };
    const user = userEvent.setup();
    render(<AdminUserDetailPage />);
    await user.click(releaseButton() as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: '휴대폰 번호 해제' });

    await user.type(within(dialog).getByLabelText('해제 사유'), '확인');
    await user.click(within(dialog).getByRole('button', { name: '번호 해제' }));

    expect(await screen.findByText('해제할 휴대폰 번호가 없어요.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '휴대폰 번호 해제' })).toBeInTheDocument();
  });
});

describe('AdminUserDetailPage — 회원 삭제 모달', () => {
  afterEach(() => {
    state.deleteCalls = [];
  });

  it('사유 없이는 삭제하지 않고, 사유를 쓰면 공백을 뺀 값으로 삭제한 뒤 닫고 알린다', async () => {
    const user = userEvent.setup();
    render(<AdminUserDetailPage />);
    await user.click(screen.getByRole('button', { name: '회원 삭제' }));
    const dialog = await screen.findByRole('dialog', { name: '회원 삭제' });

    await user.click(within(dialog).getByRole('button', { name: '삭제 처리' }));
    expect(state.deleteCalls).toEqual([]);

    await user.type(within(dialog).getByLabelText('삭제 사유'), ' 이용약관 위반 ');
    await user.click(within(dialog).getByRole('button', { name: '삭제 처리' }));

    expect(state.deleteCalls).toEqual([{ reason: '이용약관 위반' }]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('회원을 삭제 처리했어요.')).toBeInTheDocument();
  });
});

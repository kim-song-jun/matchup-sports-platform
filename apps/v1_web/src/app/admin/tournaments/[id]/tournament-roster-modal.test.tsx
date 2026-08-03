import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1AdminTournamentRegistration } from '@/types/api';
import { RosterModal } from './tournament-detail-client';

const refetch = vi.fn();
const updateEligibility = vi.fn();
let queryState: Record<string, unknown>;

const addPlayer = vi.fn();
const removePlayer = vi.fn();

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournamentPlayers: () => queryState,
  useV1UpdatePlayerEligibility: () => ({ mutate: updateEligibility, isPending: false }),
  useV1AdminAddPlayer: () => ({ mutate: addPlayer, isPending: false }),
  useV1AdminRemovePlayer: () => ({ mutate: removePlayer, isPending: false }),
}));

const registration: V1AdminTournamentRegistration = {
  id: 'registration-1',
  tournamentId: 'tournament-1',
  teamId: 'team-1',
  teamName: '번개팀',
  appliedByUserId: 'user-1',
  status: 'confirmed' as const,
  depositorName: '홍길동',
  agreedRules: true,
  agreedPrivacy: true,
  agreedRefund: true,
  agreedMediaConsent: true,
  confirmedAt: '2026-07-14T00:00:00.000Z',
  rosterLockedAt: null,
  rosterDeadlineOverrideAt: null,
  cancelRequestedAt: null,
  cancelReason: null,
  playerCount: 1,
  payment: null,
  confirmedByAdminUserId: 'admin-1',
  createdAt: '2026-07-14T00:00:00.000Z',
  updatedAt: '2026-07-14T00:00:00.000Z',
};

describe('admin tournament roster modal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryState = {
      data: {
        registrationId: 'registration-1',
        teamId: 'team-1',
        teamName: '번개팀',
        rosterLockedAt: null,
        belowMinimum: false,
        players: [
          {
            id: 'player-1',
            userId: 'user-1',
            realName: '홍길동',
            birthDateSnapshot: '1995-03-15',
            genderSnapshot: 'male',
            phone: '01012345678',
            isTeamCaptain: false,
            eligibilityStatus: 'needs_review',
            eligibilityNote: null,
            addedAt: '2026-07-14T00:00:00.000Z',
            removedAt: null,
          },
        ],
      },
      isPending: false,
      isError: false,
      error: null,
      refetch,
    };
  });

  it('renders the roster gender snapshot for an admin', () => {
    render(
      <RosterModal
        open
        onClose={() => undefined}
        registration={registration}
        showToast={() => undefined}
        canWrite
      />,
    );

    expect(screen.getByRole('dialog', { name: '명단 검토 — 번개팀' })).toBeInTheDocument();
    expect(screen.getByText('1995-03-15 · 남성')).toBeInTheDocument();
    expect(screen.getByText('휴대폰 010-1234-5678')).toBeInTheDocument();
  });

  it('moves the team captain to the top and shows a captain badge', () => {
    const roster = queryState.data as {
      players: Array<Record<string, unknown>>;
    };
    roster.players = [
      { ...roster.players[0], id: 'member-player', realName: '일반 선수', isTeamCaptain: false },
      { ...roster.players[0], id: 'captain-player', realName: '팀장 선수', isTeamCaptain: true },
    ];

    render(
      <RosterModal
        open
        onClose={() => undefined}
        registration={registration}
        showToast={() => undefined}
        canWrite
      />,
    );

    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('팀장 선수');
    expect(rows[0]).toHaveTextContent('팀장');
    expect(rows[1]).toHaveTextContent('일반 선수');
  });
  it('renders a missing gender without blocking support read access or enabling mutation', () => {
    const roster = queryState.data as {
      players: Array<{ genderSnapshot: 'male' | 'female' | null; phone: string | null }>;
    };
    roster.players[0].genderSnapshot = null;
    roster.players[0].phone = null;

    render(
      <RosterModal
        open
        onClose={() => undefined}
        registration={registration}
        showToast={() => undefined}
        canWrite={false}
      />,
    );

    expect(screen.getByText('1995-03-15 · 성별 미등록')).toBeInTheDocument();
    expect(screen.getByText('휴대폰 미등록')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '홍길동 자격 상태' })).toBeDisabled();
  });

  it('shows a retryable error instead of an empty roster when the request fails', async () => {
    queryState = {
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('관리자 명단 조회 실패'),
      refetch,
    };

    render(
      <RosterModal
        open
        onClose={() => undefined}
        registration={registration}
        showToast={() => undefined}
        canWrite
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('관리자 명단 조회 실패');
    expect(screen.queryByText('등록된 선수가 없어요.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  // 2026-08-03 사고: 어드민 콘솔에 명단 추가·제거가 아예 없어서, 운영자가 무엇을 눌러도
  // 서버로 요청이 가지 않았다(24시간 로그에 POST 0건·4xx 0건). 아래 두 테스트는 "버튼이
  // 있는가"가 아니라 **실제로 요청이 나가는가**를 확인한다.
  it('제외 버튼이 해당 선수 id 로 제거를 요청한다', async () => {
    render(
      <RosterModal
        open
        onClose={() => undefined}
        registration={registration}
        showToast={() => undefined}
        canWrite
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '홍길동 선수를 명단에서 제외' }));

    expect(removePlayer).toHaveBeenCalledTimes(1);
    expect(removePlayer.mock.calls[0][0]).toBe('player-1');
  });

  it('선수 추가는 입력값을 그대로 보내고, 값이 비면 요청하지 않는다', async () => {
    render(
      <RosterModal
        open
        onClose={() => undefined}
        registration={registration}
        showToast={() => undefined}
        canWrite
      />,
    );

    // 빈 폼으로 누르면 API 를 호출하지 않고 폼 안에서 알린다.
    await userEvent.click(screen.getByRole('button', { name: '추가' }));
    expect(addPlayer).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('사용자 ID 와 실명을 모두 입력해주세요.');

    await userEvent.type(screen.getByLabelText('사용자 ID'), 'user-42');
    await userEvent.type(screen.getByLabelText('실명'), '김명철');
    await userEvent.click(screen.getByRole('button', { name: '추가' }));

    expect(addPlayer).toHaveBeenCalledTimes(1);
    expect(addPlayer.mock.calls[0][0]).toEqual({ userId: 'user-42', realName: '김명철' });
  });

  it('읽기 전용 어드민에게는 추가 폼과 제외 버튼이 보이지 않는다', () => {
    render(
      <RosterModal
        open
        onClose={() => undefined}
        registration={registration}
        showToast={() => undefined}
        canWrite={false}
      />,
    );

    expect(screen.queryByRole('button', { name: '추가' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '홍길동 선수를 명단에서 제외' })).toBeDisabled();
  });
});

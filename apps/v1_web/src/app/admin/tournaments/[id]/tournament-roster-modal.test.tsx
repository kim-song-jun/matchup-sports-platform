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
  useV1AdminRosterEligibleMembers: () => ({
    data: {
      members: [
        { userId: 'user-42', nickname: '명철', realName: '김명철', birthDate: '19900101',
          gender: 'male', role: 'member', alreadyOnRoster: false, eligible: true, ineligibleReason: null },
        { userId: 'user-99', nickname: '무프로필', realName: null, birthDate: null,
          gender: null, role: 'member', alreadyOnRoster: false, eligible: false,
          ineligibleReason: '실명·생년월일·휴대폰이 모두 필요해요' },
      ],
    },
    isPending: false,
    isError: false,
    error: null,
  }),
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

  // UUID 를 직접 입력받던 폼은 운영자가 그 값을 얻을 방법이 없어 사실상 쓸 수 없었다
  // (2026-08-04 alpha UI 검수). 팀원 목록에서 고르는 방식으로 바뀌었다.
  it('팀원을 골라 추가하면 그 userId 와 실명이 전송된다', async () => {
    render(
      <RosterModal
        open
        onClose={() => undefined}
        registration={registration}
        showToast={() => undefined}
        canWrite
      />,
    );

    // 아무도 안 고른 상태에서는 버튼이 비활성이라 요청이 나가지 않는다.
    expect(screen.getByRole('button', { name: '추가' })).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText('추가할 팀원'), 'user-42');
    await userEvent.click(screen.getByRole('button', { name: '추가' }));

    expect(addPlayer).toHaveBeenCalledTimes(1);
    expect(addPlayer.mock.calls[0][0]).toEqual({ userId: 'user-42', realName: '김명철' });
  });

  it('자격이 없는 팀원은 이유와 함께 보이되 고를 수 없다', () => {
    render(
      <RosterModal
        open
        onClose={() => undefined}
        registration={registration}
        showToast={() => undefined}
        canWrite
      />,
    );

    const options = screen.getAllByRole('option');
    const ineligible = options.find((o) =>
      o.textContent?.includes('실명·생년월일·휴대폰이 모두 필요해요'),
    );
    // 목록에서 지우지 않고 이유를 붙여 보여 준다 — 지우면 "왜 없지?" 를 화면 밖에서 찾게 된다.
    expect(ineligible).toBeTruthy();
    expect(ineligible).toBeDisabled();

    const selectable = options.find((o) => o.textContent?.includes('김명철'));
    expect(selectable).not.toBeDisabled();
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

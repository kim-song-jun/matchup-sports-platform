import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1AdminTournamentRegistration } from '@/types/api';
import { RosterModal } from './tournament-detail-client';

const refetch = vi.fn();
const updateEligibility = vi.fn();
let queryState: Record<string, unknown>;

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournamentPlayers: () => queryState,
  useV1UpdatePlayerEligibility: () => ({ mutate: updateEligibility, isPending: false }),
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
});

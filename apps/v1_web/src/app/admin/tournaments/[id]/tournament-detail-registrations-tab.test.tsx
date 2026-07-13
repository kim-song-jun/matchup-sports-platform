import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1AdminTournamentRegistration } from '@/types/api';
import {
  useV1AdminTournamentRegistrations,
  useV1CancelRegistrationAdmin,
  useV1ConfirmPayment,
  useV1ConfirmRegistration,
  useV1ExportRosterCsv,
  useV1RejectCancelRequest,
  useV1RosterDeadlineOverrideGrant,
  useV1RosterDeadlineOverrideRevoke,
  useV1RosterLock,
  useV1RosterUnlock,
  useV1TournamentPlayers,
  useV1UpdatePlayerEligibility,
} from '@/hooks/use-v1-api';
import { RegistrationsTab } from './tournament-detail-client';

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournamentRegistrations: vi.fn(),
  useV1ConfirmPayment: vi.fn(),
  useV1ConfirmRegistration: vi.fn(),
  useV1CancelRegistrationAdmin: vi.fn(),
  useV1RejectCancelRequest: vi.fn(),
  useV1RosterLock: vi.fn(),
  useV1RosterUnlock: vi.fn(),
  useV1RosterDeadlineOverrideGrant: vi.fn(),
  useV1RosterDeadlineOverrideRevoke: vi.fn(),
  useV1ExportRosterCsv: vi.fn(),
  useV1TournamentPlayers: vi.fn(),
  useV1UpdatePlayerEligibility: vi.fn(),
}));

const useV1AdminTournamentRegistrationsMock = vi.mocked(useV1AdminTournamentRegistrations);
const useV1ConfirmPaymentMock = vi.mocked(useV1ConfirmPayment);
const useV1ConfirmRegistrationMock = vi.mocked(useV1ConfirmRegistration);
const useV1CancelRegistrationAdminMock = vi.mocked(useV1CancelRegistrationAdmin);
const useV1RejectCancelRequestMock = vi.mocked(useV1RejectCancelRequest);
const useV1RosterLockMock = vi.mocked(useV1RosterLock);
const useV1RosterUnlockMock = vi.mocked(useV1RosterUnlock);
const useV1RosterDeadlineOverrideGrantMock = vi.mocked(useV1RosterDeadlineOverrideGrant);
const useV1RosterDeadlineOverrideRevokeMock = vi.mocked(useV1RosterDeadlineOverrideRevoke);
const useV1ExportRosterCsvMock = vi.mocked(useV1ExportRosterCsv);
const useV1TournamentPlayersMock = vi.mocked(useV1TournamentPlayers);
const useV1UpdatePlayerEligibilityMock = vi.mocked(useV1UpdatePlayerEligibility);

function baseRegistration(
  overrides: Partial<V1AdminTournamentRegistration> = {},
): V1AdminTournamentRegistration {
  return {
    id: 'reg-1',
    tournamentId: 'tournament-1',
    teamId: 'team-1',
    teamName: '테스트 FC',
    appliedByUserId: 'user-1',
    status: 'confirmed',
    depositorName: null,
    agreedRules: true,
    agreedPrivacy: true,
    agreedRefund: true,
    agreedMediaConsent: true,
    confirmedAt: '2026-01-01T00:00:00.000Z',
    rosterLockedAt: null,
    rosterDeadlineOverrideAt: null,
    cancelRequestedAt: null,
    cancelReason: null,
    playerCount: 5,
    payment: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    confirmedByAdminUserId: null,
    ...overrides,
  };
}

function noopMutationHook<T>(): T {
  return { mutate: vi.fn(), isPending: false } as unknown as T;
}

describe('RegistrationsTab — 명단 제출 마감 예외 토글', () => {
  const showToast = vi.fn();

  afterEach(() => {
    vi.clearAllMocks();
  });

  beforeEach(() => {
    useV1ConfirmPaymentMock.mockReturnValue(noopMutationHook<ReturnType<typeof useV1ConfirmPayment>>());
    useV1ConfirmRegistrationMock.mockReturnValue(noopMutationHook<ReturnType<typeof useV1ConfirmRegistration>>());
    useV1CancelRegistrationAdminMock.mockReturnValue(noopMutationHook<ReturnType<typeof useV1CancelRegistrationAdmin>>());
    useV1RejectCancelRequestMock.mockReturnValue(noopMutationHook<ReturnType<typeof useV1RejectCancelRequest>>());
    useV1RosterLockMock.mockReturnValue(noopMutationHook<ReturnType<typeof useV1RosterLock>>());
    useV1RosterUnlockMock.mockReturnValue(noopMutationHook<ReturnType<typeof useV1RosterUnlock>>());
    useV1ExportRosterCsvMock.mockReturnValue(noopMutationHook<ReturnType<typeof useV1ExportRosterCsv>>());
    useV1TournamentPlayersMock.mockReturnValue({
      data: { players: [], belowMinimum: false },
      isPending: false,
    } as unknown as ReturnType<typeof useV1TournamentPlayers>);
    useV1UpdatePlayerEligibilityMock.mockReturnValue(noopMutationHook<ReturnType<typeof useV1UpdatePlayerEligibility>>());
  });

  it('shows "마감 예외 허용" for a confirmed registration with no override, and calls the grant mutation with a success toast', () => {
    const grantMutate = vi.fn();
    useV1RosterDeadlineOverrideGrantMock.mockReturnValue({
      mutate: grantMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useV1RosterDeadlineOverrideGrant>);
    useV1RosterDeadlineOverrideRevokeMock.mockReturnValue(noopMutationHook());
    useV1AdminTournamentRegistrationsMock.mockReturnValue({
      data: { items: [baseRegistration({ rosterDeadlineOverrideAt: null })], pageInfo: { nextCursor: null, hasNext: false } },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1AdminTournamentRegistrations>);

    render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} />);

    const grantButton = screen.getByRole('button', { name: '마감 예외 허용' });
    expect(screen.queryByRole('button', { name: '예외 해제' })).not.toBeInTheDocument();

    fireEvent.click(grantButton);

    expect(grantMutate).toHaveBeenCalledWith(
      'reg-1',
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );

    const { onSuccess } = grantMutate.mock.calls[0][1];
    onSuccess();
    expect(showToast).toHaveBeenCalledWith('명단 제출 마감 예외를 허용했어요.', 'success');
  });

  it('shows "예외 해제" for a registration with an active override, and calls the revoke mutation with a success toast', () => {
    const revokeMutate = vi.fn();
    useV1RosterDeadlineOverrideGrantMock.mockReturnValue(noopMutationHook());
    useV1RosterDeadlineOverrideRevokeMock.mockReturnValue({
      mutate: revokeMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useV1RosterDeadlineOverrideRevoke>);
    useV1AdminTournamentRegistrationsMock.mockReturnValue({
      data: {
        items: [baseRegistration({ rosterDeadlineOverrideAt: '2026-08-01T00:00:00.000Z' })],
        pageInfo: { nextCursor: null, hasNext: false },
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1AdminTournamentRegistrations>);

    render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} />);

    const revokeButton = screen.getByRole('button', { name: '예외 해제' });
    expect(screen.queryByRole('button', { name: '마감 예외 허용' })).not.toBeInTheDocument();

    fireEvent.click(revokeButton);

    expect(revokeMutate).toHaveBeenCalledWith(
      'reg-1',
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );

    const { onSuccess } = revokeMutate.mock.calls[0][1];
    onSuccess();
    expect(showToast).toHaveBeenCalledWith('예외를 해제했어요.', 'success');
  });
});

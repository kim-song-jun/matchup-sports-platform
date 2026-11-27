import { vi } from 'vitest';
import type {
  RegistrationHandlers,
  RegistrationViewContext,
} from '@/app/admin/tournaments/[id]/registrations-model';
import type { V1AdminTournamentRegistration } from '@/types/api';

export function registrationFixture(overrides: Partial<V1AdminTournamentRegistration> = {}): V1AdminTournamentRegistration {
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
    adminCancelReason: null,
    cancelOutcome: null,
    playerCount: 5,
    payment: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    confirmedByAdminUserId: null,
    ...overrides,
  };
}

export function viewContextFixture(overrides: Partial<RegistrationViewContext> = {}): RegistrationViewContext {
  const isFreeEntry = overrides.isFreeEntry ?? false;
  return {
    canWrite: true,
    isFreeEntry,
    confirmNoun: isFreeEntry ? '신청 확인' : '입금 확인',
    admissionsBlockedReason: null,
    busy: false,
    showToast: vi.fn(),
    ...overrides,
  };
}

export function handlersFixture(): { [K in keyof RegistrationHandlers]: ReturnType<typeof vi.fn> } {
  return {
    onViewRoster: vi.fn(),
    onConfirmPayment: vi.fn(),
    onConfirm: vi.fn(),
    onWaitlist: vi.fn(),
    onApproveCancel: vi.fn(),
    onKeepRegistration: vi.fn(),
    onOpenCancelSheet: vi.fn(),
    onReject: vi.fn(),
    onToggleGameRosters: vi.fn(),
  };
}

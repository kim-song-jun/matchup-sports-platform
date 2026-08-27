import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  useV1AdminTournamentPlayers,
  useV1UpdatePlayerEligibility,
  useV1AdminAddPlayer,
  useV1AdminRemovePlayer,
  useV1AdminRosterEligibleMembers,
} from '@/hooks/use-v1-api';
import { RegistrationsTab } from './registrations-tab';

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
  useV1AdminTournamentPlayers: vi.fn(),
  useV1UpdatePlayerEligibility: vi.fn(),
  // RosterModal 이 이 탭에서 렌더되므로 모달이 쓰는 훅도 함께 mock 해야 한다.
  useV1AdminAddPlayer: vi.fn(),
  useV1AdminRemovePlayer: vi.fn(),
  useV1AdminRosterEligibleMembers: vi.fn(),
}));

const useV1AdminTournamentRegistrationsMock = vi.mocked(useV1AdminTournamentRegistrations);
const useV1AdminAddPlayerMock = vi.mocked(useV1AdminAddPlayer);
const useV1AdminRemovePlayerMock = vi.mocked(useV1AdminRemovePlayer);
const useV1AdminRosterEligibleMembersMock = vi.mocked(useV1AdminRosterEligibleMembers);
const useV1ConfirmPaymentMock = vi.mocked(useV1ConfirmPayment);
const useV1ConfirmRegistrationMock = vi.mocked(useV1ConfirmRegistration);
const useV1CancelRegistrationAdminMock = vi.mocked(useV1CancelRegistrationAdmin);
const useV1RejectCancelRequestMock = vi.mocked(useV1RejectCancelRequest);
const useV1RosterLockMock = vi.mocked(useV1RosterLock);
const useV1RosterUnlockMock = vi.mocked(useV1RosterUnlock);
const useV1RosterDeadlineOverrideGrantMock = vi.mocked(useV1RosterDeadlineOverrideGrant);
const useV1RosterDeadlineOverrideRevokeMock = vi.mocked(useV1RosterDeadlineOverrideRevoke);
const useV1ExportRosterCsvMock = vi.mocked(useV1ExportRosterCsv);
const useV1AdminTournamentPlayersMock = vi.mocked(useV1AdminTournamentPlayers);
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
    useV1AdminTournamentPlayersMock.mockReturnValue({
      data: { players: [], belowMinimum: false },
      isPending: false,
    } as unknown as ReturnType<typeof useV1AdminTournamentPlayers>);
    useV1UpdatePlayerEligibilityMock.mockReturnValue(noopMutationHook<ReturnType<typeof useV1UpdatePlayerEligibility>>());
    useV1AdminAddPlayerMock.mockReturnValue(noopMutationHook<ReturnType<typeof useV1AdminAddPlayer>>());
    useV1AdminRemovePlayerMock.mockReturnValue(noopMutationHook<ReturnType<typeof useV1AdminRemovePlayer>>());
    useV1AdminRosterEligibleMembersMock.mockReturnValue({ data: { members: [] }, isPending: false, isError: false } as unknown as ReturnType<typeof useV1AdminRosterEligibleMembers>);
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

    render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite />);

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

  // 감사 finding #52: 예외 허용은 잠금과 무관하게 성공하는데, 잠긴 신청은 여전히 명단을
  // 못 고친다(서버가 잠금 검사를 마감 검사보다 먼저 본다) — 무조건 성공 토스트만 뜨면
  // 운영자가 "팀이 이제 고칠 수 있다"고 잘못 믿는다.
  it('grant-override toast warns that the roster is still locked when the target registration is locked', () => {
    const grantMutate = vi.fn();
    useV1RosterDeadlineOverrideGrantMock.mockReturnValue({
      mutate: grantMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useV1RosterDeadlineOverrideGrant>);
    useV1RosterDeadlineOverrideRevokeMock.mockReturnValue(noopMutationHook());
    useV1AdminTournamentRegistrationsMock.mockReturnValue({
      data: {
        items: [
          baseRegistration({ rosterDeadlineOverrideAt: null, rosterLockedAt: '2026-08-01T00:00:00.000Z' }),
        ],
        pageInfo: { nextCursor: null, hasNext: false },
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1AdminTournamentRegistrations>);

    render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite />);

    fireEvent.click(screen.getByRole('button', { name: '마감 예외 허용' }));

    const { onSuccess } = grantMutate.mock.calls[0][1];
    onSuccess();
    expect(showToast).toHaveBeenCalledWith(
      '명단 제출 마감 예외를 허용했어요. 다만 명단이 아직 잠겨 있어 팀이 수정하려면 잠금 해제도 함께 해야 해요.',
      'success',
    );
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

    render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite />);

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

  it('hides every mutation action for read-only admins but keeps roster review and CSV export', () => {
    useV1RosterDeadlineOverrideGrantMock.mockReturnValue(noopMutationHook());
    useV1RosterDeadlineOverrideRevokeMock.mockReturnValue(noopMutationHook());
    useV1AdminTournamentRegistrationsMock.mockReturnValue({
      data: {
        items: [
          baseRegistration({ rosterDeadlineOverrideAt: null }),
          baseRegistration({ id: 'reg-2', status: 'cancel_requested' }),
        ],
        pageInfo: { nextCursor: null, hasNext: false },
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1AdminTournamentRegistrations>);

    render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite={false} />);

    // canWrite=true라면 보였을 mutation 버튼들이 전부 사라져야 한다
    // ('취소'는 상태 필터 칩과 이름이 겹치므로 모호하지 않은 라벨들로 검증)
    expect(screen.queryByRole('button', { name: '명단 잠금' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '마감 예외 허용' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '취소 거부(잔류)' })).not.toBeInTheDocument();
    // 조회성 액션은 유지된다 (RosterModal은 내부에서 canWrite를 별도 게이팅)
    expect(screen.getAllByRole('button', { name: '명단 검토' })).toHaveLength(2);
  });

  // 감사 finding #0: 정원 초과 상태에서 확인 모달이 "대기 명단 처리될 수 있어요"라고 안내해
  // 놓고 확인 버튼은 항상 decision='confirm'만 보내 서버가 409로 거절했다. 이제 정원 초과
  // 시에는 버튼 라벨 자체가 "대기로 처리"로 바뀌고, 그 라벨대로 waitlist 결정을 보낸다.
  it('over-capacity confirm click offers "대기로 처리" and sends decision=waitlist, not confirm', async () => {
    const confirmMutate = vi.fn();
    useV1ConfirmRegistrationMock.mockReturnValue({
      mutate: confirmMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useV1ConfirmRegistration>);
    useV1RosterDeadlineOverrideGrantMock.mockReturnValue(noopMutationHook());
    useV1RosterDeadlineOverrideRevokeMock.mockReturnValue(noopMutationHook());
    useV1AdminTournamentRegistrationsMock.mockReturnValue({
      data: {
        items: [
          baseRegistration({ id: 'reg-1', status: 'payment_checking', confirmedAt: null }),
          // 이미 확정된 1팀 + 정원 1팀 = 이 신청을 확정하면 정원 초과.
          baseRegistration({ id: 'reg-already-confirmed', status: 'confirmed' }),
        ],
        pageInfo: { nextCursor: null, hasNext: false },
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1AdminTournamentRegistrations>);

    render(
      <RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite tournamentTeamCount={1} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '확정' }));

    // 모달 안내가 정원 초과 사실을 알리고, 확인 액션은 "대기로 처리"로 뜬다(더 이상 "확정"이
    // 아니다 — 라벨과 실제 동작이 일치해야 한다).
    expect(await screen.findByText(/정원을 초과해 확정할 수 없어요/)).toBeInTheDocument();
    const waitlistButton = await screen.findByRole('button', { name: '대기로 처리' });
    fireEvent.click(waitlistButton);

    await waitFor(() =>
      expect(confirmMutate).toHaveBeenCalledWith(
        { registrationId: 'reg-1', decision: 'waitlist' },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      ),
    );
  });
});

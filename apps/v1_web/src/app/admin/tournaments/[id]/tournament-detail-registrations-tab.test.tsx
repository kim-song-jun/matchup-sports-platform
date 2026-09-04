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

  // 감사 finding(D-small-ux-consistency #1): rosterLockedAt은 confirmed일 때만 잠기고, 잠긴
  // 신청이 admin cancel()로 종료돼도 서버(rosterUnlock)에는 status 가드가 없어 잠금 필드가
  // 그대로 남는다 — 화면이 isLocked만 보면 취소 완료(cancelled)된 신청에도 "잠금 해제"
  // 버튼이 떠서 어색하다. 잠금이 실제로 의미 있는(명단이 아직 쓰일 수 있는) confirmed·
  // cancel_requested에서만 노출해야 한다.
  it('hides "잠금 해제" for a locked-but-cancelled registration, and still shows it while cancel_requested', () => {
    useV1RosterDeadlineOverrideGrantMock.mockReturnValue(noopMutationHook());
    useV1RosterDeadlineOverrideRevokeMock.mockReturnValue(noopMutationHook());
    useV1AdminTournamentRegistrationsMock.mockReturnValue({
      data: {
        items: [
          baseRegistration({
            id: 'reg-cancelled',
            status: 'cancelled',
            rosterLockedAt: '2026-08-01T00:00:00.000Z',
          }),
          baseRegistration({
            id: 'reg-cancel-requested',
            status: 'cancel_requested',
            rosterLockedAt: '2026-08-01T00:00:00.000Z',
          }),
        ],
        pageInfo: { nextCursor: null, hasNext: false },
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1AdminTournamentRegistrations>);

    render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite />);

    expect(screen.getAllByRole('button', { name: '잠금 해제' })).toHaveLength(1);
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

/**
 * **결함 #20 — 리그 신청 거부가 어드민 화면에서 항상 400 이었다.**
 *
 * 서버는 리그면 사유를 필수로 요구하는데(`LEAGUE_CANCEL_REASON_REQUIRED`, D9), 화면은
 * 예/아니오 확인만 받고 **사유 없이** 보냈다. 훅 payload 타입엔 `reason` 이 있었지만
 * 호출부가 채우지 않았다 — 계약이 화면까지 오지 않은 자리다.
 *
 * **결함 #21 — 자동 확정 명단인지 화면에 아무 표시가 없었다.**
 */
describe('RegistrationsTab — 거부 사유와 자동 확정 배지 (FE-4)', () => {
  const showToast = vi.fn();

  afterEach(() => vi.clearAllMocks());

  function arrange(overrides: Partial<V1AdminTournamentRegistration> = {}) {
    const cancelMutate = vi.fn();
    useV1ConfirmPaymentMock.mockReturnValue(noopMutationHook<ReturnType<typeof useV1ConfirmPayment>>());
    useV1ConfirmRegistrationMock.mockReturnValue(noopMutationHook<ReturnType<typeof useV1ConfirmRegistration>>());
    useV1CancelRegistrationAdminMock.mockReturnValue({
      mutate: cancelMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useV1CancelRegistrationAdmin>);
    useV1RejectCancelRequestMock.mockReturnValue(noopMutationHook<ReturnType<typeof useV1RejectCancelRequest>>());
    useV1RosterLockMock.mockReturnValue(noopMutationHook<ReturnType<typeof useV1RosterLock>>());
    useV1RosterUnlockMock.mockReturnValue(noopMutationHook<ReturnType<typeof useV1RosterUnlock>>());
    useV1ExportRosterCsvMock.mockReturnValue(noopMutationHook<ReturnType<typeof useV1ExportRosterCsv>>());
    useV1RosterDeadlineOverrideGrantMock.mockReturnValue(noopMutationHook<ReturnType<typeof useV1RosterDeadlineOverrideGrant>>());
    useV1RosterDeadlineOverrideRevokeMock.mockReturnValue(noopMutationHook<ReturnType<typeof useV1RosterDeadlineOverrideRevoke>>());
    useV1AdminTournamentPlayersMock.mockReturnValue({
      data: { players: [], belowMinimum: false },
      isPending: false,
    } as unknown as ReturnType<typeof useV1AdminTournamentPlayers>);
    useV1UpdatePlayerEligibilityMock.mockReturnValue(noopMutationHook<ReturnType<typeof useV1UpdatePlayerEligibility>>());
    useV1AdminAddPlayerMock.mockReturnValue(noopMutationHook<ReturnType<typeof useV1AdminAddPlayer>>());
    useV1AdminRemovePlayerMock.mockReturnValue(noopMutationHook<ReturnType<typeof useV1AdminRemovePlayer>>());
    useV1AdminRosterEligibleMembersMock.mockReturnValue({ data: { members: [] }, isPending: false, isError: false } as unknown as ReturnType<typeof useV1AdminRosterEligibleMembers>);
    useV1AdminTournamentRegistrationsMock.mockReturnValue({
      data: { items: [baseRegistration(overrides)] },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1AdminTournamentRegistrations>);
    return { cancelMutate };
  }

  /**
   * 행 액션의 "취소" 버튼. **상태 필터 칩에도 같은 이름이 있어서** 이름만으로는 못 고른다 —
   * 칩은 `aria-pressed` 를 갖고 행 액션은 안 갖는다.
   */
  function openCancelModal() {
    const buttons = screen.getAllByRole('button', { name: '취소' });
    const action = buttons.find((b) => !b.hasAttribute('aria-pressed'));
    if (action === undefined) throw new Error('행 액션의 취소 버튼을 찾지 못했다');
    return action;
  }

  it('리그: 사유가 비어 있으면 요청을 보내지 않고 이유를 말한다', () => {
    const { cancelMutate } = arrange();
    render(
      <RegistrationsTab tournamentId="league-1" showToast={showToast} canWrite requireCancelReason />,
    );
    fireEvent.click(openCancelModal());
    fireEvent.click(screen.getByRole('button', { name: '거부' }));

    expect(cancelMutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('리그 참가를 거부하려면 사유를 입력해 주세요.');
  });

  it('리그: 사유를 적으면 payload 에 실려 나간다 — 이게 없어서 늘 400 이었다', () => {
    const { cancelMutate } = arrange();
    render(
      <RegistrationsTab tournamentId="league-1" showToast={showToast} canWrite requireCancelReason />,
    );
    fireEvent.click(openCancelModal());
    fireEvent.change(screen.getByLabelText('사유'), { target: { value: '정원 초과' } });
    fireEvent.click(screen.getByRole('button', { name: '거부' }));

    expect(cancelMutate).toHaveBeenCalledWith(
      { registrationId: 'reg-1', reason: '정원 초과' },
      expect.anything(),
    );
  });

  it('대회: 사유 없이도 보낼 수 있다 — 기존 계약을 바꾸지 않는다', () => {
    const { cancelMutate } = arrange();
    render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite />);
    fireEvent.click(openCancelModal());
    fireEvent.click(screen.getByRole('button', { name: '거부' }));

    // 빈 사유는 **키 자체를 빼고** 보낸다 — 빈 문자열을 보내면 팀이 남긴 취소 사유를
    // 덮어쓸 여지가 생긴다(서버는 `dto.reason ?? 기존값` 으로 보존한다).
    expect(cancelMutate).toHaveBeenCalledWith({ registrationId: 'reg-1' }, expect.anything());
  });

  it('자동 확정된 명단이면 그렇게 표시한다', () => {
    arrange({ rosterAutoConfirmedAt: '2026-09-01T00:00:00.000Z' });
    render(<RegistrationsTab tournamentId="league-1" showToast={showToast} canWrite requireCancelReason />);
    expect(screen.getByText(/자동 확정/)).toBeInTheDocument();
  });

  it('팀이 직접 낸 명단에는 자동 확정 표시가 없다', () => {
    arrange({ rosterAutoConfirmedAt: null });
    render(<RegistrationsTab tournamentId="league-1" showToast={showToast} canWrite requireCancelReason />);
    expect(screen.queryByText(/자동 확정/)).not.toBeInTheDocument();
  });
});

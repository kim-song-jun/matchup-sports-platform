import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1AdminTournamentRegistration } from '@/types/api';
import {
  useV1AdminTournamentRegistrations,
  useV1CancelRegistrationAdmin,
  useV1ConfirmPayment,
  useV1ConfirmRegistration,
  useV1ExportRosterCsv,
  useV1ExportTournamentRosterCsv,
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
import { REGISTRATION_STATUS_FILTERS } from './tournament-detail-shared';

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
  // 탭 상단 버튼 — 기존 describe 들이 따로 세팅하지 않아도 렌더되게 기본값을 준다.
  useV1ExportTournamentRosterCsv: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useV1AdminTournamentPlayers: vi.fn(),
  useV1UpdatePlayerEligibility: vi.fn(),
  // RosterModal 이 이 탭에서 렌더되므로 모달이 쓰는 훅도 함께 mock 해야 한다.
  useV1AdminAddPlayer: vi.fn(),
  useV1AdminRemovePlayer: vi.fn(),
  useV1AdminRosterEligibleMembers: vi.fn(),
}));

// 펼침 안의 표는 자기 테스트가 있다(admin-registration-game-rosters.test.tsx) — 여기선 어느 신청에 무엇을 넘기는지만 본다.
vi.mock('@/components/game-roster/admin-registration-game-rosters', () => ({
  AdminRegistrationGameRosters: (props: {
    registrationId: string;
    teamName: string;
    correctionHref: string;
    onDirtyChange?: (dirty: boolean) => void;
  }) => (
    <div data-testid="game-rosters-panel" data-registration-id={props.registrationId} data-correction-href={props.correctionHref}>
      {props.teamName}
      <button type="button" onClick={() => props.onDirtyChange?.(true)}>
        칸 바꾸기
      </button>
    </div>
  ),
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
const useV1ExportTournamentRosterCsvMock = vi.mocked(useV1ExportTournamentRosterCsv);
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

describe('RegistrationsTab — 상태 필터의 빈 결과 (#1565)', () => {
  const mutate = vi.fn();
  const refetch = vi.fn();
  const items = [
    baseRegistration({ id: 'reg-alpha', teamName: '합성 A팀' }),
    baseRegistration({ id: 'reg-beta', teamId: 'team-beta', teamName: '합성 B팀' }),
  ];

  function arrange(query: Record<string, unknown> = {}) {
    for (const hook of [useV1ConfirmPaymentMock, useV1ConfirmRegistrationMock, useV1CancelRegistrationAdminMock,
      useV1RejectCancelRequestMock, useV1RosterLockMock, useV1RosterUnlockMock, useV1ExportRosterCsvMock,
      useV1ExportTournamentRosterCsvMock, useV1RosterDeadlineOverrideGrantMock, useV1RosterDeadlineOverrideRevokeMock,
      useV1UpdatePlayerEligibilityMock, useV1AdminAddPlayerMock, useV1AdminRemovePlayerMock] as const) {
      (hook as unknown as { mockReturnValue: (value: unknown) => void }).mockReturnValue({ mutate, isPending: false });
    }
    useV1AdminTournamentPlayersMock.mockReturnValue({ data: { players: [] }, isPending: false, isError: false } as unknown as ReturnType<typeof useV1AdminTournamentPlayers>);
    useV1AdminRosterEligibleMembersMock.mockReturnValue({ data: { members: [] }, isPending: false, isError: false } as unknown as ReturnType<typeof useV1AdminRosterEligibleMembers>);
    useV1AdminTournamentRegistrationsMock.mockReturnValue({ data: { items, truncated: false }, isPending: false, isError: false, error: null, refetch, ...query } as unknown as ReturnType<typeof useV1AdminTournamentRegistrations>);
  }

  beforeEach(() => { vi.clearAllMocks(); arrange(); });
  afterEach(() => vi.clearAllMocks());

  it.each([
    { tournamentId: 'tournament-qa', canWrite: true, requireCancelReason: false },
    { tournamentId: 'league-qa', canWrite: true, requireCancelReason: true },
    { tournamentId: 'tournament-qa', canWrite: false, requireCancelReason: false },
  ])('전체2→대기0→전체2를 구분하고 실제 공용 props $tournamentId/$canWrite를 유지해요', (props) => {
    render(<RegistrationsTab {...props} showToast={vi.fn()} />);
    const filters = within(screen.getByRole('group', { name: '신청 상태 필터' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(filters.getByRole('button', { name: '확정 2' })).toBeInTheDocument();
    fireEvent.click(filters.getByRole('button', { name: '대기' }));
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText('선택한 상태의 신청이 없어요')).toBeInTheDocument();
    expect(screen.getByText('다른 상태를 선택하거나 전체 신청을 확인해 보세요.')).toBeInTheDocument();
    expect(screen.queryByText('아직 신청한 팀이 없어요.')).not.toBeInTheDocument();
    expect(filters.getByRole('button', { name: '대기' })).toHaveAttribute('aria-pressed', 'true');
    expect(filters.getByRole('button', { name: '확정 2' })).toBeInTheDocument();
    fireEvent.click(filters.getByRole('button', { name: '전체' }));
    expect(screen.queryByText('선택한 상태의 신청이 없어요')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('합성 A팀')).toBeInTheDocument();
    expect(screen.getByText('합성 B팀')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '명단 검토' })).toHaveLength(2);
    expect(mutate).not.toHaveBeenCalled();
  });

  it.each(REGISTRATION_STATUS_FILTERS.filter(({ value }) => value !== 'all'))('$label 빈 결과는 전체 없음 안내를 사용하지 않아요', ({ label }) => {
    arrange({ data: { items: [], truncated: false } });
    render(<RegistrationsTab tournamentId="tournament-qa" canWrite showToast={vi.fn()} />);
    fireEvent.click(within(screen.getByRole('group', { name: '신청 상태 필터' })).getByRole('button', { name: label }));
    expect(screen.getByText('선택한 상태의 신청이 없어요')).toBeInTheDocument();
    expect(screen.queryByText('아직 신청한 팀이 없어요.')).not.toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('실제 전체0은 전체 빈 안내를 유지하고 상태 필터로 이동할 수 있어요', () => {
    arrange({ data: { items: [], truncated: false } });
    render(<RegistrationsTab tournamentId="tournament-qa" canWrite showToast={vi.fn()} />);
    expect(screen.getByText('신청이 없어요')).toBeInTheDocument();
    expect(screen.getByText('아직 신청한 팀이 없어요.')).toBeInTheDocument();
    expect(screen.queryByText('선택한 상태의 신청이 없어요')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('빠른 연속 상태 변경 후 전체는 원본2건을 유지해요', () => {
    render(<RegistrationsTab tournamentId="tournament-qa" canWrite showToast={vi.fn()} />);
    const filters = within(screen.getByRole('group', { name: '신청 상태 필터' }));
    for (const name of ['대기', '입금 확인 중', '취소', '대기', '전체']) {
      fireEvent.click(filters.getByRole('button', { name }));
    }
    expect(filters.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('부분 조회의 선택 상태0은 기존1000건 경고와 함께 보여요', () => {
    arrange({ data: { items, truncated: true } });
    render(<RegistrationsTab tournamentId="tournament-qa" canWrite showToast={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '대기' }));
    expect(screen.getByText('선택한 상태의 신청이 없어요')).toBeInTheDocument();
    expect(screen.getByText(/신청이 1,000건을 넘어 일부만 불러왔어요/)).toBeInTheDocument();
    expect(screen.queryByText('아직 신청한 팀이 없어요.')).not.toBeInTheDocument();
  });

  it('로딩은 필터 빈 결과로 표시하지 않아요', () => {
    arrange({ data: undefined, isPending: true });
    render(<RegistrationsTab tournamentId="tournament-qa" canWrite showToast={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '대기' }));
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByText('선택한 상태의 신청이 없어요')).not.toBeInTheDocument();
    expect(screen.queryByText('아직 신청한 팀이 없어요.')).not.toBeInTheDocument();
  });

  it('API 오류→재조회→정상 빈 결과를 구분하고 선택 상태를 유지해요', () => {
    arrange({ data: undefined, isError: true, error: new Error('신청 조회 실패') });
    const view = render(<RegistrationsTab tournamentId="tournament-qa" canWrite showToast={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '대기' }));
    expect(screen.getByText('신청 조회 실패')).toBeInTheDocument();
    expect(screen.queryByText('선택한 상태의 신청이 없어요')).not.toBeInTheDocument();
    expect(screen.queryByText('아직 신청한 팀이 없어요.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(refetch).toHaveBeenCalledTimes(1);
    arrange();
    view.rerender(<RegistrationsTab tournamentId="tournament-qa" canWrite showToast={vi.fn()} />);
    expect(screen.queryByText('신청 조회 실패')).not.toBeInTheDocument();
    expect(screen.getByText('선택한 상태의 신청이 없어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '대기' })).toHaveAttribute('aria-pressed', 'true');
    expect(mutate).not.toHaveBeenCalled();
  });
});

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
   * 행 액션의 "거부" 버튼. 모달·토스트와 같은 말을 쓴다 — 위쪽 상태 필터 칩의 "취소" 는
   * **신청 상태 이름**이라 다른 뜻이고, 그래서 이름 충돌도 사라졌다.
   */
  function openCancelModal() {
    // 모달이 열리면 그 안에도 "거부" 가 생긴다 — **열기 전에** 하나뿐일 때 잡는다.
    const buttons = screen.getAllByRole('button', { name: '거부' });
    if (buttons.length !== 1) throw new Error(`행 액션 "거부" 가 ${buttons.length}개다`);
    return buttons[0];
  }

  it('리그: 사유가 비어 있으면 요청을 보내지 않고 이유를 말한다', () => {
    const { cancelMutate } = arrange();
    render(
      <RegistrationsTab tournamentId="league-1" showToast={showToast} canWrite requireCancelReason />,
    );
    fireEvent.click(openCancelModal());
    const submit = screen.getAllByRole('button', { name: '거부' }).at(-1);
    if (submit === undefined) throw new Error('모달의 거부 버튼을 찾지 못했다');
    fireEvent.click(submit);

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
    const submit = screen.getAllByRole('button', { name: '거부' }).at(-1);
    if (submit === undefined) throw new Error('모달의 거부 버튼을 찾지 못했다');
    fireEvent.click(submit);

    expect(cancelMutate).toHaveBeenCalledWith(
      { registrationId: 'reg-1', reason: '정원 초과' },
      expect.anything(),
    );
    // 결과 문구도 모달 제목("신청 거부")과 같은 말을 쓴다 — "취소" 로 알리면 팀이 스스로
    // 취소한 것과 운영자가 거부한 것이 같은 말이 된다.
    const onSuccess = (cancelMutate.mock.calls[0][1] as { onSuccess: () => void }).onSuccess;
    act(() => onSuccess());
    expect(showToast).toHaveBeenCalledWith('거부했어요.', 'success');
  });

  it('대회: 사유 없이도 보낼 수 있다 — 기존 계약을 바꾸지 않는다', () => {
    const { cancelMutate } = arrange();
    render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite />);
    fireEvent.click(openCancelModal());
    const submit = screen.getAllByRole('button', { name: '거부' }).at(-1);
    if (submit === undefined) throw new Error('모달의 거부 버튼을 찾지 못했다');
    fireEvent.click(submit);

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

describe('RegistrationsTab — 경기별 명단 펼침 (Task 179)', () => {
  const showToast = vi.fn();

  afterEach(() => vi.clearAllMocks());

  function arrange(items: V1AdminTournamentRegistration[]) {
    for (const hook of [
      useV1ConfirmPaymentMock,
      useV1ConfirmRegistrationMock,
      useV1CancelRegistrationAdminMock,
      useV1RejectCancelRequestMock,
      useV1RosterLockMock,
      useV1RosterUnlockMock,
      useV1ExportRosterCsvMock,
      useV1RosterDeadlineOverrideGrantMock,
      useV1RosterDeadlineOverrideRevokeMock,
      useV1UpdatePlayerEligibilityMock,
      useV1AdminAddPlayerMock,
      useV1AdminRemovePlayerMock,
    ] as const) {
      (hook as unknown as { mockReturnValue: (value: unknown) => void }).mockReturnValue(noopMutationHook());
    }
    useV1AdminTournamentPlayersMock.mockReturnValue({
      data: { players: [], belowMinimum: false },
      isPending: false,
    } as unknown as ReturnType<typeof useV1AdminTournamentPlayers>);
    useV1AdminRosterEligibleMembersMock.mockReturnValue({ data: { members: [] }, isPending: false, isError: false } as unknown as ReturnType<typeof useV1AdminRosterEligibleMembers>);
    useV1AdminTournamentRegistrationsMock.mockReturnValue({
      data: { items },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1AdminTournamentRegistrations>);
  }

  it('확정 신청에만 버튼이 있고, 한 번에 한 팀만 펼치며 리그도 같은 결과 정정 경로를 넘긴다', () => {
    arrange([
      baseRegistration({ id: 'reg-1', teamName: '성수 FC' }),
      baseRegistration({ id: 'reg-2', teamId: 'team-2', teamName: '마포 FC' }),
      baseRegistration({ id: 'reg-3', teamId: 'team-3', teamName: '대기 FC', status: 'awaiting_payment', confirmedAt: null }),
    ]);
    render(<RegistrationsTab tournamentId="league-1" showToast={showToast} canWrite requireCancelReason />);

    const toggles = screen.getAllByRole('button', { name: '경기별 명단' });
    expect(toggles).toHaveLength(2);
    expect(screen.queryByTestId('game-rosters-panel')).not.toBeInTheDocument();

    fireEvent.click(toggles[0]);
    const panel = screen.getByTestId('game-rosters-panel');
    expect(panel).toHaveAttribute('data-registration-id', 'reg-1');
    expect(panel).toHaveAttribute('data-correction-href', '/admin/live/league-1/records/corrections');
    expect(screen.getByRole('button', { name: '경기별 명단 접기' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: '경기별 명단' }));
    expect(screen.getAllByTestId('game-rosters-panel')).toHaveLength(1);
    expect(screen.getByTestId('game-rosters-panel')).toHaveAttribute('data-registration-id', 'reg-2');

    fireEvent.click(screen.getByRole('button', { name: '경기별 명단 접기' }));
    expect(screen.queryByTestId('game-rosters-panel')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '경기별 명단' })).toHaveLength(2);
  });

  describe('저장 전 칸 변경이 있으면 펼침을 닫기 전에 묻는다', () => {
    function arrangeDirty() {
      arrange([
        baseRegistration({ id: 'reg-1', teamName: '성수 FC' }),
        baseRegistration({ id: 'reg-2', teamId: 'team-2', teamName: '마포 FC' }),
      ]);
      render(
        <>
          <RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite />
          <a href="/admin/tournaments/tournament-1/bracket">대진 탭</a>
        </>,
      );
      fireEvent.click(screen.getAllByRole('button', { name: '경기별 명단' })[0]);
      fireEvent.click(screen.getByRole('button', { name: '칸 바꾸기' }));
    }

    const panelId = () => screen.getByTestId('game-rosters-panel').getAttribute('data-registration-id');

    it('다른 팀을 펼치려 하면 확인창 — "계속 편집"이면 그대로, "버리기"면 넘어간다', async () => {
      arrangeDirty();
      fireEvent.click(screen.getByRole('button', { name: '경기별 명단' }));
      const dialog = await screen.findByRole('dialog', { name: '저장하지 않은 명단 변경이 있어요' });
      fireEvent.click(within(dialog).getByRole('button', { name: '계속 편집' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(panelId()).toBe('reg-1');

      fireEvent.click(screen.getByRole('button', { name: '경기별 명단' }));
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '버리기' }));
      await waitFor(() => expect(panelId()).toBe('reg-2'));
    });

    it('접기와 펼친 팀을 가리는 상태 필터도 먼저 묻는다', async () => {
      arrangeDirty();
      fireEvent.click(screen.getByRole('button', { name: '경기별 명단 접기' }));
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '계속 편집' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(panelId()).toBe('reg-1');

      fireEvent.click(screen.getByRole('button', { name: /입금 대기/ }));
      expect(await screen.findByRole('dialog', { name: '저장하지 않은 명단 변경이 있어요' })).toBeInTheDocument();
    });

    it('다른 화면으로 가는 링크는 미저장 변경 보호가 막는다', async () => {
      arrangeDirty();
      fireEvent.click(screen.getByRole('link', { name: '대진 탭' }));
      expect(await screen.findByRole('dialog', { name: '작성 중인 내용이 사라져요. 나갈까요?' })).toBeInTheDocument();
    });

    it('변경이 없으면 묻지 않고 바로 바꾼다', () => {
      arrange([
        baseRegistration({ id: 'reg-1', teamName: '성수 FC' }),
        baseRegistration({ id: 'reg-2', teamId: 'team-2', teamName: '마포 FC' }),
      ]);
      render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite />);
      fireEvent.click(screen.getAllByRole('button', { name: '경기별 명단' })[0]);
      fireEvent.click(screen.getByRole('button', { name: '경기별 명단' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(panelId()).toBe('reg-2');
    });
  });
});

describe('RegistrationsTab — 전체 명단 CSV', () => {
  const showToast = vi.fn();

  afterEach(() => vi.clearAllMocks());

  function arrange(items: V1AdminTournamentRegistration[], mutate = vi.fn()) {
    for (const hook of [
      useV1ConfirmPaymentMock,
      useV1ConfirmRegistrationMock,
      useV1CancelRegistrationAdminMock,
      useV1RejectCancelRequestMock,
      useV1RosterLockMock,
      useV1RosterUnlockMock,
      useV1ExportRosterCsvMock,
      useV1RosterDeadlineOverrideGrantMock,
      useV1RosterDeadlineOverrideRevokeMock,
      useV1UpdatePlayerEligibilityMock,
      useV1AdminAddPlayerMock,
      useV1AdminRemovePlayerMock,
    ] as const) {
      (hook as unknown as { mockReturnValue: (value: unknown) => void }).mockReturnValue(noopMutationHook());
    }
    useV1ExportTournamentRosterCsvMock.mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useV1ExportTournamentRosterCsv>);
    useV1AdminTournamentPlayersMock.mockReturnValue({
      data: { players: [], belowMinimum: false },
      isPending: false,
    } as unknown as ReturnType<typeof useV1AdminTournamentPlayers>);
    useV1AdminRosterEligibleMembersMock.mockReturnValue({ data: { members: [] }, isPending: false, isError: false } as unknown as ReturnType<typeof useV1AdminRosterEligibleMembers>);
    useV1AdminTournamentRegistrationsMock.mockReturnValue({
      data: { items },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1AdminTournamentRegistrations>);
  }

  it('조회 전용 어드민도 받는다 — 대회 id 로 한 번 요청하고, 엑셀용 BOM 을 붙여 저장한다', async () => {
    const mutate = vi.fn((_: undefined, opts: { onSuccess: (res: { filename: string; csv: string }) => void }) =>
      opts.onSuccess({ filename: 'players_가을컵_all_tourname.csv', csv: 'teamName\n번개팀' }),
    );
    arrange([baseRegistration(), baseRegistration({ id: 'reg-2' })], mutate);
    let saved: Blob | undefined;
    const createObjectURL = vi.fn((blob: Blob) => {
      saved = blob;
      return 'blob:csv';
    });
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite={false} />);
    // 행마다 있는 팀별 CSV 와 별개로, 탭에 하나만 있다.
    expect(screen.getAllByRole('button', { name: 'CSV' })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '전체 명단 CSV' }));

    expect(useV1ExportTournamentRosterCsvMock).toHaveBeenCalledWith('tournament-1');
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    // jsdom Blob 은 fetch Response 가 못 읽는다("[object Blob]" 으로 문자열화) — FileReader 로 바이트를 본다.
    const bytes = await new Promise<Uint8Array>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.readAsArrayBuffer(saved as Blob);
    });
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(showToast).toHaveBeenCalledWith('CSV를 다운로드했어요.', 'success');
    click.mockRestore();
  });

  it('신청이 없으면 비활성 — 헤더만 있는 빈 파일을 받지 않게', () => {
    const mutate = vi.fn();
    arrange([], mutate);

    render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite />);
    const button = screen.getByRole('button', { name: '전체 명단 CSV' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mutate).not.toHaveBeenCalled();
  });
});

describe('RegistrationsTab — 신청 행의 팀별 금액', () => {
  it('각 행은 자기 신청의 payment.amount 를 그린다 — 다른 행의 금액이나 현재 참가비가 아니다', () => {
    const pay = (amount: number) => ({ method: 'bank_transfer', status: 'ready', amount }) as unknown as V1AdminTournamentRegistration['payment'];
    const mutate = vi.fn();
    for (const hook of [useV1ConfirmPaymentMock, useV1ConfirmRegistrationMock, useV1CancelRegistrationAdminMock,
      useV1RejectCancelRequestMock, useV1RosterLockMock, useV1RosterUnlockMock, useV1ExportRosterCsvMock,
      useV1ExportTournamentRosterCsvMock, useV1RosterDeadlineOverrideGrantMock, useV1RosterDeadlineOverrideRevokeMock,
      useV1UpdatePlayerEligibilityMock, useV1AdminAddPlayerMock, useV1AdminRemovePlayerMock] as const) {
      (hook as unknown as { mockReturnValue: (value: unknown) => void }).mockReturnValue({ mutate, isPending: false });
    }
    useV1AdminTournamentPlayersMock.mockReturnValue({ data: { players: [] }, isPending: false, isError: false } as unknown as ReturnType<typeof useV1AdminTournamentPlayers>);
    useV1AdminRosterEligibleMembersMock.mockReturnValue({ data: { members: [] }, isPending: false, isError: false } as unknown as ReturnType<typeof useV1AdminRosterEligibleMembers>);
    const items = [
      baseRegistration({ id: 'reg-a', teamName: '전 금액 FC', payment: pay(70000) }),
      baseRegistration({ id: 'reg-b', teamId: 'team-b', teamName: '후 금액 FC', payment: pay(80000) }),
    ];
    useV1AdminTournamentRegistrationsMock.mockReturnValue({ data: { items, truncated: false }, isPending: false, isError: false, error: null, refetch: vi.fn() } as unknown as ReturnType<typeof useV1AdminTournamentRegistrations>);
    render(<RegistrationsTab tournamentId="league-1" canWrite requireCancelReason showToast={vi.fn()} />);
    const [rowA, rowB] = screen.getAllByRole('listitem');
    expect(rowA).toHaveTextContent('전 금액 FC');
    expect(rowA).toHaveTextContent('70,000');
    expect(rowA).not.toHaveTextContent('80,000');
    expect(rowB).toHaveTextContent('80,000');
    expect(rowB).not.toHaveTextContent('70,000');
  });
});

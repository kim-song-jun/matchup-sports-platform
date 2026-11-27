import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render as renderWithProviders, screen, waitFor, within } from '@testing-library/react';
import type { PropsWithChildren, ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1QueryClient } from '@/lib/query-client';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import { installViewport } from '@/test/viewport';
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

const clients: QueryClient[] = [];

function render(ui: ReactElement) {
  const client = createV1QueryClient();
  clients.push(client);
  return renderWithProviders(ui, {
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

// 폭이 갈리는 부품(⋯ 메뉴·취소 처리·골라서 처리)은 데스크톱(1280)이 기본이고, 폰은 테스트가 따로 고른다.
let restoreViewport: () => void;

beforeEach(() => {
  restoreViewport = installViewport(1280);
});

afterEach(() => {
  cleanup();
  restoreViewport();
  __resetOverlayHistoryForTests();
  clients.splice(0).forEach((client) => client.clear());
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/tournaments/tournament-1/registrations',
  useRouter: () => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

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
  // 확정 팀 머리의 버튼 — 기존 describe 들이 따로 세팅하지 않아도 렌더되게 기본값을 준다.
  useV1ExportTournamentRosterCsv: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useV1AdminTournamentPlayers: vi.fn(),
  useV1UpdatePlayerEligibility: vi.fn(),
  useV1CarryOverPlayerEligibility: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
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

function noopMutationHook<T>(): T {
  return { mutate: vi.fn(), isPending: false } as unknown as T;
}

/** 모든 변경 훅을 아무것도 안 하는 mutation 으로 깔고, 신청 목록과 명단 창이 쓰는 조회 훅을 채운다. */
function arrangeAll(items: V1AdminTournamentRegistration[], query: Record<string, unknown> = {}) {
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
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useV1AdminTournamentPlayers>);
  useV1AdminRosterEligibleMembersMock.mockReturnValue({ data: { members: [] }, isPending: false, isError: false } as unknown as ReturnType<typeof useV1AdminRosterEligibleMembers>);
  useV1AdminTournamentRegistrationsMock.mockReturnValue({
    data: { items, truncated: false },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...query,
  } as unknown as ReturnType<typeof useV1AdminTournamentRegistrations>);
}

/** 신청 행의 ⋯ 를 열어 메뉴를 돌려준다. 같은 이름의 팀이 둘이면 첫 번째. */
function openMenuOf(team: string) {
  fireEvent.click(screen.getAllByRole('button', { name: `${team} 더보기` })[0]);
  return screen.getByRole('menu', { name: team });
}

const menuItem = (menu: HTMLElement, label: string) => within(menu).getByRole('menuitem', { name: new RegExp(`^${label}`) });

describe('RegistrationsTab — 묶음과 상태', () => {
  const mutate = vi.fn();
  const refetch = vi.fn();

  /** 신청을 바꾸는 mutation 셋은 같은 mutate 하나로 묶어, 어느 길로도 호출되지 않았음을 한 번에 본다. */
  function arrange(items: V1AdminTournamentRegistration[], query: Record<string, unknown> = {}) {
    arrangeAll(items, { refetch, ...query });
    for (const hook of [useV1ConfirmRegistrationMock, useV1ConfirmPaymentMock, useV1CancelRegistrationAdminMock]) {
      (hook as unknown as { mockReturnValue: (value: unknown) => void }).mockReturnValue({ mutate, isPending: false });
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    arrange([baseRegistration({ id: 'reg-alpha', teamName: '합성 A팀' })]);
  });

  it('신청 9개 상태가 처리할 것·확정·대기·취소·작성 중 어디에도 빠지지 않고 한 번씩만 나온다', () => {
    const statuses = ['submitted', 'awaiting_payment', 'payment_checking', 'paid', 'cancel_requested', 'confirmed', 'waitlisted', 'cancelled', 'draft'] as const;
    arrange(statuses.map((status) => baseRegistration({ id: `r-${status}`, teamId: `t-${status}`, teamName: `팀-${status}`, status })));
    render(<RegistrationsTab tournamentId="tournament-qa" canWrite tournamentTeamCount={8} showToast={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /처리할 것/ })).toHaveTextContent('5건');
    expect(screen.getByRole('heading', { name: /확정 팀/ })).toHaveTextContent('1 / 8팀');
    const waitlistCancelled = screen.getByRole('button', { name: /대기·취소/ });
    const drafts = screen.getByRole('button', { name: /작성 중/ });
    expect(waitlistCancelled).toHaveTextContent('2');
    expect(drafts).toHaveTextContent('작성 중 1');
    expect(waitlistCancelled).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('팀-waitlisted')).toBeNull();

    fireEvent.click(waitlistCancelled);
    fireEvent.click(drafts);
    for (const status of statuses) expect(screen.getAllByText(`팀-${status}`)).toHaveLength(1);
  });

  it('상태 칩과 처리 대기 배너는 없다 — 처리할 것 머리 한 곳에서만 센다', () => {
    arrange([baseRegistration({ status: 'payment_checking' }), baseRegistration({ id: 'r2', status: 'cancel_requested' })]);
    render(<RegistrationsTab tournamentId="tournament-qa" canWrite showToast={vi.fn()} />);
    expect(screen.queryByRole('group', { name: '신청 상태 필터' })).toBeNull();
    expect(screen.queryByText(/처리 대기 중인 신청이/)).toBeNull();
    expect(screen.getByRole('heading', { name: /처리할 것/ })).toHaveTextContent('2건');
  });

  it('종료·취소된 대회에서는 확정과 대기로 두기를 비활성화한다', () => {
    arrange([baseRegistration({ status: 'payment_checking' })]);
    const reason = '종료·취소된 대회에서는 참가 확정·대기 처리를 할 수 없어요.';
    render(<RegistrationsTab tournamentId="tournament-qa" canWrite admissionsBlockedReason={reason} showToast={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent(reason);
    const confirm = screen.getByRole('button', { name: '확정' });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    const waitlist = menuItem(openMenuOf('테스트 FC'), '대기로 두기');
    expect(waitlist).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(waitlist);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('신청이 하나도 없으면 빈 안내만 보이고 전체 명단 CSV 는 없다', () => {
    arrange([]);
    render(<RegistrationsTab tournamentId="tournament-qa" canWrite showToast={vi.fn()} />);
    expect(screen.getByText('신청이 없어요')).toBeInTheDocument();
    expect(screen.getByText('아직 신청한 팀이 없어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '전체 명단 CSV' })).toBeNull();
    expect(screen.queryByRole('heading', { name: /처리할 것/ })).toBeNull();
  });

  it('부분 조회는 1,000건 경고와 함께 묶음을 보여요', () => {
    arrange([baseRegistration()], { data: { items: [baseRegistration()], truncated: true } });
    render(<RegistrationsTab tournamentId="tournament-qa" canWrite showToast={vi.fn()} />);
    expect(screen.getByText(/신청이 1,000건을 넘어 일부만 불러왔어요/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /확정 팀/ })).toBeInTheDocument();
  });

  it('로딩은 빈 안내로 표시하지 않아요', () => {
    arrange([], { data: undefined, isPending: true });
    render(<RegistrationsTab tournamentId="tournament-qa" canWrite showToast={vi.fn()} />);
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByText('신청이 없어요')).toBeNull();
    expect(screen.queryByText('아직 신청한 팀이 없어요.')).toBeNull();
  });

  it('API 오류→다시 시도→정상 목록을 구분해요', () => {
    arrange([], { data: undefined, isError: true, error: new Error('신청 조회 실패') });
    const view = render(<RegistrationsTab tournamentId="tournament-qa" canWrite showToast={vi.fn()} />);
    expect(screen.getByText('신청 조회 실패')).toBeInTheDocument();
    expect(screen.queryByText('아직 신청한 팀이 없어요.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(refetch).toHaveBeenCalledTimes(1);

    arrange([baseRegistration({ teamName: '복구 FC' })]);
    view.rerender(<RegistrationsTab tournamentId="tournament-qa" canWrite showToast={vi.fn()} />);
    expect(screen.queryByText('신청 조회 실패')).toBeNull();
    expect(screen.getByText('복구 FC')).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });
});

describe('RegistrationsTab — 명단 보기 창 안의 잠금과 마감 예외', () => {
  const showToast = vi.fn();

  afterEach(() => {
    vi.clearAllMocks();
  });

  beforeEach(() => {
    arrangeAll([baseRegistration()]);
  });

  function lockedList() {
    return [baseRegistration({ rosterLockedAt: '2026-08-01T00:00:00.000Z' })];
  }

  it('조회 전용 어드민에게는 변경 버튼이 하나도 없고 명단 보기·CSV·경기별 명단은 남는다', () => {
    arrangeAll([
      baseRegistration({ teamName: '확정 FC' }),
      baseRegistration({ id: 'reg-2', teamId: 'team-2', teamName: '취소요청 FC', status: 'cancel_requested' }),
      baseRegistration({ id: 'reg-3', teamId: 'team-3', teamName: '확인 FC', status: 'payment_checking' }),
    ]);
    render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite={false} />);

    for (const name of ['명단 잠금', '마감 예외 허용', '취소 처리', '취소 승인', '참가 유지', '골라서 처리', '확정', '입금 확인']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryByRole('checkbox')).toBeNull();
    // 확정 팀 줄 + 처리할 것 두 줄이 모두 「명단 보기」 하나를 가진다.
    expect(screen.getAllByRole('button', { name: '명단 보기' })).toHaveLength(3);

    const menu = openMenuOf('확정 FC');
    expect(menuItem(menu, '경기별 명단')).toBeInTheDocument();
    expect(menuItem(menu, '명단 CSV 받기')).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /^신청 거부/ })).toBeNull();
  });

  it('조회 전용이면 명단 보기 창에도 잠금 조작이 없다', () => {
    arrangeAll(lockedList());
    render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite={false} rosterDeadlineAt="2099-10-01T00:00:00.000Z" />);
    fireEvent.click(screen.getByRole('button', { name: '명단 보기' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: /잠금|예외/ })).toBeNull();
  });

  it('명단 보기 창 안에서 명단을 잠그고, 목록이 다시 오면 같은 창이 잠금 해제로 바뀐다', () => {
    const lockMutate = vi.fn();
    useV1RosterLockMock.mockReturnValue({ mutate: lockMutate, isPending: false } as unknown as ReturnType<typeof useV1RosterLock>);
    const view = render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite rosterDeadlineAt="2099-10-01T00:00:00.000Z" />);

    fireEvent.click(screen.getByRole('button', { name: '명단 보기' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '명단 잠금' }));
    expect(lockMutate).toHaveBeenCalledWith({ registrationId: 'reg-1' }, expect.anything());

    arrangeAll(lockedList());
    useV1RosterLockMock.mockReturnValue({ mutate: lockMutate, isPending: false } as unknown as ReturnType<typeof useV1RosterLock>);
    view.rerender(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite rosterDeadlineAt="2099-10-01T00:00:00.000Z" />);
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: '잠금 해제' })).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: '명단 잠금' })).toBeNull();
    expect(screen.getByText('잠김')).toBeInTheDocument();
  });

  it('창을 연 신청이 목록에서 사라지면 창이 닫힌다', () => {
    arrangeAll([baseRegistration(), baseRegistration({ id: 'reg-2', teamId: 'team-2', teamName: '남는 FC' })]);
    const view = render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite />);
    fireEvent.click(screen.getAllByRole('button', { name: '명단 보기' })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    arrangeAll([baseRegistration({ id: 'reg-2', teamId: 'team-2', teamName: '남는 FC' })]);
    view.rerender(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('남는 FC')).toBeInTheDocument();
  });

  it('리그(정원·명단 마감 없음)는 팀 수만 말하고 막대가 없으며 창에도 마감 예외 허용이 없다', () => {
    arrangeAll([baseRegistration()]);
    render(<RegistrationsTab tournamentId="league-1" showToast={showToast} canWrite requireCancelReason />);
    expect(screen.getByRole('heading', { name: /확정 팀/ })).toHaveTextContent('1팀');
    expect(screen.getByRole('heading', { name: /확정 팀/ })).not.toHaveTextContent('/');
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText('정원이 다 찼어요')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '명단 보기' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: '명단 잠금' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '마감 예외 허용' })).toBeNull();
  });

  // 정원 초과 상태에서 확인창이 "대기 처리될 수 있어요"라고 안내하고 확인 버튼은 confirm 만 보내 서버가 409 로 거절한 적이 있다.
  // 정원 초과 시에는 버튼 라벨 자체가 "대기로 처리"로 바뀌고, 그 라벨대로 waitlist 결정을 보낸다.
  it('정원 초과 확정은 「대기로 처리」를 내고 decision=waitlist 를 보낸다', async () => {
    const confirmMutate = vi.fn();
    arrangeAll([
      baseRegistration({ id: 'reg-1', status: 'payment_checking', confirmedAt: null }),
      // 이미 확정된 1팀 + 정원 1팀 = 이 신청을 확정하면 정원 초과.
      baseRegistration({ id: 'reg-already-confirmed', teamId: 'team-2', teamName: '먼저 확정 FC', status: 'confirmed' }),
    ]);
    useV1ConfirmRegistrationMock.mockReturnValue({ mutate: confirmMutate, isPending: false } as unknown as ReturnType<typeof useV1ConfirmRegistration>);

    render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite tournamentTeamCount={1} />);
    fireEvent.click(screen.getByRole('button', { name: '확정' }));

    expect(await screen.findByText(/정원을 초과해 확정할 수 없어요/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '대기로 처리' }));
    await waitFor(() =>
      expect(confirmMutate).toHaveBeenCalledWith(
        { registrationId: 'reg-1', decision: 'waitlist' },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      ),
    );
  });

  it('정원 안이면 확정 확인창이 현재 팀 수를 알리고 decision=confirm 을 보낸다', async () => {
    const confirmMutate = vi.fn();
    arrangeAll([baseRegistration({ id: 'reg-1', status: 'paid', confirmedAt: null })]);
    useV1ConfirmRegistrationMock.mockReturnValue({ mutate: confirmMutate, isPending: false } as unknown as ReturnType<typeof useV1ConfirmRegistration>);

    render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite tournamentTeamCount={8} />);
    fireEvent.click(screen.getByRole('button', { name: '확정' }));
    expect(await screen.findByText('현재 0/8팀 확정 — 이 팀을 확정하면 1/8팀이 돼요.')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '확정' }));
    await waitFor(() =>
      expect(confirmMutate).toHaveBeenCalledWith({ registrationId: 'reg-1', decision: 'confirm' }, expect.anything()),
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
    const rejectMutate = vi.fn();
    arrangeAll([baseRegistration(overrides)]);
    useV1CancelRegistrationAdminMock.mockReturnValue({
      mutate: cancelMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useV1CancelRegistrationAdmin>);
    useV1RejectCancelRequestMock.mockReturnValue({
      mutate: rejectMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useV1RejectCancelRequest>);
    return { cancelMutate, rejectMutate };
  }

  /** 행 ⋯ 메뉴의 「신청 거부」 로 사유 창을 연다 — 창의 제출 버튼은 이름이 「거부」 하나다. */
  function openRejectModal() {
    fireEvent.click(menuItem(openMenuOf('테스트 FC'), '신청 거부'));
    return within(screen.getByRole('dialog'));
  }

  it('리그: 사유가 비어 있으면 요청을 보내지 않고 이유를 말한다', () => {
    const { cancelMutate } = arrange();
    render(<RegistrationsTab tournamentId="league-1" showToast={showToast} canWrite requireCancelReason />);
    fireEvent.click(openRejectModal().getByRole('button', { name: '거부' }));

    expect(cancelMutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('리그 참가를 거부하려면 사유를 입력해 주세요.');
  });

  it('리그: 사유를 적으면 payload 에 실려 나간다 — 이게 없어서 늘 400 이었다', () => {
    const { cancelMutate } = arrange();
    render(<RegistrationsTab tournamentId="league-1" showToast={showToast} canWrite requireCancelReason />);
    const modal = openRejectModal();
    fireEvent.change(screen.getByLabelText('사유'), { target: { value: '정원 초과' } });
    fireEvent.click(modal.getByRole('button', { name: '거부' }));

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
    render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite rosterDeadlineAt="2099-10-01T00:00:00.000Z" />);
    fireEvent.click(openRejectModal().getByRole('button', { name: '거부' }));

    // 빈 사유는 **키 자체를 빼고** 보낸다 — 서버가 빈 문자열을 어드민 사유로 그대로 저장한다.
    expect(cancelMutate).toHaveBeenCalledWith({ registrationId: 'reg-1' }, expect.anything());
  });

  describe('팀의 취소 요청 처리', () => {
    const requested = {
      status: 'cancel_requested' as const,
      cancelPreviousStatus: 'confirmed',
      cancelRequestedAt: '2026-10-10T00:00:00.000Z',
      cancelReason: '선수 부족으로 불참',
    };

    /** 「취소 처리」 를 열어 두 선택지 중 하나를 고른다. */
    function chooseCancelOption(name: '취소 승인' | '참가 유지') {
      fireEvent.click(screen.getByRole('button', { name: '취소 처리' }));
      fireEvent.click(screen.getByRole('button', { name }));
    }

    it('취소 요청에는 「거부」 항목 없이 「취소 처리」 한 버튼만 있고, 눌러야 두 선택지가 나온다', () => {
      arrange(requested);
      render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite rosterDeadlineAt="2099-10-01T00:00:00.000Z" />);

      expect(screen.queryByRole('button', { name: '거부' })).toBeNull();
      expect(within(openMenuOf('테스트 FC')).queryByRole('menuitem', { name: /^신청 거부/ })).toBeNull();
      expect(screen.queryByRole('button', { name: '취소 승인' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: '취소 처리' }));
      expect(screen.getByRole('button', { name: '취소 승인' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '참가 유지' })).toBeInTheDocument();
    });

    it('취소 승인을 고르면 승인 문구와 팀 사유가 든 창이 열린다', () => {
      arrange(requested);
      render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite rosterDeadlineAt="2099-10-01T00:00:00.000Z" />);
      chooseCancelOption('취소 승인');

      expect(screen.getByRole('dialog')).toHaveTextContent('참가 취소 요청을 승인할까요?');
      expect(screen.getByRole('dialog')).not.toHaveTextContent('신청을 거부할까요?');
      expect(screen.getByRole('dialog')).toHaveTextContent('선수 부족으로 불참');
    });

    it('승인은 팀 사유를 건드리지 않고 운영진 사유만 실어 보내며, 결과 문구도 승인이다', () => {
      const { cancelMutate } = arrange(requested);
      render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite rosterDeadlineAt="2099-10-01T00:00:00.000Z" />);
      chooseCancelOption('취소 승인');
      fireEvent.change(screen.getByLabelText(/운영진 사유/), { target: { value: '환불 안내함' } });
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소 승인' }));

      expect(cancelMutate).toHaveBeenCalledWith({ registrationId: 'reg-1', reason: '환불 안내함' }, expect.anything());
      const onSuccess = (cancelMutate.mock.calls[0][1] as { onSuccess: () => void }).onSuccess;
      act(() => onSuccess());
      expect(showToast).toHaveBeenCalledWith('취소를 승인했어요.', 'success');
    });

    it('리그라도 취소 요청의 승인은 사유 없이 보낼 수 있다 (거부는 여전히 필수)', () => {
      const { cancelMutate } = arrange(requested);
      render(<RegistrationsTab tournamentId="league-1" showToast={showToast} canWrite requireCancelReason />);
      chooseCancelOption('취소 승인');
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소 승인' }));

      expect(cancelMutate).toHaveBeenCalledWith({ registrationId: 'reg-1' }, expect.anything());
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('참가 유지는 확인 창을 거쳐 취소 요청을 거절한다', async () => {
      const { rejectMutate, cancelMutate } = arrange(requested);
      render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite rosterDeadlineAt="2099-10-01T00:00:00.000Z" />);
      chooseCancelOption('참가 유지');

      const dialog = await screen.findByRole('dialog', { name: '참가 유지' });
      expect(dialog).toHaveTextContent('취소 요청을 거절하고 이전 상태로 돌릴까요?');
      fireEvent.click(within(dialog).getByRole('button', { name: '참가 유지하기' }));

      await waitFor(() => expect(rejectMutate).toHaveBeenCalledWith({ registrationId: 'reg-1' }, expect.anything()));
      expect(cancelMutate).not.toHaveBeenCalled();
      const onSuccess = (rejectMutate.mock.calls[0][1] as { onSuccess: () => void }).onSuccess;
      act(() => onSuccess());
      expect(showToast).toHaveBeenCalledWith('참가를 유지했어요.', 'success');
    });

    it('폰: 취소 처리는 아래 시트에서 고르고 사유를 적어 승인한다 — 따로 뜨는 사유 창이 없다', () => {
      restoreViewport();
      restoreViewport = installViewport(390);
      const { cancelMutate } = arrange(requested);
      render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite rosterDeadlineAt="2099-10-01T00:00:00.000Z" />);

      fireEvent.click(screen.getByRole('button', { name: '취소 처리' }));
      const sheet = screen.getByRole('dialog', { name: '테스트 FC 취소 요청' });
      fireEvent.click(within(sheet).getByRole('radio', { name: '취소 승인' }));
      fireEvent.change(within(sheet).getByLabelText('운영진 사유 (선택)'), { target: { value: '환불 안내함' } });
      fireEvent.click(within(sheet).getByRole('button', { name: '취소 승인하기' }));

      expect(cancelMutate).toHaveBeenCalledWith({ registrationId: 'reg-1', reason: '환불 안내함' }, expect.anything());
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
    });

    it('폰: 참가 유지하기는 확인 창 없이 거절을 보내고 시트가 닫힌다', () => {
      restoreViewport();
      restoreViewport = installViewport(390);
      const { rejectMutate } = arrange(requested);
      render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite rosterDeadlineAt="2099-10-01T00:00:00.000Z" />);

      fireEvent.click(screen.getByRole('button', { name: '취소 처리' }));
      const sheet = screen.getByRole('dialog', { name: '테스트 FC 취소 요청' });
      fireEvent.click(within(sheet).getByRole('radio', { name: '참가 유지' }));
      fireEvent.click(within(sheet).getByRole('button', { name: '참가 유지하기' }));

      expect(rejectMutate).toHaveBeenCalledWith({ registrationId: 'reg-1' }, expect.anything());
      const { onSuccess } = rejectMutate.mock.calls[0][1] as { onSuccess: () => void };
      act(() => onSuccess());
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(showToast).toHaveBeenCalledWith('참가를 유지했어요.', 'success');
    });

    it('폰: 거절이 실패하면 시트 안에 이유를 알림으로 보인다', () => {
      restoreViewport();
      restoreViewport = installViewport(390);
      const { rejectMutate } = arrange(requested);
      render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite rosterDeadlineAt="2099-10-01T00:00:00.000Z" />);

      fireEvent.click(screen.getByRole('button', { name: '취소 처리' }));
      const sheet = screen.getByRole('dialog', { name: '테스트 FC 취소 요청' });
      fireEvent.click(within(sheet).getByRole('radio', { name: '참가 유지' }));
      fireEvent.click(within(sheet).getByRole('button', { name: '참가 유지하기' }));
      const { onError } = rejectMutate.mock.calls[0][1] as { onError: (err: unknown) => void };
      act(() => onError({ displayableMessage: false }));

      expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('참가 유지 처리에 실패했어요.');
    });
  });

  describe('처리된 신청의 표시', () => {
    function expandWaitlistCancelled() {
      fireEvent.click(screen.getByRole('button', { name: /대기·취소/ }));
    }

    it('팀 사유와 운영진 사유를 따로 보여 주고, 승인과 거부를 다른 상태 이름으로 구분한다', () => {
      arrange({
        status: 'cancelled',
        cancelRequestedAt: '2026-10-10T00:00:00.000Z',
        cancelReason: '선수 부족으로 불참',
        adminCancelReason: '환불 안내함',
        cancelOutcome: 'approved',
      });
      const { unmount } = render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite rosterDeadlineAt="2099-10-01T00:00:00.000Z" />);
      expandWaitlistCancelled();
      expect(screen.getByText('팀 취소 사유: 선수 부족으로 불참')).toBeInTheDocument();
      expect(screen.getByText('운영진 사유: 환불 안내함')).toBeInTheDocument();
      expect(screen.getByText('취소 승인됨')).toBeInTheDocument();
      unmount();

      arrange({ status: 'cancelled', adminCancelReason: '자격 미달', cancelOutcome: 'rejected' });
      render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite rosterDeadlineAt="2099-10-01T00:00:00.000Z" />);
      expandWaitlistCancelled();
      expect(screen.getByText('거부됨')).toBeInTheDocument();
      expect(screen.queryByText('취소 승인됨')).toBeNull();
    });

    it('어드민이 처리하지 않은 취소(결과 없음)는 기존처럼 「취소됨」 으로 남는다', () => {
      arrange({ status: 'cancelled', cancelOutcome: null });
      render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite rosterDeadlineAt="2099-10-01T00:00:00.000Z" />);
      expandWaitlistCancelled();
      expect(screen.getByText('취소됨')).toBeInTheDocument();
      expect(screen.queryByText('취소 승인됨')).toBeNull();
      expect(screen.queryByText('거부됨')).toBeNull();
    });
  });

  it('자동 확정된 명단이면 그렇게 표시한다', () => {
    arrange({ rosterAutoConfirmedAt: '2026-09-01T00:00:00.000Z' });
    render(<RegistrationsTab tournamentId="league-1" showToast={showToast} canWrite requireCancelReason />);
    expect(screen.getByText(/자동 확정/)).toBeInTheDocument();
  });

  it('팀이 직접 낸 명단에는 자동 확정 표시가 없다', () => {
    arrange({ rosterAutoConfirmedAt: null });
    render(<RegistrationsTab tournamentId="league-1" showToast={showToast} canWrite requireCancelReason />);
    expect(screen.queryByText(/자동 확정/)).toBeNull();
  });
});

describe('RegistrationsTab — 경기별 명단 펼침 (Task 179)', () => {
  const showToast = vi.fn();

  afterEach(() => vi.clearAllMocks());

  it('확정 신청의 ⋯ 에만 항목이 있고, 한 번에 한 팀만 펼치며 리그도 같은 결과 정정 경로를 넘긴다', () => {
    arrangeAll([
      baseRegistration({ id: 'reg-1', teamName: '성수 FC' }),
      baseRegistration({ id: 'reg-2', teamId: 'team-2', teamName: '마포 FC' }),
      baseRegistration({ id: 'reg-3', teamId: 'team-3', teamName: '대기 FC', status: 'awaiting_payment', confirmedAt: null }),
    ]);
    render(<RegistrationsTab tournamentId="league-1" showToast={showToast} canWrite requireCancelReason />);

    expect(within(openMenuOf('대기 FC')).queryByRole('menuitem', { name: /^경기별 명단/ })).toBeNull();
    expect(screen.queryByTestId('game-rosters-panel')).toBeNull();

    fireEvent.click(menuItem(openMenuOf('성수 FC'), '경기별 명단'));
    const panel = screen.getByTestId('game-rosters-panel');
    expect(panel).toHaveAttribute('data-registration-id', 'reg-1');
    expect(panel).toHaveAttribute('data-correction-href', '/admin/live/league-1/records/corrections');
    expect(menuItem(openMenuOf('성수 FC'), '경기별 명단 접기')).toBeInTheDocument();

    fireEvent.click(menuItem(openMenuOf('마포 FC'), '경기별 명단'));
    expect(screen.getAllByTestId('game-rosters-panel')).toHaveLength(1);
    expect(screen.getByTestId('game-rosters-panel')).toHaveAttribute('data-registration-id', 'reg-2');

    fireEvent.click(menuItem(openMenuOf('마포 FC'), '경기별 명단 접기'));
    expect(screen.queryByTestId('game-rosters-panel')).toBeNull();
    expect(menuItem(openMenuOf('마포 FC'), '경기별 명단')).toBeInTheDocument();
  });

  describe('저장 전 칸 변경이 있으면 펼침을 닫기 전에 묻는다', () => {
    function arrangeDirty() {
      arrangeAll([
        baseRegistration({ id: 'reg-1', teamName: '성수 FC' }),
        baseRegistration({ id: 'reg-2', teamId: 'team-2', teamName: '마포 FC' }),
      ]);
      render(
        <>
          <RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite rosterDeadlineAt="2099-10-01T00:00:00.000Z" />
          <a href="/admin/tournaments/tournament-1/bracket">대진 탭</a>
        </>,
      );
      fireEvent.click(menuItem(openMenuOf('성수 FC'), '경기별 명단'));
      fireEvent.click(screen.getByRole('button', { name: '칸 바꾸기' }));
    }

    const panelId = () => screen.getByTestId('game-rosters-panel').getAttribute('data-registration-id');

    it('다른 팀을 펼치려 하면 확인창 — "계속 편집"이면 그대로, "버리기"면 넘어간다', async () => {
      arrangeDirty();
      fireEvent.click(menuItem(openMenuOf('마포 FC'), '경기별 명단'));
      const dialog = await screen.findByRole('dialog', { name: '저장하지 않은 명단 변경이 있어요' });
      fireEvent.click(within(dialog).getByRole('button', { name: '계속 편집' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(panelId()).toBe('reg-1');

      fireEvent.click(menuItem(openMenuOf('마포 FC'), '경기별 명단'));
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '버리기' }));
      await waitFor(() => expect(panelId()).toBe('reg-2'));
    });

    it('접기도 먼저 묻는다', async () => {
      arrangeDirty();
      fireEvent.click(menuItem(openMenuOf('성수 FC'), '경기별 명단 접기'));
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '계속 편집' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(panelId()).toBe('reg-1');
    });

    it('다른 화면으로 가는 링크는 미저장 변경 보호가 막는다', async () => {
      arrangeDirty();
      fireEvent.click(screen.getByRole('link', { name: '대진 탭' }));
      expect(await screen.findByRole('dialog', { name: '작성 중인 내용이 사라져요. 나갈까요?' })).toBeInTheDocument();
    });

    it('변경이 없으면 묻지 않고 바로 바꾼다', () => {
      arrangeAll([
        baseRegistration({ id: 'reg-1', teamName: '성수 FC' }),
        baseRegistration({ id: 'reg-2', teamId: 'team-2', teamName: '마포 FC' }),
      ]);
      render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite rosterDeadlineAt="2099-10-01T00:00:00.000Z" />);
      fireEvent.click(menuItem(openMenuOf('성수 FC'), '경기별 명단'));
      fireEvent.click(menuItem(openMenuOf('마포 FC'), '경기별 명단'));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(panelId()).toBe('reg-2');
    });
  });
});

describe('RegistrationsTab — 명단 CSV', () => {
  const showToast = vi.fn();

  afterEach(() => vi.clearAllMocks());

  it('조회 전용 어드민도 전체 명단을 받는다 — 대회 id 로 한 번 요청하고, 엑셀용 BOM 을 붙여 저장한다', async () => {
    const mutate = vi.fn((_: undefined, opts: { onSuccess: (res: { filename: string; csv: string }) => void }) =>
      opts.onSuccess({ filename: 'players_가을컵_all_tourname.csv', csv: 'teamName\n번개팀' }),
    );
    arrangeAll([baseRegistration(), baseRegistration({ id: 'reg-2' })]);
    useV1ExportTournamentRosterCsvMock.mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useV1ExportTournamentRosterCsv>);
    let saved: Blob | undefined;
    const createObjectURL = vi.fn((blob: Blob) => {
      saved = blob;
      return 'blob:csv';
    });
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite={false} />);
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

  it('팀별 CSV 는 ⋯ 메뉴에서 그 신청 id 로 받고, 실패하면 이유를 알린다', () => {
    arrangeAll([baseRegistration()]);
    const rowMutate = vi.fn();
    useV1ExportRosterCsvMock.mockReturnValue({ mutate: rowMutate, isPending: false } as unknown as ReturnType<typeof useV1ExportRosterCsv>);
    render(<RegistrationsTab tournamentId="tournament-1" showToast={showToast} canWrite={false} />);

    fireEvent.click(menuItem(openMenuOf('테스트 FC'), '명단 CSV 받기'));
    expect(useV1ExportRosterCsvMock).toHaveBeenCalledWith('reg-1');
    expect(rowMutate).toHaveBeenCalledTimes(1);
    const { onError } = rowMutate.mock.calls[0][1] as { onError: (err: unknown) => void };
    act(() => onError({ displayableMessage: false }));
    expect(showToast).toHaveBeenCalledWith('CSV 다운로드에 실패했어요.', 'error');
  });
});

describe('RegistrationsTab — 신청 행의 팀별 금액', () => {
  it('각 행은 자기 신청의 payment.amount 를 그린다 — 다른 행의 금액이나 현재 참가비가 아니다', () => {
    const pay = (amount: number) => ({ method: 'bank_transfer', status: 'ready', amount }) as unknown as V1AdminTournamentRegistration['payment'];
    arrangeAll([
      baseRegistration({ id: 'reg-a', teamName: '전 금액 FC', payment: pay(70000) }),
      baseRegistration({ id: 'reg-b', teamId: 'team-b', teamName: '후 금액 FC', payment: pay(80000) }),
    ]);
    render(<RegistrationsTab tournamentId="league-1" canWrite requireCancelReason showToast={vi.fn()} />);
    const rowA = screen.getByText('전 금액 FC').closest('li');
    const rowB = screen.getByText('후 금액 FC').closest('li');
    expect(rowA).toHaveTextContent('70,000');
    expect(rowA).not.toHaveTextContent('80,000');
    expect(rowB).toHaveTextContent('80,000');
    expect(rowB).not.toHaveTextContent('70,000');
  });
});

describe.each([
  { kind: '무료 대회', isFreeEntry: true, noun: '신청 확인', done: '신청을 확인했어요.', absentWord: '입금' },
  { kind: '유료 대회', isFreeEntry: false, noun: '입금 확인', done: '입금을 확인했어요.', absentWord: '신청 확인' },
])('RegistrationsTab — $kind의 확인 처리 문구', ({ isFreeEntry, noun, done, absentWord }) => {
  const showToast = vi.fn();
  const confirmMutate = vi.fn();
  const confirmMutateAsync = vi.fn();
  // 서버 메시지가 없는 V1ApiError 를 흉내 낸다 — 호출부의 기본 문구로 떨어지는 경로.
  const messagelessError = { displayableMessage: false };

  beforeEach(() => {
    vi.clearAllMocks();
    arrangeAll([baseRegistration({ id: 'reg-wait', teamName: '대기 FC', status: 'awaiting_payment', confirmedAt: null })]);
    useV1ConfirmPaymentMock.mockReturnValue({ mutate: confirmMutate, mutateAsync: confirmMutateAsync, isPending: false } as never);
  });

  const renderTab = () => render(<RegistrationsTab tournamentId="tournament-1" canWrite isFreeEntry={isFreeEntry} showToast={showToast} />);

  it(`카드 버튼과 결과 토스트가 "${noun}" 문구를 쓴다`, () => {
    renderTab();
    expect(document.body.textContent).not.toContain(absentWord);

    fireEvent.click(screen.getByRole('button', { name: noun }));

    expect(confirmMutate).toHaveBeenCalledWith({ registrationId: 'reg-wait' }, expect.anything());
    const { onSuccess, onError } = confirmMutate.mock.calls[0][1] as { onSuccess: () => void; onError: (err: unknown) => void };
    act(() => onSuccess());
    expect(showToast).toHaveBeenCalledWith(done, 'success');
    act(() => onError(messagelessError));
    expect(showToast).toHaveBeenCalledWith(`${noun}에 실패했어요.`, 'error');
  });

  it(`일괄 처리 버튼·확인창·결과 토스트가 "${noun}" 문구를 쓴다`, async () => {
    confirmMutateAsync.mockResolvedValueOnce(undefined);
    renderTab();
    fireEvent.click(screen.getByRole('checkbox', { name: '대기 FC 일괄 선택' }));
    fireEvent.click(screen.getByRole('button', { name: `선택한 1팀 ${noun}` }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(`일괄 ${noun}`);
    expect(dialog).toHaveTextContent(`선택한 1건을 ${noun} 처리할까요?`);
    expect(dialog.textContent).not.toContain(absentWord);
    fireEvent.click(within(dialog).getByRole('button', { name: noun }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(`1건 ${noun} 완료`, 'success'));
    expect(confirmMutateAsync).toHaveBeenCalledWith({ registrationId: 'reg-wait' });
  });

  it(`일괄 처리가 한 건 실패하면 팀 이름과 함께 "${noun}에 실패했어요." 로 알린다`, async () => {
    confirmMutateAsync.mockRejectedValueOnce(messagelessError);
    renderTab();
    fireEvent.click(screen.getByRole('checkbox', { name: '대기 FC 일괄 선택' }));
    fireEvent.click(screen.getByRole('button', { name: `선택한 1팀 ${noun}` }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: noun }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(`대기 FC ${noun}에 실패했어요.`, 'error'));
  });
});

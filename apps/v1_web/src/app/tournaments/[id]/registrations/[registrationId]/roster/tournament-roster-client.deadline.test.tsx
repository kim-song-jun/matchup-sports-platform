import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useV1AddPlayer,
  useV1Registration,
  useV1RemovePlayer,
  useV1TeamDetail,
  useV1Tournament,
  useV1TournamentPlayers,
  useV1UpdatePlayer,
  useV1UpdatePlayerJersey,
} from '@/hooks/use-v1-api';
import {
  TournamentRosterPageClient,
  getRosterDeadlineState,
  parseJerseyInput,
} from './tournament-roster-client';

vi.mock('@/components/v1-ui/shell', () => ({
  AppChrome: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// '내 신청으로 돌아가기' 링크의 from 을 검증하는 테스트만 override 한다.
let rosterSearchParams = new URLSearchParams();
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useSearchParams: () => rosterSearchParams,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1Tournament: vi.fn(),
  useV1Registration: vi.fn(),
  useV1TeamDetail: vi.fn(),
  useV1TournamentPlayers: vi.fn(),
  useV1AddPlayer: vi.fn(),
  useV1UpdatePlayer: vi.fn(),
  // 기본 반환을 준다 — 화면이 이제 `isPending` 도 읽으므로(중복 제출 방지),
  // `vi.fn()` 만 두면 이 mock 을 따로 세팅하지 않는 케이스가 `undefined.isPending` 으로 죽는다.
  useV1UpdatePlayerJersey: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useV1RemovePlayer: vi.fn(),
}));

const useV1TournamentMock = vi.mocked(useV1Tournament);
const useV1RegistrationMock = vi.mocked(useV1Registration);
const useV1TeamDetailMock = vi.mocked(useV1TeamDetail);
const useV1TournamentPlayersMock = vi.mocked(useV1TournamentPlayers);
const useV1AddPlayerMock = vi.mocked(useV1AddPlayer);
const useV1UpdatePlayerMock = vi.mocked(useV1UpdatePlayer);
const useV1RemovePlayerMock = vi.mocked(useV1RemovePlayer);

const PAST_DEADLINE = '2020-01-01T00:00:00.000Z';
const FUTURE_DEADLINE = '2099-01-01T00:00:00.000Z';

function mockPlayer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'player-1',
    jerseyNumber: null as number | null,
    userId: 'user-1',
    realName: '홍길동',
    birthDateSnapshot: '1995-03-15',
    eligibilityStatus: 'non_pro' as const,
    eligibilityNote: null,
    addedAt: '2026-01-01T00:00:00.000Z',
    removedAt: null,
    ...overrides,
  };
}

describe('TournamentRosterPageClient — 명단 제출 마감 배너/액션 차단', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  beforeEach(() => {
    // 이 스위트의 모든 기존 테스트는 마감·잠금만 다루고 권한은 항상 있다고 가정하므로,
    // 기본값을 owner로 둬 M-T 게이트 추가로 기존 동작이 조용히 바뀌지 않게 한다
    // (member 권한 자체는 아래 전용 describe에서 별도로 검증한다).
    useV1TeamDetailMock.mockReturnValue({
      data: { viewer: { role: 'owner' } },
      isPending: false,
      isError: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1TeamDetail>);
    useV1TournamentPlayersMock.mockReturnValue({
      data: { players: [mockPlayer()], belowMinimum: false },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1TournamentPlayers>);
    useV1AddPlayerMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useV1AddPlayer>);
    useV1UpdatePlayerMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useV1UpdatePlayer>);
    useV1RemovePlayerMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useV1RemovePlayer>);
  });

  function mockTournament(rosterDeadlineAt: string | null, status?: string) {
    useV1TournamentMock.mockReturnValue({
      data: { minPlayers: 5, maxPlayers: 20, rosterDeadlineAt, status },
    } as unknown as ReturnType<typeof useV1Tournament>);
  }

  function mockRegistration(
    rosterDeadlineOverrideAt: string | null,
    overrides: { rosterLockedAt?: string | null } = {},
  ) {
    useV1RegistrationMock.mockReturnValue({
      data: {
        id: 'reg-1',
        teamId: 'team-1',
        status: 'confirmed',
        rosterLockedAt: overrides.rosterLockedAt ?? null,
        rosterDeadlineOverrideAt,
      },
    } as unknown as ReturnType<typeof useV1Registration>);
  }

  it('shows no deadline banner and keeps the add-player action enabled before the deadline', () => {
    mockTournament(FUTURE_DEADLINE);
    mockRegistration(null);

    render(<TournamentRosterPageClient tournamentId="tournament-1" registrationId="reg-1" />);

    expect(
      screen.queryByText('명단 제출 기간이 종료됐어요. 수정이 필요하면 운영진에게 문의해 주세요.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '선수 추가하기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '홍길동 수정' })).toBeInTheDocument();
  });

  it('shows the blocked banner and hides edit/remove actions once the deadline has passed with no override', () => {
    mockTournament(PAST_DEADLINE);
    mockRegistration(null);

    render(<TournamentRosterPageClient tournamentId="tournament-1" registrationId="reg-1" />);

    expect(
      screen.getByText('명단 제출 기간이 종료됐어요. 수정이 필요하면 운영진에게 문의해 주세요.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '선수 추가하기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '홍길동 수정' })).not.toBeInTheDocument();
  });

  it('keeps editing open and shows the override notice when an admin has granted a deadline exception', () => {
    mockTournament(PAST_DEADLINE);
    mockRegistration('2026-01-05T00:00:00.000Z');

    render(<TournamentRosterPageClient tournamentId="tournament-1" registrationId="reg-1" />);

    expect(
      screen.queryByText('명단 제출 기간이 종료됐어요. 수정이 필요하면 운영진에게 문의해 주세요.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('운영진이 명단 제출 마감 예외를 허용했어요. 계속 명단을 수정할 수 있어요.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '홍길동 수정' })).toBeInTheDocument();
  });

  // 감사 finding #52: 잠긴 신청에 마감 예외를 부여하면 "계속 수정할 수 있어요"와 "명단이
  // 마감됐어요"가 서로 모순되게 동시에 떴다 — 두 배너를 상호 배타로 합친다.
  it('shows a single combined message (not two contradicting banners) when a locked roster also has a deadline override', () => {
    mockTournament(PAST_DEADLINE);
    mockRegistration('2026-01-05T00:00:00.000Z', { rosterLockedAt: '2026-01-06T00:00:00.000Z' });

    render(<TournamentRosterPageClient tournamentId="tournament-1" registrationId="reg-1" />);

    expect(
      screen.getByText(
        '운영진이 명단 제출 마감 예외를 허용했지만 명단 자체가 잠겨 있어요. 운영진의 잠금 해제가 추가로 필요해요.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('운영진이 명단 제출 마감 예외를 허용했어요. 계속 명단을 수정할 수 있어요.'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('선수 명단이 마감됐어요. 변경이 필요하면 운영진에게 문의해 주세요.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '홍길동 수정' })).not.toBeInTheDocument();
  });

  // 감사 finding #1: 대회가 종료·취소되면 잠금·마감 예외와 무관하게 명단을 못 고친다.
  it('blocks editing and shows the tournament-closed banner when the tournament has completed, even with a deadline override', () => {
    mockTournament(PAST_DEADLINE, 'completed');
    mockRegistration('2026-01-05T00:00:00.000Z');

    render(<TournamentRosterPageClient tournamentId="tournament-1" registrationId="reg-1" />);

    // 데이터 카드(TournamentRosterDeadlineCard)와 배너 두 곳 모두 같은 문구를 낸다.
    expect(
      screen.getAllByText('대회가 종료되었거나 취소돼 더 이상 선수 명단을 수정할 수 없어요.').length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText('운영진이 명단 제출 마감 예외를 허용했어요. 계속 명단을 수정할 수 있어요.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '홍길동 수정' })).not.toBeInTheDocument();
  });
});

describe('getRosterDeadlineState', () => {
  it('never blocks when there is no roster deadline set', () => {
    expect(getRosterDeadlineState(null, null)).toEqual({ blocked: false, overridden: false });
  });

  it('does not block before the deadline', () => {
    expect(getRosterDeadlineState(FUTURE_DEADLINE, null)).toEqual({
      blocked: false,
      overridden: false,
    });
  });

  it('blocks after the deadline when there is no override', () => {
    expect(getRosterDeadlineState(PAST_DEADLINE, null)).toEqual({
      blocked: true,
      overridden: false,
    });
  });

  it('does not block after the deadline when an override is present, and flags it as overridden', () => {
    expect(getRosterDeadlineState(PAST_DEADLINE, '2020-01-02T00:00:00.000Z')).toEqual({
      blocked: false,
      overridden: true,
    });
  });

  it('treats an invalid deadline string as not blocking', () => {
    expect(getRosterDeadlineState('not-a-date', null)).toEqual({ blocked: false, overridden: false });
  });
});

/**
 * 정본 §3 "명단 공개 = 등번호·이름". 등번호는 **선택 입력**이라 `null` 일 수 있고,
 * `0` 은 유효한 번호다 — falsy 검사로 거르면 0번을 단 선수의 번호가 화면에서 사라진다.
 */
describe('명단 등번호 표시', () => {
  function renderWith(player: ReturnType<typeof mockPlayer>) {
    vi.mocked(useV1Tournament).mockReturnValue({
      data: { minPlayers: 5, maxPlayers: 20, rosterDeadlineAt: null, status: 'open' },
    } as never);
    vi.mocked(useV1Registration).mockReturnValue({
      data: { id: 'reg-1', teamId: 'team-1', status: 'confirmed', rosterLockedAt: null, rosterDeadlineOverrideAt: null },
    } as never);
    vi.mocked(useV1TournamentPlayers).mockReturnValue({
      data: { players: [player], belowMinimum: false },
      isPending: false,
    } as never);
    vi.mocked(useV1AddPlayer).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.mocked(useV1UpdatePlayer).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.mocked(useV1RemovePlayer).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    render(<TournamentRosterPageClient tournamentId="t1" registrationId="reg-1" />);
  }

  it('등번호가 있으면 이름 옆에 보인다', () => {
    renderWith(mockPlayer({ jerseyNumber: 7 }));
    expect(screen.getByLabelText('등번호 7번')).toBeInTheDocument();
  });

  it('0번도 보인다 — falsy 로 거르면 사라지는 자리다', () => {
    renderWith(mockPlayer({ jerseyNumber: 0 }));
    expect(screen.getByLabelText('등번호 0번')).toBeInTheDocument();
  });

  it('번호가 없으면 아무것도 그리지 않는다', () => {
    renderWith(mockPlayer({ jerseyNumber: null }));
    expect(screen.queryByLabelText(/등번호/)).not.toBeInTheDocument();
  });
});


/**
 * `type="number"` 입력은 `e`·`1e2`·`-` 를 그대로 통과시킨다. `Number('e')` 는 `NaN` 이고
 * **`NaN` 은 JSON 에서 `null` 로 직렬화된다** — 서버에서 "번호를 안 보냄" 과 구분되지 않아
 * 번호가 조용히 사라진다(2026-09-04 Copilot 리뷰).
 */
describe('parseJerseyInput', () => {
  it('빈 값은 오류가 아니라 "번호 없음" 이다', () => {
    expect(parseJerseyInput('')).toEqual({ ok: true });
    expect(parseJerseyInput('   ')).toEqual({ ok: true });
  });

  it('0 은 유효한 등번호다', () => {
    expect(parseJerseyInput('0')).toEqual({ ok: true, value: 0 });
  });

  it.each(['e', '1e2', '-', '-1', '7.5', '٧', '1 2'])('%s 는 거부한다 — NaN 이 null 로 나가면 안 된다', (raw) => {
    expect(parseJerseyInput(raw)).toEqual({ ok: false });
  });

  it('세 자리는 거부한다 — 서버 상한이 99 다', () => {
    expect(parseJerseyInput('100')).toEqual({ ok: false });
    expect(parseJerseyInput('99')).toEqual({ ok: true, value: 99 });
  });
});

/**
 * 등번호 수정 경로. 이게 없던 동안 번호를 잘못 넣으면 **선수를 지우고 다시 넣는 수밖에**
 * 없었고, 그 우회는 되살린 행의 자격을 `needs_review` 로 되돌린다(2026-09-04 alpha 실측).
 */
describe('등번호 수정', () => {
  const updateJersey = vi.fn().mockResolvedValue({});
  const updatePlayer = vi.fn().mockResolvedValue({});

  function renderRow(jerseyNumber: number | null, options: { jerseyPending?: boolean } = {}) {
    updateJersey.mockClear();
    updatePlayer.mockClear();
    vi.mocked(useV1Tournament).mockReturnValue({
      data: { minPlayers: 1, maxPlayers: 20, rosterDeadlineAt: null, status: 'open' },
    } as never);
    vi.mocked(useV1Registration).mockReturnValue({
      data: { id: 'reg-1', teamId: 'team-1', status: 'confirmed', rosterLockedAt: null, rosterDeadlineOverrideAt: null },
    } as never);
    vi.mocked(useV1TournamentPlayers).mockReturnValue({
      data: { players: [mockPlayer({ jerseyNumber })], belowMinimum: false },
      isPending: false,
    } as never);
    vi.mocked(useV1AddPlayer).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.mocked(useV1UpdatePlayer).mockReturnValue({ mutateAsync: updatePlayer, isPending: false } as never);
    vi.mocked(useV1UpdatePlayerJersey).mockReturnValue({
      mutateAsync: updateJersey,
      isPending: options.jerseyPending ?? false,
    } as never);
    vi.mocked(useV1RemovePlayer).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    const view = render(<TournamentRosterPageClient tournamentId="t1" registrationId="reg-1" />);
    fireEvent.click(screen.getByRole('button', { name: /수정/ }));
    return view;
  }

  /** 위와 같되 `rerender` 를 쓰려는 케이스용 — 이름을 갈라 두면 의도가 보인다. */
  const renderRowWithHandle = renderRow;

  it('번호를 고치면 등번호 경로로만 보낸다 — 자격은 건드리지 않는다', async () => {
    renderRow(7);
    fireEvent.change(screen.getByLabelText('등번호'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(updateJersey).toHaveBeenCalledWith({ playerId: 'player-1', jerseyNumber: 10 }));
    // 자격을 함께 보내면 팀장이 어드민 판정을 덮어쓸 여지가 생긴다.
    expect(updatePlayer).not.toHaveBeenCalled();
  });

  it('비우면 번호를 지운다 — null 로 보낸다', async () => {
    renderRow(7);
    fireEvent.change(screen.getByLabelText('등번호'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(updateJersey).toHaveBeenCalledWith({ playerId: 'player-1', jerseyNumber: null }));
  });

  it('0 으로 고칠 수 있다 — falsy 로 거르면 사라지는 값이다', async () => {
    renderRow(7);
    fireEvent.change(screen.getByLabelText('등번호'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(updateJersey).toHaveBeenCalledWith({ playerId: 'player-1', jerseyNumber: 0 }));
  });

  it('숫자가 아니면 보내지 않고 오류를 보여 준다', async () => {
    renderRow(7);
    fireEvent.change(screen.getByLabelText('등번호'), { target: { value: 'e' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('등번호는 0에서 99 사이 숫자로 입력해 주세요.')).toBeInTheDocument();
    expect(updateJersey).not.toHaveBeenCalled();
  });

  it('등번호 요청이 도는 동안에는 저장을 다시 누를 수 없다 — 같은 요청이 두 번 나간다', () => {
    // 저장 하나가 **자격/등번호 두 경로로 갈리므로**, 화면이 `updatePlayer` 하나만 보면
    // 등번호 요청 중에 버튼이 열려 있다(Copilot 지적). 여기서는 등번호 mutation 만
    // pending 으로 두고, 그 값이 행까지 닿는지 본다.
    // 패널을 먼저 연다 — pending 이면 "수정" 버튼부터 잠겨서 패널을 열 수 없다.
    const { rerender } = renderRow(7);
    // **값을 실제로 바꿔 둔다.** 안 그러면 버튼이 `!hasChanges` 때문에 어차피 잠겨 있어
    // pending 을 안 봐도 이 테스트가 통과한다(처음에 그렇게 썼다가 변이 red 0 으로 잡았다).
    fireEvent.change(screen.getByLabelText('등번호'), { target: { value: '8' } });
    expect(screen.getByRole('button', { name: /저장/ })).not.toBeDisabled();
    updateJersey.mockClear();
    vi.mocked(useV1UpdatePlayerJersey).mockReturnValue({
      mutateAsync: updateJersey,
      isPending: true,
    } as never);
    rerender(<TournamentRosterPageClient tournamentId="t1" registrationId="reg-1" />);

    const save = screen.getByRole('button', { name: /저장/ });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(updateJersey).not.toHaveBeenCalled();
  });

  it('"07" 은 7 과 같은 값이라 저장 버튼이 살아나지 않는다', () => {
    // 문자열로 비교하면 `"07" !== "7"` 이라 버튼이 살아나는데, 저장하면 보낼 값이 같아서
    // **요청은 0건인데 패널만 닫힌다** — 팀장은 뭔가 저장됐다고 읽는다(Copilot 지적).
    renderRow(7);
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('등번호'), { target: { value: '07' } });
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
    // 값이 실제로 달라지면 살아난다(회귀 방지 — 항상 비활성이면 아무것도 못 고친다).
    fireEvent.change(screen.getByLabelText('등번호'), { target: { value: '8' } });
    expect(screen.getByRole('button', { name: '저장' })).not.toBeDisabled();
  });

  it('숫자가 아닌 입력은 버튼을 열어 둔다 — 눌러야 왜 안 되는지 알 수 있다', () => {
    renderRow(7);
    fireEvent.change(screen.getByLabelText('등번호'), { target: { value: 'e' } });
    expect(screen.getByRole('button', { name: '저장' })).not.toBeDisabled();
  });

  it('편집 중에 서버 값이 갱신돼도 오류 문구와 입력값이 살아 있다', async () => {
    // Copilot 리뷰가 잡은 자리다. 저장 하나가 **두 요청으로 갈릴 수 있어서**(등번호 /
    // 자격) 이 순서가 실제로 난다: 등번호는 성공해 목록이 갱신되고, 자격은 실패해 오류가
    // 걸린다. 초기화가 `player.*` 에 매달려 있으면 **갱신이 도착하는 순간 오류가 지워져**
    // 팀장은 무엇이 실패했는지 못 본다.
    const { rerender } = renderRowWithHandle(7);
    fireEvent.change(screen.getByLabelText('등번호'), { target: { value: 'e' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('등번호는 0에서 99 사이 숫자로 입력해 주세요.')).toBeInTheDocument();

    // 서버 갱신이 도착한다 — 다른 요청이 등번호를 10 으로 바꿔 놓았다.
    vi.mocked(useV1TournamentPlayers).mockReturnValue({
      data: { players: [mockPlayer({ jerseyNumber: 10 })], belowMinimum: false },
      isPending: false,
    } as never);
    rerender(<TournamentRosterPageClient tournamentId="t1" registrationId="reg-1" />);

    expect(screen.getByText('등번호는 0에서 99 사이 숫자로 입력해 주세요.')).toBeInTheDocument();
    // 고치던 입력값도 되돌아가지 않는다.
    expect(screen.getByLabelText('등번호')).toHaveValue('e');
  });
});

/**
 * `type="number"` 입력에 `e`·`-`·`.` 를 넣으면 브라우저가 `badInput` 으로 보고 **`el.value` 를
 * 빈 문자열로** 준다 — 화면에는 `e` 가 보이는데 코드가 받는 값은 `''` 이라 "번호 없는 선수"
 * 로 조용히 통과했다(2026-09-04 alpha 실측: `e` → 201, `jerseyNumber: null`).
 *
 * ⚠️ **이 동작은 jsdom 에서 재현되지 않는다** — jsdom 은 `type="number"` 에도 값을 그대로
 * 보존해서 `parseJerseyInput('e')` 가 정상적으로 거부한다. 그래서 여기서는 **입력 종류가
 * 되돌아가는 것만** 막고, 실제 증명은 alpha 화면 재검증으로 한다. 행동 테스트를 흉내 내면
 * 통과하는데 버그는 살아 있는 가짜 초록이 된다.
 */
describe('등번호 입력 종류', () => {
  it('type="number" 로 되돌리지 않는다 — 브라우저가 값을 비워 검증을 통과시킨다', async () => {
    vi.mocked(useV1Tournament).mockReturnValue({
      data: { minPlayers: 5, maxPlayers: 20, rosterDeadlineAt: null, status: 'open' },
    } as never);
    vi.mocked(useV1Registration).mockReturnValue({
      data: { id: 'reg-1', teamId: 'team-1', status: 'confirmed', rosterLockedAt: null, rosterDeadlineOverrideAt: null },
    } as never);
    vi.mocked(useV1TournamentPlayers).mockReturnValue({
      data: { players: [], belowMinimum: true },
      isPending: false,
    } as never);
    vi.mocked(useV1AddPlayer).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.mocked(useV1UpdatePlayer).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.mocked(useV1RemovePlayer).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);

    // 추가 폼은 팀원 목록을 `useInfiniteQuery` 로 직접 부른다 — 이 파일의 훅 목킹으로는
    // 안 덮인다. QueryClient 만 붙이면 **실제로 `/teams/:id/members` 를 fetch 하려 들고**,
    // Node 에는 base URL 이 없어 상대 경로에서 TypeError 가 난다 — 테스트가 런타임 환경에
    // 의존하게 된다. fetch 를 그 범위에서만 스텁해 빈 결과로 끊는다.
    // **실제 응답 형태 그대로** 돌려준다 — V1 봉투(`{status,data,timestamp}`) 안에
    // `V1TeamMembersPage`. 아무 모양이나 주면 `body.data` 가 `undefined` 로 빠지고
    // 화면이 폴백을 타 **우연히 통과**한다(그러면 이 스텁이 뭘 보장하는지 알 수 없다).
    const membersPage = {
      items: [],
      summary: { ownerCount: 0, managerCount: 0, memberCount: 0 },
      viewerRole: 'owner' as const,
      pageInfo: { nextCursor: null, hasNext: false },
    };
    // **URL 을 확인한다.** 모든 요청에 같은 응답을 주면 화면이 **엉뚱한 endpoint 를 불러도
    // 조용히 통과**한다 — "팀원 목록을 부른다" 는 이 스텁의 전제 자체가 검증되지 않는다.
    // 예상 밖 URL 은 그 자리에서 실패시켜 원인을 보이게 한다.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes('/teams/team-1/members')) {
        return Promise.reject(new Error(`예상하지 않은 요청: ${url}`));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({ status: 'success', data: membersPage, timestamp: new Date().toISOString() }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    });
    // **스텁은 unmount 까지 유지한다.** 클릭 직후 복구하면 React Query 가 뒤늦게 보내는
    // 요청이 실제 fetch 로 새어 플래키해진다 — 그때 실패는 이 테스트가 보는 것과 무관한
    // 이유로 난다.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      const { container, unmount } = render(
        <QueryClientProvider client={queryClient}>
          <TournamentRosterPageClient tournamentId="t1" registrationId="reg-1" />
        </QueryClientProvider>,
      );
      fireEvent.click(screen.getByRole('button', { name: '선수 추가하기' }));

      const jersey = container.querySelector('input[id$="-jersey"]');
      expect(jersey).not.toBeNull();
      expect(jersey?.getAttribute('type')).toBe('text');
      // 숫자 키패드는 그대로 띄운다 — 입력 편의는 잃지 않는다.
      expect(jersey?.getAttribute('inputmode')).toBe('numeric');
      // 스텁의 전제를 **단언**한다. URL 이 틀리면 스텁은 reject 하지만 그 실패는 React
      // Query 상태로 흡수돼 테스트가 조용히 통과한다(실측: 거부해도 40 green) — 그래서
      // 거부만으로는 부족하고, 화면이 실제로 이 endpoint 를 불렀는지 여기서 확인해야 한다.
      await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
      expect(String(fetchSpy.mock.calls[0][0])).toContain('/teams/team-1/members');
      unmount();
      // 남은 구독이 스텁 복구 뒤에 살아나지 않게 캐시도 함께 접는다.
      queryClient.clear();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

// M-T 감사: 팀 role='멤버'인 뷰어에게 신청 명단 페이지의 '+ 추가'·'수정'·'삭제'가
// 전부 활성 상태(disabled=false)로 노출됐다. 서버(tournament-players.service.ts)는
// manager+ 만 허용해 실제 변경은 막지만(보안 구멍 아님), 화면이 활성 버튼을 보여준
// 채 눌렀을 때만 403이 나면 "성공처럼 보이는 조용한 실패"다 — 화면 자체가 뷰어 role을
// 먼저 확인해 버튼을 숨겨야 한다.
describe('TournamentRosterPageClient — 명단 수정 권한(M-T)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  beforeEach(() => {
    useV1TournamentMock.mockReturnValue({
      data: { minPlayers: 5, maxPlayers: 20, rosterDeadlineAt: null, status: 'open' },
    } as unknown as ReturnType<typeof useV1Tournament>);
    useV1RegistrationMock.mockReturnValue({
      data: { id: 'reg-1', teamId: 'team-1', status: 'confirmed', rosterLockedAt: null, rosterDeadlineOverrideAt: null },
    } as unknown as ReturnType<typeof useV1Registration>);
    useV1TournamentPlayersMock.mockReturnValue({
      data: { players: [mockPlayer()], belowMinimum: false },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1TournamentPlayers>);
    useV1AddPlayerMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof useV1AddPlayer>);
    useV1UpdatePlayerMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof useV1UpdatePlayer>);
    useV1RemovePlayerMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof useV1RemovePlayer>);
  });

  function mockTeam(role: 'owner' | 'manager' | 'member', overrides: Record<string, unknown> = {}) {
    useV1TeamDetailMock.mockReturnValue({
      data: { viewer: { role } },
      isPending: false,
      isError: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
      ...overrides,
    } as unknown as ReturnType<typeof useV1TeamDetail>);
  }

  it('member 역할은 추가·수정·삭제 버튼이 전부 안 보이고, "팀장에게 요청"으로 안내한다', () => {
    mockTeam('member');

    render(<TournamentRosterPageClient tournamentId="tournament-1" registrationId="reg-1" />);

    expect(screen.getByText('팀장에게 요청')).toBeInTheDocument();
    expect(screen.getByText(/추가·수정·삭제는 팀장 또는 매니저에게 요청해 주세요/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '선수 추가하기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '홍길동 수정' })).not.toBeInTheDocument();
    // 명단 자체(읽기)는 그대로 보인다 — 막는 건 쓰기뿐이다.
    expect(screen.getByText('홍길동')).toBeInTheDocument();
  });

  it.each(['owner', 'manager'] as const)('%s 역할은 기존과 동일하게 추가·수정 버튼이 보인다', (role) => {
    mockTeam(role);

    render(<TournamentRosterPageClient tournamentId="tournament-1" registrationId="reg-1" />);

    expect(screen.queryByText('팀장에게 요청')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '선수 추가하기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '홍길동 수정' })).toBeInTheDocument();
  });

  it('팀 조회가 아직 로딩 중이면 권한 배지를 보여주지 않는다(판정 전 fail-open 방지)', () => {
    mockTeam('owner', { isPending: true, data: undefined });

    render(<TournamentRosterPageClient tournamentId="tournament-1" registrationId="reg-1" />);

    expect(screen.queryByText('팀장에게 요청')).not.toBeInTheDocument();
    expect(screen.queryByText('수정 가능')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '선수 추가하기' })).not.toBeInTheDocument();
  });

  it('팀 조회가 실패하면 재시도 배너를 보여주고 쓰기 버튼은 숨긴다', () => {
    mockTeam('owner', { isError: true, data: undefined });

    render(<TournamentRosterPageClient tournamentId="tournament-1" registrationId="reg-1" />);

    expect(screen.getByText(/팀 정보를 불러오지 못해 수정 권한을 확인할 수 없어요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '선수 추가하기' })).not.toBeInTheDocument();
    // Copilot 리뷰: 실패는 "멤버라 확정됨"이 아니라 "확인 못 함"이다 — '팀장에게 요청'을
    // 단정적으로 보여주면 재시도 배너와 서로 다른 말을 하는 모순이 생긴다.
    expect(screen.queryByText('팀장에게 요청')).not.toBeInTheDocument();
    // 팀 권한과 무관한 마감 정보는 조회 실패와 상관없이 그대로 보인다.
    expect(screen.getByText('대회 신청 마감')).toBeInTheDocument();
  });
});

describe('TournamentRosterPageClient — "내 신청으로 돌아가기" 는 받은 from 을 잇는다', () => {
  afterEach(() => {
    vi.clearAllMocks();
    rosterSearchParams = new URLSearchParams();
  });

  beforeEach(() => {
    useV1TournamentMock.mockReturnValue({
      data: { minPlayers: 5, maxPlayers: 20, rosterDeadlineAt: null, status: 'open' },
    } as unknown as ReturnType<typeof useV1Tournament>);
    useV1RegistrationMock.mockReturnValue({
      data: { id: 'reg-1', teamId: 'team-1', status: 'confirmed', rosterLockedAt: null, rosterDeadlineOverrideAt: null },
    } as unknown as ReturnType<typeof useV1Registration>);
    useV1TeamDetailMock.mockReturnValue({
      data: { viewer: { role: 'owner' } },
      isPending: false,
      isError: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1TeamDetail>);
    useV1TournamentPlayersMock.mockReturnValue({
      data: { players: [], belowMinimum: false },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useV1TournamentPlayers>);
    useV1AddPlayerMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof useV1AddPlayer>);
    useV1UpdatePlayerMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof useV1UpdatePlayer>);
    useV1RemovePlayerMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<typeof useV1RemovePlayer>);
  });

  it('받은 from 을 "내 신청" URL 에 그대로 싣는다', () => {
    rosterSearchParams = new URLSearchParams({ from: '/home' });

    render(<TournamentRosterPageClient tournamentId="tournament-1" registrationId="reg-1" />);

    expect(screen.getByRole('link', { name: '내 신청으로 돌아가기' })).toHaveAttribute(
      'href',
      `/tournaments/tournament-1/my?from=${encodeURIComponent('/home')}`,
    );
  });

  it('대조군: from 이 없으면 "내 신청" 경로만 쓴다', () => {
    render(<TournamentRosterPageClient tournamentId="tournament-1" registrationId="reg-1" />);

    expect(screen.getByRole('link', { name: '내 신청으로 돌아가기' })).toHaveAttribute(
      'href',
      '/tournaments/tournament-1/my',
    );
  });
});

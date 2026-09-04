import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useV1AddPlayer,
  useV1Registration,
  useV1RemovePlayer,
  useV1Tournament,
  useV1TournamentPlayers,
  useV1UpdatePlayer,
} from '@/hooks/use-v1-api';
import {
  TournamentRosterPageClient,
  getRosterDeadlineState,
  parseJerseyInput,
} from './tournament-roster-client';

vi.mock('@/components/v1-ui/shell', () => ({
  AppChrome: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1Tournament: vi.fn(),
  useV1Registration: vi.fn(),
  useV1TournamentPlayers: vi.fn(),
  useV1AddPlayer: vi.fn(),
  useV1UpdatePlayer: vi.fn(),
  useV1RemovePlayer: vi.fn(),
}));

const useV1TournamentMock = vi.mocked(useV1Tournament);
const useV1RegistrationMock = vi.mocked(useV1Registration);
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
  it('type="number" 로 되돌리지 않는다 — 브라우저가 값을 비워 검증을 통과시킨다', () => {
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
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ status: 'success', data: membersPage, timestamp: new Date().toISOString() }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
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
      unmount();
      // 남은 구독이 스텁 복구 뒤에 살아나지 않게 캐시도 함께 접는다.
      queryClient.clear();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

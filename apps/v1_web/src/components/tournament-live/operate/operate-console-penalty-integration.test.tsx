import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render as renderElement, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperateConsole } from './operate-console';
import type { GameEventRecord } from '@/types/game-operations';

const queryClients: QueryClient[] = [];
const COMMAND_OPTIONS = { signal: expect.any(AbortSignal) };
function render(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  queryClients.push(client);
  return renderElement(ui, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
afterEach(() => {
  cleanup();
  queryClients.splice(0).forEach((client) => client.clear());
});

const mocks = vi.hoisted(() => ({
  useV1AuthMe: vi.fn(),
  useV1FixtureLineup: vi.fn(),
  useV1Game: vi.fn(),
  useV1GameOperationsLineup: vi.fn(),
  useV1GameOperationsConsole: vi.fn(),
  postV1GameCommand: vi.fn(),
  useV1GameResultRevisions: vi.fn((_gameId: string | null | undefined, _options?: { enabled?: boolean }) => ({
    data: undefined as Array<Record<string, unknown>> | undefined,
  })),
  useTournamentOpsRole: vi.fn(),
}));
vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  useV1AuthMe: () => mocks.useV1AuthMe(),
  useV1GameResultRevisions: (gameId: string | null | undefined, options?: { enabled?: boolean }) =>
    mocks.useV1GameResultRevisions(gameId, options),
}));
vi.mock('@/hooks/use-v1-game-operations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-game-operations')>()),
  useV1FixtureLineup: (...args: unknown[]) => mocks.useV1FixtureLineup(...args),
  useV1Game: (...args: unknown[]) => mocks.useV1Game(...args),
  useV1GameOperationsLineup: (...args: unknown[]) => mocks.useV1GameOperationsLineup(...args),
  postV1GameCommand: (...args: unknown[]) => mocks.postV1GameCommand(...args),
}));
vi.mock('@/hooks/use-v1-game-operations-console', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-game-operations-console')>()),
  useV1GameOperationsConsole: (...args: unknown[]) => mocks.useV1GameOperationsConsole(...args),
}));
vi.mock('@/components/tournament-ops/role-context', () => ({ useTournamentOpsRole: () => mocks.useTournamentOpsRole() }));
vi.mock('@/components/tournament-result-review/game-result-review-panel', () => ({
  GameResultReviewPanel: ({ gameId, tournamentId, variant }: { gameId: string; tournamentId: string; variant: string }) => (
    <div data-testid="result-confirm-card" data-game-id={gameId} data-tournament-id={tournamentId} data-variant={variant} />
  ),
}));

function goal(sequence: number): GameEventRecord {
  return {
    id: `event-${sequence}`, gameId: 'game-1', sequence, clientEventId: `client-${sequence}`,
    payloadHash: 'hash', type: 'GOAL', sideId: 'side-home', participantId: 'p-1', period: 2,
    clockMs: 6 * 60000, occurredAt: '2026-08-04T00:00:00.000Z', receivedAt: '2026-08-04T00:00:00.000Z',
    actorUserId: 'actor-1', reversesEventId: null,
  } as GameEventRecord;
}
function consoleState(overrides: Record<string, unknown> = {}) {
  return {
    canOperate: true, connectionStatus: 'connected', sync: { status: 'synced', lastSequence: 1 },
    takeover: { status: 'held', token: 'tok', expiresAtMs: Date.now() + 60000, assignmentVersion: 0 },
    queue: { items: [] }, clockOffsetMs: 0, liveEvents: [goal(1)],
    gameSnapshot: { version: 2, state: 'LIVE' }, bannerMessage: null,
    submitEvent: vi.fn(), retryFailedEvent: vi.fn(), requestTakeover: vi.fn(), reverseEvent: vi.fn(),
    assignAssist: vi.fn(), applyCommandResult: vi.fn(() => true), ...overrides,
  };
}

beforeEach(() => {
  mocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'user-1' } } });
  mocks.useV1GameOperationsLineup.mockReturnValue({ data: [], isLoading: false, isError: false, error: null, refetch: vi.fn() });
  mocks.useV1GameResultRevisions.mockReturnValue({ data: undefined });
  mocks.useV1GameOperationsConsole.mockClear();
  mocks.useV1GameOperationsConsole.mockReturnValue(consoleState());
  mocks.useTournamentOpsRole.mockReturnValue('TOURNAMENT_DIRECTOR');
  mocks.postV1GameCommand.mockReset();
  mocks.postV1GameCommand.mockResolvedValue({ gameId: 'game-1', state: 'LIVE', version: 3 });
});

describe('OperateConsole — 승부차기 (과제 2)', () => {
  const PENALTY_SIDES = [
    { id: 'side-home', gameId: 'game-1', sideKey: 'HOME' as const, teamId: null, displayNameSnapshot: '강남 풋살 클럽', createdAt: '', updatedAt: '' },
    { id: 'side-away', gameId: 'game-1', sideKey: 'AWAY' as const, teamId: null, displayNameSnapshot: '성수 풋살 클럽', createdAt: '', updatedAt: '' },
  ];
  // 종료 흐름 개편(사용자 결정 2·3) — 승부차기 입력은 이제 "후반 종료"
  // 이후, 즉 마지막 피리어드까지 ENDED가 된 뒤에만 열린다(경기 자체는
  // 아직 LIVE = 결과 미확정). 예전엔 마지막 피리어드가 LIVE인 동안 열려
  // 있었다 — 아직 뛰는 중인 경기에 승부차기 입력이 열려 있는 셈이었다.
  const FINAL_PERIOD = {
    id: 'period-2', gameId: 'game-1', number: 2, state: 'ENDED',
    startedAt: '2026-08-07T00:00:00.000Z', endedAt: '2026-08-07T00:45:00.000Z', pausedTotalMs: 0, pausedAt: null,
  };

  function tiedGoal(sequence: number, sideId: string, id: string): GameEventRecord {
    return {
      id, gameId: 'game-1', sequence, clientEventId: `client-${sequence}`, payloadHash: 'hash',
      type: 'GOAL', sideId, participantId: null, assistParticipantId: null, period: 2,
      clockMs: 5 * 60000, occurredAt: '2026-08-07T00:05:00.000Z', receivedAt: '2026-08-07T00:05:00.000Z',
      actorUserId: 'actor-1', reversesEventId: null, payload: {},
    } as GameEventRecord;
  }

  const FIRST_PERIOD = {
    id: 'period-1', gameId: 'game-1', number: 1, state: 'ENDED',
    startedAt: '2026-08-07T00:00:00.000Z', endedAt: '2026-08-07T00:20:00.000Z', pausedTotalMs: 0, pausedAt: null,
  };

  function setup(
    overrides: {
      isKnockoutFixture?: boolean;
      sourceType?: 'TEAM_MATCH' | 'TOURNAMENT_FIXTURE';
      liveEvents?: GameEventRecord[];
      periods?: ReadonlyArray<Record<string, unknown>>;
      /** 서버가 대회 설정에서 해석해 내려주는 승부차기 종료 정책. 생략하면 서버가
       *  이 필드를 안 보낸 상태(레거시 응답)를 그대로 재현한다. */
      penaltyShootoutPolicy?: { earlyStop: boolean };
      substitutionPolicy?: { mode: 'limited' | 'rolling'; maxSubstitutions: number | null };
    } = {},
  ) {
    mocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'user-1' } } });
    mocks.useV1FixtureLineup.mockReturnValue({
      data: { gameId: 'game-1', lineups: [] },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    mocks.useV1Game.mockReturnValue({
      data: {
        id: 'game-1',
        sourceType: overrides.sourceType ?? 'TEAM_MATCH',
        isKnockoutFixture: overrides.isKnockoutFixture ?? true,
        state: 'LIVE', version: 2, lastSequence: 1,
        periods: overrides.periods ?? [FIRST_PERIOD, FINAL_PERIOD],
        sides: PENALTY_SIDES,
        lineups: [],
        penaltyShootoutPolicy: overrides.penaltyShootoutPolicy,
        substitutionPolicy: overrides.substitutionPolicy,
      },
      isLoading: false, isError: false, status: 'success', refetch: vi.fn(),
    });
    const liveEvents = overrides.liveEvents ?? [tiedGoal(1, 'side-home', 'e1'), tiedGoal(2, 'side-away', 'e2')];
    mocks.useV1GameOperationsConsole.mockReturnValue(
      consoleState({ gameSnapshot: { version: 2, state: 'LIVE' }, liveEvents }),
    );
  }

  it('tournament adapter wires leased mode and the read-only role gate into the shared Core runtime', () => {
    setup();
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(mocks.useV1GameOperationsConsole).toHaveBeenCalledWith(expect.objectContaining({
      operationMode: 'tournament-leased',
      takeoverEnabled: true,
      gameId: 'game-1',
      gameDetailGameId: 'game-1',
      gameDetailStatus: 'success',
      gameSourceType: 'TEAM_MATCH',
      initialLastSequence: 1,
    }));

    cleanup();
    mocks.useV1GameOperationsConsole.mockClear();
    mocks.useTournamentOpsRole.mockReturnValue('SUPPORT_READONLY');
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);
    expect(mocks.useV1GameOperationsConsole).toHaveBeenCalledWith(expect.objectContaining({
      operationMode: 'tournament-leased',
      takeoverEnabled: false,
    }));
  });

  it.each([
    ['FIELD_OPERATOR', true],
    ['SUPPORT_READONLY', false],
  ] as const)('tournament role %s controls recorded-event editing through the adapter', (role, canEdit) => {
    setup({ liveEvents: [{ ...goal(1), assistParticipantId: null }] });
    mocks.useTournamentOpsRole.mockReturnValue(role);
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(mocks.useV1GameOperationsConsole).toHaveBeenCalledWith(expect.objectContaining({
      operationMode: 'tournament-leased',
      takeoverEnabled: canEdit,
    }));
    const events = screen.getByRole('list', { name: '기록된 이벤트 목록' });
    expect(within(events).getAllByRole('listitem')).toHaveLength(1);
    if (canEdit) {
      expect(within(events).getByRole('button', { name: /어시스트/ })).toBeInTheDocument();
      expect(within(events).getByRole('button', { name: '수정·취소' })).toBeInTheDocument();
    } else {
      expect(within(events).queryByRole('button', { name: /어시스트/ })).not.toBeInTheDocument();
      expect(within(events).queryByRole('button', { name: '수정·취소' })).not.toBeInTheDocument();
    }
  });

  it('[MD-QA #180] 대회 knockout 경기가 정규시간 종료 후 동점이면 "승부차기 시작" 버튼이 보이고, "경기 종료" 버튼은 숨는다', () => {
    setup();
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.getByRole('button', { name: /승부차기 시작/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '경기 종료' })).toBeNull();
    expect(screen.getByText(/정규 시간이 무승부로 끝났어요/)).toBeInTheDocument();
    expect(screen.queryByText(/결선 경기는 무승부로 끝낼 수 없어요/)).toBeNull();
  });

  // 요구사항 4 — 아직 정규 시간이 끝나지 않은 예외 종료 경로(하프타임 중
  // 중단 등)에서 결선 무승부인 채 "경기 종료"를 누르면, 예전에는 그대로
  // 나가 리비전이 저장되고 브래킷 프로젝션만 조용히 POISONED가 됐다.
  // 이제 버튼 자체가 막히고 사유를 알려준다(백엔드도 409
  // TOURNAMENT_PENALTY_REQUIRED로 이중 방어).
  it('[MD-QA #180] 결선 무승부 조기 종료는 화면을 경고로 채우지 않고, 더보기 메뉴에서 막은 이유를 알려준다', () => {
    // 하프타임(후반이 아직 시작조차 안 됨) — game.state는 LIVE라 "경기 종료"
    // 탈출구가 남아 있는 상태다.
    setup({ periods: [FIRST_PERIOD, { ...FINAL_PERIOD, state: 'HALFTIME', startedAt: null, endedAt: null }] });

    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    // 경고는 경기 진행 화면을 점유하지 않고, 종료 액션을 열었을 때만 맥락 안에서 안내한다.
    expect(screen.queryByText(/결선 경기는 무승부로 끝낼 수 없어요/)).toBeNull();
    expect(screen.queryByRole('button', { name: '경기 종료' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    const moreDialog = screen.getByRole('dialog', { name: '경기 더보기' });
    const endButton = within(moreDialog).getByRole('button', { name: /^경기 종료/ });
    expect(endButton).toBeDisabled();
    expect(within(moreDialog).getByText(/결선 경기는 무승부로 끝낼 수 없어요/)).toBeInTheDocument();
    fireEvent.click(endButton);
    expect(mocks.postV1GameCommand).not.toHaveBeenCalled();
    // 아직 정규 시간이 끝나지 않았으므로 승부차기 입력도 아직 열리지 않는다.
    expect(screen.queryByRole('button', { name: /승부차기 시작/ })).toBeNull();
  });

  it('[MD-QA #180] 비동점 결선 경기의 더보기 종료 액션은 경고 없이 사용할 수 있다', () => {
    setup({
      liveEvents: [tiedGoal(1, 'side-home', 'e1')],
      periods: [FIRST_PERIOD, { ...FINAL_PERIOD, state: 'HALFTIME', startedAt: null, endedAt: null }],
    });
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.queryByText(/결선 경기는 무승부로 끝낼 수 없어요/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    expect(
      within(screen.getByRole('dialog', { name: '경기 더보기' })).getByRole('button', { name: /^경기 종료/ }),
    ).toBeEnabled();
  });

  it('[MD-QA #180] takeover가 거절된 대회 디렉터는 결선 동점 경고가 전역 표시되지 않고 조작이 잠긴다', () => {
    setup({ periods: [FIRST_PERIOD, { ...FINAL_PERIOD, state: 'HALFTIME', startedAt: null, endedAt: null }] });
    mocks.useV1GameOperationsConsole.mockReturnValue(
      consoleState({ takeover: { status: 'denied', code: 'TAKEOVER_HELD', holderName: '김운영' } }),
    );
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.getByText('김운영님이 이 경기를 운영하고 있어요. 지금은 보기만 할 수 있어요.')).toBeInTheDocument();
    expect(screen.queryByText(/결선 경기는 무승부로 끝낼 수 없어요/)).toBeNull();
    expect(screen.getByRole('button', { name: '더보기' })).toBeDisabled();
    expect(mocks.postV1GameCommand).not.toHaveBeenCalled();
  });

  it('[MD-QA #180] SUPPORT_READONLY 권한의 결선 동점 경기는 경고 없이 더보기와 종료 명령이 잠긴다', () => {
    setup({ periods: [FIRST_PERIOD, { ...FINAL_PERIOD, state: 'HALFTIME', startedAt: null, endedAt: null }] });
    mocks.useTournamentOpsRole.mockReturnValue('SUPPORT_READONLY');
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.queryByText(/결선 경기는 무승부로 끝낼 수 없어요/)).toBeNull();
    expect(screen.queryByRole('button', { name: '경기 종료' })).toBeNull();
    expect(screen.getByRole('button', { name: '더보기' })).toBeDisabled();
    expect(mocks.postV1GameCommand).not.toHaveBeenCalled();
  });

  describe('종료 확인 문구가 경기 종류를 따른다', () => {
    const LIVE_FINAL_PERIOD = { ...FINAL_PERIOD, state: 'LIVE', endedAt: null };

    it('"후반 종료" 확인: 승부차기가 열리는 knockout 동점 경기는 승부차기 단계를 안내한다', async () => {
      setup({ periods: [FIRST_PERIOD, LIVE_FINAL_PERIOD] });
      render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);
      fireEvent.click(screen.getByRole('button', { name: '후반 종료' }));

      expect(await screen.findByRole('dialog')).toHaveTextContent('승부차기 입력 또는 경기 종료');
    });

    it('"후반 종료" 확인: 조별 경기는 동점이어도 승부차기를 말하지 않는다', async () => {
      setup({ isKnockoutFixture: false, periods: [FIRST_PERIOD, LIVE_FINAL_PERIOD] });
      render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);
      fireEvent.click(screen.getByRole('button', { name: '후반 종료' }));

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent('다음 단계에서 경기 종료');
      expect(dialog).not.toHaveTextContent('승부차기');
    });

    it('"경기 종료" 확인: 롤링 교체 경기는 교체를 확인하라고 하지 않고, 제한 교체 경기는 그대로 안내한다', async () => {
      setup({ isKnockoutFixture: false, substitutionPolicy: { mode: 'rolling', maxSubstitutions: null } });
      const { unmount } = render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);
      fireEvent.click(screen.getByRole('button', { name: '경기 종료' }));
      const rolling = await screen.findByRole('dialog');
      expect(rolling).toHaveTextContent('기록한 골·카드를 먼저 확인해주세요');
      expect(rolling).not.toHaveTextContent('교체');
      unmount();

      setup({ isKnockoutFixture: false, substitutionPolicy: { mode: 'limited', maxSubstitutions: 5 } });
      render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);
      fireEvent.click(screen.getByRole('button', { name: '경기 종료' }));
      expect(await screen.findByRole('dialog')).toHaveTextContent('기록한 골·카드·교체를 먼저 확인해주세요');
    });
  });

  it('knockout이 아니면(조별리그) 동점이어도 "승부차기 시작"이 보이지 않고 평소처럼 "경기 종료"가 보인다', () => {
    setup({ isKnockoutFixture: false });
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.queryByRole('button', { name: /승부차기 시작/ })).toBeNull();
    expect(screen.getByRole('button', { name: '경기 종료' })).toBeInTheDocument();
  });

  it('동점이 아니면 knockout 경기여도 "승부차기 시작"이 보이지 않는다', () => {
    setup({ liveEvents: [tiedGoal(1, 'side-home', 'e1')] });
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.queryByRole('button', { name: /승부차기 시작/ })).toBeNull();
    expect(screen.getByRole('button', { name: '경기 종료' })).toBeInTheDocument();
  });

  it('현행 대회 경기(TEAM_MATCH)도 결선 무승부면 "승부차기 시작"이 보이고 일반 종료는 막힌다', () => {
    setup({ sourceType: 'TEAM_MATCH', isKnockoutFixture: true });
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.getByRole('button', { name: /승부차기 시작/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '경기 종료' })).toBeNull();
  });

  /**
   * **대회 설정 스위치가 실제로 배선돼 있다는 유일한 증거.**
   *
   * `earlyStop`은 서버 `getGame` 응답(`penaltyShootoutPolicy`)에서 와서 술어까지
   * 흘러가야 한다. 술어 자체는 `penalty-shootout.test.ts`가 양방향으로 검증하지만,
   * **그 값을 어디서 얻는가**는 거기서 검증되지 않는다 — 콘솔이 서버 값을 무시하고
   * `true`로 굳혀도 술어 테스트는 전부 초록이다.
   *
   * 그래서 두 정책의 답이 갈리는 국면을 UI로 직접 만든다: 홈(선축)·원정 각 2킥, 2점 대
   * 0점. 남은 1킥씩으로도 따라잡을 수 없어 A2는 종료를 허용하지만, 조기 종료를 끈 A1은
   * 세 번째 킥까지 기다린다.
   */
  async function openPanelAndKickTwoRounds(policy?: { earlyStop: boolean }): Promise<HTMLElement> {
    setup(policy === undefined ? {} : { penaltyShootoutPolicy: policy });
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    fireEvent.click(screen.getByRole('button', { name: /승부차기 시작/ }));
    const startDialog = await screen.findByRole('dialog');
    fireEvent.click(within(startDialog).getByRole('button', { name: '승부차기 시작' }));

    const panel = await screen.findByRole('dialog', { name: '승부차기' });
    chooseFirstKicker(panel, '강남 풋살 클럽');
    const successButton = within(panel).getByRole('button', { name: /성공/ });
    const missButton = within(panel).getByRole('button', { name: /실패/ });
    // 홈 성공 / 원정 실패를 두 번 반복 → 각 2킥, 홈 2점 / 원정 0점.
    for (let round = 0; round < 2; round += 1) {
      fireEvent.click(successButton);
      fireEvent.click(missButton);
    }
    return panel;
  }

  it('earlyStop 정책이면(기본) 각 2킥 2점 대 0점에서 승부차기를 종료할 수 있다', async () => {
    const panel = await openPanelAndKickTwoRounds({ earlyStop: true });
    expect(within(panel).getByRole('button', { name: '승부차기 종료' })).not.toBeDisabled();
  });

  it('서버가 earlyStop=false를 내려주면 같은 국면에서 종료가 잠긴다 — 정책이 UI까지 배선돼 있다', async () => {
    const panel = await openPanelAndKickTwoRounds({ earlyStop: false });
    expect(within(panel).getByRole('button', { name: '승부차기 종료' })).toBeDisabled();
    expect(panel).toHaveTextContent('아직 남은 킥으로 뒤집힐 수 있어요.');
    // 미결이므로 킥 입력은 계속 열려 있다.
    expect(within(panel).getByRole('button', { name: /성공/ })).toBeEnabled();
  });

  it('서버가 정책을 안 내려주면(레거시 응답) FIFA 정규로 폴백한다', async () => {
    const panel = await openPanelAndKickTwoRounds(undefined);
    expect(within(panel).getByRole('button', { name: '승부차기 종료' })).not.toBeDisabled();
  });

  /**
   * 킥 시퀀스가 "각 2킥 2:1"에서 "각 3킥 3:0"으로 바뀐 이유: 2킥씩 찬 2:1은 **결판이
   * 아니다.** 원정에게 아직 3킥이 남아 있어 뒤집을 수 있기 때문이다(FIFA 정규).
   * 예전 술어가 그 국면을 결판으로 읽은 것이 이 작업이 고치는 결함의 다른 얼굴이다 —
   * `home !== away` 하나만 봤으므로 홈이 1킥 넣은 1:0조차 결판이었다.
   *
   * 이 테스트가 지키는 계약 자체(최종 점수를 **배열 순서가 아니라 `sideKey` 기준으로**
   * 매핑해 `end` payload 에 싣는다)는 그대로다. 각 2킥 뒤 2:0 은 원정이 남은 1킥을
   * 넣어도 1점이라 수학적으로 끝난 국면이다.
   */
  it('승부차기 시작 확인 → 킥 입력(2:0) → 종료 확인을 거치면, end 커맨드가 sideKey 기준 최종 점수로 호출된다', async () => {
    setup();
    mocks.postV1GameCommand.mockResolvedValue({
      gameId: 'game-1', state: 'ENDED', version: 3, revisionId: 'rev-1', revision: 1, revisionState: 'SUBMITTED',
    });
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    fireEvent.click(screen.getByRole('button', { name: /승부차기 시작/ }));
    const startDialog = await screen.findByRole('dialog');
    fireEvent.click(within(startDialog).getByRole('button', { name: '승부차기 시작' }));

    const panel = await screen.findByRole('dialog', { name: '승부차기' });
    // 이 시나리오는 홈이 선축인 경우다 — 아래 기대 payload 의 `firstKickSideKey: 'HOME'`이
    // 그 선택의 결과다(예전에는 고를 수 없었고 항상 홈으로 굳어 있었다).
    chooseFirstKicker(panel, '강남 풋살 클럽');
    const successButton = within(panel).getByRole('button', { name: /성공/ });
    const missButton = within(panel).getByRole('button', { name: /실패/ });

    // 순서는 항상 번갈아 찬다(선축인 홈 먼저). 각 2킥 뒤 2:0 은 남은 1킥씩으로 따라잡을 수
    // 없어 규칙상 결판이고, 그 순간부터 킥 입력이 잠긴다.
    fireEvent.click(successButton); // 홈 1:0
    fireEvent.click(missButton); // 원정 1:0
    fireEvent.click(successButton); // 홈 2:0
    fireEvent.click(missButton); // 원정 2:0
    expect(successButton).toBeDisabled();
    expect(missButton).toBeDisabled();

    const finishButton = within(panel).getByRole('button', { name: '승부차기 종료' });
    expect(finishButton).not.toBeDisabled();
    fireEvent.click(finishButton);

    const finishDialog = await screen.findByRole('dialog', { name: '승부차기를 종료할까요?' });
    expect(finishDialog).toHaveTextContent('강남 풋살 클럽 2 : 0 성수 풋살 클럽');
    fireEvent.click(within(finishDialog).getByRole('button', { name: '승부차기 종료' }));

    await waitFor(() =>
      expect(mocks.postV1GameCommand).toHaveBeenCalledWith(
        'game-1',
        'end',
        expect.objectContaining({
          // 킥 수가 함께 나가야 서버도 같은 술어로 결판을 판정할 수 있다. 규칙대로
          // 끝난 종료이므로 `operatorOverride`는 **실리지 않는다** — 키 부재가 곧
          // "우회 아님"이라, 여기에 키가 생기면 감사 기록이 우회를 구분하지 못한다.
          payload: {
            penalties: { home: 2, away: 0, firstKickSideKey: 'HOME', takenHome: 2, takenAway: 2 },
          },
        }),
        COMMAND_OPTIONS,
      ),
    );
  });

  // 현장에서는 규칙보다 먼저 승부차기가 끝난다 — 한 팀이 기권하거나 선수가 없어 더 못 차면
  // 두 팀의 킥 수가 어긋난 채로 경기가 종료된다. 자동 판정만 믿으면 그 상태에서 종료가
  // 영원히 잠겨, 운영자는 **차지도 않은 킥을 지어내야만** 경기를 닫을 수 있었다.
  it('킥 수가 어긋나 자동 종료가 잠긴 상태에서도 "그래도 종료"로 end 커맨드가 실제 집계 그대로 나간다', async () => {
    setup();
    mocks.postV1GameCommand.mockResolvedValue({
      gameId: 'game-1', state: 'ENDED', version: 3, revisionId: 'rev-1', revision: 1, revisionState: 'SUBMITTED',
    });
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    fireEvent.click(screen.getByRole('button', { name: /승부차기 시작/ }));
    const startDialog = await screen.findByRole('dialog');
    fireEvent.click(within(startDialog).getByRole('button', { name: '승부차기 시작' }));

    const panel = await screen.findByRole('dialog', { name: '승부차기' });
    chooseFirstKicker(panel, '강남 풋살 클럽');
    const successButton = within(panel).getByRole('button', { name: /성공/ });
    const missButton = within(panel).getByRole('button', { name: /실패/ });

    // 홈 2킥 2점 / 원정 1킥 0점 — 원정이 남은 4킥을 다 넣으면 역전 가능하므로 규칙상 미결.
    // 아래 주석은 **점수가 아니라 킥 수와 점수**를 함께 적는다 — 이 테스트의 관심사가
    // "몇 대 몇인가"가 아니라 "누가 몇 번 찼는가"이기 때문이다.
    fireEvent.click(successButton); // 홈 1킥 1점
    fireEvent.click(missButton); // 원정 1킥 0점
    fireEvent.click(successButton); // 홈 2킥 2점 — 여기서 원정이 기권했다고 하자

    expect(within(panel).getByRole('button', { name: '승부차기 종료' })).toBeDisabled();
    fireEvent.click(within(panel).getByRole('button', { name: '그래도 종료' }));

    // 확인 문구가 평소 종료와 달라야 한다 — 이건 "예상대로 끝났나" 확인이 아니라
    // "자동 판정과 다른 결론을 낸다"는 선언이고, 킥 수까지 보여줘야 오조작을 알아챈다.
    const finishDialog = await screen.findByRole('dialog', { name: '아직 안 끝난 승부차기예요' });
    expect(finishDialog).toHaveTextContent('강남 풋살 클럽 2킥 2점');
    expect(finishDialog).toHaveTextContent('성수 풋살 클럽 1킥 0점');
    fireEvent.click(within(finishDialog).getByRole('button', { name: '그래도 종료' }));

    await waitFor(() =>
      expect(mocks.postV1GameCommand).toHaveBeenCalledWith(
        'game-1',
        'end',
        expect.objectContaining({
          // 우회 종료는 킥 수(2 vs 1)와 `operatorOverride: true`를 함께 싣는다 —
          // 서버가 이 값을 `score.penalties`에 저장해 리비전에 영구히 남기므로,
          // 나중에 "이 결과는 왜 규칙과 다른가"에 답할 수 있는 유일한 근거가 된다.
          payload: {
            penalties: {
              home: 2,
              away: 0,
              firstKickSideKey: 'HOME',
              takenHome: 2,
              takenAway: 1,
              operatorOverride: true,
            },
          },
        }),
        COMMAND_OPTIONS,
      ),
    );
  });

  it('두 팀 점수가 같으면 "승부차기 종료" 버튼이 비활성이다(무승부 승부차기는 백엔드도 거부)', async () => {
    setup();
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    fireEvent.click(screen.getByRole('button', { name: /승부차기 시작/ }));
    const startDialog = await screen.findByRole('dialog');
    fireEvent.click(within(startDialog).getByRole('button', { name: '승부차기 시작' }));

    const panel = await screen.findByRole('dialog', { name: '승부차기' });
    expect(within(panel).getByRole('button', { name: '승부차기 종료' })).toBeDisabled();
  });

  /**
   * 선축(먼저 차는 팀)을 고른다. 승부차기는 동전 던지기로 선축을 정하고 시작하므로,
   * 패널은 이걸 고르기 전까지 성공/실패 버튼을 잠근다 — 즉 킥을 기록하는 모든 시나리오는
   * 이 단계를 거쳐야 한다(실제 운영자도 그렇게 한다).
   */
  function chooseFirstKicker(panel: HTMLElement, teamName: string): void {
    fireEvent.click(within(panel).getByLabelText(teamName));
  }

  /**
   * "다음 순서" 배지가 붙은 팀 이름. 패널은 `nextPenaltyKicker`가 고른 사이드
   * 카드에만 이 배지를 렌더하므로, 배지가 어느 팀에 있는지가 곧 킥 상태다.
   */
  function nextKickerName(panel: HTMLElement): string {
    const badge = within(panel).getByText('다음 순서');
    return (badge.parentElement?.textContent ?? '').replace('다음 순서', '').trim();
  }

  /**
   * 되돌리기 검증의 증거는 **패널이 그리는 킥 상태 자체**여야 한다 — 킥 기록 배지,
   * 사이드별 점수, "다음 순서" 배지의 이동.
   *
   * 이전 판은 증거로 "'승부차기 종료' 버튼이 다시 활성화된다"를 썼는데, 그 활성화는
   * 되돌리기가 동작해서가 아니라 **결판 술어가 킥 수를 보지 않아서**(홈 1:0이면
   * 원정이 0킥이어도 결판으로 읽힘) 켜지는 것이었다. 즉 그 단언은 사용자가 보고한
   * 결함을 "정답"으로 박제하고 주석으로까지 명문화하고 있었다. 원래 의도인 "undo가
   * 실제로 상태를 되감는다"는 아래 증거들이 더 직접적으로 지킨다.
   */
  it('킥을 잘못 입력했을 때 "방금 킥 되돌리기"로 킥 상태가 되감긴다', async () => {
    setup();
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    fireEvent.click(screen.getByRole('button', { name: /승부차기 시작/ }));
    const startDialog = await screen.findByRole('dialog');
    fireEvent.click(within(startDialog).getByRole('button', { name: '승부차기 시작' }));

    const panel = await screen.findByRole('dialog', { name: '승부차기' });
    chooseFirstKicker(panel, '강남 풋살 클럽');
    const undoButton = within(panel).getByRole('button', { name: '방금 킥 되돌리기' });
    // 킥이 하나도 없으면 되돌리기 자체가 막힌다(되돌릴 대상이 없다).
    expect(undoButton).toBeDisabled();

    const awayKicks = within(panel).getByLabelText('성수 풋살 클럽 킥 기록');
    expect(awayKicks).toHaveTextContent('아직 기록된 킥이 없어요');

    const successButton = within(panel).getByRole('button', { name: /성공/ });
    fireEvent.click(successButton); // 홈 성공 → 다음은 원정
    expect(nextKickerName(panel)).toBe('성수 풋살 클럽');
    fireEvent.click(successButton); // 원정 성공 → 다음은 다시 홈
    expect(nextKickerName(panel)).toBe('강남 풋살 클럽');
    expect(within(awayKicks).getByLabelText('1번째 킥 성공')).toBeInTheDocument();
    expect(undoButton).not.toBeDisabled();

    fireEvent.click(undoButton); // 원정 킥 되돌림

    // 되돌린 킥이 기록에서 사라지고, 차례도 원정으로 되돌아간다.
    expect(awayKicks).toHaveTextContent('아직 기록된 킥이 없어요');
    expect(within(awayKicks).queryByLabelText('1번째 킥 성공')).toBeNull();
    expect(nextKickerName(panel)).toBe('성수 풋살 클럽');
    // 되돌릴 킥이 하나(홈)만 남았다가, 그것마저 되돌리면 다시 잠긴다.
    expect(undoButton).not.toBeDisabled();
    fireEvent.click(undoButton);
    expect(undoButton).toBeDisabled();
  });

  /**
   * 사용자 보고 결함의 코어. 홈이 첫 킥을 성공하면 점수는 1:0이 되고, 옛 술어
   * (`isPenaltyShootoutDecisive(home, away) { return home !== away; }`)는 킥 수를
   * 보지 않으므로 이를 "결판"으로 읽어 `disabled={!decisive}`가 풀렸다 — **원정이
   * 한 번도 차기 전에** 승부차기를 종료할 수 있었다.
   */
  it('홈만 1킥 성공한 상태에서는 "승부차기 종료"가 비활성이다 — 원정이 아직 한 번도 차지 않았다', async () => {
    setup();
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    fireEvent.click(screen.getByRole('button', { name: /승부차기 시작/ }));
    const startDialog = await screen.findByRole('dialog');
    fireEvent.click(within(startDialog).getByRole('button', { name: '승부차기 시작' }));

    const panel = await screen.findByRole('dialog', { name: '승부차기' });

    // 선축을 먼저 골라야 성공/실패 버튼이 열린다. 이걸 빼면 클릭이 무시돼(버튼 disabled)
    // 킥이 한 개도 기록되지 않고, 테스트는 "0킥이라 종료 불가"만 확인하는 공테스트가 된다
    // — 옛 술어(`home !== away`)를 되살려도 0:0이라 그대로 초록이었다.
    chooseFirstKicker(panel, '강남 풋살 클럽');
    fireEvent.click(within(panel).getByRole('button', { name: /성공/ }));

    // 홈이 실제로 1점을 넣었는지부터 확인한다 — 이 단언이 있어야 아래 disabled가
    // "1:0인데도 잠겨 있다"를 뜻한다(옛 술어라면 여기서 버튼이 열린다).
    expect(within(within(panel).getByLabelText('강남 풋살 클럽 킥 기록')).getByLabelText('1번째 킥 성공')).toBeInTheDocument();
    expect(within(panel).getByLabelText('성수 풋살 클럽 킥 기록')).toHaveTextContent('아직 기록된 킥이 없어요');
    expect(within(panel).getByRole('button', { name: '승부차기 종료' })).toBeDisabled();
    expect(panel).toHaveTextContent('성수 풋살 클럽이(가) 아직 한 번도 차지 않았어요.');
  });

  /* 종료 후 결과 표시 — 승부차기를 입력하고 종료하면 패널이 닫히고 헤더 스코어는
     골 이벤트에서만 파생돼 "0 : 0"만 남았다. 방금 입력한 승부차기 결과가 이 화면
     어디에도 없어서, 운영자는 자기가 기록한 값을 확인할 수단이 없었다(알파 실측:
     서버에는 승부차기 2:0 이 저장돼 있었다). 승부차기는 골 이벤트가 아니므로
     `liveEvents`로는 절대 복원되지 않는다 — 확정 결과 리비전에서 읽어야 한다. */
  describe('종료된 경기의 승부차기 결과', () => {
    function setupEnded(revisions: Array<Record<string, unknown>>, currentOfficialRevisionId: string | null = null) {
      mocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'user-1' } } });
      mocks.useV1FixtureLineup.mockReturnValue({
        data: { gameId: 'game-1', lineups: [] },
        isLoading: false, isError: false, error: null, refetch: vi.fn(),
      });
      mocks.useV1Game.mockReturnValue({
        data: {
          id: 'game-1',
          sourceType: 'TOURNAMENT_FIXTURE',
          isKnockoutFixture: true,
          state: 'ENDED', version: 3, lastSequence: 2,
          currentOfficialRevisionId,
          periods: [FIRST_PERIOD, FINAL_PERIOD],
          sides: PENALTY_SIDES,
          lineups: [],
        },
        isLoading: false, isError: false, refetch: vi.fn(),
      });
      mocks.useV1GameOperationsConsole.mockReturnValue(
        consoleState({
          gameSnapshot: { version: 3, state: 'ENDED' },
          liveEvents: [tiedGoal(1, 'side-home', 'e1'), tiedGoal(2, 'side-away', 'e2')],
        }),
      );
      mocks.useV1GameResultRevisions.mockReturnValue({ data: revisions });
    }

    it('tournament adapter binds the result review panel to the game, tournament, and console variant', () => {
      setupEnded([]);

      render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

      const card = screen.getByTestId('result-confirm-card');
      expect(card).toHaveAttribute('data-game-id', 'game-1');
      expect(card).toHaveAttribute('data-tournament-id', 't-1');
      expect(card).toHaveAttribute('data-variant', 'console');
    });

    it('경기 종료 후에도 확정된 승부차기 점수를 헤더에 남긴다', () => {
      setupEnded([{ id: 'rev-1', revision: 1, state: 'DRAFT', score: { home: 1, away: 1, penalties: { home: 2, away: 0 } } }]);

      render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

      expect(screen.getByText('승부차기 2:0')).toBeInTheDocument();
      // 정규시간 스코어는 그대로 남는다 — 승부차기가 정규 점수를 덮어쓰면 안 된다.
      expect(screen.getByText('1 : 1')).toBeInTheDocument();
    });

    it('정정으로 확정본이 바뀌면 최신 리비전이 아니라 확정된 리비전의 승부차기를 보여준다', () => {
      // 목록은 revision 내림차순(서버 정렬)이다. 최신(rev-2)은 아직 확정 전 초안이고
      // 확정본은 rev-1 — 여기서 최신을 그대로 쓰면 확정되지 않은 값을 결과로 보여준다.
      setupEnded(
        [
          { id: 'rev-2', revision: 2, state: 'DRAFT', score: { home: 1, away: 1, penalties: { home: 5, away: 4 } } },
          { id: 'rev-1', revision: 1, state: 'OFFICIAL', score: { home: 1, away: 1, penalties: { home: 2, away: 0 } } },
        ],
        'rev-1',
      );

      render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

      expect(screen.getByText('승부차기 2:0')).toBeInTheDocument();
      expect(screen.queryByText('승부차기 5:4')).toBeNull();
    });

    it('결과 검수에서 점수를 정정해 확정하면 헤더는 이벤트가 아니라 확정본 점수를 보여준다', () => {
      // 이벤트 로그는 1:1 그대로지만 "고치고 확인"으로 확정본이 3:0이 됐다.
      setupEnded(
        [
          { id: 'rev-2', revision: 2, state: 'OFFICIAL', score: { home: 3, away: 0 } },
          { id: 'rev-1', revision: 1, state: 'SUPERSEDED', score: { home: 1, away: 1 } },
        ],
        'rev-2',
      );

      render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

      expect(screen.getByText('3 : 0')).toBeInTheDocument();
      expect(screen.queryByText('1 : 1')).toBeNull();
    });

    it('승부차기 없이 끝난 경기에는 승부차기 표기를 만들지 않는다', () => {
      setupEnded([{ id: 'rev-1', revision: 1, state: 'DRAFT', score: { home: 2, away: 1 } }]);

      render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

      expect(screen.queryByText(/승부차기/)).toBeNull();
    });
  });
});

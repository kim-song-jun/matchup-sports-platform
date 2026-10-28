import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render as renderElement, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as overlayHistory from '@/lib/overlay-history';
import type { GameDetail, GameLineup } from '@/types/game-operations';
import { TeamMatchOperateConsole } from './team-match-operate-console';

const queryClients: QueryClient[] = [];
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
  useV1Game: vi.fn(),
  useV1GameOperationsLineup: vi.fn(),
  useV1GameOperationsConsole: vi.fn(),
  postV1GameCommand: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  useV1AuthMe: () => mocks.useV1AuthMe(),
}));
vi.mock('@/hooks/use-v1-game-operations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-game-operations')>()),
  useV1Game: (...args: unknown[]) => mocks.useV1Game(...args),
  useV1GameOperationsLineup: (...args: unknown[]) => mocks.useV1GameOperationsLineup(...args),
  postV1GameCommand: (...args: unknown[]) => mocks.postV1GameCommand(...args),
}));
vi.mock('@/hooks/use-v1-game-operations-console', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-game-operations-console')>()),
  useV1GameOperationsConsole: (...args: unknown[]) => mocks.useV1GameOperationsConsole(...args),
}));


beforeEach(() => {
  mocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'user-1' } } });
  mocks.useV1GameOperationsConsole.mockReturnValue(consoleState());
  mocks.postV1GameCommand.mockClear();
  mocks.postV1GameCommand.mockResolvedValue({ gameId: 'game-1', state: 'LIVE', version: 3 });
});

function consoleState(overrides: Record<string, unknown> = {}) {
  return {
    canOperate: true,
    connectionStatus: 'connected',
    sync: { status: 'synced', lastSequence: 1 },
    takeover: { status: 'held', token: 'tok', expiresAtMs: Date.now() + 60000, assignmentVersion: 0 },
    queue: { items: [] },
    clockOffsetMs: 0,
    liveEvents: [],
    gameSnapshot: { version: 2, state: 'LIVE' },
    bannerMessage: null,
    submitEvent: vi.fn(),
    retryFailedEvent: vi.fn(),
    requestTakeover: vi.fn(),
    reverseEvent: vi.fn(),
    assignAssist: vi.fn(),
    applyCommandResult: vi.fn(() => true),
    ...overrides,
  };
}

describe('TeamMatchOperateConsole — source binding and ordinary host actions', () => {
  const teamMatchContext = {
    teamMatchId: 'team-match-1',
    gameId: 'game-1',
    status: 'matched' as const,
    isStandalone: true,
    viewerCanManageHost: true,
  };

  beforeEach(() => {
    mocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'user-1' } } });
    mocks.useV1GameOperationsConsole.mockClear();
    mocks.useV1GameOperationsLineup.mockClear();
    mocks.postV1GameCommand.mockReset();
    mocks.postV1GameCommand.mockResolvedValue({ gameId: 'game-1', state: 'LIVE', version: 3 });
  });

  function ordinaryGameDetail(overrides: Partial<GameDetail> = {}): GameDetail {
    return {
      id: 'game-1',
      sourceType: 'TEAM_MATCH',
      state: 'LIVE',
      version: 2,
      lastSequence: 1,
      competitionConfigVersionId: 'config-1',
      currentOfficialRevisionId: null,
      sides: [
        { id: 'side-home', gameId: 'game-1', sideKey: 'HOME', teamId: 'team-home', displayNameSnapshot: '홈팀', createdAt: '', updatedAt: '' },
        { id: 'side-away', gameId: 'game-1', sideKey: 'AWAY', teamId: 'team-away', displayNameSnapshot: '원정팀', createdAt: '', updatedAt: '' },
      ],
      periods: [
        { id: 'period-1', gameId: 'game-1', number: 1, state: 'LIVE', startedAt: '2026-10-28T02:00:00.000Z', endedAt: null, pausedTotalMs: 0, pausedAt: null },
        { id: 'period-2', gameId: 'game-1', number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null, pausedTotalMs: 0, pausedAt: null },
      ],
      periodDurations: [{ durationMinutes: 20, extraTime: false }, { durationMinutes: 20, extraTime: false }],
      lineups: [],
      actorRole: 'team_owner',
      realtimeAuthorization: { kind: 'unscoped', subjectVersion: 0 },
      substitutionPolicy: { mode: 'rolling', maxSubstitutions: null },
      isKnockoutFixture: false,
      penaltyShootoutPolicy: { earlyStop: true },
      ...overrides,
    };
  }

  function mountOrdinaryConsole(detail = ordinaryGameDetail(), lineups: GameLineup[] = []) {
    mocks.useV1Game.mockReturnValue({
      data: detail,
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
      refetch: vi.fn(),
    });
    mocks.useV1GameOperationsLineup.mockReturnValue({
      data: lineups,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    mocks.useV1GameOperationsConsole.mockReturnValue(consoleState({
      canOperate: true,
      takeover: { status: 'none' },
      liveEvents: [],
      gameSnapshot: { version: detail.version, state: detail.state },
    }));
    return render(<TeamMatchOperateConsole gameId="game-1" teamMatchContext={teamMatchContext} resultHref="/team-matches/team-match-1/result" />);
  }

  it('renders the ordinary host core without a tournament role provider and hides generic end', async () => {
    mountOrdinaryConsole();
    await screen.findByRole('group', { name: '경기 진행 조작' });

    expect(screen.getByRole('group', { name: '경기 진행 조작' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '경기 종료' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '결과 보내기' })).toHaveAttribute(
      'href',
      '/team-matches/team-match-1/result',
    );
    expect(mocks.useV1GameOperationsConsole).toHaveBeenCalledWith(expect.objectContaining({
      operationMode: 'ordinary-host',
      gameSourceType: 'TEAM_MATCH',
      gameActorRole: 'team_owner',
      teamMatchContext,
    }));
  });

  it('does not expose live controls or roster data when the returned Game does not match the TeamMatch', () => {
    mountOrdinaryConsole(ordinaryGameDetail({ id: 'game-other' }));

    expect(screen.getByRole('alert')).toHaveTextContent('팀매치와 경기 정보가 일치하지 않아요');
    expect(screen.queryByRole('group', { name: '경기 진행 조작' })).not.toBeInTheDocument();
    expect(screen.queryByText('홈팀')).not.toBeInTheDocument();
    expect(mocks.useV1GameOperationsLineup).not.toHaveBeenCalled();
  });

  it.each([
    ['tournament source', { sourceType: 'TOURNAMENT_FIXTURE' as const }],
    ['opposing manager role', { actorRole: 'opponent_manager' as const }],
    ['leased authorization', { realtimeAuthorization: { kind: 'staff' as const, subjectVersion: 4 } }],
  ])('does not load host controls or lineups for a Game with %s', (_name, detailOverrides) => {
    mountOrdinaryConsole(ordinaryGameDetail(detailOverrides));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '경기 진행 조작' })).not.toBeInTheDocument();
    expect(mocks.useV1GameOperationsLineup).not.toHaveBeenCalled();
    expect(mocks.useV1GameOperationsConsole).not.toHaveBeenCalled();
  });

  it.each([
    ['non-matched detail', { status: 'recruiting' as const }],
    ['league context', { isStandalone: false }],
    ['opponent manager', { viewerCanManageHost: false }],
  ])('keeps the console closed for a TeamMatch with %s', (_name, contextOverrides) => {
    const context = { ...teamMatchContext, ...contextOverrides };
    mocks.useV1Game.mockReturnValue({
      data: ordinaryGameDetail(),
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
      refetch: vi.fn(),
    });

    render(<TeamMatchOperateConsole gameId="game-1" teamMatchContext={context} resultHref="/team-matches/team-match-1/result" />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '경기 진행 조작' })).not.toBeInTheDocument();
    expect(mocks.useV1GameOperationsLineup).not.toHaveBeenCalled();
    expect(mocks.useV1GameOperationsConsole).not.toHaveBeenCalled();
  });

  it('sends an ordinary host period command without a lease token', async () => {
    mountOrdinaryConsole();
    mocks.postV1GameCommand.mockResolvedValue({ gameId: 'game-1', state: 'LIVE', version: 3 });

    fireEvent.click(screen.getByRole('button', { name: '전반 종료' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '전반 종료' }));

    await waitFor(() => expect(mocks.postV1GameCommand).toHaveBeenCalledTimes(1));
    const [, command, body] = mocks.postV1GameCommand.mock.calls[0];
    expect(command).toBe('end-period');
    expect(body).not.toHaveProperty('takeoverToken');
  });

  it('waits for the real confirmation dismissal and suppresses its continuation after unmount', async () => {
    let resolveDismissal!: () => void;
    const dismissal = new Promise<void>((resolve) => { resolveDismissal = resolve; });
    const waitForDismissal = vi.spyOn(overlayHistory, 'waitForOverlayHistory').mockReturnValue(dismissal);
    const view = mountOrdinaryConsole();

    fireEvent.click(screen.getByRole('button', { name: '일시 중지' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('일시 중지');
    fireEvent.click(within(dialog).getByRole('button', { name: '일시 중지' }));
    await waitFor(() => expect(waitForDismissal).toHaveBeenCalledTimes(1));
    view.unmount();

    await act(async () => {
      resolveDismissal();
      await dismissal;
    });

    expect(mocks.postV1GameCommand).not.toHaveBeenCalled();
    waitForDismissal.mockRestore();
  });

  it('starts with the host-side lineup returned by the ordinary operations endpoint without claiming the hidden opponent is missing', () => {
    const hostLineup: GameLineup = {
      id: 'host-lineup',
      gameId: 'game-1',
      sideId: 'side-home',
      revision: 1,
      state: 'DRAFT',
      version: 1,
      submittedAt: null,
      supersedesId: null,
      formation: null,
      createdAt: '',
      updatedAt: '',
      invalidatedAt: null,
      participants: [{
        id: 'host-player',
        gameId: 'game-1',
        sideId: 'side-home',
        lineupId: 'host-lineup',
        userId: null,
        displayNameSnapshot: '호스트 선수',
        jerseyNumber: 7,
        position: null,
        positionX: null,
        positionY: null,
        started: true,
        arrivedAt: null,
        createdAt: '',
        updatedAt: '',
      }],
    };
    const scheduledGame = ordinaryGameDetail({
      state: 'SCHEDULED',
      version: 1,
      periods: [
        { id: 'period-1', gameId: 'game-1', number: 1, state: 'SCHEDULED', startedAt: null, endedAt: null, pausedTotalMs: 0, pausedAt: null },
        { id: 'period-2', gameId: 'game-1', number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null, pausedTotalMs: 0, pausedAt: null },
      ],
    });
    mountOrdinaryConsole(scheduledGame, [hostLineup]);

    expect(screen.getByRole('button', { name: '경기 시작' })).toBeEnabled();
    expect(screen.queryByText(/원정팀.*출전 선수가 없어요/)).not.toBeInTheDocument();
    expect(screen.queryByText(/원정팀.*아직 출전 명단을 제출하지 않았어요/)).not.toBeInTheDocument();
  });

  it('routes the ordinary host to result submission when its final period ends', () => {
    const finishedPeriods = ordinaryGameDetail({
      periods: [
        { id: 'period-1', gameId: 'game-1', number: 1, state: 'ENDED', startedAt: '2026-10-28T02:00:00.000Z', endedAt: '2026-10-28T02:20:00.000Z', pausedTotalMs: 0, pausedAt: null },
        { id: 'period-2', gameId: 'game-1', number: 2, state: 'ENDED', startedAt: '2026-10-28T02:20:00.000Z', endedAt: '2026-10-28T02:40:00.000Z', pausedTotalMs: 0, pausedAt: null },
      ],
    });
    mountOrdinaryConsole(finishedPeriods);

    expect(screen.getByText(/정규 시간이 끝났어요/)).toBeInTheDocument();
    expect(screen.queryByText(/‘경기 종료’를 눌러주세요/)).not.toBeInTheDocument();
    const resultLink = screen.getByRole('link', { name: '결과 제출 화면 열기' });
    expect(resultLink).toHaveAttribute(
      'href',
      '/team-matches/team-match-1/result',
    );
    expect(resultLink).toHaveStyle({ minHeight: 'var(--size-touch-min)' });
  });
});

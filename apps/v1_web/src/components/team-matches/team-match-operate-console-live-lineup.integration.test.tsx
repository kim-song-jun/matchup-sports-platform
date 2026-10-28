import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { transferableAbortController } from 'node:util';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { v1Keys } from '@/lib/query-keys';
import type { GameDetail, GameLineup } from '@/types/game-operations';
import { TeamMatchOperateConsole } from './team-match-operate-console';

const state = vi.hoisted(() => ({ gameState: 'SCHEDULED' as 'SCHEDULED' | 'LIVE' }));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  useV1AuthMe: () => ({ data: { user: { id: 'host-user' } } }),
}));

vi.mock('@/hooks/use-v1-game-operations-console', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-game-operations-console')>()),
  useV1GameOperationsConsole: () => ({
    canOperate: true,
    connectionStatus: 'connected',
    sync: { status: 'ok', lastSequence: 0 },
    takeover: { status: 'held', token: null, expiresAtMs: null, assignmentVersion: 0 },
    queue: { items: [] },
    clockOffsetMs: 0,
    liveEvents: [],
    gameSnapshot: { version: state.gameState === 'LIVE' ? 2 : 1, state: state.gameState },
    bannerMessage: null,
    submitEvent: vi.fn(),
    retryFailedEvent: vi.fn(),
    requestTakeover: vi.fn(),
    reverseEvent: vi.fn(),
    assignAssist: vi.fn(),
    applyCommandResult: vi.fn(() => true),
  }),
}));

const success = (data: unknown) => HttpResponse.json({
  status: 'success',
  data,
  timestamp: '2026-10-28T00:00:00.000Z',
});

function detail(): GameDetail {
  return {
    id: 'game-1',
    sourceType: 'TEAM_MATCH',
    state: state.gameState,
    version: state.gameState === 'LIVE' ? 2 : 1,
    lastSequence: 0,
    competitionConfigVersionId: 'config-1',
    currentOfficialRevisionId: null,
    sides: [
      { id: 'side-home', gameId: 'game-1', sideKey: 'HOME', teamId: 'team-home', displayNameSnapshot: '홈팀', createdAt: '', updatedAt: '' },
      { id: 'side-away', gameId: 'game-1', sideKey: 'AWAY', teamId: 'team-away', displayNameSnapshot: '원정팀', createdAt: '', updatedAt: '' },
    ],
    periods: [{
      id: 'period-1', gameId: 'game-1', number: 1,
      state: state.gameState === 'LIVE' ? 'LIVE' : 'SCHEDULED',
      startedAt: state.gameState === 'LIVE' ? '2026-10-28T00:00:00.000Z' : null,
      endedAt: null, pausedTotalMs: 0, pausedAt: null,
    }],
    periodDurations: [{ durationMinutes: 20, extraTime: false }],
    lineups: [],
    actorRole: 'team_owner',
    realtimeAuthorization: { kind: 'unscoped', subjectVersion: 0 },
    substitutionPolicy: { mode: 'rolling', maxSubstitutions: null },
    isKnockoutFixture: false,
    penaltyShootoutPolicy: { earlyStop: true },
  } as GameDetail;
}

function lineup(sideId: string, participantId: string, name: string): GameLineup {
  return {
    id: `${sideId}-lineup`,
    gameId: 'game-1',
    sideId,
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
      id: participantId,
      gameId: 'game-1',
      sideId,
      lineupId: `${sideId}-lineup`,
      userId: null,
      displayNameSnapshot: name,
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
}

const homeLineup = lineup('side-home', 'home-player', '우리 선수');
const awayLineup = lineup('side-away', 'away-player', '상대 선수');
let lineupReadCount = 0;
const server = setupServer(
  http.get('*/api/v1/games/game-1', () => success(detail())),
  http.get('*/api/v1/games/game-1/operations-lineup', () => {
    lineupReadCount += 1;
    return success(state.gameState === 'LIVE' ? [homeLineup, awayLineup] : [homeLineup]);
  }),
  http.post('*/api/v1/games/:gameId/commands/:command', ({ params }) => {
    if (params.gameId !== 'game-1' || params.command !== 'start') {
      return HttpResponse.json({ status: 'error', message: 'Unexpected game command' }, { status: 404 });
    }
    state.gameState = 'LIVE';
    return success({ gameId: 'game-1', state: 'LIVE', version: 2, durableCommandId: 'command-1', replayed: false });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  state.gameState = 'SCHEDULED';
  lineupReadCount = 0;
  const interceptedFetch = globalThis.fetch.bind(globalThis);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const sourceSignal = init?.signal;
    const compatibleController = sourceSignal ? transferableAbortController() : null;
    const forwardAbort = () => compatibleController?.abort(sourceSignal?.reason);
    if (sourceSignal?.aborted) forwardAbort();
    else sourceSignal?.addEventListener('abort', forwardAbort, { once: true });
    try {
      return await interceptedFetch(input, compatibleController
        ? { ...init, signal: compatibleController.signal }
        : init);
    } finally {
      sourceSignal?.removeEventListener('abort', forwardAbort);
    }
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

it('경기 시작 뒤 실제 operations-lineup 쿼리를 갱신해 상대 선수를 실제 이벤트 선택기에 보여준다', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  const teamMatchContext = {
    teamMatchId: 'team-match-1',
    gameId: 'game-1',
    status: 'matched' as const,
    isStandalone: true,
    viewerCanManageHost: true,
  };

  render(
    <QueryClientProvider client={client}>
      <TeamMatchOperateConsole gameId="game-1" teamMatchContext={teamMatchContext} resultHref="/team-matches/team-match-1/result" />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(lineupReadCount).toBe(1));
  expect(client.getQueryData(v1Keys.gameOperationsLineup('game-1'))).toEqual([homeLineup]);
  expect(screen.queryByText('상대 선수')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '경기 시작' }));
  const confirmation = await screen.findByRole('dialog');
  fireEvent.click(within(confirmation).getByRole('button', { name: '경기 시작' }));
  await waitFor(() => expect(state.gameState).toBe('LIVE'));
  await screen.findByRole('button', { name: '일시 중지' });
  expect(screen.getByRole('button', { name: '골' })).toBeEnabled();

  fireEvent.click(screen.getByRole('button', { name: '골' }));
  const goalPicker = await screen.findByRole('dialog');
  expect(await within(goalPicker).findByText('상대 선수')).toBeInTheDocument();
  expect(lineupReadCount).toBeGreaterThanOrEqual(2);

  await act(async () => client.clear());
});

it('시작 뒤 operations-lineup 재조회가 실패하면 기존 오류 화면에서 다시 불러와 상대 명단을 반영한다', async () => {
  let reads = 0;
  server.use(http.get('*/api/v1/games/game-1/operations-lineup', () => {
    reads += 1;
    if (reads === 2) {
      return HttpResponse.json({
        status: 'error',
        statusCode: 400,
        code: 'LINEUP_REFRESH_REJECTED',
        message: '명단을 갱신할 수 없어요.',
        timestamp: '2026-10-28T00:00:00.000Z',
      }, { status: 400 });
    }
    return success(state.gameState === 'LIVE' ? [homeLineup, awayLineup] : [homeLineup]);
  }), http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })));

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  const teamMatchContext = {
    teamMatchId: 'team-match-1',
    gameId: 'game-1',
    status: 'matched' as const,
    isStandalone: true,
    viewerCanManageHost: true,
  };
  render(
    <QueryClientProvider client={client}>
      <TeamMatchOperateConsole gameId="game-1" teamMatchContext={teamMatchContext} resultHref="/team-matches/team-match-1/result" />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(reads).toBe(1));
  fireEvent.click(screen.getByRole('button', { name: '경기 시작' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '경기 시작' }));
  await screen.findByRole('button', { name: '일시 중지' });

  const rosterError = await screen.findByRole('alert');
  expect(state.gameState).toBe('LIVE');
  expect(rosterError).toHaveTextContent('경기 명단을 불러오지 못했어요');
  expect(rosterError).toHaveTextContent('명단을 갱신할 수 없어요.');
  expect(screen.queryByRole('button', { name: '골' })).not.toBeInTheDocument();
  expect(reads).toBe(2);
  fireEvent.click(within(rosterError).getByRole('button', { name: '다시 시도하기' }));
  await waitFor(() => expect(reads).toBe(3));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(client.getQueryData(v1Keys.gameOperationsLineup('game-1'))).toEqual([homeLineup, awayLineup]);

  fireEvent.click(screen.getByRole('button', { name: '골' }));
  expect(await within(await screen.findByRole('dialog')).findByText('상대 선수')).toBeInTheDocument();
  await act(async () => client.clear());
});

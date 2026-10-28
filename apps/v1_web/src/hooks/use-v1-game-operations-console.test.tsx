import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

/**
 * D-10 (frozen decision table) says `reverseEvent` must be the ONLY escape
 * hatch that stays online-only — it must never enter the durable offline
 * queue the way `submitEvent` does. The previous version of this file only
 * asserted the unrelated `assertQueueable('reverse_event')` helper throws,
 * without ever calling `useV1GameOperationsConsole`/`reverseEvent` — it
 * would keep passing even if a refactor routed `reverseEvent` through
 * `dispatchQueue`/`game.event.append`. This drives the real hook end to end
 * (socket ack -> takeover grant -> snapshot -> reverseEvent) and asserts on
 * its actual side effects: a direct REST call, and an untouched queue.
 */

const mockSocket = {
  connected: true,
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn((event: string, _payload: unknown, cb?: (result: unknown) => void) => {
    if (event === 'game.subscribe' && cb) {
      cb({
        status: 'subscribed',
        snapshot: { gameId: 'game-1', version: 5, state: 'LIVE', lastSequence: 0, events: [] },
      });
    } else if (event === 'game.takeover.request' && cb) {
      cb({
        status: 'granted',
        takeoverToken: 'tok-1',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    }
    // Other events (game.time.ping, game.takeover.renew, and — the thing
    // this test polices — game.event.append) are deliberately left unacked:
    // reverseEvent must never need to emit `game.event.append` at all.
  }),
};

const mockV1Post = vi.fn(async (..._args: unknown[]) => ({ gameId: 'game-1', state: 'LIVE', version: 6 }));

vi.mock('@/lib/v1-game-operations-socket', () => ({
  getV1GameOperationsSocket: () => mockSocket,
  setGameOperationsAuthorizationSubjectVersion: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({
  v1Post: (...args: unknown[]) => mockV1Post(...args),
}));

function createWrapper(queryClient: QueryClient) {
  return function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('useV1GameOperationsConsole — reverseEvent must never enter the offline queue', () => {
  it('sends a direct REST reversal and leaves the durable queue (in-memory and persisted) empty', async () => {
    const { useV1GameOperationsConsole } = await import('./use-v1-game-operations-console');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, unmount } = renderHook(
      () =>
        useV1GameOperationsConsole({
          gameId: 'game-1',
          gameDetailGameId: 'game-1',
          gameDetailStatus: 'success',
          realtimeAuthorization: { kind: 'unscoped', subjectVersion: 0 },
          initialLastSequence: 0,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.gameSnapshot).not.toBeNull());
    await waitFor(() => expect(result.current.takeover.status).toBe('held'));

    await act(async () => {
      await result.current.reverseEvent({ eventId: 'event-1', reason: '오심 정정' });
    });

    expect(mockV1Post).toHaveBeenCalledWith(
      '/games/game-1/events/event-1/reverse',
      expect.objectContaining({
        expectedVersion: 5,
        takeoverToken: 'tok-1',
        reason: '오심 정정',
      }),
      expect.objectContaining({ headers: { 'Idempotency-Key': expect.any(String) } }),
    );

    // The offline queue reducer's state never saw an ENQUEUE for this call.
    expect(result.current.queue.items).toHaveLength(0);
    // Nor did the socket-flush path (`sendQueuedItem`) ever fire.
    expect(mockSocket.emit).not.toHaveBeenCalledWith(
      'game.event.append',
      expect.anything(),
      expect.anything(),
    );
    // And nothing leaked into the durable localStorage-persisted queue either.
    const persisted = JSON.parse(
      window.localStorage.getItem('teameet.v1.gameOps.queue.game-1') ?? '{"items":[]}',
    );
    expect(persisted.items).toHaveLength(0);

    unmount();
  });
});

describe('useV1GameOperationsConsole — source-aware operation modes', () => {
  const ordinaryHostContext = {
    teamMatchId: 'team-match-1',
    gameId: 'game-1',
    status: 'matched' as const,
    isStandalone: true,
    viewerCanManageHost: true,
  };

  it('lets the server-authorized ordinary host operate without acquiring a takeover lease', async () => {
    const { useV1GameOperationsConsole } = await import('./use-v1-game-operations-console');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, unmount } = renderHook(
      () =>
        useV1GameOperationsConsole({
          gameId: 'game-1',
          gameDetailGameId: 'game-1',
          gameDetailStatus: 'success',
          realtimeAuthorization: { kind: 'unscoped', subjectVersion: 0 },
          gameSourceType: 'TEAM_MATCH',
          gameActorRole: 'team_manager',
          operationMode: 'ordinary-host',
          teamMatchContext: ordinaryHostContext,
          initialLastSequence: 0,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.gameSnapshot).not.toBeNull());
    expect(result.current.canOperate).toBe(true);
    expect(result.current.takeover.status).toBe('none');
    expect(mockSocket.emit).not.toHaveBeenCalledWith('game.takeover.request', expect.anything(), expect.anything());

    await act(async () => {
      await result.current.reverseEvent({ eventId: 'event-1', reason: '오심 정정' });
    });
    expect(mockV1Post).toHaveBeenCalledWith(
      '/games/game-1/events/event-1/reverse',
      expect.objectContaining({ expectedVersion: 5, clientEventId: expect.any(String), reason: '오심 정정' }),
      expect.objectContaining({ headers: { 'Idempotency-Key': expect.any(String) } }),
    );
    const [, body] = mockV1Post.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(body).not.toHaveProperty('takeoverToken');

    await act(async () => {
      await result.current.submitEvent({
        type: 'GOAL', period: 1, clockMs: 0, occurredAt: new Date().toISOString(), payload: {},
      });
    });
    await waitFor(() => expect(mockSocket.emit).toHaveBeenCalledWith(
      'game.event.append',
      expect.objectContaining({ gameId: 'game-1', event: expect.objectContaining({ type: 'GOAL' }) }),
      expect.any(Function),
    ));
    const eventPayload = mockSocket.emit.mock.calls.find(([event]) => event === 'game.event.append')?.[1] as Record<string, unknown>;
    expect(eventPayload).not.toHaveProperty('takeoverToken');
    unmount();
  });

  it.each([
    { label: 'opposing manager', context: { ...ordinaryHostContext, viewerCanManageHost: false }, sourceType: 'TEAM_MATCH' as const, role: 'team_manager' as const },
    { label: 'wrong source', context: ordinaryHostContext, sourceType: 'TOURNAMENT_FIXTURE' as const, role: 'team_manager' as const },
    { label: 'recruiting', context: { ...ordinaryHostContext, status: 'recruiting' as const }, sourceType: 'TEAM_MATCH' as const, role: 'team_manager' as const },
    { label: 'completed', context: { ...ordinaryHostContext, status: 'completed' as const }, sourceType: 'TEAM_MATCH' as const, role: 'team_manager' as const },
    { label: 'cancelled', context: { ...ordinaryHostContext, status: 'cancelled' as const }, sourceType: 'TEAM_MATCH' as const, role: 'team_manager' as const },
  ])('keeps an unauthorized ordinary-host context read-only: $label', async ({ context, sourceType, role }) => {
    const { useV1GameOperationsConsole } = await import('./use-v1-game-operations-console');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, unmount } = renderHook(
      () =>
        useV1GameOperationsConsole({
          gameId: 'game-1',
          gameDetailGameId: 'game-1',
          gameDetailStatus: 'success',
          realtimeAuthorization: { kind: 'unscoped', subjectVersion: 0 },
          gameSourceType: sourceType,
          gameActorRole: role,
          operationMode: 'ordinary-host',
          teamMatchContext: context,
          initialLastSequence: 0,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.gameSnapshot).not.toBeNull());
    expect(result.current.canOperate).toBe(false);
    expect(mockSocket.emit).not.toHaveBeenCalledWith('game.takeover.request', expect.anything(), expect.anything());
    await act(async () => {
      await expect(result.current.submitEvent({
        type: 'GOAL', period: 1, clockMs: 0, occurredAt: new Date().toISOString(), payload: {},
      })).resolves.toBeNull();
      await expect(result.current.reverseEvent({ eventId: 'event-1', reason: '오심 정정' })).rejects.toThrow();
    });
    expect(mockV1Post).not.toHaveBeenCalled();
    expect(result.current.queue.items).toHaveLength(0);
    unmount();
  });
});

/**
 * Issue #376 — the old `attachAssist` (operate-console.tsx) called
 * `ops.reverseEvent` then `ops.submitEvent` from the same render's `ops`
 * closure; `submitEvent`'s queued item captured `gameSnapshot.version` from
 * BEFORE `reverseEvent`'s version bump landed in state, so the re-submitted
 * GOAL structurally carried a stale `expectedVersion`. `assignAssist`
 * replaces both calls with one direct REST command — this test asserts it
 * sends the version straight from the hook's own `gameSnapshot` (the same
 * source `reverseEvent` above reads) and, like `reverseEvent`, never touches
 * the offline queue at all, so there is no second call whose version could
 * ever go stale.
 */
describe('useV1GameOperationsConsole — assignAssist must never enter the offline queue', () => {
  it('sends a direct REST assist-assign call and leaves the durable queue empty', async () => {
    const { useV1GameOperationsConsole } = await import('./use-v1-game-operations-console');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, unmount } = renderHook(
      () =>
        useV1GameOperationsConsole({
          gameId: 'game-1',
          gameDetailGameId: 'game-1',
          gameDetailStatus: 'success',
          realtimeAuthorization: { kind: 'unscoped', subjectVersion: 0 },
          initialLastSequence: 0,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.gameSnapshot).not.toBeNull());
    await waitFor(() => expect(result.current.takeover.status).toBe('held'));

    await act(async () => {
      await result.current.assignAssist({ eventId: 'event-1', assistParticipantId: 'participant-2' });
    });

    expect(mockV1Post).toHaveBeenCalledWith(
      '/games/game-1/events/event-1/assist',
      expect.objectContaining({
        expectedVersion: 5,
        takeoverToken: 'tok-1',
        assistParticipantId: 'participant-2',
      }),
      expect.objectContaining({ headers: { 'Idempotency-Key': expect.any(String) } }),
    );

    expect(result.current.queue.items).toHaveLength(0);
    expect(mockSocket.emit).not.toHaveBeenCalledWith(
      'game.event.append',
      expect.anything(),
      expect.anything(),
    );
    const persisted = JSON.parse(
      window.localStorage.getItem('teameet.v1.gameOps.queue.game-1') ?? '{"items":[]}',
    );
    expect(persisted.items).toHaveLength(0);

    unmount();
  });
});

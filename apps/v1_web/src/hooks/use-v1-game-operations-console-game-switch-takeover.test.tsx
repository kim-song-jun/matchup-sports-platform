import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { GameEventRecord, GameTakeoverGrant } from '@/types/game-operations';

const GAME_A = '00000000-0000-4000-8000-000000000139';
const GAME_B = '00000000-0000-4000-8000-000000000140';
const USER_ID = '00000000-0000-4000-8000-000000000001';
const SIDE_ID = '00000000-0000-4000-8000-000000000002';
type Ack = (result: unknown) => void;
type Snapshot = { readonly gameId: string; readonly version: number; readonly state: 'LIVE'; readonly lastSequence: number; readonly events: readonly GameEventRecord[] };

function createTransport(delayFirstA: boolean) {
  const handlers = new Map<string, (payload: unknown) => void>();
  const games = new Map<string, Snapshot>([
    [GAME_A, { gameId: GAME_A, version: 7, state: 'LIVE', lastSequence: 0, events: [] }],
    [GAME_B, { gameId: GAME_B, version: 2, state: 'LIVE', lastSequence: 0, events: [] }],
  ]);
  const leases = new Map<string, GameTakeoverGrant>();
  const requests: unknown[] = [];
  const sends: unknown[] = [];
  let authorizationSubjectVersion = 0;
  let delayedA: (() => void) | undefined;
  function fire(event: string, payload: unknown) { handlers.get(event)?.(payload); }
  function readGame(payload: unknown) {
    if (typeof payload !== 'object' || payload === null || !('gameId' in payload) || typeof payload.gameId !== 'string') throw new Error('The actual game envelope is required.');
    const game = games.get(payload.gameId);
    if (!game) throw new Error('The fixture permits only the two authorized route games.');
    return { payload, game };
  }
  const socket = {
    connected: true,
    on(event: string, handler: (payload: unknown) => void) { handlers.set(event, handler); },
    off(event: string) { handlers.delete(event); },
    emit(event: string, raw: unknown, ack?: Ack) {
      if (!ack) return;
      if (event === 'game.time.ping') {
        if (typeof raw !== 'object' || raw === null || !('clientSentAt' in raw) || typeof raw.clientSentAt !== 'number') throw new Error('The actual clock ping is required.');
        ack({ clientSentAt: raw.clientSentAt, serverReceivedAt: Date.now(), serverSentAt: Date.now() });
        return;
      }
      const { payload, game } = readGame(raw);
      if (event === 'game.subscribe') {
        expect(payload).toEqual({ gameId: game.gameId, afterSequence: 0 });
        fire('game.snapshot', game);
        ack({ status: 'subscribed', snapshot: game });
        return;
      }
      if (event === 'game.takeover.request') {
        if (!('authorizationSubjectVersion' in payload) || payload.authorizationSubjectVersion !== authorizationSubjectVersion || !('clientInstanceId' in payload) || typeof payload.clientInstanceId !== 'string' || !('lastSequence' in payload) || typeof payload.lastSequence !== 'number') throw new Error('The actual takeover authorization envelope is required.');
        requests.push(payload);
        const grant = { gameId: game.gameId, version: game.version, lastSequence: game.lastSequence, takeoverToken: `token-${game.gameId}-${requests.length}`, expiresAt: new Date(Date.now() + 90_000).toISOString() } satisfies GameTakeoverGrant;
        leases.set(game.gameId, grant);
        const reply = () => { fire('game.takeover.granted', grant); ack({ status: 'granted', ...grant }); };
        if (delayFirstA && game.gameId === GAME_A) { delayFirstA = false; delayedA = reply; } else reply();
        return;
      }
      if (event !== 'game.event.append') throw new Error(`Unexpected command in the fresh-event scenario: ${event}`);
      if (!('takeoverToken' in payload) || !('expectedVersion' in payload) || !('clientEventId' in payload) || typeof payload.clientEventId !== 'string' || !('payloadHash' in payload) || typeof payload.payloadHash !== 'string' || !('event' in payload)) throw new Error('The actual append envelope is required.');
      sends.push(payload);
      const lease = leases.get(game.gameId);
      if (!lease || lease.takeoverToken !== payload.takeoverToken || Date.parse(lease.expiresAt) <= Date.now()) { ack({ status: 'error', code: 'TAKEOVER_TOKEN_EXPIRED' }); return; }
      if (payload.expectedVersion !== game.version) { ack({ status: 'error', code: 'VERSION_CONFLICT' }); return; }
      const body = payload.event;
      if (typeof body !== 'object' || body === null || !('type' in body) || body.type !== 'GOAL' || !('sideId' in body) || body.sideId !== SIDE_ID || !('period' in body) || body.period !== 1 || !('clockMs' in body) || body.clockMs !== 60_000 || !('occurredAt' in body) || typeof body.occurredAt !== 'string') throw new Error('The real submitted goal body is required.');
      const record = { id: `event-${game.gameId}-1`, gameId: game.gameId, sequence: game.lastSequence + 1, clientEventId: payload.clientEventId, payloadHash: payload.payloadHash, type: 'GOAL', sideId: SIDE_ID, participantId: null, assistParticipantId: null, period: 1, clockMs: body.clockMs, occurredAt: body.occurredAt, receivedAt: new Date().toISOString(), actorUserId: USER_ID, reversesEventId: null, payload: {} } satisfies GameEventRecord;
      const latest = { ...game, version: game.version + 1, lastSequence: record.sequence, events: [...game.events, record] };
      games.set(game.gameId, latest);
      fire('game.event.committed', { gameId: game.gameId, version: latest.version, sequence: record.sequence, event: record });
      ack({ status: 'ack', clientEventId: payload.clientEventId, version: latest.version, sequence: record.sequence });
    },
  };
  return {
    socket, requests, sends, leases,
    setAuthorizationVersion(version: number) { authorizationSubjectVersion = version; },
    releaseOldA() {
      const reply = delayedA;
      if (!reply) throw new Error('The old A takeover response must actually be pending.');
      delayedA = undefined;
      reply();
    },
  };
}

vi.mock('@/lib/api-client', () => ({ v1Get: vi.fn(async () => ({ items: [] })), v1Post: vi.fn() }));
async function mount(delayFirstA = false) {
  const transport = createTransport(delayFirstA);
  vi.doMock('@/lib/v1-game-operations-socket', () => ({ getV1GameOperationsSocket: () => transport.socket, setGameOperationsAuthorizationSubjectVersion: transport.setAuthorizationVersion }));
  const { useV1GameOperationsConsole } = await import('./use-v1-game-operations-console');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { readonly children: ReactNode }) { return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>; }
  const hook = renderHook(({ gameId }: { readonly gameId: string }) => useV1GameOperationsConsole({ tournamentId: null, gameId, myUserId: USER_ID, initialLastSequence: 0 }), { wrapper, initialProps: { gameId: GAME_A } });
  await waitFor(() => expect(hook.result.current.gameSnapshot?.version).toBe(7));
  await waitFor(() => expect(transport.requests).toHaveLength(1));
  return { ...hook, transport };
}
type ConsoleHook = Awaited<ReturnType<typeof mount>>;
async function expectBAppend(hook: ConsoleHook, token: string) {
  let queuedId: string | null = null;
  await act(async () => { queuedId = await hook.result.current.submitEvent({ type: 'GOAL', sideId: SIDE_ID, period: 1, clockMs: 60_000, occurredAt: new Date().toISOString(), payload: {} }); });
  expect(queuedId).not.toBeNull();
  await waitFor(() => expect(hook.transport.sends).toHaveLength(1));
  expect(hook.transport.sends[0]).toMatchObject({ gameId: GAME_B, takeoverToken: token, expectedVersion: 2, clientEventId: queuedId });
  await waitFor(() => expect(hook.result.current.queue.items[0]).toMatchObject({ clientEventId: queuedId, gameId: GAME_B, status: 'acked', ackedVersion: 3 }));
  expect(hook.result.current.liveEvents[0]).toMatchObject({ gameId: GAME_B, clientEventId: queuedId, type: 'GOAL' });
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.resetModules(); window.localStorage.clear(); });

describe('MD-QA #139 — takeover is scoped to the active route game', () => {
  it('switching from held A automatically obtains the legitimate B lease before the next append', async () => {
    const hook = await mount();
    const grantA = hook.transport.leases.get(GAME_A);
    if (!grantA) throw new Error('A must hold a real fixture lease before navigation.');
    await waitFor(() => expect(hook.result.current.takeover).toMatchObject({ status: 'held', token: grantA.takeoverToken }));
    act(() => hook.rerender({ gameId: GAME_B }));
    await waitFor(() => expect(hook.result.current.gameSnapshot?.version).toBe(2));
    await waitFor(() => expect(hook.transport.requests).toHaveLength(2));
    expect(hook.transport.requests[1]).toMatchObject({ gameId: GAME_B });
    const grantB = hook.transport.leases.get(GAME_B);
    if (!grantB) throw new Error('B must receive its own server grant automatically.');
    expect(grantB.takeoverToken).not.toBe(grantA.takeoverToken);
    expect(hook.result.current.takeover).toMatchObject({ status: 'held', token: grantB.takeoverToken });
    await expectBAppend(hook, grantB.takeoverToken);
  });

  it('a delayed old A request response cannot replace a legitimately held B token', async () => {
    const hook = await mount(true);
    expect(hook.result.current.takeover.status).toBe('requesting');
    act(() => hook.rerender({ gameId: GAME_B }));
    await waitFor(() => expect(hook.result.current.gameSnapshot?.version).toBe(2));
    // The exposed request obtains a real B lease and isolates late ACK handling;
    // automatic acquisition without this action is independently required above.
    act(() => hook.result.current.requestTakeover());
    const grantB = hook.transport.leases.get(GAME_B);
    if (!grantB) throw new Error('The actual B request must be granted by the server.');
    await waitFor(() => expect(hook.result.current.takeover).toMatchObject({ status: 'held', token: grantB.takeoverToken }));
    act(() => hook.transport.releaseOldA());
    expect(hook.result.current.takeover).toMatchObject({ status: 'held', token: grantB.takeoverToken });
    await expectBAppend(hook, grantB.takeoverToken);
  });
});

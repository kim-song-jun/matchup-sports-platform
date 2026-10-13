import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { GameEventRecord, GameState, GameTakeoverGrant } from '@/types/game-operations';
import { deserializeQueueState } from '@/lib/game-operations-queue';

const GAME_A = '00000000-0000-4000-8000-000000000139';
const GAME_B = '00000000-0000-4000-8000-000000000140';
const USER_ID = '00000000-0000-4000-8000-000000000001';
const SIDE_ID = '00000000-0000-4000-8000-000000000002';
type Snapshot = { readonly gameId: string; readonly version: number; readonly state: GameState; readonly lastSequence: number; readonly events: readonly GameEventRecord[] };
type Ack = (result: unknown) => void;

function goal(gameId: string, sequence: number, clientEventId = `client-${gameId}-${sequence}`): GameEventRecord {
  return {
    id: `event-${gameId}-${sequence}`, gameId, sequence, clientEventId, payloadHash: `hash-${sequence}`,
    type: 'GOAL', sideId: SIDE_ID, participantId: null, assistParticipantId: null,
    period: 1, clockMs: sequence * 60_000, occurredAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(), actorUserId: USER_ID, reversesEventId: null, payload: {},
  };
}
function snapshot(gameId: string, version: number, state: GameState = 'LIVE', lastSequence = 1): Snapshot {
  return { gameId, version, state, lastSequence, events: Array.from({ length: lastSequence }, (_, index) => goal(gameId, index + 1)) };
}

function createTransport(initial: Snapshot, delayInitial = false) {
  const handlers = new Map<string, (payload: unknown) => void>();
  const servers = new Map([[initial.gameId, initial]]);
  const appends: unknown[] = [];
  const sends: { readonly event: string; readonly payload: unknown }[] = [];
  const subscriptions: unknown[] = [];
  let delayGameId: string | null = delayInitial ? initial.gameId : null;
  let delayedReply: (() => void) | undefined;
  function fire(event: string, payload: unknown) { handlers.get(event)?.(payload); }
  function readGame(payload: unknown) {
    if (typeof payload !== 'object' || payload === null || !('gameId' in payload) || typeof payload.gameId !== 'string') throw new Error('The real game envelope is required.');
    const current = servers.get(payload.gameId);
    if (!current) throw new Error('The fixture requires the requested authoritative game.');
    return current;
  }
  function reply(current: Snapshot, ack: Ack) {
    fire('game.snapshot', current);
    ack({ status: 'subscribed', snapshot: current });
  }
  const socket = {
    connected: true,
    on(event: string, handler: (payload: unknown) => void) { handlers.set(event, handler); },
    off(event: string) { handlers.delete(event); },
    emit(event: string, payload: unknown, ack?: Ack) {
      if (!ack) return;
      if (event === 'game.time.ping') {
        if (typeof payload !== 'object' || payload === null || !('clientSentAt' in payload) || typeof payload.clientSentAt !== 'number') throw new Error('The actual time ping is required.');
        ack({ clientSentAt: payload.clientSentAt, serverReceivedAt: Date.now(), serverSentAt: Date.now() });
        return;
      }
      const current = readGame(payload);
      if (event === 'game.subscribe') {
        expect(payload).toMatchObject({ gameId: current.gameId, afterSequence: 0 });
        subscriptions.push(payload);
        if (delayGameId === current.gameId) {
          delayGameId = null;
          delayedReply = () => reply(current, ack);
        } else reply(current, ack);
      }
      if (event === 'game.takeover.request') {
        ack({ status: 'granted', gameId: current.gameId, version: current.version, lastSequence: current.lastSequence, takeoverToken: `qa-token-${current.gameId}`, expiresAt: new Date(Date.now() + 60_000).toISOString() } satisfies GameTakeoverGrant & { readonly status: 'granted' });
      }
      if (event === 'game.event.append' || event === 'game.event.retry') {
        if (typeof payload !== 'object' || payload === null || !('takeoverToken' in payload) || !('clientEventId' in payload) || !('payloadHash' in payload) || !('event' in payload)) throw new Error('The actual event envelope is required.');
        const expectedVersion = event === 'game.event.retry' && 'rebasedExpectedVersion' in payload ? payload.rebasedExpectedVersion : 'expectedVersion' in payload ? payload.expectedVersion : undefined;
        if (expectedVersion === undefined) throw new Error('The command-specific version envelope is required.');
        sends.push({ event, payload });
        if (event === 'game.event.append') appends.push(payload);
        if (payload.takeoverToken !== `qa-token-${current.gameId}`) { ack({ status: 'error', code: 'STAFF_SCOPE_DENIED' }); return; }
        if (expectedVersion !== current.version) { ack({ status: 'error', code: event === 'game.event.retry' ? 'OFFLINE_EVENT_REBASE_CONFLICT' : 'VERSION_CONFLICT' }); return; }
        const eventRecord = goal(current.gameId, current.lastSequence + 1, String(payload.clientEventId));
        const latest = { ...current, version: current.version + 1, lastSequence: eventRecord.sequence, events: [...current.events, eventRecord] };
        servers.set(current.gameId, latest);
        fire('game.event.committed', { gameId: current.gameId, version: latest.version, sequence: eventRecord.sequence, event: eventRecord });
        ack({ status: 'ack', clientEventId: eventRecord.clientEventId, version: latest.version, sequence: eventRecord.sequence });
      }
    },
  };
  return {
    socket, fire, appends, sends, subscriptions,
    setServer(current: Snapshot) { servers.set(current.gameId, current); },
    delaySubscription(gameId: string) { delayGameId = gameId; },
    releaseInitial() {
      const release = delayedReply;
      if (!release) throw new Error('An initial subscription reply must actually be pending.');
      delayedReply = undefined;
      release();
    },
  };
}

vi.mock('@/lib/api-client', () => ({ v1Get: vi.fn(async () => ({ items: [] })), v1Post: vi.fn() }));
async function mount(initial: Snapshot, delayInitial = false) {
  const transport = createTransport(initial, delayInitial);
  vi.doMock('@/lib/v1-game-operations-socket', () => ({ getV1GameOperationsSocket: () => transport.socket, setGameOperationsAuthorizationSubjectVersion: vi.fn() }));
  const { useV1GameOperationsConsole } = await import('./use-v1-game-operations-console');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { readonly children: ReactNode }) { return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>; }
  const hook = renderHook(({ gameId }: { readonly gameId: string }) => useV1GameOperationsConsole({ tournamentId: null, gameId, myUserId: USER_ID, initialLastSequence: 0 }), { wrapper, initialProps: { gameId: initial.gameId } });
  await waitFor(() => expect(hook.result.current.takeover.status).toBe('held'));
  return { ...hook, transport };
}
type ConsoleHook = Awaited<ReturnType<typeof mount>>;
async function expectNextAppend(hook: ConsoleHook, gameId: string, expectedVersion: number) {
  let queuedId: string | null = null;
  await act(async () => { queuedId = await hook.result.current.submitEvent({ type: 'GOAL', sideId: SIDE_ID, period: 1, clockMs: 180_000, occurredAt: new Date().toISOString(), payload: {} }); });
  expect(queuedId).not.toBeNull();
  await waitFor(() => expect(hook.transport.appends).toHaveLength(1));
  expect(hook.transport.appends[0]).toMatchObject({ gameId, expectedVersion, takeoverToken: `qa-token-${gameId}` });
  await waitFor(() => expect(hook.result.current.queue.items.at(-1)?.status).toBe('acked'));
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.resetModules(); window.localStorage.clear(); });

describe('MD-QA #139 — snapshot races through the actual game-switch consumer', () => {
  it('an old-game singleton push cannot poison the lower version of the newly subscribed game', async () => {
    const previous = snapshot(GAME_A, 7, 'PAUSED');
    const current = snapshot(GAME_B, 2);
    const hook = await mount(previous);
    hook.transport.setServer(current);
    act(() => hook.rerender({ gameId: GAME_B }));
    act(() => hook.result.current.requestTakeover());
    act(() => {
      hook.transport.fire('game.snapshot', previous);
      hook.transport.fire('disconnect', undefined);
      hook.transport.fire('connect', undefined);
    });
    expect(hook.result.current.gameSnapshot).toEqual({ version: 2, state: 'LIVE' });
    expect(hook.result.current.liveEvents).toEqual(current.events);
    await expectNextAppend(hook, GAME_B, 2);
  });

  it('an event before the initial subscribe reply recovers its authoritative state through a real resubscribe', async () => {
    const initial = snapshot(GAME_B, 1, 'LIVE', 0);
    const current = snapshot(GAME_B, 2);
    const hook = await mount(initial, true);
    expect(hook.result.current.gameSnapshot).toBeNull();
    hook.transport.setServer(current);
    const event = current.events[0];
    if (!event) throw new Error('The committed event must be in the authoritative server snapshot.');
    act(() => {
      hook.transport.fire('game.event.committed', { gameId: GAME_B, sequence: 1, version: 2, event });
      hook.transport.releaseInitial();
    });
    await waitFor(() => expect(hook.result.current.gameSnapshot).toEqual({ version: 2, state: 'LIVE' }));
    expect(hook.result.current.liveEvents).toEqual(current.events);
    expect(hook.result.current.sync.status).toBe('synced');
    await expectNextAppend(hook, GAME_B, 2);
  });

  it('a REST pause before the initial subscribe reply recovers the PAUSED state without accepting the older reply', async () => {
    const initial = snapshot(GAME_B, 5);
    const current = snapshot(GAME_B, 6, 'PAUSED');
    const hook = await mount(initial, true);
    expect(hook.result.current.gameSnapshot).toBeNull();
    hook.transport.setServer(current);
    act(() => {
      hook.result.current.applyCommandResult({ state: 'PAUSED', version: 6 });
      hook.transport.releaseInitial();
    });
    await waitFor(() => expect(hook.result.current.gameSnapshot).toEqual({ version: 6, state: 'PAUSED' }));
    expect(hook.result.current.liveEvents).toEqual(current.events);
    await expectNextAppend(hook, GAME_B, 6);
  });

  it('a newer same-sequence assist broadcast updates the event body and an older replay cannot undo it', async () => {
    const initial = snapshot(GAME_B, 5);
    const previous = initial.events[0];
    if (!previous) throw new Error('A persisted goal is required.');
    const amended = { ...previous, assistParticipantId: '00000000-0000-4000-8000-000000000003' };
    const hook = await mount(initial);
    hook.transport.setServer({ ...initial, version: 6, events: [amended] });
    act(() => hook.transport.fire('game.event.committed', { gameId: GAME_B, sequence: 1, version: 6, event: amended }));
    await waitFor(() => expect(hook.result.current.liveEvents).toEqual([amended]));
    act(() => hook.transport.fire('game.event.committed', { gameId: GAME_B, sequence: 1, version: 5, event: previous }));
    expect(hook.result.current.liveEvents).toEqual([amended]);
    await expectNextAppend(hook, GAME_B, 6);
  });

  it('a real digest finishing after a newer commit submits the next event at the accepted version', async () => {
    const hook = await mount(snapshot(GAME_B, 5));
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const digestSpy = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => { await gate; return digest(...args); });
    let pending: Promise<string | null> | undefined;
    act(() => { pending = hook.result.current.submitEvent({ type: 'GOAL', sideId: SIDE_ID, period: 1, clockMs: 180_000, occurredAt: new Date().toISOString(), payload: {} }); });
    expect(digestSpy).toHaveBeenCalledTimes(1);
    const current = snapshot(GAME_B, 6, 'LIVE', 2);
    const committed = current.events[1];
    if (!committed) throw new Error('A newer committed event is required.');
    hook.transport.setServer(current);
    act(() => hook.transport.fire('game.event.committed', { gameId: GAME_B, sequence: 2, version: 6, event: committed }));
    await act(async () => { release?.(); await pending; });
    await waitFor(() => expect(hook.transport.sends).toHaveLength(1));
    const sent = hook.transport.sends[0];
    expect(sent?.payload).toMatchObject(sent?.event === 'game.event.retry' ? { rebasedExpectedVersion: 6 } : { expectedVersion: 6 });
    await waitFor(() => expect(hook.result.current.queue.items.at(-1)?.status).toBe('acked'));
  });

  it('a fresh offline item rebases on reconnect without changing its captured event or immutable hash', async () => {
    const hook = await mount(snapshot(GAME_B, 5));
    act(() => hook.transport.fire('disconnect', undefined));
    await act(async () => { await hook.result.current.submitEvent({ type: 'GOAL', sideId: SIDE_ID, period: 1, clockMs: 180_000, occurredAt: new Date().toISOString(), payload: {} }); });
    const captured = hook.result.current.queue.items[0];
    if (!captured) throw new Error('The real offline queue item is required.');
    expect(captured).toMatchObject({ expectedVersion: 5, status: 'queued', attempts: 0 });
    expect(hook.transport.sends).toEqual([]);
    hook.transport.setServer(snapshot(GAME_B, 6, 'LIVE', 2));
    act(() => hook.transport.fire('connect', undefined));
    await waitFor(() => expect(hook.transport.sends).toHaveLength(1));
    expect(hook.transport.sends[0]).toMatchObject({ event: 'game.event.retry', payload: { gameId: GAME_B, takeoverToken: `qa-token-${GAME_B}`, rebasedExpectedVersion: 6, event: captured.event, payloadHash: captured.payloadHash, clientEventId: captured.clientEventId } });
    await waitFor(() => expect(hook.result.current.queue.items[0]?.status).toBe('acked'));
    expect(hook.result.current.queue.items[0]).toMatchObject({ expectedVersion: 5, event: captured.event, payloadHash: captured.payloadHash });
  });

  it('a persisted item waits for the remounted game snapshot before rebasing its immutable event', async () => {
    const original = await mount(snapshot(GAME_B, 5));
    act(() => original.transport.fire('disconnect', undefined));
    await act(async () => { await original.result.current.submitEvent({ type: 'GOAL', sideId: SIDE_ID, period: 1, clockMs: 180_000, occurredAt: new Date().toISOString(), payload: {} }); });
    const captured = original.result.current.queue.items[0];
    if (!captured) throw new Error('The original hook must persist a real queued event.');
    const persisted = deserializeQueueState(window.localStorage.getItem(`teameet.v1.gameOps.queue.${GAME_B}`)).items[0];
    if (!persisted) throw new Error('The original hook must store its real queue in localStorage.');
    expect(persisted).toMatchObject({ expectedVersion: 5, payloadHash: captured.payloadHash, clientEventId: captured.clientEventId });
    expect(persisted.event).toEqual({ type: 'GOAL', sideId: SIDE_ID, period: 1, clockMs: 180_000, occurredAt: captured.event.occurredAt, payload: {} });
    expect(original.transport.sends).toEqual([]);
    original.unmount();
    vi.resetModules();
    const restored = await mount(snapshot(GAME_B, 6, 'LIVE', 2), true);
    expect(restored.result.current.gameSnapshot).toBeNull();
    await waitFor(() => expect(restored.result.current.queue.items).toHaveLength(1));
    expect(restored.transport.sends).toEqual([]);
    expect(restored.result.current.queue.items[0]).toMatchObject({ expectedVersion: 5, payloadHash: captured.payloadHash, clientEventId: captured.clientEventId, status: 'queued' });
    expect(restored.result.current.queue.items[0]?.event).toEqual(persisted.event);
    act(() => restored.transport.releaseInitial());
    await waitFor(() => expect(restored.transport.sends).toHaveLength(1));
    expect(restored.transport.sends[0]).toEqual({ event: 'game.event.retry', payload: { gameId: GAME_B, takeoverToken: `qa-token-${GAME_B}`, rebasedExpectedVersion: 6, event: persisted.event, payloadHash: captured.payloadHash, clientEventId: captured.clientEventId } });
    await waitFor(() => expect(restored.result.current.queue.items[0]?.status).toBe('acked'));
    expect(restored.result.current.queue.items[0]).toMatchObject({ expectedVersion: 5, payloadHash: captured.payloadHash, clientEventId: captured.clientEventId });
    expect(restored.result.current.queue.items[0]?.event).toEqual(persisted.event);
  });
});

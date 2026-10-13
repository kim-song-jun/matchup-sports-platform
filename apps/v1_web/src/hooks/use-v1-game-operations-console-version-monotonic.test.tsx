import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { AssignGoalAssistResult, GameEventRecord, GameMutationResult, GameState, GameTakeoverGrant } from '@/types/game-operations';

const GAME_ID = '00000000-0000-4000-8000-000000000139';
const OTHER_GAME_ID = '00000000-0000-4000-8000-000000000140';
const USER_ID = '00000000-0000-4000-8000-000000000001';
const SIDE_ID = '00000000-0000-4000-8000-000000000002';
type Snapshot = { readonly gameId: string; readonly version: number; readonly state: GameState; readonly lastSequence: number; readonly events: readonly GameEventRecord[] };
type Ack = (result: unknown) => void;

function goal(sequence: number, clientEventId = `client-${sequence}`): GameEventRecord {
  return {
    id: `event-${sequence}`, gameId: GAME_ID, sequence, clientEventId, payloadHash: `hash-${sequence}`,
    type: 'GOAL', sideId: SIDE_ID, participantId: null, assistParticipantId: null,
    period: 1, clockMs: sequence * 60_000, occurredAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(), actorUserId: USER_ID, reversesEventId: null, payload: {},
  };
}

function snapshot(version = 5, state: GameState = 'LIVE', lastSequence = 1): Snapshot {
  return { gameId: GAME_ID, version, state, lastSequence, events: Array.from({ length: lastSequence }, (_, index) => goal(index + 1)) };
}

function createSocket() {
  const handlers = new Map<string, (payload: unknown) => void>();
  const appends: { readonly payload: unknown; readonly ack: Ack }[] = [];
  const subscribes: { readonly payload: unknown; readonly ack: Ack }[] = [];
  let serverVersion = 5;
  let serverSequence = 1;
  let deferAppend = false;
  let deferSubscribe = false;
  let serverSnapshot = snapshot();
  function fire(event: string, payload: unknown) { handlers.get(event)?.(payload); }
  function acceptAppend(payload: unknown, ack: Ack) {
    if (typeof payload !== 'object' || payload === null || !('gameId' in payload) || !('expectedVersion' in payload) || !('clientEventId' in payload) || !('takeoverToken' in payload)) {
      throw new Error('The append fixture requires the real command envelope.');
    }
    if (payload.gameId !== serverSnapshot.gameId || payload.takeoverToken !== `qa-token-${serverSnapshot.gameId}`) { ack({ status: 'error', code: 'STAFF_SCOPE_DENIED' }); return; }
    if (payload.expectedVersion !== serverVersion) { ack({ status: 'error', code: 'VERSION_CONFLICT' }); return; }
    serverVersion += 1;
    serverSequence += 1;
    const event = { ...goal(serverSequence, String(payload.clientEventId)), gameId: String(payload.gameId) };
    fire('game.event.committed', { gameId: event.gameId, version: serverVersion, sequence: serverSequence, event });
    ack({ status: 'ack', version: serverVersion, sequence: serverSequence });
  }
  const socket = {
    connected: true,
    on(event: string, handler: (payload: unknown) => void) { handlers.set(event, handler); },
    off(event: string) { handlers.delete(event); },
    emit(event: string, payload: unknown, ack?: Ack) {
      if (!ack) return;
      if (event === 'game.subscribe') {
        subscribes.push({ payload, ack });
        if (!deferSubscribe) ack({ status: 'subscribed', snapshot: serverSnapshot });
      }
      if (event === 'game.takeover.request') ack({ status: 'granted', gameId: serverSnapshot.gameId, version: serverVersion, lastSequence: serverSequence, takeoverToken: `qa-token-${serverSnapshot.gameId}`, expiresAt: new Date(Date.now() + 60_000).toISOString() } satisfies GameTakeoverGrant & { readonly status: 'granted' });
      if (event === 'game.event.append') {
        appends.push({ payload, ack });
        if (!deferAppend) acceptAppend(payload, ack);
      }
    },
  };
  return {
    socket, fire, appends, subscribes,
    commit(sequence: number, version: number, clientEventId?: string) {
      serverVersion = Math.max(serverVersion, version);
      serverSequence = Math.max(serverSequence, sequence);
      fire('game.event.committed', { gameId: GAME_ID, sequence, version, event: goal(sequence, clientEventId) });
    },
    setServer(value: Snapshot) { serverSnapshot = value; serverVersion = value.version; serverSequence = value.lastSequence; },
    defer() { deferAppend = true; },
    deferSubscription() { deferSubscribe = true; },
    resume() { deferAppend = false; },
  };
}

const post = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({ v1Get: vi.fn(async () => ({ items: [] })), v1Post: (...args: unknown[]) => post(...args) }));

async function mount() {
  const transport = createSocket();
  vi.doMock('@/lib/v1-game-operations-socket', () => ({ getV1GameOperationsSocket: () => transport.socket, setGameOperationsAuthorizationSubjectVersion: vi.fn() }));
  const { useV1GameOperationsConsole } = await import('./use-v1-game-operations-console');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { readonly children: ReactNode }) { return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>; }
  const hook = renderHook(({ gameId }: { readonly gameId: string }) => useV1GameOperationsConsole({ tournamentId: null, gameId, myUserId: USER_ID, initialLastSequence: 1 }), { wrapper, initialProps: { gameId: GAME_ID } });
  await waitFor(() => expect(hook.result.current.takeover.status).toBe('held'));
  return { ...hook, transport };
}

type ConsoleHook = Awaited<ReturnType<typeof mount>>;
async function submit(hook: ConsoleHook) {
  await act(async () => { await hook.result.current.submitEvent({ type: 'GOAL', sideId: SIDE_ID, period: 1, clockMs: 180_000, occurredAt: new Date().toISOString(), payload: {} }); });
  await waitFor(() => expect(hook.transport.appends.length).toBeGreaterThan(0));
}
async function expectNextCommand(hook: ConsoleHook, version: number) {
  await submit(hook);
  expect(hook.transport.appends.at(-1)?.payload).toMatchObject({ expectedVersion: version });
  await waitFor(() => expect(hook.result.current.queue.items.at(-1)?.status).toBe('acked'));
}

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.resetModules(); window.localStorage.clear(); });

describe('MD-QA #139 — actual console consumer keeps the accepted game version', () => {
  it('an older idempotent committed replay keeps both goals and the next command succeeds at the latest version', async () => {
    const hook = await mount();
    act(() => { hook.transport.commit(2, 6); hook.transport.commit(1, 5); });
    expect(hook.result.current.liveEvents.map((event) => event.id)).toEqual(['event-1', 'event-2']);
    expect(hook.result.current.gameSnapshot).toEqual({ version: 6, state: 'LIVE' });
    expect(hook.result.current.sync.lastSequence).toBe(2);
    await expectNextCommand(hook, 6);
  });

  it('an old snapshot at the same sequence cannot undo a newer PAUSED command or its version', async () => {
    const hook = await mount();
    hook.transport.setServer(snapshot(6, 'PAUSED'));
    act(() => { hook.result.current.applyCommandResult({ state: 'PAUSED', version: 6 }); hook.transport.fire('game.snapshot', snapshot(5)); });
    expect(hook.result.current.gameSnapshot).toEqual({ version: 6, state: 'PAUSED' });
    expect(hook.result.current.liveEvents.map((event) => event.clockMs)).toEqual([60_000]);
    await expectNextCommand(hook, 6);
  });

  it('a delayed old ACK confirms its queue item but cannot roll back the newer version or sync sequence', async () => {
    const hook = await mount();
    hook.transport.defer();
    await submit(hook);
    const clientEventId = hook.result.current.queue.items[0]?.clientEventId;
    if (clientEventId === undefined) throw new Error('The real hook must enqueue the submitted goal.');
    act(() => { hook.transport.commit(2, 6, clientEventId); hook.transport.commit(3, 7); hook.transport.appends[0]?.ack({ status: 'ack', clientEventId, sequence: 2, version: 6 }); });
    expect(hook.result.current.queue.items[0]?.status).toBe('acked');
    expect(hook.result.current.gameSnapshot?.version).toBe(7);
    expect(hook.result.current.sync.lastSequence).toBe(3);
    expect(hook.result.current.liveEvents.map((event) => event.id)).toEqual(['event-1', 'event-2', 'event-3']);
    hook.transport.resume();
    await expectNextCommand(hook, 7);
  });

  it('a delayed REST command result cannot restore LIVE after a newer PAUSED result', async () => {
    const hook = await mount();
    hook.transport.setServer(snapshot(7, 'PAUSED'));
    act(() => { hook.result.current.applyCommandResult({ state: 'PAUSED', version: 7 }); hook.result.current.applyCommandResult({ state: 'LIVE', version: 6 }); });
    expect(hook.result.current.gameSnapshot).toEqual({ version: 7, state: 'PAUSED' });
    await expectNextCommand(hook, 7);
  });

  it.each(['reverse', 'assist'] as const)('a delayed %s REST result and backfill preserve a newer committed event', async (kind) => {
    const hook = await mount();
    let finish: ((value: unknown) => void) | undefined;
    post.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    let operation: Promise<void> | undefined;
    act(() => { operation = kind === 'reverse' ? hook.result.current.reverseEvent({ eventId: 'event-1', reason: 'QA correction' }) : hook.result.current.assignAssist({ eventId: 'event-1', assistParticipantId: null }); });
    act(() => hook.transport.commit(2, 7));
    const response = { gameId: GAME_ID, state: 'LIVE', version: 6, durableCommandId: 'qa-command', replayed: false } satisfies GameMutationResult;
    const assistResponse = { ...response, event: goal(1) } satisfies AssignGoalAssistResult;
    await act(async () => { finish?.(kind === 'assist' ? assistResponse : response); await operation; });
    expect(hook.result.current.gameSnapshot?.version).toBe(7);
    expect(hook.result.current.liveEvents.map((event) => event.id)).toEqual(['event-1', 'event-2']);
    await expectNextCommand(hook, 7);
  });

  it('a fresh same-sequence snapshot still updates command state and a later full snapshot still backfills', async () => {
    const hook = await mount();
    act(() => hook.transport.fire('game.snapshot', snapshot(6, 'PAUSED')));
    expect(hook.result.current.gameSnapshot).toEqual({ version: 6, state: 'PAUSED' });
    const recovered = snapshot(8, 'LIVE', 3);
    hook.transport.setServer(recovered);
    act(() => { hook.transport.fire('disconnect', undefined); hook.transport.fire('connect', undefined); });
    expect(hook.result.current.gameSnapshot).toEqual({ version: 8, state: 'LIVE' });
    expect(hook.result.current.liveEvents).toHaveLength(3);
    await expectNextCommand(hook, 8);
  });

  it('an unseen event body arriving behind an ACK still fills the timeline without lowering the version', async () => {
    const hook = await mount();
    hook.transport.setServer(snapshot(7, 'PAUSED', 2));
    act(() => { hook.result.current.applyCommandResult({ state: 'PAUSED', version: 7 }); hook.transport.fire('game.event.committed', { gameId: GAME_ID, sequence: 2, version: 6, event: goal(2) }); });
    expect(hook.result.current.gameSnapshot).toEqual({ version: 7, state: 'PAUSED' });
    expect(hook.result.current.liveEvents).toHaveLength(2);
    await expectNextCommand(hook, 7);
  });

  it('two ACKs ahead of their bodies survive an older duplicate ACK, then both bodies still arrive once', async () => {
    const hook = await mount();
    hook.transport.defer();
    await submit(hook);
    const firstId = hook.result.current.queue.items[0]?.clientEventId;
    if (firstId === undefined) throw new Error('The first real queue item is required.');
    hook.transport.setServer(snapshot(6, 'LIVE', 2));
    act(() => hook.transport.appends[0]?.ack({ status: 'ack', clientEventId: firstId, sequence: 2, version: 6 }));
    await submit(hook);
    await waitFor(() => expect(hook.transport.appends).toHaveLength(2));
    const secondId = hook.result.current.queue.items[1]?.clientEventId;
    if (secondId === undefined) throw new Error('The second real queue item is required.');
    hook.transport.setServer(snapshot(7, 'LIVE', 3));
    act(() => {
      hook.transport.appends[1]?.ack({ status: 'ack', clientEventId: secondId, sequence: 3, version: 7 });
      hook.transport.appends[0]?.ack({ status: 'ack', clientEventId: firstId, sequence: 2, version: 6 });
    });
    expect(hook.result.current.gameSnapshot?.version).toBe(7);
    expect(hook.result.current.sync.lastSequence).toBe(3);
    expect(hook.result.current.liveEvents).toHaveLength(1);
    act(() => { hook.transport.commit(2, 6, firstId); hook.transport.commit(3, 7, secondId); });
    expect(hook.result.current.liveEvents.map((event) => event.clientEventId)).toEqual(['client-1', firstId, secondId]);
    expect(hook.result.current.sync.lastSequence).toBe(3);
    hook.transport.resume();
    await expectNextCommand(hook, 7);
  });

  it('a route game change clears the previous game while a lower-version initial subscription is delayed', async () => {
    const hook = await mount();
    act(() => hook.result.current.applyCommandResult({ state: 'PAUSED', version: 7 }));
    const initial = { ...snapshot(1, 'LIVE', 0), gameId: OTHER_GAME_ID };
    hook.transport.setServer(initial);
    hook.transport.deferSubscription();
    act(() => hook.rerender({ gameId: OTHER_GAME_ID }));
    expect(hook.result.current.gameSnapshot).toBeNull();
    expect(hook.result.current.liveEvents).toEqual([]);
    const newGoal = { ...goal(1), gameId: OTHER_GAME_ID };
    const latest = { ...snapshot(2), gameId: OTHER_GAME_ID, events: [newGoal] };
    hook.transport.setServer(latest);
    act(() => {
      hook.transport.fire('game.event.committed', { gameId: OTHER_GAME_ID, sequence: 1, version: 2, event: newGoal });
      hook.transport.fire('game.snapshot', latest);
      hook.transport.subscribes.at(-1)?.ack({ status: 'subscribed', snapshot: initial });
    });
    expect(hook.result.current.gameSnapshot).toEqual({ version: 2, state: 'LIVE' });
    expect(hook.result.current.liveEvents).toEqual([newGoal]);
    act(() => hook.result.current.requestTakeover());
    await expectNextCommand(hook, 2);
  });
});

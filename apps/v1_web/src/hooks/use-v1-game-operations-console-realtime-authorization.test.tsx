import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { GameRealtimeAuthorization } from '@/types/game-operations';
import type { GameEventRecord } from '@/types/game-operations';

const GAME_A = '00000000-0000-4000-8000-000000000135';
const GAME_B = '00000000-0000-4000-8000-000000000136';
type Ack = (result: unknown) => void;
type Snapshot = { readonly gameId: string; readonly version: number; readonly state: 'LIVE'; readonly lastSequence: number; readonly events: readonly GameEventRecord[] };

type ServerRule = { readonly allowedGameId: string; readonly subjectVersion: number; readonly denialReason?: 'ASSIGNMENT_EXPIRED' };
type SocketOptions = { readonly auth: (callback: (data: Record<string, string | number>) => void) => void };

const transportHarness = vi.hoisted(() => ({
  create: undefined as undefined | ((namespace: string, options: SocketOptions) => unknown),
}));

vi.mock('socket.io-client', () => ({ io: (namespace: string, options: SocketOptions) => transportHarness.create?.(namespace, options) }));
vi.mock('@/lib/api-client', () => ({
  v1Post: vi.fn(),
}));

function createGatewayTransport(
  rules: ReadonlyMap<string, ServerRule>,
  delayedSubscribeGameId?: string,
  delayedTakeoverGameId?: string,
  delayConnect = false,
) {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const authAttempts: Array<Record<string, string | number>> = [];
  const subscriptions: Array<{ gameId: string; status: string; code?: string; reason?: string }> = [];
  const subscriptionHandshakeVersions: number[] = [];
  const takeoverRequests: string[] = [];
  const pendingSubscriptions: Array<{ readonly gameId: string; readonly acknowledge: () => void }> = [];
  const pendingTakeovers: Array<{ readonly gameId: string; readonly acknowledge: () => void }> = [];
  let handshakeVersion = -1;
  let connected = !delayConnect;
  let active = true;
  let authCallback: ((callback: (data: Record<string, string | number>) => void) => void) | undefined;
  const pendingConnections: Array<{ readonly version: number; cancelled: boolean }> = [];

  const fire = (event: string, payload: unknown) => {
    handlers.get(event)?.forEach((handler) => handler(payload));
  };
  const authenticate = () => {
    if (!authCallback) return;
    authCallback((data) => {
      authAttempts.push(data);
      handshakeVersion = typeof data.authorizationSubjectVersion === 'number' ? data.authorizationSubjectVersion : -1;
    });
  };
  const beginConnect = () => {
    authenticate();
    if (delayConnect) {
      pendingConnections.push({ version: handshakeVersion, cancelled: false });
      return;
    }
    connected = true;
    fire('connect', undefined);
  };
  const socket = {
    get connected() { return connected; },
    get active() { return active; },
    on(event: string, handler: (payload: unknown) => void) {
      const bucket = handlers.get(event) ?? new Set();
      bucket.add(handler);
      handlers.set(event, bucket);
      return socket;
    },
    off(event: string, handler?: (payload: unknown) => void) {
      if (!handler) handlers.delete(event);
      else handlers.get(event)?.delete(handler);
      return socket;
    },
    disconnect() {
      active = false;
      connected = false;
      pendingConnections.forEach((attempt) => { attempt.cancelled = true; });
      fire('disconnect', 'io client disconnect');
      return socket;
    },
    connect() {
      active = true;
      beginConnect();
      return socket;
    },
    emit(event: string, raw: unknown, ack?: Ack) {
      if (!ack) return socket;
      if (event === 'game.time.ping') {
        if (typeof raw !== 'object' || raw === null || !('clientSentAt' in raw) || typeof raw.clientSentAt !== 'number') throw new Error('Expected the real clock ping payload.');
        const now = Date.now();
        ack({ clientSentAt: raw.clientSentAt, serverReceivedAt: now, serverSentAt: now });
        return socket;
      }
      if (typeof raw !== 'object' || raw === null || !('gameId' in raw) || typeof raw.gameId !== 'string') throw new Error('Expected an actual game-bound realtime envelope.');
      const gameId = raw.gameId;
      const rule = rules.get(gameId);
      if (event === 'game.subscribe') {
        const allowed = rule !== undefined && rule.denialReason === undefined && rule.allowedGameId === gameId && rule.subjectVersion === handshakeVersion;
        const denialReason = rule?.denialReason ?? (rule?.allowedGameId === gameId ? 'AUTHORIZATION_SUBJECT_STALE' : 'ASSIGNMENT_REQUIRED');
        const response = allowed
          ? { status: 'subscribed', snapshot: { gameId, version: 1, state: 'LIVE', lastSequence: 0, events: [] } satisfies Snapshot }
          : { status: 'denied', code: 'STAFF_SCOPE_DENIED', reason: denialReason };
        const acknowledge = () => {
          subscriptions.push({ gameId, status: response.status, ...('code' in response ? { code: response.code, reason: response.reason } : {}) });
          subscriptionHandshakeVersions.push(handshakeVersion);
          if (response.status === 'subscribed' && 'snapshot' in response) fire('game.snapshot', response.snapshot);
          ack(response);
        };
        if (gameId === delayedSubscribeGameId) pendingSubscriptions.push({ gameId, acknowledge });
        else acknowledge();
        return socket;
      }
      if (event === 'game.takeover.request') {
        takeoverRequests.push(gameId);
        const allowed = rule !== undefined && rule.denialReason === undefined && rule.allowedGameId === gameId && rule.subjectVersion === handshakeVersion;
        const response = allowed
          ? { status: 'granted', gameId, version: 1, lastSequence: 0, takeoverToken: `token-${gameId}`, expiresAt: new Date(Date.now() + 90_000).toISOString() }
          : { status: 'denied', code: 'STAFF_SCOPE_DENIED', reason: rule?.denialReason ?? (rule?.allowedGameId === gameId ? 'AUTHORIZATION_SUBJECT_STALE' : 'ASSIGNMENT_REQUIRED') };
        const acknowledge = () => ack(response);
        if (gameId === delayedTakeoverGameId) pendingTakeovers.push({ gameId, acknowledge });
        else acknowledge();
        return socket;
      }
      if (event === 'game.unsubscribe') return socket;
      throw new Error(`Unexpected realtime event: ${event}`);
    },
  };

  return {
    socket,
    get connected() { return connected; },
    authAttempts,
    subscriptions,
    subscriptionHandshakeVersions,
    takeoverRequests,
    pendingSubscriptions,
    pendingTakeovers,
    releaseTakeover(gameId: string) {
      const index = pendingTakeovers.findIndex((entry) => entry.gameId === gameId);
      const pending = pendingTakeovers[index];
      if (!pending) throw new Error(`No pending takeover for ${gameId}.`);
      pendingTakeovers.splice(index, 1);
      pending.acknowledge();
    },
    releaseSubscribe(gameId: string) {
      const index = pendingSubscriptions.findIndex((entry) => entry.gameId === gameId);
      const pending = pendingSubscriptions[index];
      if (!pending) throw new Error(`No pending subscribe for ${gameId}.`);
      pendingSubscriptions.splice(index, 1);
      pending.acknowledge();
    },
    completeNextConnection() {
      const attempt = pendingConnections.find((candidate) => !candidate.cancelled);
      if (!attempt) throw new Error('No active Socket.IO handshake is pending.');
      pendingConnections.splice(pendingConnections.indexOf(attempt), 1);
      handshakeVersion = attempt.version;
      connected = true;
      fire('connect', undefined);
    },
    serverDisconnect() {
      active = false;
      connected = false;
      fire('disconnect', 'io server disconnect');
    },
    refreshHandshake() { beginConnect(); },
    serverEmit(event: string, payload: unknown) { fire(event, payload); },
    bindAuth(auth: typeof authCallback) {
      authCallback = auth;
      if (delayConnect) beginConnect();
      else authenticate();
    },
  };
}

async function mount(args: {
  readonly gameId: string;
  readonly detailStatus: 'pending' | 'success' | 'error';
  readonly detailGameId?: string;
  readonly realtimeAuthorization?: GameRealtimeAuthorization;
  readonly rules: ReadonlyMap<string, ServerRule>;
  readonly delayedSubscribeGameId?: string;
  readonly delayedTakeoverGameId?: string;
  readonly delayConnect?: boolean;
  readonly takeoverEnabled?: boolean;
}) {
  let transport: ReturnType<typeof createGatewayTransport> | undefined;
  transportHarness.create = (_namespace, options) => {
    transport = createGatewayTransport(args.rules, args.delayedSubscribeGameId, args.delayedTakeoverGameId, args.delayConnect);
    transport.bindAuth(options.auth);
    return transport.socket;
  };
  const { useV1GameOperationsConsole } = await import('./use-v1-game-operations-console');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function wrapper({ children }: { readonly children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  const hook = renderHook(
    ({ gameId, detailStatus, detailGameId, realtimeAuthorization }) => useV1GameOperationsConsole({
      gameId,
      initialLastSequence: 0,
      takeoverEnabled: args.takeoverEnabled ?? true,
      gameDetailStatus: detailStatus,
      gameDetailGameId: detailGameId ?? null,
      realtimeAuthorization: realtimeAuthorization ?? null,
    }),
    { wrapper, initialProps: args },
  );
  return {
    ...hook,
    get transport() {
      if (!transport) throw new Error('The actual Socket.IO transport was not created.');
      return transport;
    },
    get hasTransport() { return transport !== undefined; },
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('MD-QA #135 — game detail authorization drives the actual socket handshake', () => {
  it('waits for same-game detail, then reconnects with its server subject before subscribing', async () => {
    const rules = new Map([[GAME_A, { allowedGameId: GAME_A, subjectVersion: 7 }]]);
    const hook = await mount({ gameId: GAME_A, detailStatus: 'pending', rules });

    expect(hook.hasTransport).toBe(false);

    act(() => hook.rerender({ gameId: GAME_A, detailStatus: 'success', detailGameId: GAME_A, realtimeAuthorization: { kind: 'staff', subjectVersion: 7 }, rules }));
    await waitFor(() => expect(hook.transport.subscriptions).toEqual([{ gameId: GAME_A, status: 'subscribed' }]));
    expect(hook.transport.authAttempts.at(-1)).toMatchObject({ authorizationSubjectVersion: 7 });
    await waitFor(() => expect(hook.transport.takeoverRequests).toEqual([GAME_A]));
    expect(hook.result.current.takeover.status).toBe('held');

    rules.set(GAME_A, { allowedGameId: GAME_A, subjectVersion: 8 });
    act(() => hook.rerender({ gameId: GAME_A, detailStatus: 'success', detailGameId: GAME_A, realtimeAuthorization: { kind: 'staff', subjectVersion: 8 }, rules }));
    await waitFor(() => expect(hook.transport.authAttempts.at(-1)).toMatchObject({ authorizationSubjectVersion: 8 }));
    await waitFor(() => expect(hook.transport.subscriptions.filter((item) => item.status === 'subscribed')).toHaveLength(2));
  });

  it('invalidates an in-flight handshake captured under the previous staff subject', async () => {
    const rules = new Map([[GAME_A, { allowedGameId: GAME_A, subjectVersion: 8 }]]);
    const hook = await mount({
      gameId: GAME_A,
      detailStatus: 'success',
      detailGameId: GAME_A,
      realtimeAuthorization: { kind: 'staff', subjectVersion: 7 },
      rules,
      delayConnect: true,
    });

    await waitFor(() => expect(hook.transport.authAttempts).toHaveLength(1));
    expect(hook.transport.connected).toBe(false);
    expect(hook.transport.socket.active).toBe(true);

    act(() => hook.rerender({
      gameId: GAME_A,
      detailStatus: 'success',
      detailGameId: GAME_A,
      realtimeAuthorization: { kind: 'staff', subjectVersion: 8 },
      rules,
      delayConnect: true,
    }));
    await waitFor(() => expect(hook.transport.authAttempts).toHaveLength(2));
    expect(hook.transport.authAttempts.map((attempt) => attempt.authorizationSubjectVersion)).toEqual([7, 8]);

    act(() => hook.transport.completeNextConnection());
    await waitFor(() => expect(hook.transport.subscriptions).toEqual([{ gameId: GAME_A, status: 'subscribed' }]));
    expect(hook.transport.subscriptionHandshakeVersions).toEqual([8]);
    await waitFor(() => expect(hook.transport.takeoverRequests).toEqual([GAME_A]));
  });

  it('does not start a new connection after the socket became intentionally inactive', async () => {
    const rules = new Map([[GAME_A, { allowedGameId: GAME_A, subjectVersion: 7 }]]);
    const hook = await mount({
      gameId: GAME_A,
      detailStatus: 'success',
      detailGameId: GAME_A,
      realtimeAuthorization: { kind: 'staff', subjectVersion: 7 },
      rules,
    });
    await waitFor(() => expect(hook.transport.subscriptions).toEqual([{ gameId: GAME_A, status: 'subscribed' }]));

    act(() => hook.transport.serverDisconnect());
    expect(hook.transport.socket.active).toBe(false);
    act(() => hook.rerender({
      gameId: GAME_A,
      detailStatus: 'success',
      detailGameId: GAME_A,
      realtimeAuthorization: { kind: 'staff', subjectVersion: 8 },
      rules: new Map([[GAME_A, { allowedGameId: GAME_A, subjectVersion: 8 }]]),
    }));

    expect(hook.transport.authAttempts.map((attempt) => attempt.authorizationSubjectVersion)).toEqual([7]);
    expect(hook.transport.subscriptions).toEqual([{ gameId: GAME_A, status: 'subscribed' }]);
    expect(hook.transport.socket.active).toBe(false);
  });

  it('does not authorize a wrong-game or unavailable detail and preserves server denials without a lease', async () => {
    const rules = new Map([[GAME_A, { allowedGameId: GAME_B, subjectVersion: 4 }]]);
    const hook = await mount({
      gameId: GAME_A,
      detailStatus: 'success',
      detailGameId: GAME_B,
      realtimeAuthorization: { kind: 'staff', subjectVersion: 4 },
      rules,
    });

    expect(hook.hasTransport).toBe(false);

    act(() => hook.rerender({ gameId: GAME_A, detailStatus: 'success', detailGameId: GAME_A, realtimeAuthorization: { kind: 'unavailable' }, rules }));
    expect(hook.hasTransport).toBe(false);
    act(() => hook.rerender({ gameId: GAME_A, detailStatus: 'error', rules }));
    expect(hook.hasTransport).toBe(false);
    expect(hook.result.current.bannerMessage).toBe('이 경기의 실시간 권한을 확인하지 못했어요. 새로고침 후 다시 시도해주세요.');
  });

  it.each(['unscoped', 'platform_ops'] as const)('uses zero only for the explicit %s contract', async (kind) => {
    const rules = new Map([[GAME_A, { allowedGameId: GAME_A, subjectVersion: 0 }]]);
    const hook = await mount({
      gameId: GAME_A,
      detailStatus: 'success',
      detailGameId: GAME_A,
      realtimeAuthorization: { kind, subjectVersion: 0 },
      rules,
    });

    await waitFor(() => expect(hook.transport.subscriptions).toEqual([{ gameId: GAME_A, status: 'subscribed' }]));
    expect(hook.transport.authAttempts.at(-1)).toMatchObject({ authorizationSubjectVersion: 0 });
  });

  it.each([
    { name: 'stale subject', rule: { allowedGameId: GAME_A, subjectVersion: 8 }, reason: 'AUTHORIZATION_SUBJECT_STALE' },
    { name: 'expired assignment', rule: { allowedGameId: GAME_A, subjectVersion: 7, denialReason: 'ASSIGNMENT_EXPIRED' as const }, reason: 'ASSIGNMENT_EXPIRED' },
  ])('keeps the gateway $name denial authoritative', async ({ rule, reason }) => {
    const hook = await mount({
      gameId: GAME_A,
      detailStatus: 'success',
      detailGameId: GAME_A,
      realtimeAuthorization: { kind: 'staff', subjectVersion: 7 },
      rules: new Map([[GAME_A, rule]]),
    });

    await waitFor(() => expect(hook.transport.subscriptions).toEqual([{ gameId: GAME_A, status: 'denied', code: 'STAFF_SCOPE_DENIED', reason }]));
    await waitFor(() => expect(hook.result.current.takeover.status).toBe('revoked'));
    expect(hook.result.current.gameSnapshot).toBeNull();
    expect(hook.transport.takeoverRequests).toEqual([]);
  });

  it('ignores a delayed A subscribe acknowledgement after switching and authorizing B', async () => {
    const rules = new Map<string, ServerRule>([
      [GAME_A, { allowedGameId: GAME_A, subjectVersion: 1 }],
      [GAME_B, { allowedGameId: GAME_B, subjectVersion: 2 }],
    ]);
    const hook = await mount({
      gameId: GAME_A,
      detailStatus: 'success',
      detailGameId: GAME_A,
      realtimeAuthorization: { kind: 'staff', subjectVersion: 1 },
      rules,
      delayedSubscribeGameId: GAME_A,
      delayedTakeoverGameId: GAME_A,
    });
    await waitFor(() => expect(hook.transport.pendingSubscriptions.map((entry) => entry.gameId)).toEqual([GAME_A]));
    await waitFor(() => expect(hook.transport.pendingTakeovers.map((entry) => entry.gameId)).toEqual([GAME_A]));

    act(() => hook.rerender({ gameId: GAME_B, detailStatus: 'success', detailGameId: GAME_B, realtimeAuthorization: { kind: 'staff', subjectVersion: 2 }, rules, delayedSubscribeGameId: GAME_A }));
    await waitFor(() => expect(hook.transport.subscriptions).toContainEqual({ gameId: GAME_B, status: 'subscribed' }));
    await waitFor(() => expect(hook.result.current.gameSnapshot).toEqual({ state: 'LIVE', version: 1 }));
    expect(hook.transport.authAttempts.at(-1)).toMatchObject({ authorizationSubjectVersion: 2 });
    expect(hook.transport.takeoverRequests).toEqual([GAME_A, GAME_B]);
    await waitFor(() => expect(hook.result.current.takeover).toMatchObject({ status: 'held', token: `token-${GAME_B}` }));

    act(() => hook.transport.releaseSubscribe(GAME_A));
    act(() => hook.transport.releaseTakeover(GAME_A));
    expect(hook.result.current.gameSnapshot).toEqual({ state: 'LIVE', version: 1 });
    expect(hook.transport.authAttempts.at(-1)).toMatchObject({ authorizationSubjectVersion: 2 });
    expect(hook.transport.takeoverRequests).toEqual([GAME_A, GAME_B]);
    expect(hook.result.current.takeover).toMatchObject({ status: 'held', token: `token-${GAME_B}` });

    act(() => hook.rerender({ gameId: GAME_B, detailStatus: 'success', detailGameId: GAME_A, realtimeAuthorization: { kind: 'staff', subjectVersion: 1 }, rules, delayedSubscribeGameId: GAME_A }));
    expect(hook.transport.authAttempts.at(-1)).toMatchObject({ authorizationSubjectVersion: 2 });
    expect(hook.transport.takeoverRequests).toEqual([GAME_A, GAME_B]);
    expect(hook.result.current.takeover.status).not.toBe('held');
  });

  it.each([
    { name: 'pending', detailStatus: 'pending' as const, detailGameId: undefined, realtimeAuthorization: undefined },
    { name: 'failed', detailStatus: 'error' as const, detailGameId: undefined, realtimeAuthorization: undefined },
    { name: 'unavailable', detailStatus: 'success' as const, detailGameId: GAME_B, realtimeAuthorization: { kind: 'unavailable' } as const },
  ])('clears A snapshot and events while B authorization is $name', async ({ detailStatus, detailGameId, realtimeAuthorization }) => {
    const oldEvent: GameEventRecord = {
      id: 'event-a-1', gameId: GAME_A, sequence: 1, clientEventId: 'client-a-1', payloadHash: 'hash-a-1',
      type: 'GOAL', sideId: null, participantId: null, assistParticipantId: null, period: 1, clockMs: 10_000,
      occurredAt: '2026-10-27T00:00:00.000Z', receivedAt: '2026-10-27T00:00:00.100Z', actorUserId: 'operator-a',
      reversesEventId: null, payload: {},
    };
    const rules = new Map<string, ServerRule>([
      [GAME_A, { allowedGameId: GAME_A, subjectVersion: 7 }],
      [GAME_B, { allowedGameId: GAME_B, subjectVersion: 8 }],
    ]);
    const hook = await mount({
      gameId: GAME_A, detailStatus: 'success', detailGameId: GAME_A,
      realtimeAuthorization: { kind: 'staff', subjectVersion: 7 }, rules,
    });
    await waitFor(() => expect(hook.result.current.gameSnapshot).toEqual({ state: 'LIVE', version: 1 }));
    act(() => hook.transport.serverEmit('game.snapshot', {
      gameId: GAME_A, version: 2, state: 'LIVE', lastSequence: 1, events: [oldEvent],
    } satisfies Snapshot));
    await waitFor(() => expect(hook.result.current.liveEvents).toEqual([oldEvent]));

    act(() => hook.rerender({ gameId: GAME_B, detailStatus, detailGameId, realtimeAuthorization, rules }));

    expect(hook.result.current.gameSnapshot).toBeNull();
    expect(hook.result.current.liveEvents).toEqual([]);
    expect(hook.transport.subscriptions).toEqual([{ gameId: GAME_A, status: 'subscribed' }]);
    expect(hook.transport.takeoverRequests).toEqual([GAME_A]);
    expect(hook.transport.authAttempts.at(-1)).toMatchObject({ authorizationSubjectVersion: 7 });

    act(() => hook.rerender({
      gameId: GAME_B, detailStatus: 'success', detailGameId: GAME_B,
      realtimeAuthorization: { kind: 'staff', subjectVersion: 8 }, rules,
    }));
    await waitFor(() => expect(hook.transport.subscriptions).toContainEqual({ gameId: GAME_B, status: 'subscribed' }));
    await waitFor(() => expect(hook.result.current.gameSnapshot).toEqual({ state: 'LIVE', version: 1 }));
    expect(hook.result.current.liveEvents).toEqual([]);
    expect(hook.transport.authAttempts.at(-1)).toMatchObject({ authorizationSubjectVersion: 8 });
  });
});

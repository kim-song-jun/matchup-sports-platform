import { http, HttpResponse } from 'msw';
import type { SetupServerApi } from 'msw/node';
import type { GameDetail, GameEventRecord } from '@/types/game-operations';

const API = 'http://localhost/api/v1';
const GAME_ID = 'game-undo';
const LEASE = 'undo-lease';

/**
 * What the fake server does with the next record sent over the socket.
 * - `confirm`: commits, acknowledges and broadcasts at once.
 * - `commit-without-reply`: commits, but the acknowledgement and broadcast never arrive.
 * - `hold`: the request is still in transit; nothing happens until `releaseHeld()`.
 * - `drop`: the request is lost and never committed.
 */
export type AppendBehavior = 'confirm' | 'commit-without-reply' | 'hold' | 'drop';

interface SocketRecord {
  readonly gameId: string;
  readonly expectedVersion?: number;
  readonly rebasedExpectedVersion?: number;
  readonly clientEventId: string;
  readonly takeoverToken?: string;
  readonly event: {
    readonly type: GameEventRecord['type'];
    readonly sideId?: string;
    readonly participantId?: string;
    readonly period: number;
    readonly clockMs: number;
    readonly occurredAt: string;
    readonly payload: Record<string, unknown>;
  };
}

export interface ReceivedAppend {
  readonly channel: 'append' | 'retry';
  readonly clientEventId: string;
  readonly expectedVersion: number;
  readonly outcome: 'committed' | 'conflict' | 'replayed';
}

export interface ReceivedReversal {
  readonly eventId: string;
  readonly expectedVersion: number;
  readonly clientEventId: string;
  readonly idempotencyKey: string | null;
  readonly reason: string;
  outcome: 'pending' | 'reversed' | 'conflict' | 'rejected';
}

/** In-memory game server behind a fake socket and REST handlers — the console, hooks and queue stay real. */
export function createUndoFixture(server: SetupServerApi) {
  let game: GameDetail = {
    id: GAME_ID, sourceType: 'TEAM_MATCH', state: 'LIVE', version: 5, lastSequence: 0,
    competitionConfigVersionId: 'config-undo', currentOfficialRevisionId: null, actorRole: 'tournament_director',
    realtimeAuthorization: { kind: 'staff', subjectVersion: 1 },
    sides: [
      { id: 'home', gameId: GAME_ID, sideKey: 'HOME', teamId: 'team-home', displayNameSnapshot: '홈 팀', createdAt: '', updatedAt: '' },
      { id: 'away', gameId: GAME_ID, sideKey: 'AWAY', teamId: 'team-away', displayNameSnapshot: '원정 팀', createdAt: '', updatedAt: '' },
    ],
    periods: [{ id: 'period-1', gameId: GAME_ID, number: 1, state: 'LIVE', startedAt: '2026-10-16T00:00:00.000Z', endedAt: null, pausedAt: null, pausedTotalMs: 0 }],
    periodDurations: [{ durationMinutes: 40, extraTime: false }], lineups: [],
    substitutionPolicy: { mode: 'rolling', maxSubstitutions: null }, isKnockoutFixture: false,
  };
  const events: GameEventRecord[] = [];
  const appends: ReceivedAppend[] = [];
  const reversals: ReceivedReversal[] = [];
  const listeners = new Map<string, Set<(payload?: unknown) => void>>();
  const deliver = (event: string, payload?: unknown) => [...(listeners.get(event) ?? [])].forEach((listener) => listener(payload));
  const subscribed = Promise.withResolvers<void>();
  const behaviors: AppendBehavior[] = [];
  const held: Array<() => void> = [];
  type Gate = { readonly started: () => void; readonly wait: Promise<void> };
  let reverseGate: Gate | null = null;
  let eventsReadGate: Gate | null = null;
  let eventsReads = 0;
  let eventsReadFails = false;

  const success = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: new Date().toISOString() });
  const failure = (statusCode: number, code: string, message: string) =>
    HttpResponse.json({ status: 'error', statusCode, code, message }, { status: statusCode });

  function commit(fields: Pick<GameEventRecord, 'type' | 'sideId' | 'participantId' | 'period' | 'clockMs' | 'occurredAt' | 'payload' | 'clientEventId' | 'reversesEventId'>): GameEventRecord {
    const sequence = game.lastSequence + 1;
    game = { ...game, version: game.version + 1, lastSequence: sequence };
    const record: GameEventRecord = {
      id: `server-event-${sequence}`, gameId: GAME_ID, sequence, payloadHash: `hash-${sequence}`, assistParticipantId: null,
      receivedAt: new Date().toISOString(), actorUserId: 'operator-undo', ...fields,
    };
    events.push(record);
    return record;
  }

  /** Runs the server side of one record and returns the committed row (null when it was rejected). */
  function receive(channel: ReceivedAppend['channel'], payload: SocketRecord, reply: boolean, ack: (result: unknown) => void): GameEventRecord | null {
    const expectedVersion = (channel === 'append' ? payload.expectedVersion : payload.rebasedExpectedVersion) ?? -1;
    const known = events.find((event) => event.clientEventId === payload.clientEventId);
    if (known !== undefined) {
      appends.push({ channel, clientEventId: payload.clientEventId, expectedVersion, outcome: 'replayed' });
      if (reply) ack({ status: 'ack', sequence: known.sequence, version: game.version });
      return known;
    }
    if (payload.takeoverToken !== LEASE || expectedVersion !== game.version) {
      appends.push({ channel, clientEventId: payload.clientEventId, expectedVersion, outcome: 'conflict' });
      if (reply) ack({ status: 'error', code: 'VERSION_CONFLICT' });
      return null;
    }
    const record = commit({
      type: payload.event.type, sideId: payload.event.sideId ?? null, participantId: payload.event.participantId ?? null,
      period: payload.event.period, clockMs: payload.event.clockMs, occurredAt: payload.event.occurredAt,
      payload: payload.event.payload, clientEventId: payload.clientEventId, reversesEventId: null,
    });
    appends.push({ channel, clientEventId: payload.clientEventId, expectedVersion, outcome: 'committed' });
    if (reply) {
      ack({ status: 'ack', sequence: record.sequence, version: game.version });
      deliver('game.event.committed', { gameId: GAME_ID, sequence: record.sequence, version: game.version, event: record });
    }
    return record;
  }

  const socket = {
    connected: true,
    on(event: string, listener: (payload?: unknown) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)?.add(listener);
    },
    off(event: string, listener?: (payload?: unknown) => void) {
      if (listener) listeners.get(event)?.delete(listener);
      else listeners.delete(event);
    },
    emit(event: string, payload: unknown, ack?: (result: unknown) => void) {
      // A request sent while the connection is down never reaches the server.
      if (!ack || !socket.connected) return;
      if (event === 'game.subscribe') {
        ack({ status: 'subscribed', snapshot: { gameId: GAME_ID, state: game.state, version: game.version, lastSequence: game.lastSequence, events: [...events] } });
        subscribed.resolve();
      } else if (event === 'game.time.ping') {
        ack({ clientSentAt: Date.now(), serverReceivedAt: Date.now(), serverSentAt: Date.now() });
      } else if (event === 'game.takeover.request' || event === 'game.takeover.renew') {
        ack({ status: 'granted', gameId: GAME_ID, takeoverToken: LEASE, expiresAt: new Date(Date.now() + 90_000).toISOString() });
      } else if (event === 'game.event.append' || event === 'game.event.retry') {
        const channel = event === 'game.event.append' ? 'append' : 'retry';
        const record = payload as SocketRecord;
        const behavior = behaviors.shift() ?? 'confirm';
        if (behavior === 'confirm') receive(channel, record, true, ack);
        else if (behavior === 'commit-without-reply') receive(channel, record, false, ack);
        else if (behavior === 'hold') held.push(() => receive(channel, record, true, ack));
      } else {
        throw new Error(`Unexpected socket request: ${event} ${JSON.stringify(payload)}`);
      }
    },
  };

  server.use(
    http.get(`${API}/auth/me`, () => success({ user: { id: 'operator-undo' } })),
    http.get(`${API}/me/tournament-staff`, () => success({ platformRole: null, items: [] })),
    http.get(`${API}/tournament-ops/tournaments/t-undo/fixtures/f-undo/lineup`, () => success({ gameId: GAME_ID, lineups: [] })),
    http.get(`${API}/games/${GAME_ID}/result-revisions`, () => success([])),
    http.get(`${API}/games/${GAME_ID}/lineups`, () => success([])),
    http.get(`${API}/games/${GAME_ID}/events`, async () => {
      eventsReads += 1;
      const gate = eventsReadGate;
      eventsReadGate = null;
      if (gate) { gate.started(); await gate.wait; }
      if (eventsReadFails) return HttpResponse.error();
      return success({ events: [...events], lastSequence: game.lastSequence, version: game.version, state: game.state, gap: null });
    }),
    http.get(`${API}/games/${GAME_ID}`, () => success(game)),
    http.post(`${API}/games/${GAME_ID}/events/:eventId/reverse`, async ({ params, request }) => {
      const body = (await request.json()) as { expectedVersion: number; clientEventId: string; takeoverToken?: string; reason: string };
      const entry: ReceivedReversal = {
        eventId: String(params.eventId), expectedVersion: body.expectedVersion, clientEventId: body.clientEventId,
        idempotencyKey: request.headers.get('Idempotency-Key'), reason: body.reason, outcome: 'pending',
      };
      reversals.push(entry);
      const gate = reverseGate;
      reverseGate = null;
      if (gate) { gate.started(); await gate.wait; }
      if (entry.idempotencyKey !== body.clientEventId || body.takeoverToken !== LEASE) {
        entry.outcome = 'rejected';
        return failure(403, 'STAFF_SCOPE_DENIED', 'Tournament staff scope is denied');
      }
      // The real server answers a stale version in English; the console must never show it as is.
      if (body.expectedVersion !== game.version) {
        entry.outcome = 'conflict';
        return failure(409, 'VERSION_CONFLICT', 'Expected version is stale');
      }
      const target = events.find((event) => event.id === entry.eventId);
      if (target === undefined) {
        entry.outcome = 'rejected';
        return failure(404, 'GAME_EVENT_NOT_FOUND', 'Game event was not found');
      }
      if (events.some((event) => event.reversesEventId === entry.eventId)) {
        entry.outcome = 'rejected';
        return failure(409, 'EVENT_ALREADY_REVERSED', 'This event was already reversed once');
      }
      commit({
        type: 'CORRECTION', sideId: target.sideId, participantId: target.participantId, period: target.period, clockMs: target.clockMs,
        occurredAt: new Date().toISOString(), payload: { reason: body.reason }, clientEventId: body.clientEventId, reversesEventId: target.id,
      });
      entry.outcome = 'reversed';
      return success({ gameId: GAME_ID, state: game.state, version: game.version });
    }),
    http.post('*/api/v1/logs/client-error', () => success({ id: 'test-error' })),
  );

  return {
    socket, appends, reversals, subscribed: subscribed.promise,
    get events(): readonly GameEventRecord[] { return events; },
    get version() { return game.version; },
    get eventsReads() { return eventsReads; },
    /** Queues how the next records sent over the socket are treated, in order. */
    nextAppends(...next: AppendBehavior[]) { behaviors.push(...next); },
    /** Delivers every held record to the server now (it commits, acknowledges and broadcasts). */
    releaseHeld() { held.splice(0).forEach((deliver) => deliver()); },
    get heldCount() { return held.length; },
    /** Keeps the next reverse request in flight until `release()`; `started` resolves once it has arrived. */
    holdNextReversal() {
      const started = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      reverseGate = { started: started.resolve, wait: release.promise };
      return { started: started.promise, release: release.resolve };
    },
    /** Keeps the next read of the server's record list unanswered until `release()`; it answers with the records as of then. */
    holdNextEventsRead() {
      const started = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      eventsReadGate = { started: started.resolve, wait: release.promise };
      return { started: started.promise, release: release.resolve };
    },
    /** The connection drops: the console is told, and nothing it sends arrives until `reconnect()`. */
    disconnect() {
      socket.connected = false;
      deliver('disconnect', 'transport close');
    },
    reconnect() {
      socket.connected = true;
      deliver('connect');
    },
    /** Another device changes the game: the version moves without this console being told. */
    bumpVersionElsewhere() { game = { ...game, version: game.version + 1 }; },
    setEventsReadFails(value: boolean) { eventsReadFails = value; },
  };
}

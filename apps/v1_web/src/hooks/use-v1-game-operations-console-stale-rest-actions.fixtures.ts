import { http, HttpResponse } from 'msw';
import type { AssignGoalAssistResult, GameEventRecord, GameTakeoverGrant } from '@/types/game-operations';

export const API = 'http://localhost/api/v1';
export const GAME_A = '00000000-0000-4000-8000-000000000139';
export const GAME_B = '00000000-0000-4000-8000-000000000140';
export const USER_ID = '00000000-0000-4000-8000-000000000001';
export const ASSIST_ID = '00000000-0000-4000-8000-000000000003';
const SIDE_ID = '00000000-0000-4000-8000-000000000002';
type Ack = (result: unknown) => void;
type Snapshot = { readonly gameId: string; readonly state: 'LIVE'; readonly version: number; readonly lastSequence: number; readonly events: readonly GameEventRecord[] };
type Lease = GameTakeoverGrant & { readonly authorizationSubject: string; readonly clientInstanceId: string };

function goal(gameId: string): GameEventRecord {
  return { id: `goal-${gameId}`, gameId, sequence: 1, clientEventId: `original-${gameId}`, payloadHash: 'stored-goal-hash', type: 'GOAL', sideId: SIDE_ID, participantId: null, assistParticipantId: null, period: 1, clockMs: 60_000, occurredAt: new Date().toISOString(), receivedAt: new Date().toISOString(), actorUserId: USER_ID, reversesEventId: null, payload: {} };
}

export function createActionFixture() {
  const games = new Map<string, Snapshot>();
  for (const gameId of [GAME_A, GAME_B]) games.set(gameId, { gameId, state: 'LIVE', version: 5, lastSequence: 1, events: [goal(gameId)] });
  const leases = new Map<string, Lease>();
  const socketHandlers = new Map<string, (payload: unknown) => void>();
  const requests: unknown[] = [];
  const posts: { readonly gameId: string; readonly action: string; readonly body: unknown; readonly idempotencyKey: string | null }[] = [];
  let authorizationSubjectVersion = 0;
  const fire = (event: string, payload: unknown) => socketHandlers.get(event)?.(payload);
  function readGame(raw: unknown) {
    if (typeof raw !== 'object' || raw === null || !('gameId' in raw) || typeof raw.gameId !== 'string') throw new Error('The actual game envelope is required.');
    const game = games.get(raw.gameId);
    if (!game) throw new Error('The actor fixture only contains A and B.');
    return { payload: raw, game };
  }
  const socket = {
    connected: true,
    on(event: string, handler: (payload: unknown) => void) { socketHandlers.set(event, handler); },
    off(event: string) { socketHandlers.delete(event); },
    emit(event: string, raw: unknown, ack?: Ack) {
      if (!ack) return;
      if (event === 'game.time.ping') {
        if (typeof raw !== 'object' || raw === null || !('clientSentAt' in raw) || typeof raw.clientSentAt !== 'number') throw new Error('The actual time ping is required.');
        ack({ clientSentAt: raw.clientSentAt, serverReceivedAt: Date.now(), serverSentAt: Date.now() });
        return;
      }
      const { payload, game } = readGame(raw);
      if (event === 'game.subscribe') { fire('game.snapshot', game); ack({ status: 'subscribed', snapshot: game }); return; }
      if (event === 'game.takeover.request') {
        if (!('authorizationSubjectVersion' in payload) || payload.authorizationSubjectVersion !== authorizationSubjectVersion || !('clientInstanceId' in payload) || typeof payload.clientInstanceId !== 'string' || !('lastSequence' in payload) || typeof payload.lastSequence !== 'number') throw new Error('The actual actor and instance envelope is required.');
        requests.push(payload);
        const requestNumber = requests.length;
        const clientInstanceId = payload.clientInstanceId;
        const lease = { gameId: game.gameId, version: game.version, lastSequence: game.lastSequence, takeoverToken: `token-${game.gameId}-${requestNumber}`, expiresAt: new Date(Date.now() + 90_000).toISOString(), authorizationSubject: USER_ID, clientInstanceId } satisfies Lease;
        leases.set(game.gameId, lease);
        fire('game.takeover.granted', lease);
        ack({ status: 'granted', ...lease });
        return;
      }
      throw new Error(`Unexpected command in the REST-only fixture: ${event}`);
    },
  };
  const restHandler = http.post(`${API}/games/:gameId/events/:eventId/:action`, async ({ params, request }) => {
    const { gameId, eventId, action } = params;
    if (typeof gameId !== 'string' || typeof eventId !== 'string' || typeof action !== 'string') throw new Error('The actual REST route is required.');
    const body: unknown = await request.json();
    const idempotencyKey = request.headers.get('Idempotency-Key');
    posts.push({ gameId, action, body, idempotencyKey });
    const fail = (statusCode: number, code: string) => HttpResponse.json({ status: 'error', statusCode, code, message: code, timestamp: new Date().toISOString() }, { status: statusCode });
    if (request.headers.get('x-v1-user-id') !== USER_ID || request.credentials !== 'include') return fail(403, 'STAFF_SCOPE_DENIED');
    const current = games.get(gameId);
    const lease = leases.get(gameId);
    if (!current || !lease || lease.authorizationSubject !== USER_ID) return fail(403, 'STAFF_SCOPE_DENIED');
    if (typeof body !== 'object' || body === null || !('clientEventId' in body) || typeof body.clientEventId !== 'string' || body.clientEventId !== idempotencyKey || !('expectedVersion' in body) || !('takeoverToken' in body)) return fail(400, 'VALIDATION_ERROR');
    if (body.takeoverToken !== lease.takeoverToken || Date.parse(lease.expiresAt) <= Date.now()) return fail(403, 'TAKEOVER_TOKEN_EXPIRED');
    if (body.expectedVersion !== current.version) return fail(409, 'VERSION_CONFLICT');
    const original = current.events.find((event) => event.id === eventId);
    if (!original) return fail(404, 'NOT_FOUND');
    let event: GameEventRecord;
    if (action === 'assist' && 'assistParticipantId' in body && (body.assistParticipantId === ASSIST_ID || body.assistParticipantId === null)) event = { ...original, assistParticipantId: body.assistParticipantId };
    else if (action === 'reverse' && 'reason' in body && typeof body.reason === 'string' && body.reason.length > 0) event = { ...original, id: `reverse-${gameId}`, sequence: current.lastSequence + 1, clientEventId: body.clientEventId, type: 'CORRECTION', reversesEventId: original.id, payload: { reason: body.reason } };
    else return fail(400, 'VALIDATION_ERROR');
    const events = action === 'assist' ? current.events.map((record) => record.id === event.id ? event : record) : [...current.events, event];
    const latest = { ...current, version: current.version + 1, lastSequence: Math.max(current.lastSequence, event.sequence), events };
    games.set(gameId, latest);
    fire('game.event.committed', { gameId, version: latest.version, sequence: event.sequence, event });
    const result = { gameId, state: latest.state, version: latest.version, durableCommandId: `command-${body.clientEventId}`, replayed: false, event } satisfies AssignGoalAssistResult;
    return HttpResponse.json({ status: 'success', data: result, timestamp: new Date().toISOString() });
  });
  return {
    socket, games, leases, requests, posts, restHandler,
    setAuthorizationVersion(version: number) { authorizationSubjectVersion = version; },
  };
}

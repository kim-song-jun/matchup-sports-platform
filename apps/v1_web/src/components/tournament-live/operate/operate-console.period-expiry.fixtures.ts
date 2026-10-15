import { http, HttpResponse } from 'msw';
import { createHash } from 'node:crypto';
import type { SetupServerApi } from 'msw/node';
import type { V1GameResultRevision, V1GameRevisionMutationResult } from '@/types/api';
import type { GameDetail } from '@/types/game-operations';

const API = 'http://localhost/api/v1';

export function createFixture(server: SetupServerApi) {
  let game: GameDetail = {
    id: 'game-expiry', sourceType: 'TEAM_MATCH', state: 'LIVE', version: 5, lastSequence: 0,
    competitionConfigVersionId: 'config-expiry', currentOfficialRevisionId: null, actorRole: 'tournament_director',
    sides: [
      { id: 'home', gameId: 'game-expiry', sideKey: 'HOME', teamId: 'team-home', displayNameSnapshot: '홈 팀', createdAt: '', updatedAt: '' },
      { id: 'away', gameId: 'game-expiry', sideKey: 'AWAY', teamId: 'team-away', displayNameSnapshot: '원정 팀', createdAt: '', updatedAt: '' },
    ],
    periods: [{ id: 'period-1', gameId: 'game-expiry', number: 1, state: 'LIVE', startedAt: '2026-10-16T00:00:00.000Z', endedAt: null, pausedAt: null, pausedTotalMs: 0 }],
    periodDurations: [{ durationMinutes: 1, extraTime: false }], lineups: [],
    substitutionPolicy: { mode: 'rolling', maxSubstitutions: null }, isKnockoutFixture: false,
  };
  let reads = 0;
  const readWaiters = new Set<{ readonly count: number; readonly resolve: () => void }>();
  const otherGame: GameDetail = { ...game, id: 'game-other', sides: game.sides.map((side) => ({ ...side, gameId: 'game-other', displayNameSnapshot: `다른 경기 ${side.displayNameSnapshot}` })), periods: game.periods.map((period) => ({ ...period, id: 'other-period', gameId: 'game-other', startedAt: new Date().toISOString() })) };
  let readError = false;
  let commandError = false;
  let heldRead: { readonly started: () => void; readonly wait: Promise<void>; readonly responded: () => void; readonly beforeResponse: (() => void) | undefined; readonly captureAfterRelease: boolean } | null = null;
  const commands: { readonly command: string; readonly body: unknown }[] = [];
  const resultRevisions: V1GameResultRevision[] = [];
  const subscribed = Promise.withResolvers<void>();
  const handlers = new Map<string, (payload: unknown) => void>();
  const socket = {
    connected: true,
    on(event: string, handler: (payload: unknown) => void) { handlers.set(event, handler); },
    off(event: string) { handlers.delete(event); },
    emit(event: string, payload: unknown, ack?: (result: unknown) => void) {
      if (!ack) return;
      const target = typeof payload === 'object' && payload !== null && 'gameId' in payload && payload.gameId === otherGame.id ? otherGame : game;
      if (event === 'game.subscribe') {
        ack({ status: 'subscribed', snapshot: { gameId: target.id, state: target.state, version: target.version, lastSequence: 0, events: [] } });
        if (target.id === game.id) subscribed.resolve();
      } else if (event === 'game.time.ping') {
        ack({ clientSentAt: Date.now(), serverReceivedAt: Date.now(), serverSentAt: Date.now() });
      } else if (event === 'game.takeover.request' || event === 'game.takeover.renew') {
        ack({ status: 'granted', gameId: target.id, takeoverToken: 'expiry-lease', expiresAt: new Date(Date.now() + 90_000).toISOString() });
      } else {
        throw new Error(`Unexpected socket request: ${event} ${JSON.stringify(payload)}`);
      }
    },
  };
  const success = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: new Date().toISOString() });
  const failure = (statusCode: number, message: string) => HttpResponse.json({ status: 'error', statusCode, code: 'EXPIRY_TEST_FAILURE', message }, { status: statusCode });
  const endPeriod = () => {
    const livePeriod = game.periods.find((period) => period.state === 'LIVE');
    game = { ...game, version: game.version + 1, periods: game.periods.map((period) => period.id === livePeriod?.id ? { ...period, state: 'ENDED', endedAt: new Date().toISOString() } : period.number === (livePeriod?.number ?? 0) + 1 ? { ...period, state: 'HALFTIME' } : period) };
  };
  server.use(
    http.get(`${API}/auth/me`, () => success({ user: { id: 'operator-expiry' } })),
    http.get(`${API}/me/tournament-staff`, () => success({ platformRole: null, items: [] })),
    http.get(`${API}/tournament-ops/tournaments/t-expiry/fixtures/:fixtureId/lineup`, ({ params }) => success({ gameId: params.fixtureId === 'f-other' ? otherGame.id : game.id, lineups: [] })),
    http.get(`${API}/games/game-expiry/result-revisions`, () => success(resultRevisions)),
    http.get(`${API}/games/game-expiry/lineups`, () => success([])),
    http.get(`${API}/games/game-expiry/events`, () => success({ events: [], lastSequence: 0, gap: null })),
    http.get(`${API}/games/:gameId`, async ({ params }) => {
      if (params.gameId === otherGame.id) return success(otherGame);
      if (params.gameId !== game.id) return failure(404, '경기를 찾지 못했어요.');
      reads += 1;
      for (const waiter of readWaiters) if (reads >= waiter.count) { readWaiters.delete(waiter); waiter.resolve(); }
      const readResponse = () => readError ? failure(400, '서버 종료 상태를 읽지 못했어요.') : success(game);
      const response = readResponse();
      const held = heldRead;
      heldRead = null;
      if (held) { held.started(); await held.wait; held.beforeResponse?.(); held.responded(); }
      return held?.captureAfterRelease ? readResponse() : response;
    }),
    http.post(`${API}/games/game-expiry/commands/:command`, async ({ params, request }) => {
      const body: unknown = await request.json();
      commands.push({ command: String(params.command), body });
      if (request.headers.get('x-v1-user-id') !== 'operator-expiry' || typeof body !== 'object' || body === null || !('takeoverToken' in body) || body.takeoverToken !== 'expiry-lease' || !('clientCommandId' in body) || body.clientCommandId !== request.headers.get('Idempotency-Key')) return failure(403, '운영 권한이 없어요.');
      if (!('expectedVersion' in body) || body.expectedVersion !== game.version) return failure(409, '경기 버전이 달라요.');
      if (commandError) return failure(503, '종료 요청의 응답을 확인하지 못했어요.');
      if (params.command === 'end-period') endPeriod();
      if (params.command === 'end') {
        const now = new Date().toISOString();
        game = { ...game, state: 'ENDED', version: game.version + 1 };
        const revision: V1GameResultRevision = {
          id: 'result-expiry', gameId: game.id, revision: 1, state: 'SUBMITTED', score: { home: 0, away: 0 }, goalEvents: [],
          eventsHash: createHash('sha256').update('[]').digest('hex'), missingScorer: false, mvpParticipantId: null, reason: null,
          outcomeReason: 'NORMAL', outcomeNote: null, createdByActorType: 'USER', createdByUserId: 'operator-expiry',
          createdByName: null, createdBySystemActor: null, supersedesId: null, submittedAt: now, officialAt: null,
          createdAt: now, updatedAt: now, resultParticipants: [],
        };
        resultRevisions.push(revision);
        const result: V1GameRevisionMutationResult = {
          gameId: game.id, state: game.state, version: game.version, durableCommandId: 'period-command', replayed: false,
          revisionId: revision.id, revision: revision.revision, revisionState: revision.state,
        };
        return success(result);
      }
      return success({ gameId: game.id, state: game.state, version: game.version, durableCommandId: 'period-command', replayed: false });
    }),
    http.post('*/api/v1/logs/client-error', () => success({ id: 'test-error' })),
  );
  return {
    socket, commands, endPeriod, resultRevisions, subscribed: subscribed.promise,
    get reads() { return reads; },
    waitForReads(count: number) {
      if (reads >= count) return Promise.resolve();
      return new Promise<void>((resolve) => readWaiters.add({ count, resolve }));
    },
    setReadError(value: boolean) { readError = value; },
    setCommandError(value: boolean) { commandError = value; },
    pause() { game = { ...game, state: 'PAUSED', periods: game.periods.map((period) => ({ ...period, pausedAt: '2026-10-16T00:00:50.000Z' })) }; },
    halves() {
      game = { ...game, periodDurations: [{ durationMinutes: 1, extraTime: false }, { durationMinutes: 1, extraTime: false }], periods: [...game.periods, { id: 'period-2', gameId: game.id, number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null, pausedAt: null, pausedTotalMs: 0 }] };
    },
    delayNextRead(beforeResponse?: () => void, { captureAfterRelease = false } = {}) {
      const started = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const responded = Promise.withResolvers<void>();
      heldRead = { started: started.resolve, wait: release.promise, responded: responded.resolve, beforeResponse, captureAfterRelease };
      return { started: started.promise, release: release.resolve, responded: responded.promise };
    },
    startNextPeriod() {
      game = { ...game, version: 7, periods: game.periods.map((period) => period.number === 2 ? { ...period, state: 'LIVE', startedAt: new Date().toISOString() } : period) };
      handlers.get('game.snapshot')?.({ gameId: game.id, state: game.state, version: game.version, lastSequence: 0, events: [] });
    },
    pauseAfterRevert() {
      game = { ...game, state: 'PAUSED', version: 8, periods: game.periods.map((period) => period.number === 1 ? { ...period, state: 'LIVE', endedAt: null, pausedAt: new Date().toISOString() } : { ...period, state: 'SCHEDULED' }) };
      handlers.get('game.snapshot')?.({ gameId: game.id, state: game.state, version: game.version, lastSequence: 0, events: [] });
    },
  };
}

import { http, HttpResponse } from 'msw';
import type {
  V1AdminRegistrationRosterMatrix,
  V1GameRosterHistoryEvent,
  V1GameRosterView,
  V1MemberUnavailability,
  V1TeamRosterCell,
  V1TeamRosterMatrix,
  V1TeamRosterMatrixGame,
} from '@/hooks/use-v1-game-roster';
import type { V1GameState } from '@/types/api';

/**
 * Task 176 경기별 출전 명단 MSW — 서버 계약(`apps/v1_api/src/games/roster/*`)을 흉내 낸 상태형 핸들러.
 * 팀 1개 · 대회 경기 2개 · 선수 3명. 계산식은 서버와 같다: 기준 − 빼기 − 결장(시작 시각이 기간 안).
 * 팩토리마다 상태가 새로 생기고, `requests` 에 요청 경로·바디가 쌓인다(테스트가 호출 인자를 본다).
 */

const api = '*/api/v1';
const NOW = '2026-10-01T00:00:00.000Z';

export const GAME_ROSTER_MSW = {
  teamId: 'team-1',
  tournamentId: 'tournament-1',
  registrationId: 'registration-1',
  viewerUserId: 'user-1',
  games: [
    { gameId: 'roster-game-1', sideId: 'roster-side-1', startAt: '2026-10-04T01:00:00.000Z', opponentName: '마포 FC' },
    { gameId: 'roster-game-2', sideId: 'roster-side-2', startAt: '2026-10-11T01:00:00.000Z', opponentName: '강남 유나이티드' },
  ],
  players: [
    { userId: 'player-1', displayName: '김민재', jerseyNumber: 7 },
    { userId: 'player-2', displayName: '박서준', jerseyNumber: 10 },
    { userId: 'player-3', displayName: '한도윤', jerseyNumber: null },
  ],
} as const;

const NAMES: Record<string, string> = {
  'user-1': '김팀장',
  ...Object.fromEntries(GAME_ROSTER_MSW.players.map((p) => [p.userId, p.displayName])),
};

type Adjustment = {
  id: string;
  gameId: string;
  userId: string;
  reason: string | null;
  actorUserId: string;
  actorRole: string;
  createdAt: string;
  revokedAt: string | null;
  revokedByUserId: string | null;
};

type Unavailability = Omit<V1MemberUnavailability, 'actor'> & { actorUserId: string; actorRole: string };

export type GameRosterMswRequest = { method: string; path: string; body: unknown };

function ok<T>(data: T) {
  return HttpResponse.json({ status: 'success', data, timestamp: NOW });
}

function fail(statusCode: number, code: string, message: string, details?: unknown) {
  return HttpResponse.json({ status: 'error', statusCode, code, message, details, timestamp: NOW }, { status: statusCode });
}

export function createV1GameRosterMswHandlers() {
  const state = {
    gameStates: new Map<string, V1GameState>(GAME_ROSTER_MSW.games.map((g) => [g.gameId, 'SCHEDULED'])),
    adjustments: [] as Adjustment[],
    unavailabilities: [] as Unavailability[],
    requests: [] as GameRosterMswRequest[],
    seq: 0,
  };

  const nextId = (prefix: string) => `${prefix}-${++state.seq}`;
  const at = () => new Date(Date.parse(NOW) + state.seq * 60_000).toISOString();
  const findGame = (gameId: string, sideId?: string) =>
    GAME_ROSTER_MSW.games.find((g) => g.gameId === gameId && (sideId === undefined || g.sideId === sideId));
  const activeAdjustment = (gameId: string, userId: string) =>
    state.adjustments.find((a) => a.gameId === gameId && a.userId === userId && a.revokedAt === null);
  const coveringUnavailability = (userId: string, startAt: string) =>
    state.unavailabilities.find(
      (u) => u.userId === userId && u.revokedAt === null && u.startsAt <= startAt && startAt < u.endsAt,
    );
  const actor = (userId: string, role: string | null) => ({ userId, displayName: NAMES[userId] ?? '알 수 없음', role });
  const person = (p: (typeof GAME_ROSTER_MSW.players)[number]) => ({ ...p, accountLinked: true });

  async function record(request: Request, path: string) {
    const text = request.method === 'GET' ? '' : await request.text();
    state.requests.push({ method: request.method, path, body: text === '' ? undefined : JSON.parse(text) });
  }

  function view(game: (typeof GAME_ROSTER_MSW.games)[number]): V1GameRosterView {
    const gameState = state.gameStates.get(game.gameId)!;
    const base = GAME_ROSTER_MSW.players.map((p) => {
      const status = coveringUnavailability(p.userId, game.startAt)
        ? ('UNAVAILABLE' as const)
        : activeAdjustment(game.gameId, p.userId)
          ? ('EXCLUDED' as const)
          : ('PARTICIPATING' as const);
      return { ...person(p), status };
    });
    const excluded = GAME_ROSTER_MSW.players.flatMap((p) => {
      const adj = activeAdjustment(game.gameId, p.userId);
      if (!adj || coveringUnavailability(p.userId, game.startAt)) return [];
      return [{ ...person(p), adjustmentId: adj.id, reason: adj.reason, excludedAt: adj.createdAt, actor: actor(adj.actorUserId, adj.actorRole) }];
    });
    const unavailable = GAME_ROSTER_MSW.players.flatMap((p) => {
      const u = coveringUnavailability(p.userId, game.startAt);
      if (!u) return [];
      return [{ ...person(p), unavailabilityId: u.id, reason: u.reason, startsAt: u.startsAt, endsAt: u.endsAt, actor: actor(u.actorUserId, u.actorRole) }];
    });
    const participants = base
      .filter((p) => p.status === 'PARTICIPATING')
      .map(({ status: _status, ...p }) => ({ ...p, joinedAfterFixtureCreated: false }));
    return {
      gameId: game.gameId,
      sideId: game.sideId,
      teamId: GAME_ROSTER_MSW.teamId,
      teamMatchId: `team-match-${game.gameId}`,
      competitionId: GAME_ROSTER_MSW.tournamentId,
      competitionKind: 'TOURNAMENT',
      gameState,
      deadline: game.startAt,
      editable: gameState === 'SCHEDULED',
      viewerRole: 'TEAM_MANAGER',
      baseSource: 'REGISTRATION',
      base,
      participants,
      excluded,
      suspended: [],
      unavailable,
      counts: {
        base: base.length,
        participating: participants.length,
        excluded: excluded.length,
        unavailable: unavailable.length,
        suspended: 0,
      },
      legacyLineupPending: false,
    };
  }

  function matrix(): Pick<V1TeamRosterMatrix, 'games' | 'players'> {
    const views = GAME_ROSTER_MSW.games.map((g) => ({ game: g, roster: view(g) }));
    const games: V1TeamRosterMatrixGame[] = views.map(({ game, roster }) => ({
      gameId: game.gameId,
      sideId: game.sideId,
      teamMatchId: roster.teamMatchId,
      competitionId: roster.competitionId,
      competitionKind: roster.competitionKind,
      competitionTitle: '성수 풋살컵',
      opponentName: game.opponentName,
      scheduledAt: game.startAt,
      gameState: roster.gameState,
      editable: roster.editable,
      summary: {
        participating: roster.counts.participating,
        excluded: roster.counts.excluded,
        unavailable: roster.counts.unavailable,
        suspended: roster.counts.suspended,
      },
    }));
    const players = GAME_ROSTER_MSW.players.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      accountLinked: true,
      cells: views.map(({ roster }): V1TeamRosterCell => {
        const empty = { reason: null, actorRole: null, adjustmentId: null, unavailabilityId: null, remainingMatches: null };
        const ex = roster.excluded.find((e) => e.userId === p.userId);
        if (ex) return { ...empty, gameId: roster.gameId, status: 'EXCLUDED', reason: ex.reason, actorRole: ex.actor.role, adjustmentId: ex.adjustmentId };
        const un = roster.unavailable.find((u) => u.userId === p.userId);
        if (un) return { ...empty, gameId: roster.gameId, status: 'UNAVAILABLE', reason: un.reason, actorRole: un.actor.role, unavailabilityId: un.unavailabilityId };
        return { ...empty, gameId: roster.gameId, status: 'PARTICIPATING' };
      }),
    }));
    return { games, players };
  }

  function exclude(gameId: string, userId: string, reason: string | null): boolean {
    if (activeAdjustment(gameId, userId)) return true;
    state.adjustments.push({
      id: nextId('adjustment'),
      gameId,
      userId,
      reason,
      actorUserId: GAME_ROSTER_MSW.viewerUserId,
      actorRole: 'TEAM_MANAGER',
      createdAt: at(),
      revokedAt: null,
      revokedByUserId: null,
    });
    return false;
  }

  function revoke(gameId: string, userId: string): boolean {
    const adj = activeAdjustment(gameId, userId);
    if (!adj) return true;
    adj.revokedAt = at();
    adj.revokedByUserId = GAME_ROSTER_MSW.viewerUserId;
    return false;
  }

  const inRoster = (userId: string) => GAME_ROSTER_MSW.players.some((p) => p.userId === userId);
  const deadlinePassed = (gameIds: string[]) =>
    fail(409, 'LINEUP_DEADLINE_PASSED', '경기가 시작돼 명단을 바꿀 수 없어요.', { gameIds });
  const unavailabilityView = (u: Unavailability): V1MemberUnavailability => {
    const { actorUserId, actorRole, ...rest } = u;
    return { ...rest, actor: { userId: actorUserId, displayName: NAMES[actorUserId] ?? '알 수 없음', role: actorRole } };
  };

  const sidePath = `${api}/games/:gameId/sides/:sideId`;
  const handlers = [
    http.get(`${sidePath}/roster`, async ({ request, params }) => {
      await record(request, new URL(request.url).pathname);
      const game = findGame(String(params.gameId), String(params.sideId));
      if (!game) return fail(404, 'GAME_ROSTER_NOT_AVAILABLE', '이 경기는 명단을 조정할 수 없어요.');
      return ok(view(game));
    }),
    http.get(`${sidePath}/roster-adjustments`, async ({ request, params }) => {
      await record(request, new URL(request.url).pathname);
      const game = findGame(String(params.gameId), String(params.sideId));
      if (!game) return fail(404, 'GAME_ROSTER_NOT_AVAILABLE', '이 경기는 명단을 조정할 수 없어요.');
      const events: V1GameRosterHistoryEvent[] = state.adjustments
        .filter((a) => a.gameId === game.gameId)
        .flatMap((a) => {
          const common = { adjustmentId: a.id, userId: a.userId, displayName: NAMES[a.userId], reason: a.reason };
          const rows: V1GameRosterHistoryEvent[] = [
            { ...common, type: 'EXCLUDE', actor: actor(a.actorUserId, a.actorRole), at: a.createdAt },
          ];
          if (a.revokedAt !== null && a.revokedByUserId !== null) {
            rows.push({ ...common, type: 'REVOKE', actor: actor(a.revokedByUserId, null), at: a.revokedAt });
          }
          return rows;
        })
        .sort((x, y) => x.at.localeCompare(y.at));
      return ok({ gameId: game.gameId, sideId: game.sideId, events });
    }),
    http.post(`${sidePath}/roster-adjustments`, async ({ request, params }) => {
      await record(request, new URL(request.url).pathname);
      const game = findGame(String(params.gameId), String(params.sideId));
      if (!game) return fail(404, 'GAME_ROSTER_NOT_AVAILABLE', '이 경기는 명단을 조정할 수 없어요.');
      const body = state.requests.at(-1)!.body as { userId: string; reason?: string };
      if (state.gameStates.get(game.gameId) !== 'SCHEDULED') return deadlinePassed([game.gameId]);
      if (!inRoster(body.userId)) return fail(422, 'ROSTER_ADJUSTMENT_NOT_IN_ROSTER', '기준 명단에 없는 선수예요.');
      const alreadyApplied = exclude(game.gameId, body.userId, body.reason ?? null);
      const adj = activeAdjustment(game.gameId, body.userId)!;
      const { gameId: _gameId, actorUserId: _actor, revokedByUserId: _revoker, ...adjustment } = adj;
      return ok({ alreadyApplied, adjustment, roster: view(game) });
    }),
    http.delete(`${sidePath}/roster-adjustments/:userId`, async ({ request, params }) => {
      await record(request, new URL(request.url).pathname);
      const game = findGame(String(params.gameId), String(params.sideId));
      if (!game) return fail(404, 'GAME_ROSTER_NOT_AVAILABLE', '이 경기는 명단을 조정할 수 없어요.');
      if (state.gameStates.get(game.gameId) !== 'SCHEDULED') return deadlinePassed([game.gameId]);
      const alreadyApplied = revoke(game.gameId, String(params.userId));
      return ok({ alreadyApplied, roster: view(game) });
    }),
    http.get(`${api}/teams/:teamId/game-rosters`, async ({ request, params }) => {
      await record(request, new URL(request.url).pathname);
      const result: V1TeamRosterMatrix = { teamId: String(params.teamId), viewerRole: 'TEAM_MANAGER', ...matrix() };
      return ok(result);
    }),
    http.post(`${api}/teams/:teamId/game-rosters/batch`, async ({ request, params }) => {
      await record(request, new URL(request.url).pathname);
      const { changes } = state.requests.at(-1)!.body as {
        changes: { gameId: string; userId: string; op: 'EXCLUDE' | 'REVOKE'; reason?: string }[];
      };
      const started = [...new Set(changes.map((c) => c.gameId))].filter((id) => state.gameStates.get(id) !== 'SCHEDULED');
      if (started.length > 0) return deadlinePassed(started);
      const results = changes.map((c) => {
        const game = findGame(c.gameId)!;
        const alreadyApplied = c.op === 'EXCLUDE' ? exclude(c.gameId, c.userId, c.reason ?? null) : revoke(c.gameId, c.userId);
        return { gameId: c.gameId, sideId: game.sideId, userId: c.userId, op: c.op, alreadyApplied };
      });
      return ok({ teamId: String(params.teamId), results });
    }),
    http.get(`${api}/teams/:teamId/members/:userId/unavailability`, async ({ request, params }) => {
      await record(request, new URL(request.url).pathname);
      const items = state.unavailabilities
        .filter((u) => u.teamId === params.teamId && u.userId === params.userId)
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
        .map(unavailabilityView);
      return ok({ teamId: String(params.teamId), userId: String(params.userId), items });
    }),
    http.post(`${api}/teams/:teamId/members/:userId/unavailability`, async ({ request, params }) => {
      await record(request, new URL(request.url).pathname);
      const body = state.requests.at(-1)!.body as { startsAt: string; endsAt: string; reason?: string };
      const created: Unavailability = {
        id: nextId('unavailability'),
        teamId: String(params.teamId),
        userId: String(params.userId),
        startsAt: new Date(body.startsAt).toISOString(),
        endsAt: new Date(body.endsAt).toISOString(),
        reason: body.reason ?? null,
        actorUserId: GAME_ROSTER_MSW.viewerUserId,
        actorRole: 'TEAM_MANAGER',
        createdAt: at(),
        revokedAt: null,
      };
      state.unavailabilities.push(created);
      const syncedSides = GAME_ROSTER_MSW.games.filter((g) => created.startsAt <= g.startAt && g.startAt < created.endsAt).length;
      return HttpResponse.json(
        { status: 'success', data: { unavailability: unavailabilityView(created), syncedSides }, timestamp: NOW },
        { status: 201 },
      );
    }),
    http.delete(`${api}/teams/:teamId/members/:userId/unavailability/:unavailabilityId`, async ({ request, params }) => {
      await record(request, new URL(request.url).pathname);
      const row = state.unavailabilities.find((u) => u.id === params.unavailabilityId && u.userId === params.userId);
      if (!row) return fail(404, 'UNAVAILABILITY_NOT_FOUND', '결장 기간을 찾을 수 없어요.');
      const alreadyApplied = row.revokedAt !== null;
      if (!alreadyApplied) row.revokedAt = at();
      return ok({ alreadyApplied, unavailability: unavailabilityView(row), syncedSides: alreadyApplied ? 0 : 1 });
    }),
    http.get(`${api}/admin/tournaments/:tournamentId/registrations/:registrationId/game-rosters`, async ({ request, params }) => {
      await record(request, new URL(request.url).pathname);
      const result: V1AdminRegistrationRosterMatrix = {
        registrationId: String(params.registrationId),
        teamId: GAME_ROSTER_MSW.teamId,
        competitionId: String(params.tournamentId),
        viewerRole: 'ADMIN',
        ...matrix(),
      };
      return ok(result);
    }),
  ];

  return {
    handlers,
    requests: state.requests,
    setGameState(gameId: string, gameState: V1GameState) {
      state.gameStates.set(gameId, gameState);
    },
  };
}

export const v1GameRosterMswHandlers = createV1GameRosterMswHandlers().handlers;

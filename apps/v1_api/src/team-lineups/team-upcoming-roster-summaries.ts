import type { Prisma } from '@prisma/client';
import { computeGameRoster } from '../games/roster/game-roster-computation';
import { summarizeGameRoster } from '../games/roster/game-roster-matrix';
import { parseLineupCatalog } from '../tournaments/competition-config/competition-config.parse';
import { loadTeamCompetitionGameOrder } from '../tournaments/discipline/team-game-order';
import { readSuspensionVerdictsForUpcomingKeys } from '../tournaments/discipline/suspension-verdicts';
import { loadCompetitionRosterBase, type GameRosterSideContext } from '../games/roster/game-roster-loader';
import type { TeamUpcomingGame, GameRosterSummaryEntry } from './lineup-todo.service';

type Tx = Prisma.TransactionClient;
const QUERY_BATCH_SIZE = 100;
const UPCOMING_SIDE_SELECT = {
  id: true,
  gameId: true,
  game: { select: { teamMatchId: true } },
} as const;
const UPCOMING_GAME_CONTEXT_SELECT = {
  id: true,
  state: true,
  competitionConfig: { select: { lineup: true } },
  teamMatch: { select: { id: true, tournamentId: true, leagueId: true, startAt: true } },
} as const;
type UpcomingSide = Prisma.V1GameSideGetPayload<{ select: typeof UPCOMING_SIDE_SELECT }>;
type UpcomingGameContext = Prisma.V1GameGetPayload<{ select: typeof UPCOMING_GAME_CONTEXT_SELECT }>;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) result.push(items.slice(offset, offset + size));
  return result;
}

/** Batch-calculates the member roster selector summaries without changing home/TODO callers. */
export async function loadTeamUpcomingRosterSummaries(
  tx: Tx,
  teamId: string,
  games: readonly TeamUpcomingGame[],
): Promise<Map<string, GameRosterSummaryEntry>> {
  if (games.length === 0) return new Map();

  const sideRows: UpcomingSide[] = [];
  for (const ids of chunks(games.map((game) => game.gameId), QUERY_BATCH_SIZE)) {
    sideRows.push(...await tx.v1GameSide.findMany({
      where: { gameId: { in: ids }, teamId },
      select: UPCOMING_SIDE_SELECT,
    }));
  }
  const sideByGameId = new Map(sideRows.map((side) => [side.gameId, side]));
  const result = new Map<string, GameRosterSummaryEntry>(sideRows.map((side) => [side.gameId, {
    teamMatchId: side.game.teamMatchId,
    sideId: side.id,
    summary: null,
    participantUserIds: null,
  }]));
  const rosterGameIds = games
    .filter((game) => game.competitionKind !== 'FRIENDLY' && game.tournamentId !== null)
    .map((game) => game.gameId);
  const gameRows: UpcomingGameContext[] = [];
  for (const ids of chunks(rosterGameIds, QUERY_BATCH_SIZE)) {
    gameRows.push(...await tx.v1Game.findMany({
      where: { id: { in: ids } },
      select: UPCOMING_GAME_CONTEXT_SELECT,
    }));
  }
  const rows = gameRows.flatMap((game) => {
    const side = sideByGameId.get(game.id);
    const match = game.teamMatch;
    if (side === undefined || match === null) return [];
    const competitionId = match.leagueId ?? match.tournamentId;
    if (competitionId === null) return [];
    const context: GameRosterSideContext = {
      competitionId,
      isLeague: match.leagueId !== null,
      teamId,
      goalkeeperPositionCode:
        parseLineupCatalog(game.competitionConfig?.lineup ?? null).positions.find((position) => position.goalkeeper)?.code ?? 'GK',
      gameId: game.id,
      sideId: side.id,
      gameState: game.state,
      teamMatchId: match.id,
      tournamentId: match.tournamentId,
      leagueId: match.leagueId,
      startAt: match.startAt,
    };
    return [{ context, competitionKey: `${context.isLeague ? 'LEAGUE' : 'TOURNAMENT'}:${competitionId}` }];
  });
  const rowByGameId = new Map(rows.map((row) => [row.context.gameId, row]));
  const contextIds = rows.map(({ context }) => ({ gameId: context.gameId, sideId: context.sideId }));
  const [roles, adjustments] = await Promise.all([
    Promise.all(chunks(contextIds, QUERY_BATCH_SIZE).map((batch) => tx.v1GameRosterRole.findMany({
      where: { OR: batch.map(({ gameId, sideId }) => ({ gameId, sideId, teamId })) },
      select: { gameId: true, sideId: true, userId: true, goalkeeper: true },
    }))).then((pages) => pages.flat()),
    Promise.all(chunks(contextIds, QUERY_BATCH_SIZE).map((batch) => tx.v1GameRosterAdjustment.findMany({
      where: { revokedAt: null, OR: batch.map(({ gameId, sideId }) => ({ gameId, sideId, teamId })) },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        gameId: true,
        sideId: true,
        userId: true,
        reason: true,
        actorUserId: true,
        actorRole: true,
        createdAt: true,
        revokedAt: true,
      },
    }))).then((pages) => pages.flat()),
  ]);
  const rolesBySide = new Map<string, Map<string, boolean>>();
  for (const role of roles) {
    const key = `${role.gameId}:${role.sideId}`;
    const byUser = rolesBySide.get(key) ?? new Map<string, boolean>();
    byUser.set(role.userId, role.goalkeeper);
    rolesBySide.set(key, byUser);
  }
  const adjustmentsBySide = new Map<string, typeof adjustments>();
  for (const adjustment of adjustments) {
    const key = `${adjustment.gameId}:${adjustment.sideId}`;
    adjustmentsBySide.set(key, [...(adjustmentsBySide.get(key) ?? []), adjustment]);
  }

  const kickoffs = [...new Map(rows.flatMap(({ context }) =>
    context.startAt === null ? [] : [[context.startAt.getTime(), context.startAt] as const],
  )).values()];
  const fetchedUnavailabilities = (await Promise.all(chunks(kickoffs, QUERY_BATCH_SIZE).map((batch) =>
    tx.v1TeamMemberUnavailability.findMany({
      where: {
        teamId,
        revokedAt: null,
        OR: batch.map((at) => ({ startsAt: { lte: at }, endsAt: { gt: at } })),
      },
      select: {
        id: true,
        userId: true,
        startsAt: true,
        endsAt: true,
        reason: true,
        actorUserId: true,
        actorRole: true,
        revokedAt: true,
      },
    }),
  ))).flat();
  const unavailabilities = [...new Map(fetchedUnavailabilities.map((row) => [row.id, row])).values()];

  const contextsByCompetition = new Map<string, GameRosterSideContext[]>();
  for (const { context, competitionKey } of rows) {
    contextsByCompetition.set(competitionKey, [...(contextsByCompetition.get(competitionKey) ?? []), context]);
  }
  const preloadByCompetition = new Map<string, {
    base: Awaited<ReturnType<typeof loadCompetitionRosterBase>>;
    suspensions: Map<string, Map<string, import('../tournaments/discipline/card-suspension').SuspensionVerdict>>;
  }>();
  for (const [competitionKey, contexts] of contextsByCompetition) {
    const first = contexts[0]!;
    const base = await loadCompetitionRosterBase(tx, {
      competitionId: first.competitionId,
      isLeague: first.isLeague,
      teamId,
    });
    const suspensions = new Map<string, Map<string, import('../tournaments/discipline/card-suspension').SuspensionVerdict>>();
    if (base !== null) {
      const orderedGames = await loadTeamCompetitionGameOrder(tx, {
        competitionId: first.competitionId,
        isLeague: first.isLeague,
        teamId,
      });
      const byUpcomingKey = await readSuspensionVerdictsForUpcomingKeys(tx, {
        competitionId: first.competitionId,
        orderedGames,
        upcomingKeys: contexts.map((context) => context.teamMatchId),
      });
      for (const context of contexts) {
        suspensions.set(context.teamMatchId, byUpcomingKey.get(context.teamMatchId) ?? new Map());
      }
    }
    preloadByCompetition.set(competitionKey, { base, suspensions });
  }

  const unavailabilityByKickoff = new Map<number, typeof unavailabilities>();
  for (const kickoff of kickoffs) {
    unavailabilityByKickoff.set(kickoff.getTime(), unavailabilities.filter((row) =>
      row.startsAt.getTime() <= kickoff.getTime() && kickoff.getTime() < row.endsAt.getTime(),
    ));
  }
  for (const game of games) {
    const row = rowByGameId.get(game.gameId);
    if (row === undefined) continue;
    const { context, competitionKey } = row;
    const sideKey = `${context.gameId}:${context.sideId}`;
    const preload = preloadByCompetition.get(competitionKey);
    const base = preload?.base ?? null;
    const computed = base === null ? null : computeGameRoster({
      base: base.entries.map((entry) => ({
        ...entry,
        goalkeeper: entry.goalkeeper ?? rolesBySide.get(sideKey)?.get(entry.userId) ?? false,
      })),
      adjustments: adjustmentsBySide.get(sideKey) ?? [],
      unavailabilities: context.startAt === null ? [] : unavailabilityByKickoff.get(context.startAt.getTime()) ?? [],
      gameStartAt: context.startAt,
      suspensionVerdicts: preload?.suspensions.get(context.teamMatchId) ?? new Map(),
    });
    result.set(game.gameId, {
      teamMatchId: context.teamMatchId,
      sideId: context.sideId,
      summary: computed === null ? null : summarizeGameRoster(computed),
      participantUserIds: computed === null ? null : new Set(computed.participants.map((entry) => entry.userId)),
    });
  }
  return result;
}

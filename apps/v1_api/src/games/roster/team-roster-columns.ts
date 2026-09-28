import type { Prisma } from '@prisma/client';
import { loadTeamCompetitionGameOrder } from '../../tournaments/discipline/team-game-order';
import { loadCompetitionRosterBase, loadGameRoster, type LoadedGameRoster } from './game-roster-loader';
import type { TeamRosterMatrixGame } from './game-roster-matrix';
import { upcomingCompetitionGameWhere } from './game-roster-sync';

type Tx = Prisma.TransactionClient;

export interface TeamRosterColumn {
  readonly game: TeamRosterMatrixGame;
  /** 기준 명단이 없는 팀(확정 신청 없는 대회)은 null. */
  readonly loaded: LoadedGameRoster | null;
}

/**
 * 한 팀의 시작 전 대회·리그 경기와 경기마다 계산된 명단. 시각순(시각 없는 대회 대진은 뒤).
 * 기준 명단·팀 경기 순서는 대회·리그마다 한 번만 읽는다.
 */
export async function loadTeamRosterColumns(
  tx: Tx,
  input: { teamId: string; competitionId: string | null; now: Date },
): Promise<TeamRosterColumn[]> {
  const games = await tx.v1Game.findMany({
    where: upcomingCompetitionGameWhere(input.competitionId, input.teamId, input.now),
    select: {
      id: true,
      state: true,
      sides: { where: { teamId: input.teamId }, select: { id: true } },
      teamMatch: {
        select: {
          id: true,
          startAt: true,
          leagueId: true,
          tournamentId: true,
          hostTeamId: true,
          hostTeam: { select: { name: true } },
          approvedApplicantTeam: { select: { name: true } },
          league: { select: { title: true } },
          tournament: { select: { title: true } },
        },
      },
    },
  });
  const rows = games.flatMap((game) => {
    const teamMatch = game.teamMatch;
    const side = game.sides[0];
    const competitionId = teamMatch === null ? null : (teamMatch.leagueId ?? teamMatch.tournamentId);
    if (teamMatch === null || side === undefined || competitionId === null) return [];
    const isLeague = teamMatch.leagueId !== null;
    const isHost = teamMatch.hostTeamId === input.teamId;
    const column: TeamRosterMatrixGame = {
      gameId: game.id,
      sideId: side.id,
      teamMatchId: teamMatch.id,
      competitionId,
      competitionKind: isLeague ? 'LEAGUE' : 'TOURNAMENT',
      competitionTitle: (isLeague ? teamMatch.league?.title : teamMatch.tournament?.title) ?? null,
      opponentName: (isHost ? teamMatch.approvedApplicantTeam?.name : teamMatch.hostTeam?.name) ?? null,
      scheduledAt: teamMatch.startAt,
      gameState: game.state,
    };
    return [{ column, isLeague }];
  });
  rows.sort(
    (a, b) =>
      (a.column.scheduledAt?.getTime() ?? Infinity) - (b.column.scheduledAt?.getTime() ?? Infinity) ||
      a.column.gameId.localeCompare(b.column.gameId),
  );

  const preload = async (competitionId: string, isLeague: boolean) => {
    const scope = { competitionId, isLeague, teamId: input.teamId };
    const base = await loadCompetitionRosterBase(tx, scope);
    return { base, orderedGames: base === null ? [] : await loadTeamCompetitionGameOrder(tx, scope) };
  };
  const preloadByCompetition = new Map<string, Awaited<ReturnType<typeof preload>>>();
  const columns: TeamRosterColumn[] = [];
  for (const { column, isLeague } of rows) {
    let preloaded = preloadByCompetition.get(column.competitionId);
    if (preloaded === undefined) {
      preloaded = await preload(column.competitionId, isLeague);
      preloadByCompetition.set(column.competitionId, preloaded);
    }
    const loaded =
      preloaded.base === null
        ? null
        : await loadGameRoster(tx, { gameId: column.gameId, sideId: column.sideId }, preloaded);
    columns.push({ game: column, loaded });
  }
  return columns;
}

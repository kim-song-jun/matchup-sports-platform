import { type Prisma, V1GameState } from '@prisma/client';
import { loadTeamCompetitionGameOrder } from '../../tournaments/discipline/team-game-order';
import { loadCompetitionRosterBase, loadGameRoster, loadPlayedLineup, type LoadedGameRoster } from './game-roster-loader';
import type { TeamRosterMatrixGame } from './game-roster-matrix';
import type { PlayedLineupRow } from './game-roster-view';
import { isUnmigratedTeamAuthoredLineup, upcomingCompetitionGameWhere } from './game-roster-sync';

type Tx = Prisma.TransactionClient;

export interface TeamRosterColumn {
  readonly game: TeamRosterMatrixGame;
  /** 기준 명단이 없는 팀(확정 신청 없는 대회)은 null. */
  readonly loaded: LoadedGameRoster | null;
  /** 시작된 경기의 기록 명단. 시작 전이거나 기준 명단이 없으면 null. */
  readonly playedLineup: readonly PlayedLineupRow[] | null;
}

/** 대회·리그 대진에서 그 팀의 상대 팀 이름. 상대가 아직 정해지지 않았으면 null. */
export function competitionOpponentName(
  teamMatch: {
    hostTeamId: string | null;
    hostTeam: { name: string } | null;
    approvedApplicantTeam: { name: string } | null;
  },
  teamId: string,
): string | null {
  return (teamMatch.hostTeamId === teamId ? teamMatch.approvedApplicantTeam?.name : teamMatch.hostTeam?.name) ?? null;
}

/**
 * 한 팀의 시작 전 대회·리그 경기와 경기마다 계산된 명단. 시각순(시각 없는 대회 대진은 뒤).
 * `includeStarted` 면 그 대회·리그에서 시작된(진행 중·종료) 경기도 싣는다 — 취소된 경기는 빠진다.
 * 기준 명단·팀 경기 순서는 대회·리그마다 한 번만 읽는다.
 */
export async function loadTeamRosterColumns(
  tx: Tx,
  input: { teamId: string; competitionId: string | null; now: Date; includeStarted?: boolean },
): Promise<TeamRosterColumn[]> {
  const upcoming = upcomingCompetitionGameWhere(input.competitionId, input.teamId, input.now);
  const started: Prisma.V1GameWhereInput | null =
    input.includeStarted && input.competitionId !== null
      ? {
          state: { in: [V1GameState.LIVE, V1GameState.PAUSED, V1GameState.ENDED] },
          teamMatch: {
            deletedAt: null,
            status: { not: 'cancelled' },
            OR: [{ leagueId: input.competitionId }, { tournamentId: input.competitionId, leagueId: null }],
          },
          sides: { some: { teamId: input.teamId } },
        }
      : null;
  const games = await tx.v1Game.findMany({
    where: started === null ? upcoming : { OR: [upcoming, started] },
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
    const column: TeamRosterMatrixGame = {
      gameId: game.id,
      sideId: side.id,
      teamMatchId: teamMatch.id,
      competitionId,
      competitionKind: isLeague ? 'LEAGUE' : 'TOURNAMENT',
      competitionTitle: (isLeague ? teamMatch.league?.title : teamMatch.tournament?.title) ?? null,
      opponentName: competitionOpponentName(teamMatch, input.teamId),
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
    columns.push({ game: column, loaded, playedLineup: loaded === null ? null : await loadPlayedLineup(tx, loaded.context) });
  }
  const legacyCompetitions = new Set<string>();
  for (const { column, isLeague } of rows) {
    // 일괄 GK 변경이 검사하는 것도 시작 전 경기뿐이다 — 진행한 경기의 옛 저장본이 남은 경기 GK 를 막지 않는다.
    if (!isLeague || column.gameState !== V1GameState.SCHEDULED) continue;
    const latest = await tx.v1GameLineup.findFirst({ where: { gameId: column.gameId, sideId: column.sideId, invalidatedAt: null }, orderBy: { revision: 'desc' } });
    if (latest !== null && await isUnmigratedTeamAuthoredLineup(tx, column.gameId, column.sideId, latest)) legacyCompetitions.add(column.competitionId);
  }
  return columns.map((column) => ({ ...column, game: { ...column.game, goalkeeperEditable: !legacyCompetitions.has(column.game.competitionId) } }));
}

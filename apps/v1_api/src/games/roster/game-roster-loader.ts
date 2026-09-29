import type { Prisma, V1GameState } from '@prisma/client';
import { leagueTeamRosterBase, readLeagueTeamRosters } from '../../league-matches/league-fixture-creation';
import { readSuspensionVerdicts, type OrderedCompetitionGame } from '../../tournaments/discipline/suspension-verdicts';
import { loadTeamCompetitionGameOrder } from '../../tournaments/discipline/team-game-order';
import { participantDisplayName } from '../../tournaments/participant-display-name';
import { readJerseyNumbers } from '../../tournaments/tournament-player-jersey';
import { computeGameRoster, type GameRosterBaseEntry, type GameRosterComputation } from './game-roster-computation';

type Tx = Prisma.TransactionClient;

export type GameRosterBaseSource = 'REGISTRATION' | 'TEAM_MEMBERS';

export interface CompetitionRosterBase {
  readonly source: GameRosterBaseSource;
  readonly entries: GameRosterBaseEntry[];
}

export interface CompetitionTeamScope {
  /** 리그면 leagueId, 대회면 tournamentId. 참가 신청(`V1TournamentRegistration.tournamentId`)의 키와 같다. */
  readonly competitionId: string;
  readonly isLeague: boolean;
  readonly teamId: string;
}

/**
 * 기준 명단 = confirmed 참가 신청의 활성 선수. 리그는 명단이 없는 팀에 한해 팀 활성 멤버로 폴백한다.
 * 대회에 confirmed 신청이 없거나 리그 팀이 비활성이면 `null` — 계산 대상이 아니다.
 * DB 를 바꾸지 않는다 — 조회 API 가 그대로 부른다.
 */
export async function loadCompetitionRosterBase(
  tx: Tx,
  scope: CompetitionTeamScope,
): Promise<CompetitionRosterBase | null> {
  if (scope.isLeague) {
    const team = (await readLeagueTeamRosters(tx, scope.competitionId, [scope.teamId])).get(scope.teamId);
    if (team === undefined) return null;
    return {
      source: team.registeredPlayers.length > 0 ? 'REGISTRATION' : 'TEAM_MEMBERS',
      entries: leagueTeamRosterBase(team),
    };
  }

  const registration = await tx.v1TournamentRegistration.findFirst({
    where: { tournamentId: scope.competitionId, teamId: scope.teamId, status: 'confirmed' },
    select: {
      id: true,
      players: {
        where: { removedAt: null },
        select: {
          id: true,
          userId: true,
          user: { select: { profile: { select: { nickname: true, displayName: true } } } },
        },
        orderBy: { id: 'asc' },
      },
    },
  });
  if (registration === null) return null;
  const jerseys = await readJerseyNumbers(tx, registration.id);
  return {
    source: 'REGISTRATION',
    entries: registration.players.map((player) => ({
      userId: player.userId,
      accountLinked: true,
      displayNameSnapshot: participantDisplayName(player),
      jerseyNumber: jerseys.get(player.id) ?? null,
      sourceParticipantId: player.id,
    })),
  };
}

export interface GameRosterSideContext extends CompetitionTeamScope {
  readonly gameId: string;
  readonly sideId: string;
  readonly gameState: V1GameState;
  readonly teamMatchId: string;
  readonly tournamentId: string | null;
  readonly leagueId: string | null;
  readonly startAt: Date | null;
}

export interface LoadedGameRoster {
  readonly context: GameRosterSideContext;
  readonly baseSource: GameRosterBaseSource;
  readonly base: readonly GameRosterBaseEntry[];
  readonly computation: GameRosterComputation;
}

export interface GameRosterPreload {
  readonly base?: CompetitionRosterBase | null;
  readonly orderedGames?: readonly OrderedCompetitionGame[];
}

/**
 * 대회·리그 경기 한 사이드의 명단 계산 입력을 읽어 `computeGameRoster` 에 넘긴다. DB 를 바꾸지 않는다.
 * 친선 경기·팀 미정 사이드·기준 명단이 없는 팀은 `null`.
 *
 * 한 팀의 여러 경기를 돌 때는 `preloaded` 로 기준 명단과 팀 경기 순서를 한 번만 읽어 넘긴다.
 */
export async function loadGameRoster(
  tx: Tx,
  target: { gameId: string; sideId: string },
  preloaded: GameRosterPreload = {},
): Promise<LoadedGameRoster | null> {
  const context = await loadGameRosterContext(tx, target);
  return context === null ? null : loadGameRosterForContext(tx, context, preloaded);
}

/** 경기·사이드에서 대회·리그와 팀을 푼다. 친선 경기·팀 미정 사이드는 `null`. */
export async function loadGameRosterContext(
  tx: Tx,
  target: { gameId: string; sideId: string },
): Promise<GameRosterSideContext | null> {
  const game = await tx.v1Game.findUnique({
    where: { id: target.gameId },
    select: {
      id: true,
      state: true,
      teamMatch: { select: { id: true, tournamentId: true, leagueId: true, startAt: true } },
      sides: { where: { id: target.sideId }, select: { id: true, teamId: true } },
    },
  });
  const side = game?.sides[0];
  const teamMatch = game?.teamMatch ?? null;
  if (game === null || game === undefined || side === undefined || side.teamId === null || teamMatch === null) {
    return null;
  }
  const competitionId = teamMatch.leagueId ?? teamMatch.tournamentId;
  if (competitionId === null) return null;

  const context: GameRosterSideContext = {
    competitionId,
    isLeague: teamMatch.leagueId !== null,
    teamId: side.teamId,
    gameId: game.id,
    sideId: side.id,
    gameState: game.state,
    teamMatchId: teamMatch.id,
    tournamentId: teamMatch.tournamentId,
    leagueId: teamMatch.leagueId,
    startAt: teamMatch.startAt,
  };
  return context;
}

export async function loadGameRosterForContext(
  tx: Tx,
  context: GameRosterSideContext,
  preloaded: GameRosterPreload = {},
): Promise<LoadedGameRoster | null> {
  const base = preloaded.base !== undefined ? preloaded.base : await loadCompetitionRosterBase(tx, context);
  if (base === null) return null;

  // 사이드 팀이 바뀌었으면 옛 팀의 조정은 이 팀 명단과 무관하다.
  const adjustments = await tx.v1GameRosterAdjustment.findMany({
    where: { gameId: context.gameId, sideId: context.sideId, teamId: context.teamId, revokedAt: null },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      userId: true,
      reason: true,
      actorUserId: true,
      actorRole: true,
      createdAt: true,
      revokedAt: true,
    },
  });
  const unavailabilities =
    context.startAt === null
      ? []
      : await tx.v1TeamMemberUnavailability.findMany({
          where: {
            teamId: context.teamId,
            revokedAt: null,
            startsAt: { lte: context.startAt },
            endsAt: { gt: context.startAt },
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
        });
  const orderedGames = preloaded.orderedGames ?? (await loadTeamCompetitionGameOrder(tx, context));
  const suspensionVerdicts = await readSuspensionVerdicts(tx, {
    competitionId: context.competitionId,
    orderedGames,
    upcomingKey: context.teamMatchId,
  });

  return {
    context,
    baseSource: base.source,
    base: base.entries,
    computation: computeGameRoster({
      base: base.entries,
      adjustments,
      unavailabilities,
      gameStartAt: context.startAt,
      suspensionVerdicts,
    }),
  };
}

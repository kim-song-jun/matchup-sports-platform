import type { Prisma, V1GameState } from '@prisma/client';
import { compareRosterOrder } from '../../common/roster-order';
import { leagueTeamRosterBase, readLeagueTeamRosters } from '../../league-matches/league-fixture-creation';
import { readSuspensionVerdicts, type OrderedCompetitionGame } from '../../tournaments/discipline/suspension-verdicts';
import { loadTeamCompetitionGameOrder } from '../../tournaments/discipline/team-game-order';
import { participantDisplayName } from '../../tournaments/participant-display-name';
import { rosterBlockReason } from '../../tournaments/roster-cleanup';
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
      entries: leagueTeamRosterBase(team).sort(rosterOrder),
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
    })).sort(rosterOrder),
  };
}

/**
 * 등번호 원본 = 확정된 참가 신청. 기준 명단이 참가 명단(`REGISTRATION`)이고 뷰어가 그 팀의 팀장·매니저일 때만 준다 —
 * 등번호 저장 API(`PATCH …/players/:playerId/jersey-number`)의 권한과 같아서, 열어 줘도 저장이 403 이 되는 사람에게는 주지 않는다.
 * 기준 명단을 읽는 쿼리(`loadCompetitionRosterBase`)와 같은 조건으로 찾는다.
 * `editable` 은 저장 API 의 잠금·마감 가드(`rosterBlockReason`)와 같은 판정이다 — 잠긴 명단에 입력 칸을 열면 저장이 409 가 된다.
 */
export async function loadJerseyRegistration(
  tx: Tx,
  scope: CompetitionTeamScope,
  input: { baseSource: GameRosterBaseSource; isTeamManager: boolean },
): Promise<{ id: string; editable: boolean } | null> {
  if (!input.isTeamManager || input.baseSource !== 'REGISTRATION') return null;
  const registration = await tx.v1TournamentRegistration.findFirst({
    where: { tournamentId: scope.competitionId, teamId: scope.teamId, status: 'confirmed' },
    select: {
      id: true,
      status: true,
      rosterLockedAt: true,
      rosterDeadlineOverrideAt: true,
      tournament: { select: { rosterDeadlineAt: true, status: true, kind: true } },
    },
  });
  if (!registration) return null;
  return { id: registration.id, editable: rosterBlockReason(registration, registration.tournament) === null };
}

/** 명단 화면·요약·계산 목록이 이 순서를 그대로 쓴다 — 규칙은 `compareRosterOrder` 한 곳에 있다. */
function rosterOrder(a: GameRosterBaseEntry, b: GameRosterBaseEntry): number {
  return compareRosterOrder(
    { jerseyNumber: a.jerseyNumber, name: a.displayNameSnapshot, id: a.userId },
    { jerseyNumber: b.jerseyNumber, name: b.displayNameSnapshot, id: b.userId },
  );
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

/** 그 시각을 덮는(`startsAt <= at < endsAt`) 취소 안 된 그 팀 결장 기간. */
export function unavailabilityCoveringWhere(teamId: string, at: Date): Prisma.V1TeamMemberUnavailabilityWhereInput {
  return { teamId, revokedAt: null, startsAt: { lte: at }, endsAt: { gt: at } };
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
          where: unavailabilityCoveringWhere(context.teamId, context.startAt),
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

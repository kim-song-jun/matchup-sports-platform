import { Prisma, V1GameLineupState, V1GameState, type V1GameLineup } from '@prisma/client';
import { OperationAuditWriterService } from '../../common/audit/operation-audit-writer.service';
import { carryRevokedConsent, loadRevokedConsentByUserId } from '../../team-matches/lineup-consent-carry';
import { suspensionRulesEnabled } from '../../tournaments/discipline/card-suspension';
import { readSuspensionRules } from '../../tournaments/discipline/suspension-verdicts';
import { loadTeamCompetitionGameOrder } from '../../tournaments/discipline/team-game-order';
import { createSourceRosterIdentityLinks } from '../games.service';
import {
  fillCompetitionRosterBase,
  loadCompetitionRosterBase,
  loadGameRosterContext,
  loadGameRosterForContext,
  type GameRosterPreload,
} from './game-roster-loader';

type Tx = Prisma.TransactionClient;

export const TOURNAMENT_ROSTER_SYNC_ACTION = 'TOURNAMENT_ROSTER_SYNCED';
export const LEAGUE_ROSTER_SYNC_ACTION = 'LEAGUE_ROSTER_SYNCED';
/**
 * 리그 이관 스크립트가 한 사이드의 팀장 저장본을 조정 기록으로 옮긴 뒤 남기는 감사 action.
 * `requestId = leagueRosterMigrationRequestId(gameId, sideId)`. 이 행이 있어야 그 사이드가 동기화 대상이 된다.
 */
export const LEAGUE_ROSTER_MIGRATED_ACTION = 'LEAGUE_ROSTER_ADJUSTMENTS_MIGRATED';

export function leagueRosterMigrationRequestId(gameId: string, sideId: string): string {
  return `${gameId}:${sideId}`;
}

function syncAuditRequestId(gameId: string, lineupId: string): string {
  return `${gameId}:${lineupId}`;
}

const KIND = {
  league: { action: LEAGUE_ROSTER_SYNC_ACTION, systemActor: 'LEAGUE_ROSTER_SYNC', identityReason: 'league_roster_sync' },
  tournament: {
    action: TOURNAMENT_ROSTER_SYNC_ACTION,
    systemActor: 'TOURNAMENT_ROSTER_SYNC',
    identityReason: 'tournament_roster_sync',
  },
} as const;

interface ParticipantRow {
  readonly userId: string | null;
  readonly displayNameSnapshot: string;
  readonly jerseyNumber: number | null;
}

function rosterKey(rows: readonly ParticipantRow[]): string {
  return rows
    .map((row) => `${row.userId ?? ''}␟${row.displayNameSnapshot}␟${row.jerseyNumber ?? ''}`)
    .sort()
    .join('␞');
}

/**
 * 리그 사이드의 최신 리비전이 팀장이 저장·제출한 것이고 아직 이관되지 않았으면 true.
 * 시스템 리비전 = 대진 생성 스냅샷(리비전 1 DRAFT) 또는 동기화 감사 행이 붙은 리비전.
 */
export async function isUnmigratedTeamAuthoredLineup(tx: Tx, gameId: string, sideId: string, latest: V1GameLineup) {
  if (latest.revision === 1 && latest.state === V1GameLineupState.DRAFT) return false;
  const marker = await tx.v1OperationAudit.findFirst({
    where: {
      OR: [
        {
          requestId: syncAuditRequestId(gameId, latest.id),
          action: { in: [LEAGUE_ROSTER_SYNC_ACTION, TOURNAMENT_ROSTER_SYNC_ACTION] },
        },
        { requestId: leagueRosterMigrationRequestId(gameId, sideId), action: LEAGUE_ROSTER_MIGRATED_ACTION },
      ],
    },
    select: { id: true },
  });
  return marker === null;
}

/**
 * `v1_games` 행을 id 순으로 잠근다. 경기 시작 명령이 잠그는 행이라, 잠근 뒤 읽은 `SCHEDULED` 판정은
 * 명단을 쓰는 동안 바뀌지 않는다. 여러 경기를 잠글 때 순서를 고정해 교착을 피한다(이미 잡은 행은 다시 잡아도 된다).
 */
export async function lockGameRows(tx: Tx, gameIds: readonly string[]): Promise<void> {
  for (const gameId of [...new Set(gameIds)].sort()) {
    await tx.$queryRaw`SELECT id FROM v1_games WHERE id = ${gameId} FOR UPDATE`;
  }
}

/** 팀들의 시작 전 대회·리그 경기를 한꺼번에 id 순으로 잠근다. 여러 팀·대회를 차례로 동기화하기 전에 부른다. */
async function lockUpcomingTeamGames(
  tx: Tx,
  competitionId: string | null,
  teamIds: readonly string[],
  now: Date,
): Promise<void> {
  if (teamIds.length === 0) return;
  const games = await tx.v1Game.findMany({
    where: { OR: teamIds.map((teamId) => upcomingCompetitionGameWhere(competitionId, teamId, now)) },
    select: { id: true },
  });
  await lockGameRows(
    tx,
    games.map((game) => game.id),
  );
}

/**
 * 대회·리그 경기 한 사이드의 명단을 계산 결과(`loadGameRoster`)에 맞춘다. 바뀌었으면 true.
 *
 * - 경기 행을 잠근 뒤 `SCHEDULED` 인 경기만. 참가자 행은 지우지 않고 새 리비전을 추가한다(골·카드 이벤트 FK).
 * - 새 리비전은 **SUBMITTED** 다. 공식 결과·신원 후보 셀렉터가 제출본을 우선 읽으므로
 *   DRAFT 로 얹으면 옛 제출본이 계속 기록이 된다.
 * - 리그의 팀장 저장본은 이관 전까지 덮지 않는다.
 */
export async function syncGameSideRoster(
  tx: Tx,
  target: { gameId: string; sideId: string },
  preloaded: GameRosterPreload = {},
): Promise<boolean> {
  await lockGameRows(tx, [target.gameId]);
  const context = await loadGameRosterContext(tx, target);
  if (context === null || context.gameState !== V1GameState.SCHEDULED) return false;
  if (preloaded.base === undefined) await fillCompetitionRosterBase(tx, context);
  const loaded = await loadGameRosterForContext(tx, context, preloaded);
  if (loaded === null) return false;
  const { computation } = loaded;

  const latest = await tx.v1GameLineup.findFirst({
    where: { gameId: context.gameId, sideId: context.sideId, invalidatedAt: null },
    orderBy: { revision: 'desc' },
  });
  if (latest === null) return false;
  if (context.isLeague && (await isUnmigratedTeamAuthoredLineup(tx, context.gameId, context.sideId, latest))) {
    return false;
  }

  const desired: ParticipantRow[] = computation.participants.map((entry) => ({
    userId: entry.accountLinked ? entry.userId : null,
    displayNameSnapshot: entry.displayNameSnapshot,
    jerseyNumber: entry.jerseyNumber,
  }));
  const current = await tx.v1GameParticipant.findMany({
    where: { lineupId: latest.id },
    select: { userId: true, displayNameSnapshot: true, jerseyNumber: true },
  });
  // 같은 명단이어도 최신이 DRAFT(대진 생성 스냅샷·진출 뒤 초안)면 제출본으로 올린다. 공식 결과·운영
  // 보드는 제출본만 명단으로 치고, 대회·리그는 팀이 직접 제출할 경로가 없다(T-e). 빈 명단은 제출하지 않는다.
  if (rosterKey(current) === rosterKey(desired) && (latest.state !== V1GameLineupState.DRAFT || desired.length === 0)) {
    return false;
  }

  const top = await tx.v1GameLineup.findFirst({
    where: { gameId: context.gameId, sideId: context.sideId },
    orderBy: { revision: 'desc' },
    select: { revision: true },
  });
  const kind = context.isLeague ? KIND.league : KIND.tournament;
  const carried = await loadRevokedConsentByUserId(tx, latest.id);
  const now = new Date();
  const lineup = await tx.v1GameLineup.create({
    data: {
      gameId: context.gameId,
      sideId: context.sideId,
      revision: Math.max(top?.revision ?? 0, latest.revision) + 1,
      supersedesId: latest.id,
      formation: latest.formation,
      state: V1GameLineupState.SUBMITTED,
      submittedAt: now,
    },
  });
  const created = await tx.v1GameParticipant.createManyAndReturn({
    data: desired.map((row) => ({
      gameId: context.gameId,
      sideId: context.sideId,
      lineupId: lineup.id,
      userId: row.userId,
      displayNameSnapshot: row.displayNameSnapshot,
      jerseyNumber: row.jerseyNumber,
      // 명단 = 출전자(정본 §3). 출전 판정은 이 값을 읽는다.
      started: true,
    })),
    select: { id: true, userId: true },
  });
  const linked = created.flatMap((row) => (row.userId === null ? [] : [{ participantId: row.id, userId: row.userId }]));
  await createSourceRosterIdentityLinks(
    tx,
    linked,
    { actorType: 'SYSTEM', systemActor: kind.systemActor },
    kind.identityReason,
  );
  for (const row of linked) {
    await carryRevokedConsent(tx, row.participantId, carried.get(row.userId));
  }
  await new OperationAuditWriterService().create(tx, {
    actor: { type: 'SYSTEM', id: kind.systemActor },
    requestId: syncAuditRequestId(context.gameId, lineup.id),
    action: kind.action,
    targetType: 'GAME',
    targetId: context.gameId,
    // 감사의 경기 참조는 (tournamentId, teamMatchId) 복합 FK 다. tournamentId 가 없는 옛 리그 경기에
    // 리그 id 를 짝지으면 FK 위반으로 트랜잭션이 깨지므로 그때는 경기 참조를 뺀다.
    tournamentId: context.tournamentId ?? context.leagueId,
    teamMatchId: context.tournamentId === null ? null : context.teamMatchId,
    occurredAt: now,
    before: { lineupId: latest.id },
    after: {
      lineupId: lineup.id,
      sideId: context.sideId,
      participantCount: created.length,
      excludedCount: computation.excluded.length,
      unavailableCount: computation.unavailable.length,
      suspendedCount: computation.suspended.length,
    },
  });
  return true;
}

/**
 * 한 팀의 대회·리그 시작 전 경기. 대회 대진은 시각이 선택값이라 시각 없는 경기도 시작 전으로 본다.
 * `competitionId` 가 null 이면 그 팀의 모든 대회·리그 경기다.
 */
export function upcomingCompetitionGameWhere(
  competitionId: string | null,
  teamId: string,
  now: Date,
): Prisma.V1GameWhereInput {
  return {
    state: V1GameState.SCHEDULED,
    teamMatch: {
      deletedAt: null,
      status: { not: 'cancelled' },
      AND: [
        competitionId === null
          ? { OR: [{ leagueId: { not: null } }, { tournamentId: { not: null } }] }
          : { OR: [{ leagueId: competitionId }, { tournamentId: competitionId, leagueId: null }] },
        { OR: [{ startAt: null }, { startAt: { gt: now } }] },
      ],
    },
    sides: { some: { teamId } },
  };
}

/**
 * 한 팀의 그 대회·리그 시작 전 경기 명단을 전부 다시 계산한다. 바뀐 사이드 수를 돌려준다.
 * 참가 명단 변경·시작 시각 변경·앞 경기 결과 변경처럼 팀의 여러 경기에 걸치는 트리거가 부른다.
 */
export async function syncCompetitionTeamRosters(
  tx: Tx,
  input: { competitionId: string; teamId: string },
): Promise<number> {
  const games = await tx.v1Game.findMany({
    where: upcomingCompetitionGameWhere(input.competitionId, input.teamId, new Date()),
    orderBy: { id: 'asc' },
    select: {
      id: true,
      teamMatch: { select: { leagueId: true } },
      sides: { where: { teamId: input.teamId }, select: { id: true } },
    },
  });
  if (games.length === 0) return 0;
  await lockGameRows(
    tx,
    games.map((game) => game.id),
  );
  const scope = {
    competitionId: input.competitionId,
    isLeague: games[0].teamMatch?.leagueId != null,
    teamId: input.teamId,
  };
  await fillCompetitionRosterBase(tx, scope);
  const base = await loadCompetitionRosterBase(tx, scope);
  // 확정 신청이 없는 대회 팀·비활성 리그 팀은 대진 생성과 같은 이유로 대상이 아니다.
  if (base === null) return 0;
  const orderedGames = await loadTeamCompetitionGameOrder(tx, scope);

  let synced = 0;
  for (const game of games) {
    for (const side of game.sides) {
      if (await syncGameSideRoster(tx, { gameId: game.id, sideId: side.id }, { base, orderedGames })) synced += 1;
    }
  }
  return synced;
}

/**
 * 경기의 순서가 바뀌었을 때(시작 시각 변경·대진 추가·팀 배정 변경) 관련 팀들의 시작 전 경기를 다시 계산한다.
 * 결장 기간은 시작 시각에, 출전정지는 팀 경기 순서에 걸리므로 규정 유무와 관계없이 돈다.
 */
export async function syncRostersForTeamMatchTeams(
  tx: Tx,
  input: { competitionId: string; teamIds: readonly (string | null)[] },
): Promise<number> {
  const teamIds = [...new Set(input.teamIds)].filter((teamId): teamId is string => teamId !== null);
  await lockUpcomingTeamGames(tx, input.competitionId, teamIds, new Date());
  let synced = 0;
  for (const teamId of teamIds) {
    synced += await syncCompetitionTeamRosters(tx, { competitionId: input.competitionId, teamId });
  }
  return synced;
}

/**
 * 결과 리비전이 제출·확정·무효가 된 경기의 양 팀 시작 전 경기를 다시 계산한다(출전정지 변동).
 * 출전정지 규정이 없는 대회·리그는 결과가 명단을 바꿀 수 없으므로 조회 두 번으로 끝난다.
 */
export async function syncRostersAfterResultChange(tx: Tx, gameId: string): Promise<number> {
  const game = await tx.v1Game.findUnique({
    where: { id: gameId },
    select: {
      teamMatch: { select: { tournamentId: true, leagueId: true, hostTeamId: true, approvedApplicantTeamId: true } },
    },
  });
  const teamMatch = game?.teamMatch ?? null;
  const competitionId = teamMatch === null ? null : (teamMatch.leagueId ?? teamMatch.tournamentId);
  if (teamMatch === null || competitionId === null) return 0;
  if (!suspensionRulesEnabled(await readSuspensionRules(tx, competitionId))) return 0;
  return syncRostersForTeamMatchTeams(tx, {
    competitionId,
    teamIds: [teamMatch.hostTeamId, teamMatch.approvedApplicantTeamId],
  });
}

/**
 * 결장 기간 등록·취소 뒤 그 팀의 기간 안 시작 전 대회·리그 경기를 다시 계산한다.
 * 경기마다 대회·리그가 다를 수 있어 대회·리그 단위로 묶어 돈다.
 */
export async function syncTeamRostersWithinPeriod(
  tx: Tx,
  input: { teamId: string; startsAt: Date; endsAt: Date },
): Promise<number> {
  const now = new Date();
  const matches = await tx.v1TeamMatch.findMany({
    where: {
      deletedAt: null,
      status: { not: 'cancelled' },
      startAt: { gte: input.startsAt, lt: input.endsAt, gt: now },
      OR: [{ leagueId: { not: null } }, { tournamentId: { not: null } }],
      AND: [{ OR: [{ hostTeamId: input.teamId }, { approvedApplicantTeamId: input.teamId }] }],
      game: { state: V1GameState.SCHEDULED },
    },
    select: { leagueId: true, tournamentId: true },
  });
  const competitionIds = new Set(
    matches.map((row) => row.leagueId ?? row.tournamentId).filter((id): id is string => id !== null),
  );
  if (competitionIds.size > 1) await lockUpcomingTeamGames(tx, null, [input.teamId], now);
  let synced = 0;
  for (const competitionId of competitionIds) {
    synced += await syncCompetitionTeamRosters(tx, { competitionId, teamId: input.teamId });
  }
  return synced;
}

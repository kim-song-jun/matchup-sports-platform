import { ConflictException } from '@nestjs/common';
import { Prisma, V1GameLineupState, V1GameState, V1TournamentStatus, type V1GameLineup } from '@prisma/client';
import { OperationAuditWriterService } from '../../common/audit/operation-audit-writer.service';
import { fillEmptyLeagueRosters } from '../../league-matches/league-fixture-creation';
import { carryRevokedConsent, loadRevokedConsentByUserId } from '../../team-matches/lineup-consent-carry';
import { suspensionRulesEnabled } from '../../tournaments/discipline/card-suspension';
import { readSuspensionRules } from '../../tournaments/discipline/suspension-verdicts';
import { loadTeamCompetitionGameOrder } from '../../tournaments/discipline/team-game-order';
import { selectLineupParticipantsWithDraftFallback } from '../core/latest-lineup-participants';
import { createSourceRosterIdentityLinks } from '../games.service';
import {
  loadCompetitionRosterBase,
  loadGameRosterContext,
  loadGameRosterForContext,
  type GameRosterPreload,
} from './game-roster-loader';
import { completeQueuedDuplicates, parseRosterResyncTarget } from './roster-resync-events';

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

export interface ShownArrival {
  readonly userId: string | null;
  readonly displayNameSnapshot: string;
  readonly arrivedAt: Date | null;
}

/**
 * 새 리비전 행마다 지금 화면에 보이는 명단에서 같은 사람의 검인 시각을 찾는다. 검인은 킥오프 직전이라
 * 재계산보다 먼저 온다 — 이월하지 않으면 명단이 한 번 바뀔 때마다 받아 둔 검인이 사라진다.
 * 계정 없는 행은 이름으로 대조하고, 같은 이름은 `shown` 순서대로 1:1 소진한다.
 */
export function carryArrivals(shown: readonly ShownArrival[], desired: readonly ParticipantRow[]): Array<Date | null> {
  const keyOf = (row: { userId: string | null; displayNameSnapshot: string }) =>
    row.userId !== null ? `u:${row.userId}` : `g:${row.displayNameSnapshot}`;
  const buckets = new Map<string, Array<Date | null>>();
  for (const row of shown) buckets.set(keyOf(row), [...(buckets.get(keyOf(row)) ?? []), row.arrivedAt]);
  return desired.map((row) => buckets.get(keyOf(row))?.shift() ?? null);
}

/** 그 사이드에서 화면(검인 패널)이 보여 주는 리비전의 참가자 — 제출본이 있으면 제출본, 없으면 최신. */
async function loadShownArrivals(tx: Tx, gameId: string, sideId: string): Promise<ShownArrival[]> {
  const lineups = await tx.v1GameLineup.findMany({
    where: { gameId, sideId, invalidatedAt: null },
    select: { id: true, sideId: true, revision: true, state: true },
  });
  const rows = await tx.v1GameParticipant.findMany({
    where: { lineupId: { in: lineups.map((lineup) => lineup.id) } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { sideId: true, lineupId: true, userId: true, displayNameSnapshot: true, arrivedAt: true },
  });
  return selectLineupParticipantsWithDraftFallback(rows, lineups);
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
 * 명단을 쓰는 동안 바뀌지 않는다. 이미 쥔 행은 다시 잡아도 기다리지 않는다.
 * 명단을 쓰는 경로는 이것 대신 `lockRosterWriteScope` 를 트랜잭션 첫 잠금으로 부른다.
 */
export async function lockGameRows(tx: Tx, gameIds: readonly string[]): Promise<void> {
  for (const gameId of [...new Set(gameIds)].sort()) {
    await tx.$queryRaw`SELECT id FROM v1_games WHERE id = ${gameId} FOR UPDATE`;
  }
}

/**
 * 명단을 쓰는 트랜잭션의 첫 잠금. 순서는 대회·리그 행(KEY SHARE) → 리그의 빈 참가 명단 채우기
 * (신청 → 계정 → 멤버십) → 경기(id 순)다. 감사 행의 대회 FK 검사가 대회 행을 KEY SHARE 하는데 대회 설정
 * 변경·순위 재계산은 대회 → 경기 순으로 잡으므로, 경기를 먼저 쥐면 둘이 서로를 기다린다.
 * `sideIds` 가 null 이면 그 경기들의 팀 배정된 사이드 전부가 채우기 대상이다.
 */
export async function lockRosterWriteScope(
  tx: Tx,
  gameIds: readonly string[],
  sideIds: readonly string[] | null,
): Promise<void> {
  const ids = [...new Set(gameIds)].sort();
  if (ids.length === 0) return;
  const games = await tx.v1Game.findMany({
    where: { id: { in: ids } },
    select: {
      teamMatch: { select: { tournamentId: true, leagueId: true } },
      sides: {
        where: { teamId: { not: null }, ...(sideIds === null ? {} : { id: { in: [...sideIds] } }) },
        select: { teamId: true },
      },
    },
  });
  const competitionIds = new Set<string>();
  const leagueTeams = new Map<string, Set<string>>();
  for (const game of games) {
    const tournamentId = game.teamMatch?.tournamentId ?? null;
    const leagueId = game.teamMatch?.leagueId ?? null;
    if (tournamentId !== null) competitionIds.add(tournamentId);
    if (leagueId === null) continue;
    competitionIds.add(leagueId);
    const teams = leagueTeams.get(leagueId) ?? new Set<string>();
    for (const side of game.sides) if (side.teamId !== null) teams.add(side.teamId);
    leagueTeams.set(leagueId, teams);
  }
  for (const competitionId of [...competitionIds].sort()) {
    await tx.$queryRaw`SELECT id FROM v1_tournaments WHERE id = ${competitionId} FOR KEY SHARE`;
  }
  for (const leagueId of [...leagueTeams.keys()].sort()) {
    const teamIds = [...leagueTeams.get(leagueId)!].sort();
    if (teamIds.length > 0) await fillEmptyLeagueRosters(tx, leagueId, teamIds);
  }
  await lockGameRows(tx, ids);
}

/**
 * 잠근 뒤 다시 읽은 대상이 처음 잠근 집합 안에 있는지 본다. 그 사이 다른 트랜잭션이 경기를 끼워
 * 넣었으면 그 행을 지금 잡을 수 없으므로(순서가 깨진다) 던진다 — 워커가 이벤트를 다시 시도한다.
 */
function requireLockedGames(locked: ReadonlySet<string>, gameIds: readonly string[]): void {
  const missing = [...new Set(gameIds)].filter((gameId) => !locked.has(gameId)).sort();
  if (missing.length === 0) return;
  throw new ConflictException({
    code: 'COMMAND_CONCURRENCY_CONFLICT',
    message: '경기 일정이 동시에 바뀌어 명단을 다시 계산하지 못했어요. 다시 시도해 주세요.',
    details: { gameIds: missing },
  });
}

/** 잠그기 전 조회: 대회·리그별 팀들의 시작 전 경기와 그 팀 사이드. */
async function findUpcomingTeamSides(
  tx: Tx,
  targets: ReadonlyArray<{ competitionId: string; teamId: string }>,
  now: Date,
): Promise<Array<{ gameId: string; sideId: string }>> {
  const found: Array<{ gameId: string; sideId: string }> = [];
  for (const target of targets) {
    const games = await tx.v1Game.findMany({
      where: upcomingCompetitionGameWhere(target.competitionId, target.teamId, now),
      select: { id: true, sides: { where: { teamId: target.teamId }, select: { id: true } } },
    });
    for (const game of games) found.push(...game.sides.map((side) => ({ gameId: game.id, sideId: side.id })));
  }
  return found;
}

/**
 * 대회·리그 경기 한 사이드의 명단을 계산 결과(`loadGameRoster`)에 맞춘다. 바뀌었으면 true.
 * `lockRosterWriteScope` 로 잠그므로 호출자는 아무 행도 쥐지 않았어야 한다 — 이미 잠갔으면
 * `syncPreparedGameSideRoster`.
 *
 * - 경기 행을 잠근 뒤 `SCHEDULED` 인 경기만. 참가자 행은 지우지 않고 새 리비전을 추가한다(골·카드 이벤트 FK).
 * - 새 리비전은 **SUBMITTED** 다. 공식 결과·신원 후보 셀렉터가 제출본을 우선 읽으므로
 *   DRAFT 로 얹으면 옛 제출본이 계속 기록이 된다.
 * - 리그의 팀장 저장본은 이관 전까지 덮지 않는다.
 */
export async function syncGameSideRoster(
  tx: Tx,
  target: { gameId: string; sideId: string },
): Promise<boolean> {
  await lockRosterWriteScope(tx, [target.gameId], [target.sideId]);
  return syncLockedGameSide(tx, target, {});
}

/** 호출자가 이 사이드를 `lockRosterWriteScope` 로 이미 잠갔다(조정 API·이관 CLI). */
export function syncPreparedGameSideRoster(tx: Tx, target: { gameId: string; sideId: string }): Promise<boolean> {
  return syncLockedGameSide(tx, target, {});
}

/** `syncGameSideRoster` 의 본체. 호출자가 `lockRosterWriteScope` 로 이 경기를 이미 잠갔다. */
async function syncLockedGameSide(
  tx: Tx,
  target: { gameId: string; sideId: string },
  preloaded: GameRosterPreload,
): Promise<boolean> {
  const context = await loadGameRosterContext(tx, target);
  if (context === null || context.gameState !== V1GameState.SCHEDULED) return false;
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
  const arrivals = carryArrivals(await loadShownArrivals(tx, context.gameId, context.sideId), desired);
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
    data: desired.map((row, index) => ({
      gameId: context.gameId,
      sideId: context.sideId,
      lineupId: lineup.id,
      userId: row.userId,
      displayNameSnapshot: row.displayNameSnapshot,
      jerseyNumber: row.jerseyNumber,
      // 명단 = 출전자(정본 §3). 출전 판정은 이 값을 읽는다.
      started: true,
      arrivedAt: arrivals[index],
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
 * 대회 경기는 콘솔의 시작 명령으로만 SCHEDULED 를 벗어나므로 시각이 지나도 시작 전이다(지연 경기, 끝난
 * 대회 제외). 리그는 결과 입력이 SCHEDULED 에서 바로 끝내 시각이 지난 경기는 이미 치렀을 수 있어 시각으로 끊는다.
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
        {
          OR: [
            { startAt: null },
            { startAt: { gt: now } },
            { leagueId: null, tournament: { status: { notIn: [V1TournamentStatus.completed, V1TournamentStatus.cancelled] } } },
          ],
        },
      ],
    },
    sides: { some: { teamId } },
  };
}

/**
 * 잠근 경기 안에서 한 팀의 그 대회·리그 시작 전 경기 명단을 다시 계산한다. 바뀐 사이드 수를 돌려준다.
 * 잠근 뒤 다시 읽으므로 그 사이 시작된 경기는 빠진다.
 */
async function syncLockedCompetitionTeam(
  tx: Tx,
  input: { competitionId: string; teamId: string },
  locked: ReadonlySet<string>,
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
  requireLockedGames(
    locked,
    games.map((game) => game.id),
  );
  const rosterScope = {
    competitionId: input.competitionId,
    isLeague: games[0].teamMatch?.leagueId != null,
    teamId: input.teamId,
  };
  const base = await loadCompetitionRosterBase(tx, rosterScope);
  // 확정 신청이 없는 대회 팀·비활성 리그 팀은 대진 생성과 같은 이유로 대상이 아니다.
  if (base === null) return 0;
  const orderedGames = await loadTeamCompetitionGameOrder(tx, rosterScope);

  let synced = 0;
  for (const game of games) {
    for (const side of game.sides) {
      if (await syncLockedGameSide(tx, { gameId: game.id, sideId: side.id }, { base, orderedGames })) synced += 1;
    }
  }
  return synced;
}

/**
 * 대회·리그별 팀들의 시작 전 경기를 `lockRosterWriteScope` 로 한 번에 잠근 뒤(트랜잭션의 첫 잠금) 각각 다시 계산한다.
 * 결장 기간은 시작 시각에, 출전정지는 팀 경기 순서에 걸리므로 경기 순서가 바뀌는 트리거도 이것을 탄다.
 */
async function syncCompetitionTeams(
  tx: Tx,
  targets: ReadonlyArray<{ competitionId: string; teamId: string }>,
): Promise<number> {
  const unique = [...new Map(targets.map((target) => [`${target.competitionId}:${target.teamId}`, target])).values()];
  const planned = await findUpcomingTeamSides(tx, unique, new Date());
  if (planned.length === 0) return 0;
  const plannedGameIds = planned.map((row) => row.gameId);
  await lockRosterWriteScope(
    tx,
    plannedGameIds,
    planned.map((row) => row.sideId),
  );
  const locked = new Set(plannedGameIds);
  let synced = 0;
  for (const target of unique) synced += await syncLockedCompetitionTeam(tx, target, locked);
  return synced;
}

/** 한 팀의 그 대회·리그 시작 전 경기 명단을 전부 다시 계산한다. 이 트랜잭션의 첫 잠금이어야 한다. */
export async function syncCompetitionTeamRosters(
  tx: Tx,
  input: { competitionId: string; teamId: string },
): Promise<number> {
  return syncCompetitionTeams(tx, [input]);
}

/**
 * 팀 멤버십이 바뀐 뒤(가입·추방·탈퇴·계정 비활성) 참가 명단 없이 팀 활성 멤버를 기준 명단으로 쓰는
 * 리그(폴백)의 시작 전 경기를 다시 계산한다. 참가 명단이 있는 대회·리그는 명단 정리 경로
 * (`tournaments/roster-cleanup.ts`)가 따로 이벤트를 남긴다.
 */
export async function syncTeamMemberFallbackRosters(tx: Tx, teamIds: readonly string[]): Promise<number> {
  const now = new Date();
  const targets: Array<{ competitionId: string; teamId: string }> = [];
  for (const teamId of new Set(teamIds)) {
    const games = await tx.v1Game.findMany({
      where: upcomingCompetitionGameWhere(null, teamId, now),
      select: { teamMatch: { select: { leagueId: true } } },
    });
    const leagueIds = new Set(
      games.map((game) => game.teamMatch?.leagueId ?? null).filter((id): id is string => id !== null),
    );
    if (leagueIds.size === 0) continue;
    const withRoster = await tx.v1TournamentRegistration.findMany({
      where: {
        tournamentId: { in: [...leagueIds] },
        teamId,
        status: 'confirmed',
        players: { some: { removedAt: null } },
      },
      select: { tournamentId: true },
    });
    const registered = new Set(withRoster.map((row) => row.tournamentId));
    for (const leagueId of leagueIds) {
      if (!registered.has(leagueId)) targets.push({ competitionId: leagueId, teamId });
    }
  }
  return syncCompetitionTeams(tx, targets);
}

/**
 * 결과가 명단을 바꿀 수 있는 경기면 그 대회·리그와 양 팀을 돌려준다. 결과는 출전정지를 통해서만 명단에
 * 닿으므로, 규정이 없는 대회·리그·친선은 null — 결과 핸들러가 후속 이벤트를 남길지도 이것으로 정한다.
 */
export async function resultRosterImpact(
  tx: Tx,
  gameId: string,
): Promise<{ competitionId: string; teamIds: string[] } | null> {
  const game = await tx.v1Game.findUnique({
    where: { id: gameId },
    select: {
      teamMatch: { select: { tournamentId: true, leagueId: true, hostTeamId: true, approvedApplicantTeamId: true } },
    },
  });
  const teamMatch = game?.teamMatch ?? null;
  const competitionId = teamMatch === null ? null : (teamMatch.leagueId ?? teamMatch.tournamentId);
  if (teamMatch === null || competitionId === null) return null;
  if (!suspensionRulesEnabled(await readSuspensionRules(tx, competitionId))) return null;
  const teamIds = [teamMatch.hostTeamId, teamMatch.approvedApplicantTeamId].filter((id): id is string => id !== null);
  return { competitionId, teamIds };
}

/** 결과 리비전이 제출·확정·무효가 된 경기의 양 팀 시작 전 경기를 다시 계산한다(출전정지 변동). */
export async function syncRostersAfterResultChange(tx: Tx, gameId: string): Promise<number> {
  const impact = await resultRosterImpact(tx, gameId);
  if (impact === null) return 0;
  return syncCompetitionTeams(
    tx,
    impact.teamIds.map((teamId) => ({ competitionId: impact.competitionId, teamId })),
  );
}

/**
 * 결장 기간 등록·취소 뒤 그 팀의 기간 안 시작 전 대회·리그 경기를 다시 계산한다.
 * 경기마다 대회·리그가 다를 수 있어 대회·리그 단위로 묶어 돈다.
 */
export async function syncTeamRostersWithinPeriod(
  tx: Tx,
  input: { teamId: string; startsAt: Date; endsAt: Date },
): Promise<number> {
  const games = await tx.v1Game.findMany({
    where: {
      AND: [
        upcomingCompetitionGameWhere(null, input.teamId, new Date()),
        { teamMatch: { startAt: { gte: input.startsAt, lt: input.endsAt } } },
      ],
    },
    select: { teamMatch: { select: { leagueId: true, tournamentId: true } } },
  });
  const competitionIds = new Set(
    games
      .map((game) => game.teamMatch?.leagueId ?? game.teamMatch?.tournamentId ?? null)
      .filter((id): id is string => id !== null),
  );
  return syncCompetitionTeams(
    tx,
    [...competitionIds].map((competitionId) => ({ competitionId, teamId: input.teamId })),
  );
}

/** 한 경기의 팀 배정된 사이드 전부(시각 필터 없음). 진출·대진 팀 변경 뒤의 새 팀 명단. */
async function syncGameRosters(tx: Tx, gameId: string): Promise<number> {
  await lockRosterWriteScope(tx, [gameId], null);
  const sides = await tx.v1GameSide.findMany({
    where: { gameId, teamId: { not: null } },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  let synced = 0;
  for (const side of sides) {
    if (await syncLockedGameSide(tx, { gameId, sideId: side.id }, {})) synced += 1;
  }
  return synced;
}

/**
 * `COMPETITION_ROSTER_RESYNC` 워커 핸들러. 같은 대상의 대기 이벤트를 닫고(한 번에 처리), 대상 경기를
 * `lockRosterWriteScope` 로 잠근 뒤 다시 계산한다. 그 사이 시작된 경기는 잠근 뒤 판정으로 건너뛴다.
 */
export async function handleCompetitionRosterResync(
  tx: Tx,
  event: { id: string; payload: unknown },
): Promise<number> {
  const target = parseRosterResyncTarget(event.payload);
  await completeQueuedDuplicates(tx, event);
  switch (target.scope) {
    case 'competitionTeam':
      return syncCompetitionTeamRosters(tx, target);
    case 'teamMembers':
      return syncTeamMemberFallbackRosters(tx, [target.teamId]);
    case 'teamPeriod':
      return syncTeamRostersWithinPeriod(tx, {
        teamId: target.teamId,
        startsAt: new Date(target.startsAt),
        endsAt: new Date(target.endsAt),
      });
    case 'game':
      return syncGameRosters(tx, target.gameId);
    case 'result':
      return syncRostersAfterResultChange(tx, target.gameId);
  }
}

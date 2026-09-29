import { Prisma, V1GameRosterAdjustmentAction, V1GameState, V1TeamMatchStatus } from '@prisma/client';
import { OperationAuditWriterService } from '../../common/audit/operation-audit-writer.service';
import { loadGameRosterContext, loadGameRosterForContext } from '../../games/roster/game-roster-loader';
import {
  isUnmigratedTeamAuthoredLineup,
  LEAGUE_ROSTER_MIGRATED_ACTION,
  leagueRosterMigrationRequestId,
  lockRosterWriteScope,
  syncPreparedGameSideRoster,
} from '../../games/roster/game-roster-sync';
import { competitionTeamTargets, enqueueRosterResync } from '../../games/roster/roster-resync-events';

type Tx = Prisma.TransactionClient;

/**
 * 리그 팀장 저장본(Task 179 이전 `/team-matches/:id/lineup` 으로 저장·제출한 리비전)을 경기 명단 조정으로 옮긴다.
 *
 * 기준 명단에 있는데 저장본에 없는 사람 → EXCLUDE(actor = 그 사이드를 저장한 팀장, reason 없음). 조정으로 표현할 수
 * 없는 저장본 행(게스트·기준 명단 밖 계정)은 세기만 한다. 옮긴 사이드에는 이관 표시 감사 행을 남기고 곧바로
 * 동기화한다 — 그 뒤로 그 사이드는 참가 명단 계산을 따른다. 동기화와 같은 "시작 전"(SCHEDULED + 킥오프 전)만 다룬다.
 *
 * 저장본 등번호는 경기 명단이 참가 명단 번호를 따르므로, 참가 명단 번호가 비어 있고 팀 안에서 안 겹칠 때만 참가 명단에
 * 옮겨 적는다(있는 번호는 덮지 않는다).
 */

export interface SavedLineupRow {
  readonly userId: string | null;
  readonly jerseyNumber: number | null;
}

export interface LeagueSideMigrationPlan {
  readonly excludeUserIds: string[];
  readonly unrepresentableRows: number;
  /** 저장본 번호를 옮겨 적을 참가 명단 행(`V1TournamentPlayer.id`). */
  readonly jerseyCopies: ReadonlyArray<{ readonly playerId: string; readonly userId: string; readonly jerseyNumber: number }>;
  /** 옮겨 적지 못해(참가 명단에 다른 번호가 있거나 팀 안에서 겹침) 경기 명단 번호가 저장본과 달라지는 행. */
  readonly jerseyChangedRows: number;
}

export function planLeagueSideMigration(input: {
  readonly base: ReadonlyArray<{
    readonly userId: string;
    readonly jerseyNumber: number | null;
    readonly sourceParticipantId: string;
  }>;
  /** 기준 명단이 참가 명단 행인가(팀원 폴백이면 번호를 적을 행이 없다). */
  readonly baseIsRegistration: boolean;
  readonly saved: readonly SavedLineupRow[];
  readonly activeExcludedUserIds: ReadonlySet<string>;
}): LeagueSideMigrationPlan {
  const byUser = new Map(input.base.map((entry) => [entry.userId, entry]));
  const saved = new Set(input.saved.flatMap((row) => (row.userId === null ? [] : [row.userId])));
  const excludeUserIds = [...byUser.keys()].filter(
    (userId) => !saved.has(userId) && !input.activeExcludedUserIds.has(userId),
  );
  const unrepresentableRows = input.saved.filter((row) => row.userId === null || !byUser.has(row.userId)).length;

  const taken = new Set(input.base.flatMap((entry) => (entry.jerseyNumber === null ? [] : [entry.jerseyNumber])));
  const assigned = new Map<string, number>();
  const jerseyCopies: Array<{ playerId: string; userId: string; jerseyNumber: number }> = [];
  let jerseyChangedRows = 0;
  for (const row of input.saved) {
    const entry = row.userId === null ? undefined : byUser.get(row.userId);
    if (entry === undefined || row.jerseyNumber === null) continue;
    const current = assigned.get(entry.userId) ?? entry.jerseyNumber;
    if (row.jerseyNumber === current) continue;
    if (input.baseIsRegistration && current === null && !taken.has(row.jerseyNumber)) {
      taken.add(row.jerseyNumber);
      assigned.set(entry.userId, row.jerseyNumber);
      jerseyCopies.push({ playerId: entry.sourceParticipantId, userId: entry.userId, jerseyNumber: row.jerseyNumber });
    } else {
      jerseyChangedRows += 1;
    }
  }
  return { excludeUserIds, unrepresentableRows, jerseyCopies, jerseyChangedRows };
}

export interface LineupSaveRecord {
  readonly actorUserId: string;
  readonly responseBody: unknown;
  readonly createdAt: Date;
}

/**
 * 그 사이드의 현재 저장본을 만든 팀장. 라인업 행에는 작성자 칸이 없어 저장 요청의 멱등 기록
 * (`TEAM_MATCH_LINEUP`/`save`, 응답에 sideId·revision)으로 찾는다. 정정 요청 복사 리비전은 상대팀이
 * 만든 것이라 `save` 만 보고, 현재 리비전 이하에서 가장 최근 것을 고른다.
 */
export function resolveLineupSaver(records: readonly LineupSaveRecord[], sideId: string, maxRevision: number): string | null {
  let best: { actorUserId: string; revision: number; createdAt: Date } | null = null;
  for (const record of records) {
    const body = record.responseBody;
    if (typeof body !== 'object' || body === null) continue;
    const { sideId: savedSideId, revision } = body as { sideId?: unknown; revision?: unknown };
    if (savedSideId !== sideId || typeof revision !== 'number' || revision > maxRevision) continue;
    if (
      best === null ||
      revision > best.revision ||
      (revision === best.revision && record.createdAt.getTime() > best.createdAt.getTime())
    ) {
      best = { actorUserId: record.actorUserId, revision, createdAt: record.createdAt };
    }
  }
  return best?.actorUserId ?? null;
}

export type LeagueSideMigrationStatus =
  | 'MIGRATED'
  | 'WOULD_MIGRATE'
  | 'ACTOR_UNRESOLVED'
  | 'ROSTER_NOT_AVAILABLE'
  /** 팀장 저장본이지만 킥오프가 지나 옮기지 않았다(치렀는데 결과 입력 전일 수 있다). */
  | 'KICKOFF_PASSED';

/**
 * 동기화(`upcomingCompetitionGameWhere`)의 리그 기준과 같다 — 결과 입력이 SCHEDULED 에서 바로 끝내므로
 * 킥오프가 지난 SCHEDULED 리그 경기는 이미 치렀을 수 있다. 시각 없는 경기는 시작 전이다.
 */
export function leagueKickoffPassed(startAt: Date | null, now: Date): boolean {
  return startAt !== null && startAt.getTime() <= now.getTime();
}

export interface LeagueSideMigrationReport {
  readonly gameId: string;
  readonly sideId: string;
  readonly teamMatchId: string;
  readonly status: LeagueSideMigrationStatus;
  readonly excludeCount: number;
  readonly unrepresentableRows: number;
  /** 참가 명단에 실제로 옮겨 적은 저장본 번호 수(dry-run 은 적었다가 되돌린 수). */
  readonly jerseyCopiedRows: number;
  readonly jerseyChangedRows: number;
  /** 옮긴 뒤 동기화가 새 명단 리비전을 만들었는가(저장본의 게스트·등번호 차이 등). */
  readonly rosterChanged: boolean;
}

export interface LeagueRosterMigrationResult {
  readonly dryRun: boolean;
  readonly sidesScanned: number;
  readonly teamAuthoredSides: number;
  readonly migratedSides: number;
  readonly excludeCount: number;
  readonly unrepresentableRows: number;
  readonly jerseyCopiedRows: number;
  readonly jerseyChangedRows: number;
  readonly actorUnresolvedSides: number;
  readonly rosterNotAvailableSides: number;
  /** 팀장 저장본이 최신인데 킥오프가 지나 옮기지 않은 사이드 수. */
  readonly kickoffPassedSides: number;
  readonly sides: LeagueSideMigrationReport[];
}

const MIGRATION_SYSTEM_ACTOR = 'LEAGUE_ROSTER_ADJUSTMENT_MIGRATION';

/**
 * dry-run 은 적용 경로를 끝까지 태운 뒤 이 오류로 트랜잭션을 되돌린다 — 보고가 실제 적용과 같은 계산이 된다.
 * 옮기지 않는 사이드도 되돌린다: 리그 기준 명단 조회가 빈 참가 명단을 그 자리에서 채우기 때문이다.
 */
class DryRunRollback extends Error {
  constructor(readonly report: LeagueSideMigrationReport | null) {
    super('dry-run rollback');
  }
}

function sideReport(
  side: { gameId: string; sideId: string; teamMatchId: string },
  status: LeagueSideMigrationStatus,
  plan: LeagueSideMigrationPlan | null,
  rosterChanged: boolean,
  jerseyCopiedRows = 0,
): LeagueSideMigrationReport {
  return {
    ...side,
    status,
    excludeCount: plan?.excludeUserIds.length ?? 0,
    unrepresentableRows: plan?.unrepresentableRows ?? 0,
    jerseyCopiedRows,
    jerseyChangedRows: plan?.jerseyChangedRows ?? 0,
    rosterChanged,
  };
}

/** 그 사이드의 최신 리비전이 이관 전 팀장 저장본이면 그 리비전. */
async function unmigratedTeamLineup(tx: Tx, target: { gameId: string; sideId: string }) {
  const latest = await tx.v1GameLineup.findFirst({
    where: { ...target, invalidatedAt: null },
    orderBy: { revision: 'desc' },
  });
  if (latest === null || !(await isUnmigratedTeamAuthoredLineup(tx, target.gameId, target.sideId, latest))) return null;
  return latest;
}

/**
 * `copiedJerseys` 는 이번 실행에서 앞 사이드가 참가 명단에 옮겨 적은 번호다. dry-run 은 사이드마다 되돌리므로 DB 만 보면
 * 뒤 사이드가 같은 선수에게 다른 번호를 또 적는 것으로 보고한다. 키는 리그·팀·선수 — 되돌려진 빈 명단 채우기가 사이드마다
 * 다시 돌아 참가 명단 행 id 가 바뀐다.
 */
async function migrateSide(
  tx: Tx,
  side: { gameId: string; sideId: string; teamMatchId: string },
  outcome: 'MIGRATED' | 'WOULD_MIGRATE',
  copiedJerseys: Map<string, number>,
): Promise<LeagueSideMigrationReport | null> {
  const target = { gameId: side.gameId, sideId: side.sideId };
  // 잠금(빈 리그 명단 채우기 포함)은 옮길 사이드에만 건다. 잠근 뒤 다시 보고 그 사이 시작된 경기는 건너뛴다.
  if ((await unmigratedTeamLineup(tx, target)) === null) return null;
  // 킥오프가 지난 경기는 잠그기 전(채우기 쓰기 전)에 거르고, 승인 판단용으로 세기만 한다.
  const beforeLock = await loadGameRosterContext(tx, target);
  if (beforeLock !== null && leagueKickoffPassed(beforeLock.startAt, new Date())) {
    return sideReport(side, 'KICKOFF_PASSED', null, false);
  }
  await lockRosterWriteScope(tx, [side.gameId], [side.sideId]);
  const context = await loadGameRosterContext(tx, target);
  if (context !== null && context.gameState !== V1GameState.SCHEDULED) return null;
  const latest = await unmigratedTeamLineup(tx, target);
  if (latest === null) return null;

  const report = (
    status: LeagueSideMigrationStatus,
    plan: LeagueSideMigrationPlan | null,
    rosterChanged = false,
    jerseyCopiedRows = 0,
  ) => sideReport(side, status, plan, rosterChanged, jerseyCopiedRows);
  const loaded = context === null ? null : await loadGameRosterForContext(tx, context);
  if (loaded === null) return report('ROSTER_NOT_AVAILABLE', null);

  const saved = await tx.v1GameParticipant.findMany({
    where: { lineupId: latest.id },
    select: { userId: true, jerseyNumber: true },
  });
  const active = await tx.v1GameRosterAdjustment.findMany({
    where: { ...target, teamId: loaded.context.teamId, revokedAt: null },
    select: { userId: true },
  });
  const copyKey = (userId: string) => `${loaded.context.competitionId}:${loaded.context.teamId}:${userId}`;
  const plan = planLeagueSideMigration({
    base: loaded.base.map((entry) => ({
      ...entry,
      jerseyNumber: copiedJerseys.get(copyKey(entry.userId)) ?? entry.jerseyNumber,
    })),
    baseIsRegistration: loaded.baseSource === 'REGISTRATION',
    saved,
    activeExcludedUserIds: new Set(active.map((row) => row.userId)),
  });

  let saverUserId: string | null = null;
  if (plan.excludeUserIds.length > 0) {
    const records = await tx.v1IdempotencyRecord.findMany({
      where: { action: 'save', resourceType: 'TEAM_MATCH_LINEUP', resourceId: side.teamMatchId },
      select: { actorUserId: true, responseBody: true, createdAt: true },
    });
    saverUserId = resolveLineupSaver(records, side.sideId, latest.revision);
    if (saverUserId === null) return report('ACTOR_UNRESOLVED', plan);
  }

  if (saverUserId !== null) {
    await tx.v1GameRosterAdjustment.createMany({
      data: plan.excludeUserIds.map((userId) => ({
        ...target,
        teamId: loaded.context.teamId,
        userId,
        action: V1GameRosterAdjustmentAction.EXCLUDE,
        reason: null,
        actorUserId: saverUserId,
        actorRole: 'TEAM_MANAGER',
      })),
    });
  }
  let jerseyCopiedRows = 0;
  for (const copy of plan.jerseyCopies) {
    const { count } = await tx.v1TournamentPlayer.updateMany({
      where: { id: copy.playerId, removedAt: null, jerseyNumber: null },
      data: { jerseyNumber: copy.jerseyNumber },
    });
    jerseyCopiedRows += count;
    if (count > 0) copiedJerseys.set(copyKey(copy.userId), copy.jerseyNumber);
  }
  // 참가 명단 번호는 그 팀의 다른 시작 전 경기 명단에도 찍힌다 — 참가 명단 번호 수정과 같은 후속 이벤트.
  if (jerseyCopiedRows > 0) {
    await enqueueRosterResync(tx, competitionTeamTargets(loaded.context.competitionId, [loaded.context.teamId]));
  }
  await new OperationAuditWriterService().create(tx, {
    actor: { type: 'SYSTEM', id: MIGRATION_SYSTEM_ACTOR },
    requestId: leagueRosterMigrationRequestId(side.gameId, side.sideId),
    action: LEAGUE_ROSTER_MIGRATED_ACTION,
    targetType: 'GAME',
    targetId: side.gameId,
    // 동기화 감사와 같은 규칙 — tournamentId 없는 옛 리그 경기에 리그 id 를 짝지으면 복합 FK 위반이다.
    tournamentId: loaded.context.tournamentId ?? loaded.context.leagueId,
    teamMatchId: loaded.context.tournamentId === null ? null : side.teamMatchId,
    occurredAt: new Date(),
    before: { lineupId: latest.id },
    after: {
      sideId: side.sideId,
      excludeCount: plan.excludeUserIds.length,
      unrepresentableRows: plan.unrepresentableRows,
      jerseyCopiedRows,
      jerseyChangedRows: plan.jerseyChangedRows,
    },
  });
  const rosterChanged = await syncPreparedGameSideRoster(tx, target);
  return report(outcome, plan, rosterChanged, jerseyCopiedRows);
}

/** 시작 전 리그 경기의 팀장 저장본을 조정으로 옮긴다. `apply` 가 false(기본)면 아무것도 쓰지 않는다. */
export async function migrateLeagueRosterAdjustments(
  prisma: { $transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> } & Pick<Tx, 'v1GameSide'>,
  options: { apply?: boolean } = {},
): Promise<LeagueRosterMigrationResult> {
  const apply = options.apply === true;
  const sides = await prisma.v1GameSide.findMany({
    where: {
      teamId: { not: null },
      game: {
        state: V1GameState.SCHEDULED,
        teamMatch: { leagueId: { not: null }, deletedAt: null, status: { not: V1TeamMatchStatus.cancelled } },
      },
    },
    select: { id: true, gameId: true, game: { select: { teamMatchId: true } } },
    // 킥오프 순 — 같은 선수의 저장본 번호가 경기마다 다르면 가장 이른 경기 번호가 참가 명단에 남는다.
    orderBy: [{ game: { teamMatch: { startAt: 'asc' } } }, { gameId: 'asc' }, { sideKey: 'asc' }],
  });

  const reports: LeagueSideMigrationReport[] = [];
  const copiedJerseys = new Map<string, number>();
  for (const side of sides) {
    if (side.game.teamMatchId === null) continue;
    const input = { gameId: side.gameId, sideId: side.id, teamMatchId: side.game.teamMatchId };
    try {
      const report = await prisma.$transaction(async (tx) => {
        const result = await migrateSide(tx, input, apply ? 'MIGRATED' : 'WOULD_MIGRATE', copiedJerseys);
        if (!apply) throw new DryRunRollback(result);
        return result;
      });
      if (report !== null) reports.push(report);
    } catch (error) {
      if (!(error instanceof DryRunRollback)) throw error;
      if (error.report !== null) reports.push(error.report);
    }
  }

  const moved = reports.filter((row) => row.status === 'MIGRATED' || row.status === 'WOULD_MIGRATE');
  return {
    dryRun: !apply,
    sidesScanned: sides.length,
    teamAuthoredSides: reports.length,
    migratedSides: moved.length,
    excludeCount: moved.reduce((sum, row) => sum + row.excludeCount, 0),
    unrepresentableRows: reports.reduce((sum, row) => sum + row.unrepresentableRows, 0),
    jerseyCopiedRows: moved.reduce((sum, row) => sum + row.jerseyCopiedRows, 0),
    jerseyChangedRows: moved.reduce((sum, row) => sum + row.jerseyChangedRows, 0),
    actorUnresolvedSides: reports.filter((row) => row.status === 'ACTOR_UNRESOLVED').length,
    rosterNotAvailableSides: reports.filter((row) => row.status === 'ROSTER_NOT_AVAILABLE').length,
    kickoffPassedSides: reports.filter((row) => row.status === 'KICKOFF_PASSED').length,
    sides: reports,
  };
}

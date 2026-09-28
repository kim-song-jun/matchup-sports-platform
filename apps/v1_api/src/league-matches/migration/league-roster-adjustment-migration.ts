import { Prisma, V1GameRosterAdjustmentAction, V1GameState, V1TeamMatchStatus } from '@prisma/client';
import { OperationAuditWriterService } from '../../common/audit/operation-audit-writer.service';
import { loadGameRoster } from '../../games/roster/game-roster-loader';
import {
  isUnmigratedTeamAuthoredLineup,
  LEAGUE_ROSTER_MIGRATED_ACTION,
  leagueRosterMigrationRequestId,
  syncGameSideRoster,
} from '../../games/roster/game-roster-sync';

type Tx = Prisma.TransactionClient;

/**
 * 리그 팀장 저장본(Task 176 이전 `/team-matches/:id/lineup` 으로 저장·제출한 리비전)을 경기 명단 조정으로 옮긴다.
 *
 * 기준 명단에 있는데 저장본에 없는 사람 → EXCLUDE(actor = 그 사이드를 저장한 팀장, reason 없음). 조정으로 표현할 수
 * 없는 저장본 행(게스트·기준 명단 밖 계정)은 세기만 한다. 옮긴 사이드에는 이관 표시 감사 행을 남기고 곧바로
 * 동기화한다 — 그 뒤로 그 사이드는 참가 명단 계산을 따른다. 시작 전(SCHEDULED) 경기만 다룬다.
 */

export interface SavedLineupRow {
  readonly userId: string | null;
}

export interface LeagueSideMigrationPlan {
  readonly excludeUserIds: string[];
  readonly unrepresentableRows: number;
}

export function planLeagueSideMigration(input: {
  readonly baseUserIds: readonly string[];
  readonly saved: readonly SavedLineupRow[];
  readonly activeExcludedUserIds: ReadonlySet<string>;
}): LeagueSideMigrationPlan {
  const base = new Set(input.baseUserIds);
  const saved = new Set(input.saved.flatMap((row) => (row.userId === null ? [] : [row.userId])));
  const excludeUserIds = [...base].filter((userId) => !saved.has(userId) && !input.activeExcludedUserIds.has(userId));
  const unrepresentableRows = input.saved.filter((row) => row.userId === null || !base.has(row.userId)).length;
  return { excludeUserIds, unrepresentableRows };
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

export type LeagueSideMigrationStatus = 'MIGRATED' | 'WOULD_MIGRATE' | 'ACTOR_UNRESOLVED' | 'ROSTER_NOT_AVAILABLE';

export interface LeagueSideMigrationReport {
  readonly gameId: string;
  readonly sideId: string;
  readonly teamMatchId: string;
  readonly status: LeagueSideMigrationStatus;
  readonly excludeCount: number;
  readonly unrepresentableRows: number;
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
  readonly actorUnresolvedSides: number;
  readonly rosterNotAvailableSides: number;
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

async function migrateSide(
  tx: Tx,
  side: { gameId: string; sideId: string; teamMatchId: string },
  outcome: 'MIGRATED' | 'WOULD_MIGRATE',
): Promise<LeagueSideMigrationReport | null> {
  const target = { gameId: side.gameId, sideId: side.sideId };
  const latest = await tx.v1GameLineup.findFirst({
    where: { ...target, invalidatedAt: null },
    orderBy: { revision: 'desc' },
  });
  if (latest === null || !(await isUnmigratedTeamAuthoredLineup(tx, side.gameId, side.sideId, latest))) return null;

  const report = (status: LeagueSideMigrationStatus, plan: LeagueSideMigrationPlan | null, rosterChanged = false) => ({
    ...side,
    status,
    excludeCount: plan?.excludeUserIds.length ?? 0,
    unrepresentableRows: plan?.unrepresentableRows ?? 0,
    rosterChanged,
  });
  const loaded = await loadGameRoster(tx, target);
  if (loaded === null) return report('ROSTER_NOT_AVAILABLE', null);

  const saved = await tx.v1GameParticipant.findMany({ where: { lineupId: latest.id }, select: { userId: true } });
  const active = await tx.v1GameRosterAdjustment.findMany({
    where: { ...target, revokedAt: null },
    select: { userId: true },
  });
  const plan = planLeagueSideMigration({
    baseUserIds: loaded.base.map((entry) => entry.userId),
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
        userId,
        action: V1GameRosterAdjustmentAction.EXCLUDE,
        reason: null,
        actorUserId: saverUserId,
        actorRole: 'TEAM_MANAGER',
      })),
    });
  }
  const { context } = loaded;
  await new OperationAuditWriterService().create(tx, {
    actor: { type: 'SYSTEM', id: MIGRATION_SYSTEM_ACTOR },
    requestId: leagueRosterMigrationRequestId(side.gameId, side.sideId),
    action: LEAGUE_ROSTER_MIGRATED_ACTION,
    targetType: 'GAME',
    targetId: side.gameId,
    // 동기화 감사와 같은 규칙 — tournamentId 없는 옛 리그 경기에 리그 id 를 짝지으면 복합 FK 위반이다.
    tournamentId: context.tournamentId ?? context.leagueId,
    teamMatchId: context.tournamentId === null ? null : side.teamMatchId,
    occurredAt: new Date(),
    before: { lineupId: latest.id },
    after: { sideId: side.sideId, excludeCount: plan.excludeUserIds.length, unrepresentableRows: plan.unrepresentableRows },
  });
  const rosterChanged = await syncGameSideRoster(tx, target);
  return report(outcome, plan, rosterChanged);
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
    orderBy: [{ gameId: 'asc' }, { sideKey: 'asc' }],
  });

  const reports: LeagueSideMigrationReport[] = [];
  for (const side of sides) {
    if (side.game.teamMatchId === null) continue;
    const input = { gameId: side.gameId, sideId: side.id, teamMatchId: side.game.teamMatchId };
    try {
      const report = await prisma.$transaction(async (tx) => {
        const result = await migrateSide(tx, input, apply ? 'MIGRATED' : 'WOULD_MIGRATE');
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
    actorUnresolvedSides: reports.filter((row) => row.status === 'ACTOR_UNRESOLVED').length,
    rosterNotAvailableSides: reports.filter((row) => row.status === 'ROSTER_NOT_AVAILABLE').length,
    sides: reports,
  };
}

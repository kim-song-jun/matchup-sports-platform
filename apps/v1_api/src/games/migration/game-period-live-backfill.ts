import { Prisma, type PrismaClient } from '@prisma/client';

export type GamePeriodLiveBackfillResult = {
  /** Number of V1GamePeriod rows this run flipped to LIVE. Always 0 for a dry run. */
  updatedPeriods: number;
};

/**
 * D-21 (T1-0 blocker B7): one-time repair for games that were already
 * V1Game.state='LIVE' OR 'PAUSED' before the T1-0 deploy. Before T1-0's fix
 * to executeCommand, NEITHER `start` NOR `pause` ever touched V1GamePeriod
 * -- only V1Game.state was flipped -- so any game that reached LIVE, or
 * LIVE-then-PAUSED, under the old code still has every period SCHEDULED.
 * Once T1-0's PERIOD_NOT_STARTED gate ships, those games could never
 * receive another event again without this backfill: a PAUSED game left
 * this way stays permanently stuck even after `resume`, because `resume`
 * (by design, both before and after T1-0) never touches V1GamePeriod either
 * -- only `start` does.
 *
 * Which period to open: before T1-0's frontend fix, the operate console's
 * `currentPeriod` picked "the highest period number" whenever no period was
 * ever LIVE (see operate-console.tsx's pre-T1-0 fallback) -- for a
 * 2-period sport that means every event captured pre-deploy was recorded at
 * period=2, never period=1. Opening a hardcoded period 1 would pass the new
 * PERIOD_NOT_STARTED gate but collide with the PRE-EXISTING (not touched by
 * T1-0) EVENT_LATE guard in `assertEventReferences` (games.service.ts),
 * which rejects any event whose `period` is less than the max period
 * already recorded for that game: the exact game this backfill exists to
 * rescue would stay unrescuable. Opening MAX(recorded period for that game,
 * defaulting to 1 when the game has no events yet) instead keeps
 * continuity with whatever was already captured.
 *
 * Idempotent by construction: the NOT EXISTS clause excludes any game that
 * already has at least one non-SCHEDULED period -- which includes games
 * this backfill already ran against (their target period is now LIVE) and
 * games that started normally through the old OR new code path. Re-running
 * this against an already-repaired (or never-affected) database is a no-op.
 *
 * Fix round 4: this used to be a migration.sql UPDATE statement
 * (prisma/migrations/20260807000000_v1_period_live_backfill), but
 * deploy-alpha.yml's expand-contract gate
 * (scripts/qa/check-expand-contract-migrations.mjs) rejects any non-additive
 * SQL statement in a migration file -- an UPDATE can never satisfy
 * isAdditiveStatement(), so that migration would permanently block every
 * alpha deploy once it landed on dev. Moved here, following the same split
 * Task 10 already established (game-result-backfill.ts/.cli.ts): schema
 * migrations in prisma/migrations/ stay additive-only, and one-time DATA
 * repairs run as a post-deploy CLI instead (see
 * game-period-live-backfill.cli.ts). The SQL logic itself is byte-for-byte
 * what the removed migration ran -- only where it executes from changed.
 *
 * The join/filter predicate is defined once and shared between the dry-run
 * COUNT and the real UPDATE so the two can never silently drift apart --
 * Postgres's `UPDATE p ... FROM g WHERE <predicate>` and a comma-join
 * `SELECT ... FROM p, g WHERE <predicate>` accept exactly the same
 * predicate shape.
 */
function matchPredicate(): Prisma.Sql {
  return Prisma.sql`
    "p"."game_id" = "g"."id"
    AND "g"."state" IN ('LIVE', 'PAUSED')
    AND "p"."number" = COALESCE(
      (SELECT MAX("e"."period") FROM "v1_game_events" AS "e" WHERE "e"."game_id" = "g"."id"),
      1
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "v1_game_periods" AS "p2"
      WHERE "p2"."game_id" = "g"."id"
        AND "p2"."state" <> 'SCHEDULED'
    )
  `;
}

export async function runGamePeriodLiveBackfill(
  prisma: PrismaClient,
  options: { dryRun: boolean },
): Promise<GamePeriodLiveBackfillResult> {
  if (options.dryRun) {
    const candidates = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS "count"
      FROM "v1_game_periods" AS "p", "v1_games" AS "g"
      WHERE ${matchPredicate()}
    `;
    return { updatedPeriods: Number(candidates[0]?.count ?? 0n) };
  }
  const updatedPeriods = await prisma.$executeRaw`
    UPDATE "v1_game_periods" AS "p"
    SET "state" = 'LIVE', "started_at" = now()
    FROM "v1_games" AS "g"
    WHERE ${matchPredicate()}
  `;
  return { updatedPeriods };
}

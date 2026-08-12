import type { V1GamePeriodState } from '@prisma/client';

/**
 * Lane 1 (관전자 라이브 스코어), 2026-08 -- exposes "경과 시간/피리어드" to the
 * public schedule/match views (the second half of the "score, elapsed time or
 * period, and a live indicator" minimum the spectator page was missing).
 *
 * `computeElapsedMs` deliberately mirrors the operations console's own twin,
 * `elapsedMatchMs` in `apps/v1_web/src/lib/game-operations-clock.ts` (see that
 * file's doc comment) -- same pause-aware fold, same "anchor to `pausedAtMs`
 * while paused rather than subtracting a live span from `now`" reasoning.
 * There is no shared package between `apps/v1_api` and `apps/v1_web` in this
 * monorepo (`pnpm-workspace.yaml` only globs `apps/*`), so the two runtimes
 * cannot literally share one module; this keeps the algorithm identical by
 * inspection instead. Never reads `Date.now()` internally -- `nowMs` is
 * always passed in, so this stays fully unit-testable without a clock mock.
 */
export function computeElapsedMs(input: {
  readonly nowMs: number;
  readonly periodStartedAtMs: number;
  readonly pausedTotalMs: number;
  readonly pausedAtMs: number | null;
}): number {
  const effectiveNowMs =
    input.pausedAtMs === null ? input.nowMs : Math.min(input.nowMs, input.pausedAtMs);
  const raw = effectiveNowMs - input.periodStartedAtMs - input.pausedTotalMs;
  return Math.max(0, raw);
}

export interface PublicGameClock {
  readonly periodNumber: number;
  readonly elapsedMs: number;
  readonly isPaused: boolean;
}

export interface GamePeriodClockRow {
  readonly number: number;
  readonly state: V1GamePeriodState;
  readonly startedAt: Date | null;
  readonly pausedTotalMs: number;
  readonly pausedAt: Date | null;
}

/**
 * Resolves the spectator-facing clock for whichever period is currently
 * `LIVE`. Returns `null` when no period is live right now -- before kickoff,
 * during a between-periods break the operator has not started the next
 * period for yet, or after the game has ended -- rather than guessing from a
 * stale period's frozen time. A `LIVE` row with `startedAt === null` (should
 * never happen once `start`/`start-period` (or the deprecated fused
 * `next-period`) have run, but this read side must
 * not crash on a write-side invariant it cannot itself enforce) also
 * resolves to `null`.
 */
export function resolveLiveClock(
  periods: readonly GamePeriodClockRow[],
  now: Date,
): PublicGameClock | null {
  const live = periods.find((period) => period.state === 'LIVE');
  if (live === undefined || live.startedAt === null) return null;
  const elapsedMs = computeElapsedMs({
    nowMs: now.getTime(),
    periodStartedAtMs: live.startedAt.getTime(),
    pausedTotalMs: live.pausedTotalMs,
    pausedAtMs: live.pausedAt?.getTime() ?? null,
  });
  return { periodNumber: live.number, elapsedMs, isPaused: live.pausedAt !== null };
}

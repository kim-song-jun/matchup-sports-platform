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

export type PublicPeriodBreak = 'halftime' | 'regulation_ended';

/**
 * `resolveLiveClock`이 `null`을 반환했을 때(=지금 LIVE인 피리어드가 없음) 그 이유가
 * 하프타임인지 정규 시간 종료(결과 확정/승부차기 대기)인지 구분한다. 운영 콘솔의
 * `halftimePeriod`/`regulationEnded` 파생 로직(`operate-console.tsx`, 이슈 #375 /
 * 종료 흐름 개편)과 정확히 같은 판정이다 -- 같은 V1GamePeriod 행을 보고 두 화면이
 * 다른 결론을 내면 안 되므로 로직을 그대로 미러링한다(공유 패키지가 없다는 제약은
 * `computeElapsedMs`의 문서 주석과 동일, apps/v1_api와 apps/v1_web은 별도 런타임).
 *
 * `periods`가 비었거나(게임 미생성) 전부 SCHEDULED(킥오프 전, `start` 커맨드가 게임과
 * 피리어드 1을 같은 트랜잭션에서 LIVE로 묶어 전이시키므로 이 상태에서 LIVE 피리어드가
 * "아직 없다"가 legit하게 존재하는 유일한 경우다 -- games.service.ts의 executeCommand
 * 'start' 분기 참고)이면 `null`을 반환한다 -- `resolveLiveClock`이 그 경우 클록을 알아서
 * `null`로 돌려주는 것과 대칭이다. 호출부는 `clock`과 동일한 조건(`mode==='live' &&
 * !showOfficialResult`)으로만 이 함수를 부르므로 status_only/공식결과확정 이후에는
 * 애초에 호출되지 않는다.
 */
export function resolvePeriodBreak(periods: readonly GamePeriodClockRow[]): PublicPeriodBreak | null {
  if (periods.length === 0) return null;
  if (periods.some((period) => period.state === 'LIVE')) return null;
  if (periods.some((period) => period.state === 'HALFTIME')) return 'halftime';
  if (periods.every((period) => period.state === 'ENDED')) return 'regulation_ended';
  return null;
}

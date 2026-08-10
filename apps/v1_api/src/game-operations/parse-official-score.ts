import { Prisma } from '@prisma/client';
import type { OfficialScore } from './game-result-official-projection.types';

/**
 * Extracted from `GameResultOfficialProjectionService` (outbox-handler +
 * team-record-facts backfill task) so the exact same validation runs for
 * both the live worker path and `team-record-facts-backfill.ts` — a
 * revision whose `score` JSON doesn't parse must be treated identically
 * (thrown, quarantined by the caller) wherever it's read, not re-validated
 * with a second, potentially-drifted implementation.
 *
 * Two producer shapes for `V1GameResultRevision.score` legitimately coexist
 * (see migration `20260810130000_v1_official_fact_backfill_score_shape`'s
 * file doc, which widened `v1_guard_game_official_fact_insert()` to accept
 * both):
 *   1. Flat `{ home, away, penalties? }` — every LIVE OFFICIAL producer
 *      (`GamesService.deriveTournamentRevision`, `TournamentResultReviewService`).
 *   2. Nested `{ regulation: { home, away } | null, penalty, goals,
 *      incomplete, provenance }` — `game-result-backfill.ts`'s
 *      `createImportedGame()`.
 * This mirrors that trigger's `COALESCE(score->'home', score->'regulation'->'home')`
 * exactly: the flat top-level key wins when present, falling back to the
 * nested `regulation` key only when the flat one is absent. Without this
 * fallback, `team-record-facts-backfill.ts` throws (and quarantines as
 * `CORRUPT_SCORE`) on every revision `createImportedGame()` ever wrote,
 * even though the DB trigger has accepted that exact shape since the
 * migration above.
 */
export function parseOfficialScore(score: Prisma.JsonValue): OfficialScore {
  if (typeof score !== 'object' || score === null || Array.isArray(score)) {
    throw new Error('OFFICIAL revision requires non-negative integer home and away scores');
  }
  const record = score as Record<string, Prisma.JsonValue | undefined>;
  const regulation = record.regulation;
  const nestedRegulation =
    typeof regulation === 'object' && regulation !== null && !Array.isArray(regulation)
      ? (regulation as Record<string, Prisma.JsonValue | undefined>)
      : undefined;
  const home = record.home ?? nestedRegulation?.home;
  const away = record.away ?? nestedRegulation?.away;
  if (
    typeof home !== 'number' ||
    !Number.isInteger(home) ||
    home < 0 ||
    typeof away !== 'number' ||
    !Number.isInteger(away) ||
    away < 0
  ) {
    throw new Error('OFFICIAL revision requires non-negative integer home and away scores');
  }
  const penalties = parseOfficialPenalties(record.penalties);
  return { home, away, ...(penalties === undefined ? {} : { penalties }) };
}

/**
 * `V1GameResultRevision.score.penalties` is only ever written by the flat
 * producer shape (`{home,away,penalties?}` — see `OfficialScore`'s doc).
 * Absent is the ordinary case (no shootout recorded); present, it must be
 * exactly as strict as the top-level home/away check above so a malformed
 * value can never silently reach `GameResultBracketProjectionService`'s
 * penalty-aware winner resolution.
 */
function parseOfficialPenalties(value: unknown): { home: number; away: number } | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    typeof (value as { home?: unknown }).home !== 'number' ||
    !Number.isInteger((value as { home: number }).home) ||
    (value as { home: number }).home < 0 ||
    typeof (value as { away?: unknown }).away !== 'number' ||
    !Number.isInteger((value as { away: number }).away) ||
    (value as { away: number }).away < 0
  ) {
    throw new Error('OFFICIAL revision penalties must be non-negative integer home and away scores');
  }
  return { home: (value as { home: number }).home, away: (value as { away: number }).away };
}

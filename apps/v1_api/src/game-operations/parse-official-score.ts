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
  // 승부차기도 home/away 와 같은 이유로 두 형태를 모두 읽는다 -- 다만 키 이름이
  // 형태별로 다르다: 평평한 형태는 `penalties`(복수), 중첩 형태는 `penalty`(단수,
  // `regulation` 의 형제 필드). 위 home/away 는 처음부터 폴백을 갖고 있었는데 승부차기만
  // 빠져 있어서, 중첩 형태로 저장된 경기는 승부차기가 조용히 사라졌다 -- 그러면
  // `resolveTeamRecordResult` 가 승부차기로 갈린 경기를 DRAWN 으로 기록한다(이 커밋이
  // 고치는 바로 그 버그가 그 경기 집합에서만 되살아난다). 같은 함정을 이미 겪은
  // `public-tournament-records.service.ts` 의 `parseScore()` 와 같은 문장이다.
  const penalties = parseOfficialPenalties(record.penalties ?? record.penalty);
  return { home, away, ...(penalties === undefined ? {} : { penalties }) };
}

/**
 * 승부차기 값은 평평한 형태에서는 `penalties`(복수), 중첩 형태에서는 `penalty`(단수)로
 * 저장된다 — 호출부가 두 키를 합쳐 넘기므로 이 함수는 값의 모양만 검사한다.
 * Absent is the ordinary case (no shootout recorded); present, it must be
 * exactly as strict as the top-level home/away check above so a malformed
 * value can never silently reach `GameResultBracketProjectionService`'s
 * penalty-aware winner resolution.
 */
function parseOfficialPenalties(value: unknown): { home: number; away: number } | undefined {
  // `null` 도 "승부차기 없음"이다. 평평한 형태는 키를 아예 빼서 없음을 표현하지만
  // 중첩 형태(`createImportedGame()`)는 `penalty: null` 을 **명시적으로** 쓴다 --
  // null 을 malformed 로 거부하면 승부차기가 없었던 모든 중첩 형태 리비전이 통째로
  // 파싱 실패한다.
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== 'object' ||
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

import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { V1GameState } from '@prisma/client';

const GAME_STATES: readonly V1GameState[] = [
  V1GameState.SCHEDULED,
  V1GameState.LIVE,
  V1GameState.PAUSED,
  V1GameState.ENDED,
  V1GameState.CANCELLED,
];

/**
 * Sensible-default warning codes (Decision #3) -- neither the plan nor
 * docs/api/global-contract.md define `warning` values for the operations board. See the doc
 * comment at the top of tournament-operations-board.service.ts for the exact semantics of each
 * code.
 *
 * Split into two groups (post-D3 determinism hardening -- see the "stable body" doc section in
 * tournament-operations-board.service.ts):
 * - `STABLE_WARNING_CODES` are a pure function of persisted state alone and live in each item's
 *   `warnings` array in the response's stable/hash-stable body.
 * - `TIME_RELATIVE_WARNING_CODES` additionally depend on the wall-clock instant the request was
 *   served at (a deadline/expiry comparison) and live ONLY in the response's separate
 *   `liveWarnings` array, which is NOT part of the stable snapshot and may legitimately differ
 *   between two reads separated by real time with zero intervening writes.
 *
 * ## `?warning=<code>` accepts ONLY `STABLE_WARNING_CODES` (P0 fix, see review finding #2)
 * An earlier revision let `warning` accept the full `OPERATIONS_BOARD_WARNING_CODES` union and
 * filtered `items` by whichever group matched. That was wrong: the filter runs BEFORE `items` is
 * built, so filtering by a time-relative code changed `items` membership as a function of `now`
 * alone (two requests against an identical, unchanged database could return different `items` if
 * they straddled a `NO_STAFF_ASSIGNED`/`LINEUP_NOT_SUBMITTED` deadline). That re-contaminated the
 * very "hash-stable body" guarantee `{items, nextCursor, watermark}` exists to provide.
 *
 * The corrected, absolute rule: **`items` membership must never depend on a time-relative value.**
 * Rather than silently returning a clock-dependent page, requesting a time-relative code as the
 * `warning` filter is now REJECTED -- HTTP callers get `400 VALIDATION_ERROR` from the global
 * `ValidationPipe`'s `@IsIn` check (this repo's `ValidationPipe.exceptionFactory` in `main.ts`
 * always responds `400`, never `422`, for DTO validation failures); direct/non-HTTP callers
 * (including this service's own tests) are defensively re-checked inside
 * `TournamentOperationsBoardService.list()` with an equivalent `400 BadRequestException`
 * (`OPERATIONS_BOARD_WARNING_FILTER_NOT_STABLE`) -- see that file for the runtime guard. A client
 * that wants a live-warning-aware view must fetch the (always time-independent) full page and
 * filter client-side using the separate `liveWarnings` array, which was always documented as
 * clock-dependent and outside the stable snapshot.
 */
export const STABLE_WARNING_CODES = ['NO_FIELD_ASSIGNED', 'MISSING_SCORER', 'RESULT_REVIEW_OVERDUE'] as const;

export const TIME_RELATIVE_WARNING_CODES = ['NO_STAFF_ASSIGNED', 'LINEUP_NOT_SUBMITTED'] as const;

export const OPERATIONS_BOARD_WARNING_CODES = [
  ...STABLE_WARNING_CODES,
  ...TIME_RELATIVE_WARNING_CODES,
] as const;

export type StableWarningCode = (typeof STABLE_WARNING_CODES)[number];
export type TimeRelativeWarningCode = (typeof TIME_RELATIVE_WARNING_CODES)[number];
export type OperationsBoardWarningCode = (typeof OPERATIONS_BOARD_WARNING_CODES)[number];

/**
 * `GET /api/v1/tournament-ops/tournaments/:tournamentId/operations` query params.
 *
 * `status` filters on `V1Game.state`, NOT `V1TournamentFixture.status` -- the latter is
 * dead/unmaintained (GamesService never writes it once the Game model became authoritative).
 *
 * `limit` follows the global cursor rule (docs/api/global-contract.md line ~7): default 20, max
 * 100.
 *
 * `cursor` is a deliberately opaque token (its literal current shape is a raw
 * `V1TournamentFixture.id` for keyset positioning -- see the service's pagination doc section
 * for why that shape did NOT change even while its cross-tournament-reuse handling was hardened
 * in review finding #7).
 */
export class ListTournamentOperationsQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsIn(GAME_STATES)
  status?: V1GameState;

  @IsOptional()
  @IsUUID()
  fieldId?: string;

  /** VALIDATED against `STABLE_WARNING_CODES` only (`@IsIn` below) -- see the doc block above for
   * why time-relative codes are rejected here rather than silently making `items` clock-dependent.
   * The compile-time TYPE intentionally stays the full `OperationsBoardWarningCode` union (rather
   * than narrowing to `StableWarningCode`) purely for source-compatibility with existing TypeScript
   * call sites that pass a `TimeRelativeWarningCode` literal expecting a runtime rejection (e.g.
   * this endpoint's own tests exercising the now-rejected path) -- narrowing this property's
   * declared type would turn that into a compile error instead of the intended runtime
   * `BadRequestException`. `TournamentOperationsBoardService.list()` performs the actual runtime
   * narrowing/rejection for callers (including this service's own direct, non-HTTP callers) that
   * never go through this DTO's `@IsIn` validator at all. */
  @IsOptional()
  @IsIn(STABLE_WARNING_CODES)
  warning?: OperationsBoardWarningCode;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

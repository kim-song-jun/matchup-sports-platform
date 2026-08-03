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
 * `?warning=<code>` accepts codes from BOTH groups (`OPERATIONS_BOARD_WARNING_CODES` is their
 * union) -- filtering by a time-relative code still returns the right fixtures, it just means the
 * filtered *response* is no longer guaranteed clock-stable (see the service doc comment).
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

  @IsOptional()
  @IsIn(OPERATIONS_BOARD_WARNING_CODES)
  warning?: OperationsBoardWarningCode;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

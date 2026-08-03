import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

/**
 * Body for POST /tournament-ops/tournaments/:tournamentId/staff/:assignmentId/revoke.
 *
 * The frozen contract row (docs/api/global-contract.md) describes the body as
 * {expectedVersion, reason}. TournamentStaffService.revokeStaff (Task 7,
 * owned by apps/v1_api/src/tournaments/staff/, not this lane) only accepts
 * {expectedVersion, audit} -- its audit envelope has no free-text field to
 * carry a human-written reason. Rather than validate and require `reason`
 * and then silently drop it (Task 18 review finding #11: a contract-required
 * field that is thrown away is worse than rejecting it), this lane's
 * TournamentOperationsStaffService.revoke() persists it itself as a
 * follow-up V1OperationAudit row (action `tournament.staff.revoke_reason`,
 * same resourceId/tournamentId) using the audit table's own `reason` column,
 * immediately after revokeStaff() commits. It is a best-effort write after
 * the fact (not atomic with the revocation itself, since that would require
 * editing the out-of-lane service), but the reason is genuinely persisted
 * and queryable instead of discarded.
 */
export class RevokeTournamentStaffDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

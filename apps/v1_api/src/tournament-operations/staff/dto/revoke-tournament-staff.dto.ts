import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

/**
 * Body for POST /tournament-ops/tournaments/:tournamentId/staff/:assignmentId/revoke.
 *
 * The frozen contract row (docs/api/global-contract.md) describes the body as
 * {expectedVersion, reason}. `reason` is forwarded as
 * `RevokeTournamentStaffInput.reason` into `TournamentStaffService.revokeStaff()`
 * (Task 7, apps/v1_api/src/tournaments/staff/), which writes it onto the SAME
 * `V1OperationAudit` row as the revoke, inside the SAME transaction (Task 18
 * review P1-3 fix) -- this lane no longer performs a separate follow-up write
 * for it after that transaction has already committed. See
 * `TournamentStaffService.writeAudit()`'s doc comment for the atomicity
 * reasoning.
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

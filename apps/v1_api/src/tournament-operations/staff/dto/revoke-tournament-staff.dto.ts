import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

/**
 * Body for POST /tournament-ops/tournaments/:tournamentId/staff/:assignmentId/revoke.
 *
 * The frozen contract row (docs/api/global-contract.md) describes the body as
 * {expectedVersion, reason}. Per Decision #1 (shipped code wins over contract
 * prose), TournamentStaffService.revokeStaff (Task 7, owned by
 * apps/v1_api/src/tournaments/staff/, not this lane) only accepts
 * {expectedVersion, audit} -- its audit envelope has no free-text field to
 * carry a human-written reason. `reason` is still validated and accepted here
 * (so the frozen contract shape is satisfiable end-to-end and the field is
 * available for future audit-trail work) but it is NOT forwarded to or
 * persisted by TournamentStaffService today. Documented per Decision #3.
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

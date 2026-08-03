import { V1TournamentStaffRole } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsUUID,
} from 'class-validator';

/**
 * Body for POST /tournament-ops/tournaments/:tournamentId/staff.
 *
 * Mirrors TournamentStaffService.GrantTournamentStaffInput 1:1 (Task 7,
 * apps/v1_api/src/tournaments/staff/tournament-staff.service.ts) --
 * validation here only rejects malformed input; the role-scope business
 * rules (STAFF_SCOPE_REQUIRED / STAFF_SCOPE_NOT_ALLOWED / etc.) stay owned
 * by TournamentStaffService for the ordinary grantStaff() path. The one
 * exception is TournamentOperationsStaffService.grant()'s first-director
 * bootstrap branch: bootstrapFirstDirector() has no field/fixture scope
 * parameters at all, so that one STAFF_SCOPE_NOT_ALLOWED check is
 * re-derived locally there instead of being silently dropped (Task 18
 * review finding #10).
 */
export class GrantTournamentStaffDto {
  @IsUUID()
  userId!: string;

  @IsEnum(V1TournamentStaffRole)
  role!: V1TournamentStaffRole;

  @IsOptional()
  @IsUUID()
  fieldId?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  fixtureIds?: string[];

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

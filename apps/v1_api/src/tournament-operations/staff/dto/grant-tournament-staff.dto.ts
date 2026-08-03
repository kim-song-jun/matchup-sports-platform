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
 * validation here only rejects malformed input; the actual role-scope
 * business rules (STAFF_SCOPE_REQUIRED / STAFF_SCOPE_NOT_ALLOWED / etc.)
 * are re-derived nowhere and stay owned by TournamentStaffService.
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

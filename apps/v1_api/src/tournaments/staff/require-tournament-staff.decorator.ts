import { SetMetadata } from '@nestjs/common';
import type { TournamentStaffAction } from './tournament-staff-policy';

export const TOURNAMENT_STAFF_REQUIREMENT = 'tournamentStaffRequirement';

export type TournamentStaffRequirement = {
  readonly action: TournamentStaffAction;
  readonly tournamentIdParam?: string;
  readonly fixtureIdParam?: string;
  readonly fieldIdParam?: string;
  readonly courtIdParam?: string;
};

export const RequireTournamentStaff = (requirement: TournamentStaffRequirement): MethodDecorator =>
  SetMetadata(TOURNAMENT_STAFF_REQUIREMENT, requirement);

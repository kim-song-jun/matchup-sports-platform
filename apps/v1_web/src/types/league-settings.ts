export interface LeagueSettings {
  leagueId: string;
  title: string;
  rulesText: string;
  regionId: string | null;
  startsOn: string | null;
  endsOn: string | null;
  registrationDeadlineAt: string | null;
  plannedFixtureCount: number | null;
  updatedAt: string;
  status: string;
  sportName: string;
}
export interface UpdateLeagueSettings {
  expectedUpdatedAt: string;
  title: string;
  rulesText: string;
  regionId: string;
  startsOn: string;
  endsOn: string;
  registrationDeadlineAt: string | null;
  plannedFixtureCount: number | null;
}

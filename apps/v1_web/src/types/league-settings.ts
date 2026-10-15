export interface LeagueSettings {
  leagueId: string;
  title: string;
  rulesText: string;
  regionId: string | null;
  startsOn: string | null;
  endsOn: string | null;
  registrationDeadlineAt: string | null;
  plannedFixtureCount: number | null;
  /** 참가팀 정원. null이면 무제한이다. */
  maxTeams: number | null;
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
  /** 생략하면 기존 정원 유지, null이면 무제한으로 변경한다. */
  maxTeams?: number | null;
}

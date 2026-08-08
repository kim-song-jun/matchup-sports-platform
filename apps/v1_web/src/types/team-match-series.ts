export interface V1AdminSeriesListItem {
  seriesId: string;
  title: string;
  state: 'draft' | 'active' | 'completed';
  teamCount: number;
  fixtureCount: number;
  startsOn: string;
  endsOn: string;
}

export interface V1SeriesFixture {
  teamMatchId: string;
  title: string;
  homeTeamId: string;
  awayTeamId: string | null;
  startAt: string;
  placeName: string;
  status: string;
}

export interface V1AdminSeriesDetail {
  seriesId: string;
  title: string;
  state: 'draft' | 'active' | 'completed';
  teamIds: string[];
  fixtures: V1SeriesFixture[];
}

export interface V1PublicSeriesDetail extends V1AdminSeriesDetail {
  startsOn: string;
  endsOn: string;
}

export interface V1CreateSeriesPayload {
  title: string;
  sportId: string;
  regionId: string;
  startsOn: string;
  endsOn: string;
  teamIds: string[];
}

export interface V1CreateSeriesResult {
  seriesId: string;
  title: string;
  state: 'draft' | 'active' | 'completed';
}

export interface V1GenerateSeriesFixturesPayload {
  weeksCount: number;
}

export interface V1GenerateSeriesFixturesResult {
  seriesId: string;
  createdCount: number;
  teamMatchIds: string[];
}

export interface V1UpdateSeriesFixturePayload {
  startsAt?: string;
  placeName?: string;
  placeAddress?: string;
}

export interface V1UpdateSeriesFixtureResult {
  teamMatchId: string;
  startAt: string;
  placeName: string;
  placeAddress: string | null;
}

export interface V1SeriesStandingRow {
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  position: number;
}

export interface V1SeriesPendingFixture {
  teamMatchId: string;
  homeTeamId: string;
  awayTeamId: string | null;
  startAt: string;
}

export interface V1SeriesStandingsResponse {
  seriesId: string;
  tieBreakOrder: string[];
  standings: V1SeriesStandingRow[];
  pendingFixtures: V1SeriesPendingFixture[];
}

export interface V1SeriesPlayerRecordRow {
  userId: string;
  nickname: string | null;
  goals: number;
  assists: number;
}

export interface V1SeriesPlayerRecordsResponse {
  seriesId: string;
  goals: V1SeriesPlayerRecordRow[];
  // NOTE(deviation from plan): the backend (feat/v1-wave-b-series,
  // team-match-series-public.service.ts) intentionally omits `assists`
  // entirely until the T1 track's V1GameResultParticipant.assists column
  // lands on this branch — the response is `{ seriesId, goals }` only, with
  // no `assists` key at all (not even an empty array). Keep this optional
  // and guard every read with `?? []` until that backend field ships.
  assists?: V1SeriesPlayerRecordRow[];
}

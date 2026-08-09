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
  /**
   * 참가 팀들이 과거에 실제로 썼던 장소(최신순, distinct, 최대 5개) — 대진 일괄
   * 생성 폼의 "기본 장소" 추천 칩에 쓴다. 대진이 이미 있으면 서버가 빈 배열을 준다.
   * public 조회(V1PublicSeriesDetail)에는 없어서 optional.
   */
  recentVenues?: string[];
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

export interface V1SeriesFixtureScheduleTemplate {
  /** 0(일)~6(토), KST 기준 요일. */
  dayOfWeek: number;
  /** 'HH:mm', KST 기준 24시간제 시각. */
  time: string;
}

export interface V1GenerateSeriesFixturesPayload {
  weeksCount: number;
  /** 지정하지 않으면 시작일 그대로(자정) 매주 반복하는 기존 동작을 유지한다. */
  schedule?: V1SeriesFixtureScheduleTemplate;
  /** 지정하지 않으면 서버 기본값('장소 미정')을 사용한다. */
  placeName?: string;
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
  assists: V1SeriesPlayerRecordRow[];
}

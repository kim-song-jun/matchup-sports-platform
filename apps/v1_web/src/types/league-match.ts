export interface V1AdminLeagueListItem {
  leagueId: string;
  title: string;
  state: 'draft' | 'active' | 'completed';
  teamCount: number;
  fixtureCount: number;
  startsOn: string;
  endsOn: string;
}

export interface V1LeagueFixture {
  teamMatchId: string;
  title: string;
  homeTeamId: string;
  awayTeamId: string | null;
  startAt: string;
  placeName: string;
  status: string;
  /**
   * 경기 결과 점수 — 백엔드 채움 작업이 병행 진행 중이라(Task 152) 당분간 항상
   * undefined일 수 있다. 소비 측(league-match-standings-client.tsx)은 값이 없으면
   * 스코어 대신 상태 기반 문구("예정"/"결과 대기")로 대체해 화면이 깨지지 않게 한다.
   */
  homeScore?: number;
  awayScore?: number;
}

export interface V1AdminLeagueDetail {
  leagueId: string;
  title: string;
  state: 'draft' | 'active' | 'completed';
  teamIds: string[];
  /**
   * 참가 팀들이 과거에 실제로 썼던 장소(최신순, distinct, 최대 5개) — 대진 일괄
   * 생성 폼의 "기본 장소" 추천 칩에 쓴다. 대진이 이미 있으면 서버가 빈 배열을 준다.
   * public 조회(V1PublicLeagueDetail)에는 없어서 optional.
   */
  recentVenues?: string[];
  fixtures: V1LeagueFixture[];
}

export interface V1PublicLeagueDetail extends V1AdminLeagueDetail {
  startsOn: string;
  endsOn: string;
}

export interface V1CreateLeaguePayload {
  title: string;
  sportId: string;
  regionId: string;
  startsOn: string;
  endsOn: string;
  teamIds: string[];
}

export interface V1CreateLeagueResult {
  leagueId: string;
  title: string;
  state: 'draft' | 'active' | 'completed';
}

export interface V1LeagueFixtureScheduleTemplate {
  /** 0(일)~6(토), KST 기준 요일. */
  dayOfWeek: number;
  /** 'HH:mm', KST 기준 24시간제 시각. */
  time: string;
}

export interface V1GenerateLeagueFixturesPayload {
  weeksCount: number;
  /** 지정하지 않으면 시작일 그대로(자정) 매주 반복하는 기존 동작을 유지한다. */
  schedule?: V1LeagueFixtureScheduleTemplate;
  /** 지정하지 않으면 서버 기본값('장소 미정')을 사용한다. */
  placeName?: string;
}

export interface V1GenerateLeagueFixturesResult {
  leagueId: string;
  createdCount: number;
  teamMatchIds: string[];
}

export interface V1UpdateLeagueFixturePayload {
  startsAt?: string;
  placeName?: string;
  placeAddress?: string;
}

export interface V1UpdateLeagueFixtureResult {
  teamMatchId: string;
  startAt: string;
  placeName: string;
  placeAddress: string | null;
}

export interface V1LeagueStandingRow {
  teamId: string;
  teamName: string;
  teamLogoUrl: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  position: number;
}

export interface V1LeaguePendingFixture {
  teamMatchId: string;
  homeTeamId: string;
  awayTeamId: string | null;
  startAt: string;
}

export interface V1LeagueStandingsResponse {
  leagueId: string;
  tieBreakOrder: string[];
  standings: V1LeagueStandingRow[];
  pendingFixtures: V1LeaguePendingFixture[];
}

export interface V1LeaguePlayerRecordRow {
  userId: string;
  nickname: string | null;
  goals: number;
  assists: number;
}

export interface V1LeaguePlayerRecordsResponse {
  leagueId: string;
  goals: V1LeaguePlayerRecordRow[];
  assists: V1LeaguePlayerRecordRow[];
}

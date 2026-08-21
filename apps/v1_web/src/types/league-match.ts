export interface V1AdminLeagueListItem {
  leagueId: string;
  title: string;
  state: 'draft' | 'active' | 'completed';
  teamCount: number;
  fixtureCount: number;
  startsOn: string;
  endsOn: string;
}

/**
 * R5 공개 리그 목록 항목 — GET /league-matches. 어드민 목록(V1AdminLeagueListItem)과
 * 달리 fixtureCount는 담지 않는다(공개 화면은 "몇 경기가 남았는지"보다 "어떤 종목·지역·
 * 몇 팀"이 발견 단계에 더 중요한 정보라 API 계약을 분리했다). sport에 code를 포함해
 * getSportAccent(code)/SportGlyph로 대회 카드(V1TournamentListItem.sport)와 같은
 * 시각 언어를 쓸 수 있게 한다.
 */
export interface V1PublicLeagueListItem {
  leagueId: string;
  title: string;
  state: 'draft' | 'active' | 'completed';
  startsOn: string;
  endsOn: string;
  sport: { sportId: string; code: string; name: string };
  region: { regionId: string; name: string };
  /**
   * 리그 체계(시리즈)에 속한 리그만 값이 있다. 단발 리그는 전부 null — 티어가 "1부"인 게
   * 아니라 티어 개념 자체가 없다. 목록에도 필요하다: 이 화면은 "자기 수준의 리그를 고르는"
   * 곳이라 상세에 들어가야만 몇 부인지 알 수 있으면 고를 수가 없다(Task 153 시나리오 3).
   * 서버가 항상 키를 내려주므로 optional 이 아니다.
   */
  seriesId: string | null;
  tier: number | null;
  tierLabel: string | null;
  seasonNo: number | null;
  seriesTitle: string | null;
  teamCount: number;
}

export interface V1PublicLeagueListResponse {
  items: V1PublicLeagueListItem[];
  pageInfo: { nextCursor: string | null; hasNext: boolean };
}

// type 별칭 -- tournaments 목록 필터(TournamentListFilters, hooks/use-v1-api.ts)와
// 같은 이유로 interface가 아니라 type을 쓴다: v1Get(path, query?: Record<string, ...>)에
// 캐스트 없이 바로 넘기는 관례를 그대로 따른다.
export type V1LeagueMatchesFilters = {
  sportId?: string;
  regionId?: string;
  state?: 'draft' | 'active' | 'completed';
  cursor?: string;
  limit?: number;
};

export interface V1LeagueFixture {
  teamMatchId: string;
  title: string;
  homeTeamId: string;
  awayTeamId: string | null;
  startAt: string;
  placeName: string;
  /** 어드민 상세(V1AdminLeagueDetail)에서만 채워진다 — 공개 상세(V1PublicLeagueDetail)는 미포함. */
  placeAddress?: string | null;
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
  /**
   * 리그 체계(시리즈)에 속한 리그만 채워진다. 단발 리그는 넷 다 null 이고,
   * 그때 화면은 티어 뱃지를 아예 띄우지 않는다 — 단발 리그는 "1부"가 아니라
   * 티어 개념 자체가 없기 때문이다. Task 153.
   */
  seriesId?: string | null;
  seriesTitle?: string | null;
  tier?: number | null;
  /** '1부' / '2부' / '3부'. 서버가 만들어 준다. */
  tierLabel?: string | null;
  seasonNo?: number | null;
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

// R13: 참가팀 조회 — GET /admin/league-matches/:leagueId/teams
export interface V1AdminLeagueTeam {
  teamId: string;
  /** 팀이 그 사이 소프트삭제됐으면 '(삭제된 팀)'. */
  name: string;
  status: string | null;
  memberCount: number;
  logoUrl: string | null;
}

export interface V1AdminLeagueTeamsResponse {
  leagueId: string;
  teams: V1AdminLeagueTeam[];
}

// R12: 리그 대진 취소 — POST /admin/league-matches/:leagueId/fixtures/:teamMatchId/cancel
export interface V1CancelLeagueFixturePayload {
  reason: string;
}

export interface V1CancelLeagueFixtureResult {
  teamMatchId: string;
  status: 'cancelled';
  cancelledApplications: number;
  /**
   * 이 취소로 리그가 자동 종료(active -> completed)됐는지. 취소는 "남은 대진"을
   * 줄이는 조작이라 마지막 미확정 대진을 취소하면 리그가 그 자리에서 끝난다.
   */
  leagueCompleted: boolean;
  alreadyProcessed: boolean;
}

// R13: 대진 재생성 — POST /admin/league-matches/:leagueId/fixtures/regenerate
export interface V1RegenerateLeagueFixturesPayload extends V1GenerateLeagueFixturesPayload {
  reason: string;
}

export interface V1RegenerateLeagueFixturesResult {
  leagueId: string;
  cancelledCount: number;
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
  /**
   * 어드민이 최종 승인한 승강 결과. preview 단계에서는 행이 만들어지지 않으므로
   * 값이 있다는 것은 곧 확정됐다는 뜻이다. 아직 확정 전이면 null (Task 153 시나리오 4).
   */
  promotionKind: 'promoted' | 'relegated' | 'stayed' | 'withdrawn' | null;
  promotionToTier: number | null;
  promotionToTierLabel: string | null;
}

export interface V1LeaguePendingFixture {
  teamMatchId: string;
  homeTeamId: string;
  awayTeamId: string | null;
  startAt: string;
}

export interface V1LeagueStandingsResponse {
  leagueId: string;
  tier: number | null;
  tierLabel: string | null;
  tieBreakOrder: string[];
  standings: V1LeagueStandingRow[];
  pendingFixtures: V1LeaguePendingFixture[];
  /**
   * 이 시즌의 승강이 확정됐는지. false 면 순위표에 승강 열을 띄우지 않는다.
   * 서버가 항상 내려주므로 optional 이 아니다.
   */
  promotionDecided: boolean;
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

// R11(C-6): 몰수패·부전승 결과 입력. 스코어는 서버가 고정 컨벤션(승 1 : 몰수팀 0)으로
// 계산하므로 요청에는 어느 팀이 불참했는지와 사유만 싣는다.
export interface V1RecordLeagueForfeitPayload {
  noShowTeamId: string;
  reason: string;
}

export interface V1RecordLeagueForfeitResult {
  teamMatchId: string;
  leagueId: string;
  noShowTeamId: string;
  winningTeamId: string;
  homeScore: number;
  awayScore: number;
  resultRevisionId: string;
  /** true면 이미 몰수가 확정돼 있어 이번 호출이 아무것도 바꾸지 않았다는 뜻. */
  alreadyProcessed: boolean;
  /**
   * `alreadyProcessed`일 때만 의미가 있다. 요청한 몰수팀이 이미 확정된 몰수팀과
   * 같은지 — false면 "반대 팀으로 정정하려 했지만 반영되지 않았다"는 뜻이라
   * 화면이 성공으로 표시하면 안 된다.
   */
  requestMatchesStored?: boolean;
}

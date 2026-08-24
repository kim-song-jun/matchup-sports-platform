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

/**
 * "내 리그" 목록의 내 팀 순위 요약. draft 리그(대진 없음)거나 이 팀이 아직 순위표에
 * 없으면(이론상 없어야 하지만 방어적으로) null. `V1LeagueStandingRow`의 부분집합이다 --
 * 목록 화면은 순위표 전체가 아니라 "몇 등·승점"만 필요하다.
 */
export interface V1MyLeagueStandingSummary {
  position: number;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalDifference: number;
}

/**
 * "내 리그" 목록의 다음 예정 경기. completed 리그(남은 대진 없음)거나 draft 리그면 null.
 * opponentTeamId 가 null 이면 상대팀이 아직 확정되지 않은 대진(신청 대기 등)이다.
 */
export interface V1MyLeagueNextFixture {
  teamMatchId: string;
  startAt: string;
  opponentTeamId: string | null;
  opponentTeamName: string | null;
}

/**
 * R4: 내 리그 (GET /league-matches/me). 목록 아이템에 "내 팀이 어느 팀인지"를 얹는다 --
 * 한 리그에 내 팀이 둘 이상일 수 있어(같은 사용자가 두 팀 소속) 배열이다.
 * 참가 테이블 기준이라 **대진이 아직 없는 draft 리그도 들어온다.**
 *
 * 감사 보통 항목(Task 153 Wave 2) — 팀장이 가장 궁금한 "우리 팀 몇 등?" / "다음 경기
 * 언제?"를 목록에서 바로 보여준다. standing/nextFixture 는 draft 리그에서 둘 다 null,
 * completed 리그에서는 standing만(최종 순위) 채워지고 nextFixture는 null이다.
 */
export interface V1MyLeagueListItem extends V1PublicLeagueListItem {
  myTeams: Array<{
    teamId: string;
    name: string;
    standing: V1MyLeagueStandingSummary | null;
    nextFixture: V1MyLeagueNextFixture | null;
  }>;
}

export interface V1MyLeagueListResponse {
  items: V1MyLeagueListItem[];
}

export interface V1PublicLeagueListResponse {
  items: V1PublicLeagueListItem[];
  pageInfo: { nextCursor: string | null; hasNext: boolean };
}

// type 별칭 -- tournaments 목록 필터(TournamentListFilters, hooks/use-v1-api.ts)와
// 같은 이유로 interface가 아니라 type을 쓴다: v1Get(path, query?: Record<string, ...>)에
// 캐스트 없이 바로 넘기는 관례를 그대로 따른다.
export type V1LeagueMatchesFilters = {
  /** 이 팀이 참가한 리그만. 대진이 없는 draft 리그도 걸린다. */
  teamId?: string;
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
   * 결과 진행 단계 — 어드민 상세에서만 채워진다. 팀매치 `status`(matched/cancelled)와는
   * **다른 축**이다: status 는 "대진이 성사됐는가", 이 값은 "결과가 어디까지 왔는가"다.
   * 그래서 어드민 표에서 두 값을 각각의 열로 보여준다(2026-08-24 D6 확정).
   */
  resultStage?: 'not_entered' | 'draft' | 'awaiting_approval' | 'change_requested' | 'official' | 'voided';
  /**
   * 경기 결과 점수 — 공식 결과가 확정된 대진에만 채워진다. 미확정이면 null 이고,
   * 0:0 으로 오인되지 않게 서버가 명시적으로 구분해 내려준다. 소비 측은 값이 없으면
   * 스코어 대신 상태 기반 문구("예정"/"결과 대기")로 대체한다.
   */
  homeScore?: number | null;
  awayScore?: number | null;
  /**
   * 몰수패로 확정된 결과인지. 몰수는 스코어만 보면 실제 1:0 승리와 구분되지 않아서
   * 서버가 boolean 으로 알려준다(어드민이 쓴 몰수 사유 원문은 공개하지 않는다).
   * 공개 상세에만 있고 어드민 상세엔 없다.
   */
  isForfeit?: boolean;
}

export interface V1AdminLeagueDetail {
  leagueId: string;
  title: string;
  state: 'draft' | 'active' | 'completed';
  /**
   * 그룹 B 감사 결함 1 — 참가팀 추가 화면이 "이 리그 종목과 같은 팀만" 검색을 좁히는 데
   * 쓴다. public 조회(V1PublicLeagueDetail)는 `sport: { sportId, code, name }` 중첩
   * 객체로 이미 같은 정보를 들고 있어서(league-match-public.service.ts) 이 평평한
   * 필드는 어드민 응답에만 있다 — optional.
   */
  sportId?: string;
  teamIds: string[];
  /**
   * 참가 팀들이 과거에 실제로 썼던 장소(최신순, distinct, 최대 5개) — 대진 일괄
   * 생성 폼의 "기본 장소" 추천 칩에 쓴다. 대진이 이미 있으면 서버가 빈 배열을 준다.
   * public 조회(V1PublicLeagueDetail)에는 없어서 optional.
   */
  recentVenues?: string[];
  fixtures: V1LeagueFixture[];
}

/**
 * 이슈 1(감사 보통) — 같은 시리즈의 다른 시즌·티어 리그. 상세 화면의 탐색 링크에 쓴다.
 * tier·seasonNo 는 시리즈에 속한 리그라면(V1League 모델 불변식 — 셋은 항상 함께
 * 채워지거나 함께 null) 항상 값이 있어 non-null 이다.
 */
export interface V1LeagueSeriesSibling {
  leagueId: string;
  tier: number;
  tierLabel: string;
  seasonNo: number;
  state: 'draft' | 'active' | 'completed';
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
  /**
   * 이슈 1 — 단발 리그(seriesId === null)는 항상 빈 배열. 서버가 항상 키를 내려주므로
   * optional 이 아니다.
   */
  seriesSiblings: V1LeagueSeriesSibling[];
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

/** 그룹 B 감사 결함 2 — 서버가 명시적으로 알려주는 대진 생성 부수효과 경고. 지금은
 * ODD_TEAM_COUNT_BYE(홀수 팀 bye) 하나뿐이지만, tournaments 쪽 SCHEDULE_NOT_SET처럼
 * 서버가 추가하면 화면이 코드를 모른 채로도 message만 그대로 보여줄 수 있게 배열로 둔다. */
export interface V1LeagueFixtureWarning {
  code: string;
  message: string;
}

export interface V1GenerateLeagueFixturesResult {
  leagueId: string;
  createdCount: number;
  teamMatchIds: string[];
  warnings: V1LeagueFixtureWarning[];
}

// 그룹 B 감사 결함 3 — POST /admin/league-matches/:leagueId/fixtures/preview. DB를 바꾸지
// 않는 dry-run. GenerateLeagueFixturesDto와 완전히 같은 body를 받는다(생성·재생성 둘 다
// 이 미리보기를 공유한다).
export interface V1PreviewLeagueFixture {
  round: number;
  homeTeamId: string;
  awayTeamId: string;
  startAt: string;
}

export interface V1PreviewLeagueFixturesResult {
  leagueId: string;
  rounds: number;
  fixtureCount: number;
  placeName: string;
  fixtures: V1PreviewLeagueFixture[];
  warnings: V1LeagueFixtureWarning[];
}

// 그룹 B 감사 결함 1 — 개설 후 참가팀 추가·제거.
export interface V1AddLeagueTeamPayload {
  teamId: string;
}

export interface V1AddLeagueTeamResult {
  leagueId: string;
  teamId: string;
  teamCount: number;
  /** true면 이 리그에 이미 대진이 있다는 뜻 — 새로 추가한 팀은 다음 "대진 재생성" 전까지
   * 대진표에 반영되지 않는다. 화면이 이 값으로 안내 문구를 띄운다. */
  hasExistingFixtures: boolean;
}

export interface V1RemoveLeagueTeamResult {
  leagueId: string;
  teamId: string;
  /** 이 팀이 낀 미확정 대진 중 함께 취소된 수. */
  cancelledFixtureCount: number;
  leagueCompleted: boolean;
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

// R6: 리그 종료 역전이 — POST /admin/league-matches/:leagueId/revert-completion.
// 사유는 선택(감사 로그용). 이미 active 면 alreadyProcessed: true 로 멱등 응답한다.
export interface V1RevertLeagueCompletionPayload {
  reason?: string;
}

export interface V1RevertLeagueCompletionResult {
  leagueId: string;
  state: 'active';
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
  warnings: V1LeagueFixtureWarning[];
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
  /**
   * 감사 H-2 — 시즌 중에도 "지금 순위라면 승격/강안권인가"를 보여주는 예상값.
   * `promotionKind`(확정)와 절대 같은 의미가 아니다 -- 확정 전(promotionDecided=false)에만
   * 값이 있고, 확정되면 이 필드는 다시 전부 null 이 된다(그때부터는 promotionKind가 진실).
   * 시리즈에 속하지 않은 단발 리그는 애초에 항상 null.
   */
  expectedPromotionKind: 'promoted' | 'relegated' | 'stayed' | null;
  expectedPromotionToTier: number | null;
  expectedPromotionToTierLabel: string | null;
}

/** 감사 H-5 — tie-break 기준을 전부 소진하고도 갈리지 않아 팀ID 사전순 폴백으로 순위가 결정된 팀 그룹. */
export interface V1LeagueTieBreakGroup {
  teamIds: string[];
  teamNames: string[];
}

export interface V1LeaguePendingFixture {
  teamMatchId: string;
  homeTeamId: string;
  awayTeamId: string | null;
  startAt: string;
}

/**
 * 그룹 B(시즌 결산·시상) — 종료된 리그의 우승팀 한 항목. 배열 길이가 1보다 크면
 * 공동 우승(동점 우승)이다 -- 승점·득실차·다득점·(적용됐다면)맞대결까지 전부 같아
 * 이 리그의 tieBreakOrder 로는 갈리지 않았다는 뜻(감사 H-5의 tieBreakGroups 재사용).
 */
export interface V1LeagueChampionTeam {
  teamId: string;
  teamName: string;
  teamLogoUrl: string | null;
}

export interface V1LeagueStandingsResponse {
  leagueId: string;
  tier: number | null;
  tierLabel: string | null;
  tieBreakOrder: string[];
  standings: V1LeagueStandingRow[];
  pendingFixtures: V1LeaguePendingFixture[];
  /**
   * 그룹 B(시즌 결산·시상 화면 감사) — 종료된 리그의 우승팀. `state !== 'completed'`
   * 인 리그(draft/active)는 "우승"이라는 개념 자체가 성립하지 않아 항상 빈 배열이다.
   * 서버가 항상 키를 내려주므로 optional 이 아니다 -- 화면은 `champions.length === 0`
   * 을 "아직 우승팀 없음"으로 그대로 읽으면 된다(진행 중인지 준비 중인지는 이 응답만으로
   * 구분할 필요가 없다 -- 우승 배지를 안 그리면 그만이다).
   * 새 계산이 아니라 이미 계산해 둔 tieBreakGroups(H-5)에서 1위 팀이 속한 그룹을 그대로
   * 찾아 쓴다 -- 별도의 "공동 우승 판정" 로직을 새로 만들지 않는다.
   */
  champions: V1LeagueChampionTeam[];
  /**
   * 이슈 3 — 취소돼 집계에서 빠진 대진 수. 0이면 화면은 안내를 그리지 않는다.
   * 서버가 항상 내려주므로 optional 이 아니다.
   */
  cancelledFixtureCount: number;
  /**
   * 이 시즌의 승강이 확정됐는지. false 면 순위표에 승강 열을 띄우지 않는다.
   * 서버가 항상 내려주므로 optional 이 아니다.
   */
  promotionDecided: boolean;
  /**
   * 이 시즌·티어에 적용되는 승강 슬롯 수(확정 전에만 값 있음). standings[].expectedPromotionKind
   * 와 짝이다 -- 시리즈에 속하지 않거나(단발 리그) 이미 확정됐으면 null.
   */
  promotionForecast: { promoteSlots: number; relegateSlots: number; skippedByMajorityGuard: boolean } | null;
  /** 감사 H-5 — 대부분의 시즌은 빈 배열이다. */
  tieBreakGroups: V1LeagueTieBreakGroup[];
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

// U1: 운영자 결과 입력·정정 — POST .../result 와 .../result/correct 가 완전히 같은 요청
// 모양을 쓴다(league-match-result-entry.dto.ts RecordLeagueResultDto). 신규 입력·정정
// 두 화면이 이 하나의 payload 타입을 공유한다.
export interface V1RecordLeagueResultPayload {
  homeScore: number;
  awayScore: number;
  /** 감사 로그·결과 리비전에 남기는 처리 사유. 필수. */
  reason: string;
}

export interface V1RecordLeagueResultResult {
  teamMatchId: string;
  leagueId: string;
  homeScore: number;
  awayScore: number;
  resultRevisionId: string;
  /** true면 이미 같은 내용으로 확정돼 있어 이번 호출이 아무것도 바꾸지 않았다는 뜻. */
  alreadyProcessed: boolean;
}

// D2 (E4): 어드민 이의 목록·처리. 백엔드가 leagueId/teamMatchId/raisedByTeamId를
// 단일 IN 조회로 리그 제목·대진 팀 이름·제기 팀 이름까지 붙여서 내려준다
// (league-match-dispute.service.ts enrichDisputeRows) — 화면은 raw id 를 다시
// 조합할 필요가 없다.
export type V1LeagueMatchDisputeStatus = 'open' | 'accepted' | 'rejected';
export type V1LeagueMatchDisputeResolution = 'correction' | 'void';

export interface V1AdminLeagueMatchDisputeRow {
  id: string;
  leagueId: string;
  leagueTitle: string;
  teamMatchId: string;
  homeTeamName: string;
  awayTeamName: string;
  reason: string;
  raisedByTeamId: string;
  raisedByTeamName: string;
  status: V1LeagueMatchDisputeStatus;
  resolution: V1LeagueMatchDisputeResolution | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  /** 이의를 걸 당시 걸려 있던 공식 스코어("전"). 처리 모달의 정정 경로가 전→후 비교에 쓴다. */
  currentHomeScore: number | null;
  currentAwayScore: number | null;
}

export interface V1AdminLeagueMatchDisputeListResponse {
  items: V1AdminLeagueMatchDisputeRow[];
}

/** 수락(정정/무효) 요청 — 정정은 스코어가 필수, 무효는 스코어를 보내지 않는다. */
export interface V1ResolveLeagueMatchDisputePayload {
  resolution: V1LeagueMatchDisputeResolution;
  note: string;
  homeScore?: number;
  awayScore?: number;
}

export interface V1ResolveLeagueMatchDisputeResult {
  id: string;
  status: V1LeagueMatchDisputeStatus;
  resolution: V1LeagueMatchDisputeResolution | null;
  /** true면 이미 처리된 이의라 이번 호출이 아무것도 바꾸지 않았다는 뜻(멱등). */
  alreadyProcessed: boolean;
}

export interface V1RejectLeagueMatchDisputePayload {
  note: string;
}

export interface V1RejectLeagueMatchDisputeResult {
  id: string;
  status: V1LeagueMatchDisputeStatus;
  alreadyProcessed: boolean;
}

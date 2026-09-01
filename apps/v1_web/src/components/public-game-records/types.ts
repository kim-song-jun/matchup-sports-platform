/**
 * Task 24 -- frontend-local mirror of the public-records response shapes
 * shipped in `apps/v1_api/src/games/public-records/**` (see
 * `docs/api/domains/public-records.md`). Kept separate from `@/types/api`
 * (not a declared Task 24 output) and never imports `@prisma/client`
 * directly, per this repo's frontend convention.
 *
 * `visibilityMode` only ever carries the three modes a public payload can
 * actually be serialized under -- a `hidden` fixture is never returned by
 * the API at all (same 404 as "does not exist"), so `'hidden'` is
 * deliberately not part of this union.
 */

import type { MatchOutcomeReason } from '@/lib/match-outcome';
export type PublicVisibilityMode = 'status_only' | 'live' | 'official_only';

/** `pending` covers both "no official revision yet" and "a correction draft is mid-review". */
export type PublicResultState = 'pending' | 'official' | 'corrected' | 'void';

export type PublicScoreStatus = 'unavailable' | 'live' | 'official';

/**
 * 승부차기 최종 스코어. 결선(knockout) 경기가 정규시간 동점으로 끝나 승부차기까지
 * 간 경우에만 존재한다 — 조별리그에서는 서버가 애초에 기록을 거부한다
 * (`TOURNAMENT_PENALTY_NOT_ALLOWED`).
 */
export interface PublicPenaltyScore {
  readonly home: number;
  readonly away: number;
}

export interface PublicScore {
  readonly home: number;
  readonly away: number;
  /**
   * 승부차기가 없었던 경기(대부분)는 `null`. 서버는 두 가지 저장 형태(평평한
   * `{home,away,penalties}` / 백필된 `{regulation,penalty}`)를 모두 읽어 이 한 가지
   * 모양으로 정규화해 내려준다(`public-tournament-records.service.ts`의 `parseScore`)
   * — 소비처는 저장 형태를 알 필요가 없다. 진행 중(`scoreStatus: 'live'`) 스코어에는
   * 승부차기가 존재할 수 없으므로 항상 `null`이다.
   */
  readonly penalties: PublicPenaltyScore | null;
}

/**
 * Lane 1 addition -- the pause-aware elapsed clock of whichever period is
 * currently live (`resolveLiveClock`, `apps/v1_api/src/games/public-records/public-clock.ts`).
 * `null` before kickoff, during a between-periods break, or once the match
 * has ended -- never a stale/frozen number.
 */
export interface PublicGameClock {
  readonly periodNumber: number;
  readonly elapsedMs: number;
  readonly isPaused: boolean;
}

/** 'halftime' = 피리어드 사이 휴식(다음 피리어드 미시작). 'regulation_ended' =
 *  모든 피리어드가 ENDED인데 게임(V1Game.state)은 아직 LIVE — 결과 확정 또는
 *  승부차기를 기다리는 중. 운영 콘솔의 halftimePeriod/regulationEnded와 동일한
 *  두 상태를 그대로 재사용한다(operate-console.tsx, 이슈 #375 / 종료 흐름 개편). */
export type PublicPeriodBreak = 'halftime' | 'regulation_ended';

/**
 * 참가팀 공개 정책 통일(fix/v1-publish) — teamId/teamName은 대회가 모집
 * 중(status==='open')이고 조회자가 운영자·스태프가 아니면 둘 다 null이다.
 * registrationId는 재식별 경로가 없으므로 항상 남는다.
 */
export interface PublicSideSummary {
  readonly registrationId: string;
  readonly teamId: string | null;
  readonly teamName: string | null;
}

/**
 * One goal in a schedule card's scorer-summary line. `participantName`/
 * `jerseyNumber` follow the exact same consent gate as `PublicMatchEvent` --
 * `null` means "withheld", never "unknown"/"guest with no name".
 */
export interface PublicScheduleScorer {
  readonly side: 'home' | 'away';
  readonly ownGoal?: boolean;
  readonly participantName: string | null;
  readonly jerseyNumber: number | null;
  readonly period: number | null;
  readonly clockMs: number | null;
}

/**
 * One card (booking/sending-off) in a schedule card's event summary. Consent
 * gating on `participantName`/`jerseyNumber` is identical to
 * `PublicScheduleScorer` — `null` means "withheld", never "unknown".
 *
 * `cardColor` is `null` only for legacy payloads that never stored a colour;
 * the schedule card then draws a neutral card rather than guessing yellow.
 */
export interface PublicScheduleCard {
  readonly side: 'home' | 'away';
  readonly cardColor: 'YELLOW' | 'RED' | null;
  readonly participantName: string | null;
  readonly jerseyNumber: number | null;
  readonly period: number | null;
  readonly clockMs: number | null;
}

/** One row of `GET /tournaments/:id/schedule` `items[]`/`unscheduled[]`. */
export interface PublicScheduleEntry {
  readonly fixtureId: string;
  readonly round: string;
  readonly fixtureNumber: number;
  readonly legNumber: number;
  readonly groupId: string | null;
  readonly groupName: string | null;
  readonly scheduledAt: string | null;
  readonly venue: string | null;
  /**
   * 이 경기가 열리는 필드(경기장)의 식별자. 표시용 `fieldName` 과 달리 **배정 대조에 쓰는
   * 값**이다 — 필드 단위 스태프 배정이 이름이 겹치는 필드의 경기까지 "내 담당"으로 묶던 것을
   * 막으려고 서버가 함께 내려준다(이름은 중복될 수 있지만 id 는 그렇지 않다).
   */
  readonly fieldId: string | null;
  readonly fieldName: string | null;
  readonly home: PublicSideSummary | null;
  readonly away: PublicSideSummary | null;
  readonly visibilityMode: PublicVisibilityMode;
  readonly status: string;
  readonly resultState: PublicResultState;
  readonly scoreStatus: PublicScoreStatus;
  readonly score: PublicScore | null;
  readonly clock: PublicGameClock | null;
  readonly periodBreak: PublicPeriodBreak | null;
  readonly scorers: readonly PublicScheduleScorer[];
  readonly cards: readonly PublicScheduleCard[];
  /** 몰수·중단 종결 표기. 경기 상세와 같은 규칙으로 서버가 채운다(정상 종료·공개 전이면 null). */
  readonly outcome: PublicMatchOutcome | null;
  readonly hasVideo: boolean;
}

/**
 * 몰수·중단으로 종결된 경기의 표기. 정상 종료(`NORMAL`)면 서버가 `null` 로 내려
 * 기존 화면 계약이 그대로다 — 관전자에게 매번 "정상 종료"라고 말할 이유는 없다.
 *
 * `note` 가 이 타입의 존재 이유다. 점수만 보이면 몰수 0:0 과 실제 0:0 무승부가
 * 화면에서 같아 보이고, 1차 대회에서 문제가 됐던 "왜 그 점수인지 아무 데도 없다"가
 * 그대로 남는다. 서버는 사유 없는 몰수 종료를 422 로 거절하므로(`extractEndOutcome`)
 * `reason !== null` 이면 실무상 `note` 도 있지만, 스키마상 nullable 이라 타입은
 * 그대로 둔다 — 소비처가 빈 사유를 렌더하지 않도록 분기한다.
 */
export interface PublicMatchOutcome {
  readonly reason: MatchOutcomeReason;
  readonly note: string | null;
}

/** teamId/teamName/teamLogoUrl 비공개 규칙은 PublicSideSummary와 동일. */
interface PublicStandingRowBase {
  readonly groupId: string;
  readonly groupName: string;
  readonly teamName: string | null;
  readonly teamLogoUrl: string | null;
  readonly position: number;
  readonly points: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
}

/** 대회 순위 행. `teamId` 는 참가팀 비공개 상태에서 null 이 되므로 행 식별자가 따로 필요하다. */
export interface PublicTournamentStandingRow extends PublicStandingRowBase {
  /** 참가팀 공개 정책 통일(fix/v1-publish) — teamId가 null이어도 행마다 고유한 키. */
  readonly registrationId: string;
  readonly teamId: string | null;
}

/**
 * 정규 리그 순위 행. **`registrationId` 가 없다** — 리그엔 참가 등록 개념이 자체가 없어서,
 * 서버가 teamId 를 그 이름에 담는 대신 아예 싣지 않는다(`leagueOverallStandings` 선례:
 * *"이름이 내용과 갈린 상태"* 를 만들지 않는다).
 *
 * 그래서 행 key 는 `teamId` 인데, 대회에서 teamId 를 key 로 못 쓰던 이유가 **"비공개 상태에도"**
 * 였다는 점이 중요하다 — **리그는 참가팀을 가리지 않으므로 그 전제가 성립하지 않는다.**
 * 한 팀은 순위표에 한 번만 나오므로 teamId 가 유일하고 non-null 이다.
 */
export interface PublicLeagueStandingRow extends PublicStandingRowBase {
  readonly registrationId?: undefined;
  readonly teamId: string;
}

export type PublicStandingRow = PublicTournamentStandingRow | PublicLeagueStandingRow;

export interface PublicTournamentScheduleResponse {
  readonly tournamentId: string;
  readonly tournamentTitle: string;
  readonly bracketPublished: boolean;
  readonly items: readonly PublicScheduleEntry[];
  readonly unscheduled: readonly PublicScheduleEntry[];
  readonly standings: readonly PublicStandingRow[];
  readonly nextCursor: string | null;
}

/** A lineup slot's `displayName` is `null` exactly when D-03/D-11 consent gating withholds identity. */
export interface PublicLineupSlot {
  readonly participantId: string;
  readonly displayName: string | null;
  readonly jerseyNumber: number | null;
  readonly position: string | null;
  /**
   * 공개 프로필 경로. **열어도 되는지 판단까지 서버가 끝낸 값**이라 화면은 있으면 링크,
   * 없으면 그냥 글자로 두면 된다 — 화면이 동의·계정 유무를 다시 따지지 않는다.
   * 계정이 없는 참가자, 동의하지 않은 사람, 이름이 가려진 사람은 모두 `null`.
   */
  readonly profileHref: string | null;
}

export interface PublicLineup {
  readonly home: readonly PublicLineupSlot[];
  readonly away: readonly PublicLineupSlot[];
}

/**
 * `type` mirrors `V1GameEventType` ('GOAL' | 'CARD') but is kept as `string` to avoid a `@prisma/client` import.
 *
 * `side`, `participantName`, `jerseyNumber` are all resolved server-side and
 * are deliberately independent of `lineup` (`PublicMatchDetail.lineup`) --
 * the lineup-publish gate (킥오프 60분 전) exists to stop pre-match squad
 * announcements from leaking early, but a goal/card event can only ever
 * exist once the match has started, so showing who scored is never a
 * pre-match leak. A consumer must never fall back to cross-referencing
 * `lineup` for an event's side/name: that cross-reference silently breaks
 * exactly when `lineup` is `null` (unpublished or `status_only`), which is
 * the one case this decoupling exists to cover.
 */
export interface PublicMatchEvent {
  readonly type: string;
  /** CARD 이벤트의 저장된 색상. CARD가 아니거나 알 수 없는 과거 payload면 null. */
  readonly cardColor: 'YELLOW' | 'RED' | null;
  readonly sideId: string;
  readonly side: 'home' | 'away';
  readonly participantId: string | null;
  readonly participantName: string | null;
  readonly jerseyNumber: number | null;
  /** 공개 프로필 경로 — 서버가 열어도 되는지까지 판단한 값. `PublicLineupSlot` 과 동일 규칙. */
  readonly profileHref: string | null;
  readonly period: number | null;
  readonly clockMs: number | null;
}

export interface PublicMatchMvp {
  readonly participantId: string;
  readonly displayName: string | null;
  /** 공개 프로필 경로 — 서버가 열어도 되는지까지 판단한 값. `PublicLineupSlot` 과 동일 규칙. */
  readonly profileHref: string | null;
}

export interface PublicMatchHistoryEntry {
  readonly revision: number;
  readonly state: 'OFFICIAL' | 'VOID';
  readonly officialAt: string | null;
  readonly reason: string | null;
  readonly isCorrection: boolean;
}

export interface PublicMatchVideo {
  readonly id: string;
  readonly title: string | null;
  readonly url: string;
}

export interface PublicNextMatch {
  readonly fixtureId: string;
  readonly round: string;
  readonly scheduledAt: string | null;
  readonly home: { readonly teamId: string; readonly teamName: string } | null;
  readonly away: { readonly teamId: string; readonly teamName: string } | null;
}

/** `GET /tournaments/:id/matches/:fixtureId` response. */
export interface PublicMatchDetail {
  readonly tournamentId: string;
  readonly tournamentTitle: string;
  readonly fixtureId: string;
  readonly gameId: string | null;
  readonly round: string;
  readonly fixtureNumber: number;
  readonly legNumber: number;
  readonly groupId: string | null;
  readonly groupName: string | null;
  readonly scheduledAt: string | null;
  readonly venue: string | null;
  readonly fieldName: string | null;
  readonly home: PublicSideSummary | null;
  readonly away: PublicSideSummary | null;
  readonly visibilityMode: PublicVisibilityMode;
  readonly status: string;
  readonly resultState: PublicResultState;
  readonly scoreStatus: PublicScoreStatus;
  readonly score: PublicScore | null;
  readonly clock: PublicGameClock | null;
  readonly periodBreak: PublicPeriodBreak | null;
  readonly lineup: PublicLineup | null;
  readonly events: readonly PublicMatchEvent[];
  readonly mvp: PublicMatchMvp | null;
  /** 몰수·중단 종결 표기. 정상 종료거나 아직 공식 결과가 공개되기 전이면 `null`. */
  readonly outcome: PublicMatchOutcome | null;
  readonly pendingProjection: boolean;
  readonly history: readonly PublicMatchHistoryEntry[];
  readonly videos: readonly PublicMatchVideo[];
  readonly nextMatch: PublicNextMatch | null;
}

/**
 * 승부차기 최종 스코어(팀 전적 API 전용 형태). `PublicPenaltyScore`(home/away)와 달리
 * 조회 대상 팀 기준으로 이미 정규화돼 온다 -- 팀 전적 화면은 항상 "우리 팀 vs 상대"로
 * 읽어야 하므로 소비처가 매번 home/away를 팀 관점으로 다시 매핑할 필요가 없다.
 * 승부차기가 없었던 경기(대부분)는 `null`.
 */
export interface PublicTeamRecordPenalties {
  readonly for: number;
  readonly against: number;
}

/**
 * 팀 전적 행을 펼쳤을 때 보여주는 골/카드 이벤트. `PublicMatchEvent`와 필드 의미는
 * 같지만 `side`가 'home'/'away'가 아니라 조회 대상 팀 기준 'own'/'opponent'로 이미
 * 정규화돼 온다. `participantName`/`jerseyNumber`의 null은 동의/실명정책 게이팅
 * 결과이지 데이터 누락이 아니다 -- `presentParticipantName()`으로 렌더한다.
 */
export interface PublicTeamRecordEvent {
  readonly id: string;
  readonly type: 'GOAL' | 'OWN_GOAL' | 'CARD';
  readonly side: 'own' | 'opponent';
  readonly participantName: string | null;
  readonly jerseyNumber: number | null;
  /** 공개 프로필 경로 — 서버가 열어도 되는지까지 판단한 값. `PublicMatchEvent` 와 동일 규칙. */
  readonly profileHref: string | null;
  readonly period: number | null;
  readonly clockMs: number | null;
  readonly cardColor: 'YELLOW' | 'RED' | null;
}

/**
 * U2 -- 팀 전적 한 건이 리그(`league`)/대회(`tournament`)/친선(`friendly`) 중 어디에
 * 속하는지. 백엔드 판정 함수(`apps/v1_api/src/games/public-records/team-record-category.ts`)의
 * 값을 그대로 미러링한다 -- `tournamentId`가 있으면 대회 포맷이 "리그 방식"이어도
 * `tournament`로 분류된다(리그 명칭 정책 확정: "정규 리그" ≠ "리그 방식 대회").
 */
export type TeamRecordCategory = 'league' | 'tournament' | 'friendly';

/**
 * U2 -- 화면 탭 상태 전용 값. '전체'는 서버에 `type` 을 아예 보내지 않는 상태를
 * 가리키는 로컬 전용 값이라(백엔드 계약: 파라미터 미전달 = 필터 없음)
 * `TeamRecordCategory` 에는 없다.
 */
export type TeamRecordTypeFilter = TeamRecordCategory | 'all';

export interface PublicTeamRecordItem {
  readonly gameId: string;
  readonly teamMatchId: string | null;
  readonly tournamentId: string | null;
  readonly tournamentTitle: string | null;
  /** 팀매치를 거친 경기에서만 채워진다 (`tournamentId`가 있는 경기는 항상 null). */
  readonly leagueId: string | null;
  readonly leagueTitle: string | null;
  readonly type: TeamRecordCategory;
  readonly opponentTeamId: string | null;
  readonly opponentTeamName: string | null;
  readonly opponentTeamLogoUrl: string | null;
  /**
   * `WON | DRAWN | LOST` (`V1TeamRecordResult`), kept as `string` to avoid a `@prisma/client` import.
   *
   * **공개 가시성이 `status_only` 인 경기에서는 `null` 이다** — 경기가 있었다는 사실만 알리고
   * 승패·점수는 감춘다(서버 `public-team-records.service.ts` 가 그렇게 내려준다).
   */
  readonly result: string | null;
  /**
   * 정규시간 점수 그대로 -- 승부차기가 있어도 이 값을 승부차기 스코어로 덮어쓰지 않는다.
   * `result` 와 같은 이유로 `status_only` 경기에서는 `null` 이다.
   */
  readonly goalsFor: number | null;
  readonly goalsAgainst: number | null;
  /** Scheduled match instant (`teamMatch.startAt` or tournament fixture `scheduledAt`). */
  readonly playedAt: string;
  /** 승부차기가 있었던 경기(결선 무승부 후 승부차기)만 채워진다. */
  readonly penalties: PublicTeamRecordPenalties | null;
  /** 시간순(period asc, clockMs asc) 정렬. 골·카드 이벤트만 담긴다. */
  readonly events: readonly PublicTeamRecordEvent[];
}

/** `PublicTeamRecordsSummary`와 `byType`의 각 항목이 공유하는 승-무-패-득실 모양. */
export interface TeamRecordSummaryTotals {
  readonly played: number;
  readonly won: number;
  readonly drawn: number;
  readonly lost: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
}

export interface PublicTeamRecordsSummary extends TeamRecordSummaryTotals {
  /**
   * U2 -- `type` 쿼리 필터와 무관하게 항상 전체 기준(백엔드 계약, `fetchSummary`
   * 주석 참고: "집계는 페이지가 아니라 전체 기준"). 탭이 '전체'가 아닌 종류를
   * 고르면 화면은 이 맵에서 해당 종류 값을 그대로 꺼내 KPI 를 교체한다 -- 별도
   * 계산 없이.
   */
  readonly byType: Readonly<Record<TeamRecordCategory, TeamRecordSummaryTotals>>;
}

/** `GET /teams/:id/records` response. */
export interface PublicTeamRecordsResponse {
  readonly teamId: string;
  readonly teamName: string;
  readonly teamLogoUrl: string | null;
  readonly summary: PublicTeamRecordsSummary;
  /**
   * 시즌 드롭다운 선택지 -- `season`/`type` 쿼리와 무관하게 항상 이 팀에 공식 경기가
   * 있었던 연도 전체(내림차순, 4자리 문자열). 하드코딩 연도 목록을 프론트에 두지
   * 않기 위한 단일 소스(`public-team-records.service.ts`의 `fetchAvailableSeasons`).
   */
  readonly availableSeasons: readonly string[];
  readonly items: readonly PublicTeamRecordItem[];
  readonly nextCursor: string | null;
}

export interface PublicUserRecordItem {
  readonly id: string;
  readonly gameId: string;
  /**
   * F6 -- 개인 전적 한 건의 정본 분류. 팀 전적(`PublicTeamRecordItem.type`)과 **같은
   * 값 집합·같은 판정 함수**(`team-record-category.ts`)를 쓴다 -- 같은 경기를 두 화면이
   * 다르게 부르지 않게 하기 위함이다.
   */
  readonly type: TeamRecordCategory;
  /**
   * 구 클라이언트 호환용 별칭(`summary.mvpCount`와 같은 성격). 게임의 *소스 타입*
   * 이분법일 뿐이라 리그 경기를 친선 팀매치와 구분하지 못한다 -- 신규 화면은 반드시
   * 위 `type`을 읽는다.
   */
  readonly matchType: 'tournament' | 'team_match';
  readonly tournamentId: string | null;
  readonly tournamentTitle: string | null;
  /**
   * 정규 리그 대진에서만 채워진다 (`tournamentId`가 있는 대회 경기와 리그가 아닌
   * 친선 팀매치는 둘 다 null). `PublicTeamRecordItem`과 동일한 사슬
   * (game.teamMatchId -> V1TeamMatch.leagueId -> V1League.title)로 서버가 해석한다.
   */
  readonly leagueId: string | null;
  readonly leagueTitle: string | null;
  readonly round: string | null;
  readonly teamId: string | null;
  readonly teamName: string | null;
  readonly opponentTeamId: string | null;
  readonly opponentTeamName: string | null;
  readonly result: 'WON' | 'LOST' | 'DRAWN' | null;
  readonly goals: number;
  readonly cards: { readonly yellow: number; readonly red: number };
  readonly minutesPlayed: number | null;
  readonly started: boolean;
  readonly goalkeeper: boolean;
  readonly mvp: boolean;
  readonly officialAt: string;
}

/**
 * 파울 누적치는 이 요약에 없다 — 서버가 공개 응답에서 아예 빼기 때문이다
 * (`PublicUserRecordsService`의 summary 주석 참조). 카드(경고/퇴장)만 공개된다.
 */
export interface PublicUserRecordsSummary {
  readonly appearances: number;
  readonly goals: number;
  readonly assists: number;
  readonly yellowCards: number;
  readonly redCards: number;
  readonly mvpCount: number;
  readonly matchMvpCount: number;
  readonly tournamentAwardCount: number;
}

export interface PublicUserTournamentAward {
  readonly id: string;
  readonly tournamentId: string;
  readonly tournamentTitle: string;
  readonly awardType: string;
  readonly awardLabel: string;
  readonly iconKey:
    | 'trophy'
    | 'crown'
    | 'goal'
    | 'shield'
    | 'glove'
    | 'handshake'
    | 'sparkles'
    | 'medal'
    | 'star'
    | null;
  readonly teamName: string | null;
  readonly note: string | null;
  readonly awardedAt: string;
}

/**
 * `GET /users/:id/records` response.
 *
 * `viewerIsOwner`가 `true`면 조회자 본인의 페이지다 -- 이 경우 `consentGranted`가
 * `false`여도 `items`가 채워진다(본인은 동의 없이도 자기 기록을 볼 수 있다). 다만 그
 * 상태는 "남에게는 아직 안 보이는 상태"이므로 화면에서 그 사실과 해결 경로(공개 동의
 * 설정)를 반드시 알려야 한다. `viewerIsOwner`가 `false`면 `items`는 언제나
 * `isParticipantPubliclyEligible` 서버 게이팅을 통과한(=공개 동의가 켜진) 행만 담는다.
 * `nickname`은 본인 프로필 닉네임이라 게이팅 대상이 아니다.
 *
 * `consentGranted`는 `viewerIsOwner`가 `true`일 때만 응답에 실린다 -- 타인이 조회할 땐
 * 키 자체가 빠진다(`public-user-records.service.ts`의 서버 측 결정: 본인 동의 여부가
 * `items` 존재 여부와 별개로 새는 신호이기 때문). 그래서 optional이다 -- 소비처는
 * `viewerIsOwner`가 `false`일 때 이 필드를 읽으면 안 된다(항상 `undefined`).
 */
export interface PublicUserRecordsResponse {
  readonly userId: string;
  readonly nickname: string | null;
  readonly viewerIsOwner: boolean;
  readonly consentGranted?: boolean;
  readonly summary: PublicUserRecordsSummary;
  readonly tournamentAwards: readonly PublicUserTournamentAward[];
  readonly items: readonly PublicUserRecordItem[];
  readonly nextCursor: string | null;
}

// ── 회고 STATS-1: 대회 단위 개인 득점·도움 랭킹 ─────────────────────────────
// 리그 `V1LeaguePlayerRecordsResponse`(types/league-match.ts)와 같은 계약에
// `profileHref`만 더한다 — 랭킹 행은 정의상 전원 동의+계정 연결이라 항상 존재한다.
export interface PublicTournamentPlayerRecordRow {
  readonly userId: string;
  readonly nickname: string | null;
  readonly profileHref: string;
  readonly goals: number;
  readonly assists: number;
}

export interface PublicTournamentPlayerRecordsResponse {
  readonly tournamentId: string;
  readonly goals: readonly PublicTournamentPlayerRecordRow[];
  readonly assists: readonly PublicTournamentPlayerRecordRow[];
}

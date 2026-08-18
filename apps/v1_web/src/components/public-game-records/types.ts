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
  readonly hasVideo: boolean;
}

/** teamId/teamName/teamLogoUrl 비공개 규칙은 PublicSideSummary와 동일. */
export interface PublicStandingRow {
  readonly groupId: string;
  readonly groupName: string;
  /** 참가팀 공개 정책 통일(fix/v1-publish) — teamId가 null이어도 행마다 고유한 키. */
  readonly registrationId: string;
  readonly teamId: string | null;
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
  readonly period: number | null;
  readonly clockMs: number | null;
}

export interface PublicMatchMvp {
  readonly participantId: string;
  readonly displayName: string | null;
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
  readonly pendingProjection: boolean;
  readonly history: readonly PublicMatchHistoryEntry[];
  readonly videos: readonly PublicMatchVideo[];
  readonly nextMatch: PublicNextMatch | null;
}

export interface PublicTeamRecordItem {
  readonly gameId: string;
  readonly teamMatchId: string | null;
  readonly tournamentId: string | null;
  readonly tournamentTitle: string | null;
  readonly opponentTeamId: string | null;
  readonly opponentTeamName: string | null;
  readonly opponentTeamLogoUrl: string | null;
  /** `WON | DRAWN | LOST` (`V1TeamRecordResult`), kept as `string` to avoid a `@prisma/client` import. */
  readonly result: string;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly officialAt: string;
  readonly isCorrected: boolean;
}

export interface PublicTeamRecordsSummary {
  readonly played: number;
  readonly won: number;
  readonly drawn: number;
  readonly lost: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
}

/** `GET /teams/:id/records` response. */
export interface PublicTeamRecordsResponse {
  readonly teamId: string;
  readonly teamName: string;
  readonly teamLogoUrl: string | null;
  readonly summary: PublicTeamRecordsSummary;
  readonly items: readonly PublicTeamRecordItem[];
  readonly nextCursor: string | null;
}

export interface PublicUserRecordItem {
  readonly id: string;
  readonly gameId: string;
  readonly matchType: 'tournament' | 'team_match';
  readonly tournamentId: string | null;
  readonly tournamentTitle: string | null;
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
  readonly items: readonly PublicUserRecordItem[];
  readonly nextCursor: string | null;
}

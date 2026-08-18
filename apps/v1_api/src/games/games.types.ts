import type {
  V1GameEventType,
  V1GameResultRevisionState,
  V1GameSideKey,
  V1GameSourceType,
  V1GameState,
} from '@prisma/client';

export type GameSourceType = V1GameSourceType;
export type GameState = V1GameState;
export type GameEventType = V1GameEventType;
export type GameRevisionState = V1GameResultRevisionState;
export type GameSideKey = V1GameSideKey;

export type GameActorRole =
  | 'team_manager'
  | 'team_owner'
  | 'opponent_manager'
  | 'platform_ops'
  | 'tournament_director'
  | 'field_operator'
  | 'support_readonly';

export type GameActorScope =
  | {
      actorType: 'USER';
      actorUserId: string;
      role: GameActorRole;
      tournamentId?: string;
      fixtureId?: string;
      teamId?: string;
      authorizationSubject?: string;
    }
  | {
      actorType: 'SYSTEM';
      systemActor: 'GAME_END_DERIVER' | 'GAME_BACKFILL' | 'PROJECTION_REPAIR';
    };

export interface GameCommandContextInput {
  actor: GameActorScope;
  expectedVersion: number;
  currentVersion: number;
  headerIdempotencyKey: string;
  bodyClientCommandId: string;
  payloadHash: string;
  takeoverToken?: string;
}

export interface GameCommandContext {
  actor: GameActorScope;
  expectedVersion: number;
  durableCommandId: string;
  payloadHash: string;
  takeoverToken?: string;
}

export interface DurableGameCommandRecord<TResponse> {
  payloadHash: string;
  responseStatus: number;
  responseBody: TResponse;
}

export type GameIdempotencyDecision<TResponse> =
  | { kind: 'NEW' }
  | { kind: 'REPLAY'; responseStatus: number; responseBody: TResponse };

export interface GameSideCreationInput {
  sideKey: GameSideKey;
  teamId: string | null;
  displayNameSnapshot: string;
}

export interface GameParticipantCreationInput {
  sourceParticipantId: string;
  /** 이 참가자가 가리키는 사용자 — 대회 경기라면 등록 명단(V1TournamentPlayer)의 userId.
   * 이름 문자열만으로는 동명이인을 구분할 수 없어 라인업 화면이 명단과 대조하지 못한다. */
  userId?: string;
  sideKey: GameSideKey;
  displayNameSnapshot: string;
  jerseyNumber?: number;
  position?: string;
}

export interface GameSourceCreationInput {
  sourceType: GameSourceType;
  sourceId: string;
  competitionConfigVersionId: string;
  sides: readonly GameSideCreationInput[];
  participants: readonly GameParticipantCreationInput[];
}

export interface GameSourceSnapshot extends GameSourceCreationInput {
  sourceVersion: number;
}

export interface GameCreationResult {
  gameId: string;
  sourceType: GameSourceType;
  sourceId: string;
  competitionConfigVersionId: string;
  state: GameState;
  version: number;
}

export interface GameSourceAdapter<TTransaction> {
  readonly sourceType: GameSourceType;
  loadSnapshot(tx: TTransaction, sourceId: string): Promise<GameSourceSnapshot>;
  createGame(
    tx: TTransaction,
    input: GameSourceCreationInput,
    context: GameCommandContext,
  ): Promise<GameCreationResult>;
}

export interface GameMutationResult {
  gameId: string;
  state: GameState;
  version: number;
  durableCommandId: string;
  replayed: boolean;
}

/**
 * The wire shape of one committed `v1_game_events` row — mirrors the web
 * client's `GameEventRecord` (apps/v1_web/src/types/game-operations.ts)
 * field for field, INCLUDING `occurredAt`/`receivedAt` as already-ISO
 * strings (not `Date`): this is what actually crosses the socket, and it's
 * also embedded in `GameEventAppendResult`, which flows through
 * `jsonInput()`/`canonicalize()` for idempotency-record and audit-log
 * storage — `canonicalize()` recurses via `Object.entries()`, and
 * `Object.entries(new Date())` is `[]` (Date's timestamp isn't an own
 * enumerable property), so a raw `Date` here would silently persist as `{}`.
 * Pre-stringifying avoids that trap entirely instead of teaching
 * `canonicalize()` about `Date`.
 */
export interface PersistedGameEvent {
  id: string;
  gameId: string;
  sequence: number;
  clientEventId: string;
  payloadHash: string;
  type: GameEventType;
  sideId: string | null;
  participantId: string | null;
  assistParticipantId: string | null;
  period: number;
  clockMs: number;
  occurredAt: string;
  receivedAt: string;
  actorUserId: string;
  reversesEventId: string | null;
  payload: Record<string, unknown>;
}

export interface GameEventAppendResult extends GameMutationResult {
  clientEventId: string;
  sequence: number;
  /**
   * The FULL persisted event record — root-cause fix for the ops-console
   * realtime scoreboard bug (2026-08): `RealtimeGateway.acknowledgeGameEvent`
   * used to broadcast the client's raw, un-persisted request payload
   * (`input.event`) as if it were a complete `GameEventRecord`. That payload
   * never carries `id`/`reversesEventId` (the client can't know them before
   * the server assigns them), so every self-committed event landed in the
   * console's `liveEvents` with `id: undefined` and `reversesEventId:
   * undefined`. The scoreboard's `reversedIds` set is built from
   * `event.reversesEventId`, and `undefined !== null` — so that `undefined`
   * silently entered the set, which then matched (via `.has(event.id)`)
   * every OTHER event whose `id` was also `undefined`, including the event
   * itself. Every self-recorded goal was permanently treated as "already
   * reversed" and excluded from the score, only correcting itself on a full
   * reload (which rebuilds `liveEvents` from this same, real `listEvents()`
   * row shape). Optional because idempotent replays of requests stored
   * before this field existed won't have it — callers must tolerate its
   * absence (the frontend's own sequence-based de-dup already discards
   * replayed broadcasts, so an absent `event` on a replay is harmless).
   */
  event?: PersistedGameEvent;
  /**
   * Issue #376 follow-up -- present only on `assignGoalAssist` responses,
   * and only when that command's `syncAssistsIntoSubmittedRevision` (see
   * its doc comment in `games.service.ts`) actually superseded a SUBMITTED
   * result revision with a fresh, assist-synced successor to keep the
   * review screen honest against the amended event stream. `revisionId`/
   * `revision` describe the NEW successor (itself left `SUBMITTED`, still
   * awaiting review -- not the predecessor named by `supersedesRevisionId`,
   * which this command never mutates). Absent for every other command, and
   * absent on `assignGoalAssist` itself when there was no SUBMITTED
   * revision to sync or the resync would have been a no-op. This is the
   * only place the sync's diff is recorded -- it flows into `withCommand`'s
   * normal `V1OperationAudit` write (`after: response`) for the same
   * command, so the change stays traceable through the audit log this repo
   * already uses instead of a new mechanism (the successor revision itself
   * is also independently visible forever in `GET .../result-revisions`,
   * rendered by the existing `RevisionTimeline` UI like any other
   * revision).
   */
  revisionAssistSync?: {
    revisionId: string;
    revision: number;
    supersedesRevisionId: string;
    participants: Array<{ participantId: string; assistsBefore: number; assistsAfter: number }>;
  };
}

export interface GameRevisionMutationResult extends GameMutationResult {
  revisionId: string;
  revision: number;
  revisionState: GameRevisionState;
}

export interface GameScore {
  home: number;
  away: number;
  penalties?: {
    home: number;
    away: number;
    /**
     * 선축(먼저 찬 팀). 동전 던지기 결과라 점수 두 개로는 복원할 수 없다 —
     * 여기 없으면 "누가 먼저 찼는지"는 어디에도 남지 않는다.
     *
     * `penalties` **안쪽**에 두는 것이 중요하다. `GameScore`의 최상위에 새 키를
     * 두면 같은 형태를 공유하는 `GameScoreDto`가 `main.ts`의
     * `whitelist: true, forbidNonWhitelisted: true` 아래서 그 키를 여분 키로 보고
     * `400 VALIDATION_ERROR`를 낸다(알파 실측 사고). 중첩 객체 안에서도 whitelist는
     * 그대로 적용되므로, `PenaltyScoreDto`에 **선언하는 것이 곧 허용**이다.
     *
     * optional인 이유: 이 필드가 생기기 전에 저장된 리비전에는 값이 없다. 승부차기
     * 점수 자체는 그 리비전들에도 있으므로, 선축이 없다고 승부차기를 통째로
     * 버리면 결선 정정이 막힌다(`readStoredPenalties` 참고).
     */
    firstKickSideKey?: 'HOME' | 'AWAY';
    /**
     * 각 팀이 실제로 찬 킥 수. 점수(성공 수)만으로는 "홈 1킥 1:0 / 원정 0킥"과
     * "각 5킥 1:0"이 **같은 값**이라, 이게 없으면 서버는 승부차기가 끝났는지
     * 판정할 수 없다 — 예전 서버가 막을 수 있는 건 무승부뿐이었고 화면의
     * 가드는 API 를 직접 호출하면 그대로 우회됐다.
     *
     * 둘은 항상 함께 있거나 함께 없다(`extractEndPenalties`가 강제).
     * optional 인 이유는 `firstKickSideKey`와 같다 — 이 필드가 생기기 전에
     * 저장된 리비전을 정정하는 경로를 막지 않기 위해서다.
     */
    takenHome?: number;
    takenAway?: number;
    /**
     * 규칙상 아직 결판이 안 났는데 **운영자가 명시적으로 닫았다**는 표식.
     *
     * 면제 플래그가 아니라 **감사 기록**이다. 현장에서는 규칙보다 먼저 승부차기가
     * 끝난다(기권·선수 없음·심판 중단). 이 값이 리비전에 남아야 나중에 "이 결과는
     * 왜 규칙과 다른가"에 답할 수 있다 — 없으면 우회와 정상 종료가 기록상
     * 구분되지 않는다.
     *
     * 타입은 `boolean`이지만 **대회 레인은 `true`만 저장한다** —
     * `extractEndPenalties`가 `false`를 키 제거로 정규화한다. "우회 아님"이 키 부재와
     * false 두 가지 표현을 갖지 않게 하려는 것으로, 같은 파일이 `firstKickSideKey`에서
     * 지키는 불변식과 같다. (타입을 `true` 리터럴로 좁히지 않는 이유: 이 형태를
     * `GameScoreDto`와 공유하는데, DTO 입구는 클라이언트가 보낸 `false`를 400 으로
     * 되돌리지 않고 받아 정규화하는 편이 관용적이다.)
     */
    operatorOverride?: boolean;
  };
}

export interface GameResultSide {
  id: string;
  sideKey: 'HOME' | 'AWAY';
}

export interface GameResultParticipant {
  id: string;
  sideId: string;
  goals: number;
  cards: {
    yellow: number;
    red: number;
  };
  assists?: number;
  fouls?: number;
  minutesPlayed?: number;
}

export interface GameResultEvent {
  type: GameEventType | string;
  sideId?: string;
  participantId?: string;
  assistParticipantId?: string;
  period: number;
  clockMs: number;
  reversed?: boolean;
  card?: 'YELLOW' | 'RED';
}

export interface GameResultInvariantInput {
  // Task 17: TEAM_MATCH games are self-reported (no live officiating), so
  // validateGameResultInvariants exempts them from the event-vs-score
  // cross-check below. TOURNAMENT_FIXTURE keeps the strict event-derived
  // verification unchanged. See game-invariants.ts for the branch.
  sourceType: GameSourceType;
  score: GameScore;
  sides: readonly GameResultSide[];
  participants: readonly GameResultParticipant[];
  events: readonly GameResultEvent[];
  scorerPolicy: 'required' | 'optional_with_warning';
  missingScorer: boolean;
  mvpParticipantId?: string;
}

export type PublicGameVisibilityMode = 'hidden' | 'status_only' | 'live' | 'official_only';

export interface GameVisibilityPolicyInput {
  mode: PublicGameVisibilityMode;
  publicLiveEnabled: boolean;
  lineupEligible: boolean;
}

export interface GameVisibilitySnapshot<TLineup, TEvent, TRecord> {
  gameId: string;
  state: GameState;
  lineup: readonly TLineup[];
  liveScore: GameScore | null;
  liveEvents: readonly TEvent[];
  officialScore: GameScore | null;
  officialEvents: readonly TEvent[];
  officialRecords: readonly TRecord[];
}

export interface SerializedGameVisibility<TLineup, TEvent, TRecord> {
  gameId: string;
  state: GameState;
  effectiveMode: Exclude<PublicGameVisibilityMode, 'hidden'>;
  scoreStatus: 'unavailable' | 'live' | 'official';
  lineup: readonly TLineup[] | null;
  score: GameScore | null;
  events: readonly TEvent[];
  records: readonly TRecord[];
}

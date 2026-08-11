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

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

export interface GameEventAppendResult extends GameMutationResult {
  clientEventId: string;
  sequence: number;
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

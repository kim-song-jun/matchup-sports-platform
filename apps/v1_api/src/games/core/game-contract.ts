import { V1GameSourceType, V1GameState } from '@prisma/client';
import type {
  GameActorScope,
  GameCommandContext,
  GameCommandContextInput,
  DurableGameCommandRecord,
  GameIdempotencyDecision,
  GameSourceCreationInput,
} from '../games.types';

export type GameContractErrorCode =
  | 'COMMAND_IDEMPOTENCY_KEY_MISMATCH'
  | 'COMPETITION_CONFIG_REQUIRED'
  | 'EVENT_INVALID'
  | 'EVENT_STREAM_APPEND_ONLY'
  | 'INVALID_ACTOR_SCOPE'
  | 'INVALID_GAME_SOURCE'
  | 'INVALID_GAME_STATE'
  | 'INVALID_STATE_TRANSITION'
  | 'IDEMPOTENCY_PAYLOAD_CONFLICT'
  | 'PARTICIPANT_INVALID'
  | 'PARTICIPANT_SIDE_MISMATCH'
  | 'REVISION_CONTENT_FROZEN'
  | 'REVISION_MUST_BE_SUPERSEDED'
  | 'SCORE_EVENT_MISMATCH'
  | 'SCORE_INVALID'
  | 'SUBSTITUTION_INVALID'
  | 'SUBSTITUTION_OUT_NOT_ON_PITCH'
  | 'SUBSTITUTION_IN_ALREADY_ON_PITCH'
  | 'SUBSTITUTION_LIMIT_REACHED'
  // Task 166 BE-3: 롤링 교체 종목은 교체를 기록하지 않는다(정본 §3). 위 네 코드와 달리
  // **400** 으로 매핑된다 — 저것들은 "이 요청 내용이 규칙에 어긋난다" 이고 이건 "이
  // 경기에는 그 명령 자체가 없다" 라서, 다른 선수를 골라도 통과하지 않는다.
  | 'SUBSTITUTION_NOT_TRACKED'
  | 'TERMINAL_REVISION_IMMUTABLE'
  | 'VERSION_CONFLICT';

export class GameContractError extends Error {
  constructor(
    readonly code: GameContractErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'GameContractError';
  }
}

export type GameLifecycleTrigger = 'TOURNAMENT_COMMAND' | 'TEAM_RESULT_SUBMISSION' | 'CANCEL';

export interface GameLifecycleTransitionInput {
  sourceType: V1GameSourceType | string;
  trigger: GameLifecycleTrigger;
  from: V1GameState | string;
  to: V1GameState | string;
}

const gameStates = new Set<string>(Object.values(V1GameState));
const sourceTypes = new Set<string>(Object.values(V1GameSourceType));
const activeGameStates = new Set<V1GameState>([
  V1GameState.SCHEDULED,
  V1GameState.LIVE,
  V1GameState.PAUSED,
]);
// TEAM_RESULT_SUBMISSION is legitimately called twice in the correction loop:
// (1) the FIRST submission, which must move the Game out of an active state
// and into ENDED — that transition is what "ending the match" means, so it
// is restricted to activeGameStates exactly like before; and (2) a
// RESUBMISSION of a corrected revision, which is only reachable after the
// opponent has already put the first, already-ENDED game's revision into
// CHANGE_REQUESTED (createResultRevision refuses to mint a new DRAFT unless
// the latest revision for the game is CHANGE_REQUESTED — see its
// RESULT_REVISION_ALREADY_EXISTS guard). In case (2) the Game is already
// ENDED and stays ENDED; only the revision row's own state machine
// (DRAFT -> SUBMITTED) and the Game's version actually change. Allowing
// from === ENDED here therefore does not let anyone submit a "first" result
// against an ended game out of thin air — a submit call always needs a real
// revisionId already sitting in DRAFT, and a DRAFT can only exist post-ENDED
// as the product of a real change-request. CANCELLED is deliberately left
// out: cancellation is terminal and must never accept a result submission.
const teamResultSubmittableStates = new Set<V1GameState>([
  ...activeGameStates,
  V1GameState.ENDED,
]);
const actorRoles = new Set([
  'team_manager',
  'team_owner',
  'opponent_manager',
  'platform_ops',
  'tournament_director',
  'field_operator',
  'support_readonly',
]);
const systemActors = new Set(['GAME_END_DERIVER', 'GAME_BACKFILL', 'PROJECTION_REPAIR']);

export const TOURNAMENT_GAME_TRANSITIONS: Readonly<
  Record<V1GameState, readonly V1GameState[]>
> = Object.freeze({
  [V1GameState.SCHEDULED]: Object.freeze([V1GameState.LIVE, V1GameState.CANCELLED]),
  [V1GameState.LIVE]: Object.freeze([
    V1GameState.PAUSED,
    V1GameState.ENDED,
    V1GameState.CANCELLED,
  ]),
  [V1GameState.PAUSED]: Object.freeze([
    V1GameState.LIVE,
    V1GameState.ENDED,
    V1GameState.CANCELLED,
  ]),
  [V1GameState.ENDED]: Object.freeze([]),
  [V1GameState.CANCELLED]: Object.freeze([]),
});

function assertKnownState(state: string): asserts state is V1GameState {
  if (!gameStates.has(state)) {
    throw new GameContractError('INVALID_GAME_STATE', `Unknown game state: ${state}`);
  }
}

function assertKnownSource(sourceType: string): asserts sourceType is V1GameSourceType {
  if (!sourceTypes.has(sourceType)) {
    throw new GameContractError('INVALID_GAME_SOURCE', `Unknown game source: ${sourceType}`);
  }
}

export function assertGameLifecycleTransition(input: GameLifecycleTransitionInput): void {
  assertKnownSource(input.sourceType);
  assertKnownState(input.from);
  assertKnownState(input.to);

  let allowed = false;
  if (input.trigger === 'TOURNAMENT_COMMAND') {
    allowed =
      input.sourceType === V1GameSourceType.TOURNAMENT_FIXTURE &&
      TOURNAMENT_GAME_TRANSITIONS[input.from].includes(input.to);
  } else if (input.trigger === 'TEAM_RESULT_SUBMISSION') {
    allowed =
      input.sourceType === V1GameSourceType.TEAM_MATCH &&
      input.to === V1GameState.ENDED &&
      teamResultSubmittableStates.has(input.from);
  } else {
    allowed =
      input.to === V1GameState.CANCELLED &&
      activeGameStates.has(input.from);
  }

  if (!allowed) {
    throw new GameContractError(
      'INVALID_STATE_TRANSITION',
      `${input.sourceType}/${input.trigger} cannot transition ${input.from} to ${input.to}`,
      {
        sourceType: input.sourceType,
        trigger: input.trigger,
        from: input.from,
        to: input.to,
      },
    );
  }
}

function assertActor(actor: GameActorScope): void {
  if (actor.actorType === 'USER') {
    if (actor.actorUserId.trim().length === 0 || !actorRoles.has(actor.role)) {
      throw new GameContractError('INVALID_ACTOR_SCOPE', 'User actor scope is incomplete');
    }
    return;
  }
  if (actor.actorType === 'SYSTEM' && systemActors.has(actor.systemActor)) {
    return;
  }
  throw new GameContractError('INVALID_ACTOR_SCOPE', 'Actor scope is invalid');
}

export function resolveGameIdempotency<TResponse>(
  existing: DurableGameCommandRecord<TResponse> | null,
  incomingPayloadHash: string,
): GameIdempotencyDecision<TResponse> {
  if (!/^[a-f0-9]{64}$/i.test(incomingPayloadHash)) {
    throw new GameContractError('EVENT_INVALID', 'Payload hash must be a SHA-256 hex digest');
  }
  if (existing === null) {
    return { kind: 'NEW' };
  }
  if (existing.payloadHash.toLowerCase() !== incomingPayloadHash.toLowerCase()) {
    throw new GameContractError(
      'IDEMPOTENCY_PAYLOAD_CONFLICT',
      'Durable command ID was already used with a different payload',
    );
  }
  return {
    kind: 'REPLAY',
    responseStatus: existing.responseStatus,
    responseBody: existing.responseBody,
  };
}

export function assertGameCommandContext(input: GameCommandContextInput): GameCommandContext {
  assertActor(input.actor);
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new GameContractError('VERSION_CONFLICT', 'Expected version must be a non-negative integer');
  }
  if (input.expectedVersion !== input.currentVersion) {
    throw new GameContractError('VERSION_CONFLICT', 'Expected version is stale', {
      expectedVersion: input.expectedVersion,
      currentVersion: input.currentVersion,
    });
  }

  const headerCommandId = input.headerIdempotencyKey.trim();
  const bodyCommandId = input.bodyClientCommandId.trim();
  if (headerCommandId.length === 0 || headerCommandId !== bodyCommandId) {
    throw new GameContractError(
      'COMMAND_IDEMPOTENCY_KEY_MISMATCH',
      'Idempotency-Key and clientCommandId must be the same non-empty value',
    );
  }
  if (!/^[a-f0-9]{64}$/i.test(input.payloadHash)) {
    throw new GameContractError('EVENT_INVALID', 'Payload hash must be a SHA-256 hex digest');
  }

  return {
    actor: input.actor,
    expectedVersion: input.expectedVersion,
    durableCommandId: headerCommandId,
    payloadHash: input.payloadHash.toLowerCase(),
    ...(input.takeoverToken === undefined ? {} : { takeoverToken: input.takeoverToken }),
  };
}

export function assertGameSourceCreationInput(input: GameSourceCreationInput): void {
  assertKnownSource(input.sourceType);
  if (input.sourceId.trim().length === 0) {
    throw new GameContractError('INVALID_GAME_SOURCE', 'Source ID is required');
  }
  if (input.competitionConfigVersionId.trim().length === 0) {
    throw new GameContractError(
      'COMPETITION_CONFIG_REQUIRED',
      'An immutable competition config version pin is required',
    );
  }
  if (input.sides.length !== 2) {
    throw new GameContractError('INVALID_GAME_SOURCE', 'A game requires exactly two sides');
  }
  const sideKeys = new Set(input.sides.map((side) => side.sideKey));
  if (sideKeys.size !== 2 || !sideKeys.has('HOME') || !sideKeys.has('AWAY')) {
    throw new GameContractError('INVALID_GAME_SOURCE', 'A game requires HOME and AWAY sides');
  }
  const participantIds = new Set<string>();
  for (const participant of input.participants) {
    if (participantIds.has(participant.sourceParticipantId)) {
      throw new GameContractError('PARTICIPANT_INVALID', 'Source participant IDs must be unique');
    }
    participantIds.add(participant.sourceParticipantId);
    if (!sideKeys.has(participant.sideKey)) {
      throw new GameContractError('PARTICIPANT_INVALID', 'Participant side does not exist');
    }
  }
}

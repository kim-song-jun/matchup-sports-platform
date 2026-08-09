import { V1GameResultRevisionState } from '@prisma/client';
import { GameContractError } from './game-contract';

export type RevisionFlow = 'STANDARD' | 'CORRECTION';
export type RevisionMutation = 'CONTENT' | 'PARTICIPANTS' | 'STATE' | 'DELETE';
export type AppendOnlyEventOperation = 'APPEND' | 'UPDATE' | 'DELETE';

export const TERMINAL_REVISION_STATES = Object.freeze([
  V1GameResultRevisionState.CHANGE_REQUESTED,
  V1GameResultRevisionState.SUPPLEMENT_REQUESTED,
  V1GameResultRevisionState.REJECTED,
  V1GameResultRevisionState.OFFICIAL,
  V1GameResultRevisionState.VOID,
] as const);

const terminalStates = new Set<V1GameResultRevisionState>(TERMINAL_REVISION_STATES);

export interface RevisionTransitionInput {
  from: V1GameResultRevisionState;
  to: V1GameResultRevisionState;
  flow: RevisionFlow;
}

export type RevisionSupersessionPurpose =
  | 'TEAM_RESUBMISSION'
  | 'TOURNAMENT_RESUBMISSION'
  | 'CORRECTION';

export interface RevisionSupersessionInput {
  baseGameId: string;
  successorGameId: string;
  baseRevisionId: string;
  supersedesRevisionId: string;
  baseState: V1GameResultRevisionState;
  successorState: V1GameResultRevisionState;
  purpose: RevisionSupersessionPurpose;
}

const standardSubmittedTargets = new Set<V1GameResultRevisionState>([
  V1GameResultRevisionState.CHANGE_REQUESTED,
  V1GameResultRevisionState.SUPPLEMENT_REQUESTED,
  V1GameResultRevisionState.REJECTED,
  V1GameResultRevisionState.OFFICIAL,
]);
const correctionTargets = new Set<V1GameResultRevisionState>([
  V1GameResultRevisionState.OFFICIAL,
  V1GameResultRevisionState.VOID,
]);

export function assertRevisionTransition(input: RevisionTransitionInput): void {
  if (terminalStates.has(input.from)) {
    const code =
      input.from === V1GameResultRevisionState.OFFICIAL &&
      input.to === V1GameResultRevisionState.DRAFT
        ? 'REVISION_MUST_BE_SUPERSEDED'
        : 'TERMINAL_REVISION_IMMUTABLE';
    throw new GameContractError(
      code,
      `Revision ${input.from} cannot be mutated; create a superseding revision`,
    );
  }

  const allowed =
    (input.from === V1GameResultRevisionState.DRAFT &&
      input.to === V1GameResultRevisionState.SUBMITTED) ||
    (input.from === V1GameResultRevisionState.SUBMITTED &&
      standardSubmittedTargets.has(input.to)) ||
    (input.flow === 'CORRECTION' &&
      input.from === V1GameResultRevisionState.DRAFT &&
      correctionTargets.has(input.to));

  if (!allowed) {
    throw new GameContractError(
      'REVISION_MUST_BE_SUPERSEDED',
      `Revision transition ${input.from} to ${input.to} is not allowed for ${input.flow}`,
    );
  }
}

export function assertRevisionMutationAllowed(
  state: V1GameResultRevisionState,
  mutation: RevisionMutation,
): void {
  if (terminalStates.has(state)) {
    throw new GameContractError(
      'TERMINAL_REVISION_IMMUTABLE',
      `Terminal revision ${state} rejects ${mutation}`,
    );
  }
  if (
    state === V1GameResultRevisionState.SUBMITTED &&
    (mutation === 'CONTENT' || mutation === 'PARTICIPANTS' || mutation === 'DELETE')
  ) {
    throw new GameContractError(
      'REVISION_CONTENT_FROZEN',
      `Submitted revision rejects ${mutation}`,
    );
  }
}

export function assertRevisionSupersession(input: RevisionSupersessionInput): void {
  const validBase =
    (input.purpose === 'TEAM_RESUBMISSION' &&
      input.baseState === V1GameResultRevisionState.CHANGE_REQUESTED) ||
    (input.purpose === 'TOURNAMENT_RESUBMISSION' &&
      [V1GameResultRevisionState.REJECTED, V1GameResultRevisionState.SUPPLEMENT_REQUESTED].some(
        (state) => state === input.baseState,
      )) ||
    (input.purpose === 'CORRECTION' && input.baseState === V1GameResultRevisionState.OFFICIAL);
  if (
    !validBase ||
    input.successorState !== V1GameResultRevisionState.DRAFT ||
    input.baseGameId !== input.successorGameId ||
    input.baseRevisionId !== input.supersedesRevisionId
  ) {
    throw new GameContractError(
      'REVISION_MUST_BE_SUPERSEDED',
      'Successor must be a same-game draft pointing at an allowed immutable base revision',
    );
  }
}

export function assertAppendOnlyEventOperation(operation: AppendOnlyEventOperation): void {
  if (operation !== 'APPEND') {
    throw new GameContractError(
      'EVENT_STREAM_APPEND_ONLY',
      `Game events are append-only; ${operation} is forbidden`,
    );
  }
}

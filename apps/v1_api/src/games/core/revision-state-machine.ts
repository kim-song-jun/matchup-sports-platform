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
  | 'CORRECTION'
  | 'VOID_REENTRY'
  | 'ASSIST_SYNC';

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
    (input.purpose === 'CORRECTION' && input.baseState === V1GameResultRevisionState.OFFICIAL) ||
    // 무효 처리(VOID)는 경기의 끝이 아니라 '현재 유효한 공식 결과 없음' 상태예요.
    // 권한자가 VOID 리비전을 base 로 새 DRAFT 를 만들어 다시 확정할 수 있어야
    // 경기가 미확정으로 고착되지 않아요. 기존 공식·무효 리비전은 그대로 남아요.
    (input.purpose === 'VOID_REENTRY' && input.baseState === V1GameResultRevisionState.VOID) ||
    // Issue #376 follow-up: assignGoalAssist amends a GOAL event's assist
    // after the game already auto-derived+submitted its first revision. The
    // DB trigger v1_guard_result_participant_mutation (see
    // prisma/migrations/20260729000100_v1_game_operations) forbids writing
    // v1_game_result_participants for any revision whose state isn't DRAFT
    // -- SUBMITTED included -- so the SUBMITTED revision itself can never be
    // patched in place. ASSIST_SYNC lets a SUBMITTED revision be the base of
    // a fresh DRAFT successor (which the caller must still submit itself,
    // same as every other purpose here), reusing the exact
    // supersede-then-submit mechanism TOURNAMENT_RESUBMISSION already uses
    // instead of a new one. The base SUBMITTED row is left exactly as it
    // was (matching every other purpose above) -- see
    // syncAssistsIntoSubmittedRevision's doc comment in games.service.ts
    // for why, and for how officializeResultRevision independently refuses
    // to officialize a SUBMITTED revision that ASSIST_SYNC has since
    // superseded.
    (input.purpose === 'ASSIST_SYNC' && input.baseState === V1GameResultRevisionState.SUBMITTED);
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

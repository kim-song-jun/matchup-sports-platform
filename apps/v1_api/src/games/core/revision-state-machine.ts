import { V1GameResultRevisionState } from '@prisma/client';
import { GameContractError } from './game-contract';

export type RevisionFlow = 'STANDARD' | 'CORRECTION';
export type RevisionMutation = 'CONTENT' | 'PARTICIPANTS' | 'STATE' | 'DELETE';
export type AppendOnlyEventOperation = 'APPEND' | 'UPDATE' | 'DELETE';

/**
 * Task 166: `SUPPLEMENT_REQUESTED` · `REJECTED` 를 없앴다. 그 둘은 **어드민이 팀에게
 * 결과를 되돌려 보내는 왕복**이었고, 정본 §4 가 "결과는 보내기 → 확인 한 단계, 이의 없음"
 * 으로 확정하면서 그 왕복 자체가 사라졌다. 어드민이 틀린 결과를 만나면 되돌려 보내지 않고
 * **그 자리에서 고쳐 확정한다**(supersede-and-submit 의 SUBMITTED base — 아래).
 *
 * `CHANGE_REQUESTED` 는 남는다. 이름이 "요청" 이라 왕복처럼 읽히지만 실제 역할은
 * **팀 매치 레인의 재작성 허용 상태**(팀 왕복이 아니다)다 — 그 레인의
 * `createResultRevision` 이 새 DRAFT 를 만들 수 있는 유일한 선행 상태이고, 이걸 없애면
 * 결과를 다시 넣을 방법이 사라진다
 * (games.service.ts 의 같은 자리 주석에 "이의 수락으로 무효 처리된 리그 대진은 결과를 다시
 * 넣을 방법이 전혀 없어 시즌 승강이 영구히 막혔다" 는 실사고가 적혀 있다).
 *
 * **대회 픽스처 레인에서는 다르다.** 거기서 `CHANGE_REQUESTED` 는 아래 목록에 있는 그대로
 * terminal(불변)이고, 재작성 경로가 아니다 — `createResultRevision` 은 대회 픽스처를 앞에서
 * 거부하고, `supersedeAndSubmit` 의 base 는 contract 이후 `SUBMITTED` 뿐이다. 그래서
 * contract 마이그레이션은 되살려야 할 옛 행을 `CHANGE_REQUESTED` 가 아니라 `SUBMITTED` 로
 * 보낸다(조건 셋을 만족할 때만).
 *
 * contract 단계(2026-09-03)에서 두 값을 **여기서도** 뺐다. expand 때 남겨 둔 이유는 "이미
 * 그 상태로 저장된 행이 갑자기 변경 가능해지면 안 된다" 였는데, 그 행들을 마이그레이션이
 * CHANGE_REQUESTED 로 옮겼으므로 지킬 대상이 더 없다.
 */
export const TERMINAL_REVISION_STATES = Object.freeze([
  V1GameResultRevisionState.CHANGE_REQUESTED,
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
    // Task 166: base 에 `SUBMITTED` 가 **더해졌다**. 예전엔 REJECTED/SUPPLEMENT_REQUESTED
    // 뿐이었는데, 그 두 상태는 "어드민이 팀에게 되돌려 보냈다" 는 뜻이라 팀이 다시
    // 제출하는 왕복을 전제했다. 그 왕복이 사라진 지금(정본 §4) 어드민은 **제출된 결과를
    // 그 자리에서 고쳐** 새 리비전으로 대체한다.
    //
    // 레거시 두 상태는 contract 단계(2026-09-03)에서 뺐다 — 마이그레이션이 그 행들을
    // CHANGE_REQUESTED 로 옮겨 base 가 될 행 자체가 없다.
    //
    // 누가 할 수 있는지는 여기서 정하지 않는다 — `supersedeAndSubmit` 이
    // `staffAccess.assertAccess({ action: 'result_review' })` 를 지나므로 팀 actor 는 그
    // 경계에서 403 이다(이 함수는 상태만 본다).
    (input.purpose === 'TOURNAMENT_RESUBMISSION' &&
      input.baseState === V1GameResultRevisionState.SUBMITTED) ||
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

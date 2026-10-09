import { V1GameResultRevisionState } from '@prisma/client';
import { assertRevisionSupersession, assertRevisionTransition } from './revision-state-machine';

/**
 * 리비전 승계(supersession) 규칙.
 *
 * #380 — 무효 처리(VOID)는 "경기의 끝"이 아니라 "지금 유효한 공식 결과가 없음"이다.
 * 예전에는 VOID 를 base 로 새 리비전을 만들 수 없어, 한 번 무효 처리한 경기가 결과
 * 미확정으로 영구 고착됐다(운영자가 올바른 결과를 다시 넣을 방법이 없었다).
 */
const base = {
  baseGameId: 'game-1',
  successorGameId: 'game-1',
  baseRevisionId: 'rev-1',
  supersedesRevisionId: 'rev-1',
  successorState: V1GameResultRevisionState.DRAFT,
} as const;

describe('assertRevisionSupersession', () => {
  it('무효 처리된 리비전을 기반으로 새 초안을 만들 수 있다', () => {
    expect(() =>
      assertRevisionSupersession({
        ...base,
        purpose: 'VOID_REENTRY',
        baseState: V1GameResultRevisionState.VOID,
      }),
    ).not.toThrow();
  });

  it('무효 재입력은 무효 상태에서만 시작할 수 있다', () => {
    // 공식 결과를 VOID_REENTRY 로 덮어쓰는 우회를 막는다 — 그건 CORRECTION 의 몫이다.
    expect(() =>
      assertRevisionSupersession({
        ...base,
        purpose: 'VOID_REENTRY',
        baseState: V1GameResultRevisionState.OFFICIAL,
      }),
    ).toThrow();
  });

  it('기존 정정 규칙은 그대로 유지된다', () => {
    expect(() =>
      assertRevisionSupersession({
        ...base,
        purpose: 'CORRECTION',
        baseState: V1GameResultRevisionState.OFFICIAL,
      }),
    ).not.toThrow();

    // 정정은 무효 상태에서 시작할 수 없다(그건 VOID_REENTRY 다)
    expect(() =>
      assertRevisionSupersession({
        ...base,
        purpose: 'CORRECTION',
        baseState: V1GameResultRevisionState.VOID,
      }),
    ).toThrow();
  });

  it('승계 결과는 언제나 초안이어야 한다', () => {
    expect(() =>
      assertRevisionSupersession({
        ...base,
        purpose: 'VOID_REENTRY',
        baseState: V1GameResultRevisionState.VOID,
        successorState: V1GameResultRevisionState.OFFICIAL,
      }),
    ).toThrow();
  });

  /**
   * #376 follow-up — assignGoalAssist amends a GOAL event's assist after the
   * game's first revision is already SUBMITTED. v1_guard_result_participant_
   * mutation (a DB trigger, prisma/migrations/20260729000100_v1_game_operations)
   * rejects any write to v1_game_result_participants unless the owning
   * revision is DRAFT, so the SUBMITTED revision can never be patched in
   * place — ASSIST_SYNC lets it be superseded by a fresh DRAFT successor
   * instead, the same supersede-then-submit shape TOURNAMENT_RESUBMISSION
   * already uses.
   */
  it('제출된 리비전을 기반으로 어시스트 동기화용 새 초안을 만들 수 있다', () => {
    expect(() =>
      assertRevisionSupersession({
        ...base,
        purpose: 'ASSIST_SYNC',
        baseState: V1GameResultRevisionState.SUBMITTED,
      }),
    ).not.toThrow();
  });

  it('어시스트 동기화는 제출된 상태에서만 시작할 수 있다', () => {
    // 확정된(OFFICIAL) 결과를 ASSIST_SYNC 로 덮어쓰는 우회를 막는다 — 그건
    // CORRECTION 의 몫이다(assignGoalAssist 자체도 OFFICIAL 리비전이 있는
    // 경기는 커맨드 진입 자체를 거부한다).
    expect(() =>
      assertRevisionSupersession({
        ...base,
        purpose: 'ASSIST_SYNC',
        baseState: V1GameResultRevisionState.OFFICIAL,
      }),
    ).toThrow();

    expect(() =>
      assertRevisionSupersession({
        ...base,
        purpose: 'ASSIST_SYNC',
        baseState: V1GameResultRevisionState.DRAFT,
      }),
    ).toThrow();
  });
});

describe('assertRevisionTransition — ADMIN_QUICK', () => {
  const { DRAFT, OFFICIAL, VOID } = V1GameResultRevisionState;

  it('어드민 빠른 입력 흐름만 초안을 곧바로 확정할 수 있다', () => {
    expect(() => assertRevisionTransition({ from: DRAFT, to: OFFICIAL, flow: 'ADMIN_QUICK' })).not.toThrow();
  });

  it('대조군 — STANDARD 는 초안 직행 확정이 여전히 막혀 있다', () => {
    expect(() => assertRevisionTransition({ from: DRAFT, to: OFFICIAL, flow: 'STANDARD' })).toThrow(
      expect.objectContaining({ code: 'REVISION_MUST_BE_SUPERSEDED' }),
    );
  });

  it('대조군 — CORRECTION 의 기존 허용은 그대로다', () => {
    expect(() => assertRevisionTransition({ from: DRAFT, to: OFFICIAL, flow: 'CORRECTION' })).not.toThrow();
  });

  it('빠른 입력 흐름도 초안 → 무효 직행은 열지 않는다', () => {
    expect(() => assertRevisionTransition({ from: DRAFT, to: VOID, flow: 'ADMIN_QUICK' })).toThrow(
      expect.objectContaining({ code: 'REVISION_MUST_BE_SUPERSEDED' }),
    );
  });

  it('이미 확정된 리비전은 빠른 입력 흐름으로도 고칠 수 없다', () => {
    expect(() => assertRevisionTransition({ from: OFFICIAL, to: DRAFT, flow: 'ADMIN_QUICK' })).toThrow(
      expect.objectContaining({ code: 'REVISION_MUST_BE_SUPERSEDED' }),
    );
    expect(() => assertRevisionTransition({ from: OFFICIAL, to: OFFICIAL, flow: 'ADMIN_QUICK' })).toThrow(
      expect.objectContaining({ code: 'TERMINAL_REVISION_IMMUTABLE' }),
    );
  });
});

describe('assertRevisionTransition — TEAM_CHANGE', () => {
  it.each([V1GameResultRevisionState.DRAFT, V1GameResultRevisionState.SUBMITTED])('%s 를 VOID 로 폐기할 수 있다', (from) => {
    expect(() => assertRevisionTransition({ from, to: V1GameResultRevisionState.VOID, flow: 'TEAM_CHANGE' })).not.toThrow();
  });

  it('공식 결과는 이 흐름으로 무효화할 수 없고, 다른 흐름은 미확정 결과를 VOID 로 못 보낸다', () => {
    expect(() => assertRevisionTransition({ from: V1GameResultRevisionState.OFFICIAL, to: V1GameResultRevisionState.VOID, flow: 'TEAM_CHANGE' })).toThrow();
    expect(() => assertRevisionTransition({ from: V1GameResultRevisionState.SUBMITTED, to: V1GameResultRevisionState.VOID, flow: 'STANDARD' })).toThrow();
  });
});

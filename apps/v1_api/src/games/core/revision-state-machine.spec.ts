import { V1GameResultRevisionState } from '@prisma/client';
import { assertRevisionSupersession } from './revision-state-machine';

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
});

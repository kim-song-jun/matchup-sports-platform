import { BadRequestException } from '@nestjs/common';
import { FUTSAL_V1_CONFIG, REQUIRED_TIE_BREAK_ORDER } from './competition-config.presets';
import {
  assertValidTieBreakOrder,
  normalizeTieBreakOrderForStorage,
  resolveTieBreakOrder,
  withTournamentTieBreakOrder,
} from './tournament-tie-break-order';

const GOALS_FIRST = ['points', 'goal_difference', 'goals_for', 'head_to_head', 'fair_play', 'seeded_draw'];

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof BadRequestException) return (error.getResponse() as { code?: string }).code;
    throw error;
  }
  return undefined;
}

describe('assertValidTieBreakOrder', () => {
  it('승점 처음 · 추첨 마지막 사이에서 네 기준을 어떤 순서로 놓아도 받는다', () => {
    expect(assertValidTieBreakOrder(GOALS_FIRST)).toEqual(GOALS_FIRST);
    expect(assertValidTieBreakOrder([...REQUIRED_TIE_BREAK_ORDER])).toEqual(REQUIRED_TIE_BREAK_ORDER);
  });

  it.each([
    ['배열이 아님', 'points'],
    ['빈 배열', []],
    ['기준 하나 누락', ['points', 'head_to_head', 'goal_difference', 'goals_for', 'seeded_draw']],
    ['기준 중복(득실차 두 번)', ['points', 'goal_difference', 'goal_difference', 'goals_for', 'fair_play', 'seeded_draw']],
    ['모르는 기준', ['points', 'head_to_head', 'goal_difference', 'goals_for', 'fewest_goals_against', 'seeded_draw']],
    ['승점이 처음이 아님', ['head_to_head', 'points', 'goal_difference', 'goals_for', 'fair_play', 'seeded_draw']],
    ['추첨이 마지막이 아님', ['points', 'head_to_head', 'goal_difference', 'seeded_draw', 'goals_for', 'fair_play']],
    ['추첨이 맨 앞쪽(승점 다음)', ['points', 'seeded_draw', 'head_to_head', 'goal_difference', 'goals_for', 'fair_play']],
    ['문자열이 아닌 원소', ['points', 1, 'goal_difference', 'goals_for', 'fair_play', 'seeded_draw']],
  ])('거절한다 — %s', (_label, value) => {
    expect(codeOf(() => assertValidTieBreakOrder(value))).toBe('TIE_BREAK_ORDER_INVALID');
  });
});

describe('normalizeTieBreakOrderForStorage', () => {
  it('기본 순서와 같으면 null 로 저장한다 — 안 건드린 대회와 같은 상태', () => {
    expect(normalizeTieBreakOrderForStorage([...REQUIRED_TIE_BREAK_ORDER])).toBeNull();
  });

  it('null 은 기본값으로 되돌리기라 그대로 null', () => {
    expect(normalizeTieBreakOrderForStorage(null)).toBeNull();
  });

  it('다른 순서는 검증한 배열 그대로 저장한다', () => {
    expect(normalizeTieBreakOrderForStorage(GOALS_FIRST)).toEqual(GOALS_FIRST);
  });

  it('잘못된 순서는 저장 전에 거절한다', () => {
    expect(codeOf(() => normalizeTieBreakOrderForStorage(['points', 'seeded_draw']))).toBe('TIE_BREAK_ORDER_INVALID');
  });
});

describe('resolveTieBreakOrder', () => {
  it('저장값이 없으면 지금까지 쓰던 순서다', () => {
    expect(resolveTieBreakOrder(null)).toEqual(REQUIRED_TIE_BREAK_ORDER);
    expect(resolveTieBreakOrder(undefined)).toEqual(REQUIRED_TIE_BREAK_ORDER);
  });

  it('저장값이 있으면 그 순서다', () => {
    expect(resolveTieBreakOrder(GOALS_FIRST)).toEqual(GOALS_FIRST);
  });

  it('손상된 저장값은 기본 순서로 덮지 않고 오류로 드러낸다', () => {
    expect(() => resolveTieBreakOrder(['points'])).toThrow(BadRequestException);
  });
});

describe('withTournamentTieBreakOrder', () => {
  it('대회 순서를 설정 사본의 tieBreak.order 에 얹고 승점 규칙은 그대로 둔다', () => {
    const applied = withTournamentTieBreakOrder(FUTSAL_V1_CONFIG, GOALS_FIRST);
    expect(applied.tieBreak.order).toEqual(GOALS_FIRST);
    expect(applied.tieBreak.points).toEqual(FUTSAL_V1_CONFIG.tieBreak.points);
  });

  it('공유 설정 판 객체를 바꾸지 않는다', () => {
    const before = JSON.stringify(FUTSAL_V1_CONFIG);
    withTournamentTieBreakOrder(FUTSAL_V1_CONFIG, GOALS_FIRST);
    expect(JSON.stringify(FUTSAL_V1_CONFIG)).toBe(before);
    expect(FUTSAL_V1_CONFIG.tieBreak.order).toEqual(REQUIRED_TIE_BREAK_ORDER);
  });

  it('저장값이 없으면 설정 판의 순서를 그대로 쓴다', () => {
    expect(withTournamentTieBreakOrder(FUTSAL_V1_CONFIG, null).tieBreak.order).toEqual(REQUIRED_TIE_BREAK_ORDER);
  });
});

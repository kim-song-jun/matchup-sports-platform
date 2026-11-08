import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOURNAMENT_TIE_BREAK_ORDER,
  formatTournamentTieBreakRule,
  moveTieBreakCriterion,
  sameTieBreakOrder,
} from './tournament-tie-break';

describe('moveTieBreakCriterion', () => {
  it('가운데 칸을 한 칸 아래로 옮기면 바로 아래 칸과 자리를 바꾼다', () => {
    expect(moveTieBreakCriterion(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, 1, 1)).toEqual([
      'points', 'goal_difference', 'head_to_head', 'goals_for', 'fair_play', 'seeded_draw',
    ]);
  });

  it('가운데 칸을 한 칸 위로 옮기면 바로 위 칸과 자리를 바꾼다', () => {
    expect(moveTieBreakCriterion(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, 4, -1)).toEqual([
      'points', 'head_to_head', 'goal_difference', 'fair_play', 'goals_for', 'seeded_draw',
    ]);
  });

  it('승점 아래로 올리거나 추첨 위로 내리면 고정 칸을 건드리지 않고 그대로다', () => {
    expect(moveTieBreakCriterion(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, 1, -1)).toEqual(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER);
    expect(moveTieBreakCriterion(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, 4, 1)).toEqual(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER);
  });

  it('고정 칸 자체는 움직이지 않는다', () => {
    expect(moveTieBreakCriterion(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, 0, 1)).toEqual(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER);
    expect(moveTieBreakCriterion(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, 5, -1)).toEqual(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER);
  });

  it('받은 배열을 바꾸지 않는다', () => {
    const before = [...DEFAULT_TOURNAMENT_TIE_BREAK_ORDER];
    moveTieBreakCriterion(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, 2, 1);
    expect(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER).toEqual(before);
  });
});

describe('sameTieBreakOrder', () => {
  it('같은 순서만 같다고 본다', () => {
    expect(sameTieBreakOrder(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, [...DEFAULT_TOURNAMENT_TIE_BREAK_ORDER])).toBe(true);
    expect(sameTieBreakOrder(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, moveTieBreakCriterion(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, 1, 1))).toBe(false);
  });
});

describe('formatTournamentTieBreakRule', () => {
  it('순서대로 한국어 라벨을 화살표로 잇는다', () => {
    expect(formatTournamentTieBreakRule(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER)).toBe('승점 → 맞대결 → 득실차 → 다득점 → 페어플레이 → 추첨');
  });

  it('라벨을 모르는 값은 내부 식별자를 노출하지 않고 버린다', () => {
    expect(formatTournamentTieBreakRule(['points', 'fewest_goals_against', 'seeded_draw'])).toBe('승점 → 추첨');
  });
});

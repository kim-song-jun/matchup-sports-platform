import { BadRequestException } from '@nestjs/common';
import { FUTSAL_V1_CONFIG, REQUIRED_TIE_BREAK_ORDER } from './competition-config.presets';
import {
  assertValidTieBreakOrder,
  DEFAULT_TIE_BREAK_ORDER,
  normalizeSixTeamDirectFinalOrderForStorage,
  normalizeTieBreakOrderForStorage,
  resolveSixTeamDirectFinalOrder,
  resolveStageTieBreakOrder,
  resolveTieBreakOrder,
  withTournamentTieBreakOrder,
} from './tournament-tie-break-order';
import { matchTieBreakPreset, TOURNAMENT_TIE_BREAK_PRESETS } from './tournament-tie-break-presets';

const GOALS_FIRST = ['points', 'goal_difference', 'goals_for', 'head_to_head', 'fair_play', 'fewest_goals_against', 'seeded_draw'];
const LEGACY_GOALS_FIRST = ['points', 'goal_difference', 'goals_for', 'head_to_head', 'fair_play', 'seeded_draw'];
const FEWEST_AGAINST_FIRST = ['points', 'fewest_goals_against', 'head_to_head', 'goal_difference', 'goals_for', 'fair_play', 'seeded_draw'];

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
  it('승점 처음 · 추첨 마지막 사이에서 다섯 기준을 어떤 순서로 놓아도 받는다', () => {
    expect(assertValidTieBreakOrder(GOALS_FIRST)).toEqual(GOALS_FIRST);
    expect(assertValidTieBreakOrder(FEWEST_AGAINST_FIRST)).toEqual(FEWEST_AGAINST_FIRST);
    expect(assertValidTieBreakOrder([...DEFAULT_TIE_BREAK_ORDER])).toEqual(DEFAULT_TIE_BREAK_ORDER);
  });

  it('MD-QA #186 전의 6칸 순서는 추첨 바로 앞에 최소 실점을 넣은 7칸으로 읽는다', () => {
    expect(assertValidTieBreakOrder(LEGACY_GOALS_FIRST)).toEqual(GOALS_FIRST);
    expect(assertValidTieBreakOrder([...REQUIRED_TIE_BREAK_ORDER])).toEqual(DEFAULT_TIE_BREAK_ORDER);
  });

  it.each([
    ['배열이 아님', 'points'],
    ['빈 배열', []],
    ['기준 두 개 누락', ['points', 'head_to_head', 'goal_difference', 'goals_for', 'seeded_draw']],
    ['기준 중복(득실차 두 번)', ['points', 'goal_difference', 'goal_difference', 'goals_for', 'fair_play', 'fewest_goals_against', 'seeded_draw']],
    ['6칸인데 최소 실점이 페어플레이를 대신함', ['points', 'head_to_head', 'goal_difference', 'goals_for', 'fewest_goals_against', 'seeded_draw']],
    ['모르는 기준', ['points', 'head_to_head', 'goal_difference', 'goals_for', 'fair_play', 'most_wins', 'seeded_draw']],
    ['승점이 처음이 아님', ['head_to_head', 'points', 'goal_difference', 'goals_for', 'fair_play', 'fewest_goals_against', 'seeded_draw']],
    ['추첨이 마지막이 아님', ['points', 'head_to_head', 'goal_difference', 'seeded_draw', 'goals_for', 'fair_play', 'fewest_goals_against']],
    ['문자열이 아닌 원소', ['points', 1, 'goal_difference', 'goals_for', 'fair_play', 'fewest_goals_against', 'seeded_draw']],
    ['8칸', [...GOALS_FIRST.slice(0, 6), 'fair_play', 'seeded_draw']],
  ])('거절한다 — %s', (_label, value) => {
    expect(codeOf(() => assertValidTieBreakOrder(value))).toBe('TIE_BREAK_ORDER_INVALID');
  });
});

describe('normalizeTieBreakOrderForStorage', () => {
  it('기본 순서와 같으면(옛 6칸 기본 포함) null 로 저장한다 — 안 건드린 대회와 같은 상태', () => {
    expect(normalizeTieBreakOrderForStorage([...DEFAULT_TIE_BREAK_ORDER])).toBeNull();
    expect(normalizeTieBreakOrderForStorage([...REQUIRED_TIE_BREAK_ORDER])).toBeNull();
  });

  it('null 은 기본값으로 되돌리기라 그대로 null', () => {
    expect(normalizeTieBreakOrderForStorage(null)).toBeNull();
  });

  it('다른 순서는 7칸으로 저장한다', () => {
    expect(normalizeTieBreakOrderForStorage(GOALS_FIRST)).toEqual(GOALS_FIRST);
    expect(normalizeTieBreakOrderForStorage(LEGACY_GOALS_FIRST)).toEqual(GOALS_FIRST);
  });

  it('잘못된 순서는 저장 전에 거절한다', () => {
    expect(codeOf(() => normalizeTieBreakOrderForStorage(['points', 'seeded_draw']))).toBe('TIE_BREAK_ORDER_INVALID');
  });
});

describe('resolveTieBreakOrder', () => {
  it('저장값이 없으면 기본 순서(첫 프리셋)다', () => {
    expect(resolveTieBreakOrder(null)).toEqual(DEFAULT_TIE_BREAK_ORDER);
    expect(resolveTieBreakOrder(undefined)).toEqual(TOURNAMENT_TIE_BREAK_PRESETS[0].order);
  });

  it('저장값이 있으면 그 순서다(옛 6칸은 7칸으로)', () => {
    expect(resolveTieBreakOrder(GOALS_FIRST)).toEqual(GOALS_FIRST);
    expect(resolveTieBreakOrder(LEGACY_GOALS_FIRST)).toEqual(GOALS_FIRST);
  });

  it('손상된 저장값은 기본 순서로 덮지 않고 오류로 드러낸다', () => {
    expect(() => resolveTieBreakOrder(['points'])).toThrow(BadRequestException);
  });
});

describe('resolveStageTieBreakOrder — 단계 → 대회 → 기본값', () => {
  it('단계 행이 있으면 그 순서, 없으면 대회 순서, 둘 다 없으면 기본값', () => {
    expect(resolveStageTieBreakOrder(GOALS_FIRST, FEWEST_AGAINST_FIRST)).toEqual(FEWEST_AGAINST_FIRST);
    expect(resolveStageTieBreakOrder(GOALS_FIRST, null)).toEqual(GOALS_FIRST);
    expect(resolveStageTieBreakOrder(null, undefined)).toEqual(DEFAULT_TIE_BREAK_ORDER);
  });
});

describe('matchTieBreakPreset', () => {
  it('프리셋과 같으면 그 키, 아니면 null(직접 정한 순서)', () => {
    expect(matchTieBreakPreset(DEFAULT_TIE_BREAK_ORDER)).toBe('head_to_head_first');
    expect(matchTieBreakPreset(GOALS_FIRST)).toBe('goal_difference_first');
    expect(matchTieBreakPreset(FEWEST_AGAINST_FIRST)).toBeNull();
  });

  it('모든 프리셋은 유효한 7칸 순서이고 키가 겹치지 않는다', () => {
    for (const preset of TOURNAMENT_TIE_BREAK_PRESETS) expect(assertValidTieBreakOrder([...preset.order])).toEqual(preset.order);
    expect(new Set(TOURNAMENT_TIE_BREAK_PRESETS.map((preset) => preset.key)).size).toBe(TOURNAMENT_TIE_BREAK_PRESETS.length);
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

describe('6강 결승 직행 비교 순서', () => {
  it('저장값이 없으면 다득점 → 득실차 → 최소 실점', () => {
    expect(resolveSixTeamDirectFinalOrder(null)).toEqual(['goals_for', 'goal_difference', 'fewest_goals_against']);
  });

  it('세 기준을 한 번씩 담은 순서만 받고 기본 순서는 null 로 저장한다', () => {
    expect(resolveSixTeamDirectFinalOrder(['fewest_goals_against', 'goals_for', 'goal_difference'])).toEqual(['fewest_goals_against', 'goals_for', 'goal_difference']);
    expect(normalizeSixTeamDirectFinalOrderForStorage(['goals_for', 'goal_difference', 'fewest_goals_against'])).toBeNull();
    expect(normalizeSixTeamDirectFinalOrderForStorage(['goal_difference', 'goals_for', 'fewest_goals_against'])).toEqual(['goal_difference', 'goals_for', 'fewest_goals_against']);
  });

  it.each([
    ['중복', ['goals_for', 'goals_for', 'goal_difference']],
    ['누락', ['goals_for', 'goal_difference']],
    ['모르는 기준', ['goals_for', 'goal_difference', 'head_to_head']],
    ['배열 아님', 'goals_for'],
  ])('거절한다 — %s', (_label, value) => {
    expect(codeOf(() => resolveSixTeamDirectFinalOrder(value))).toBe('SIX_TEAM_ORDER_INVALID');
  });
});

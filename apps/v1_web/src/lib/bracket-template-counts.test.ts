import { describe, expect, it } from 'vitest';
import { BRACKET_TEMPLATE_MAX_FIXTURES, exceedsFixtureLimit, planBracketTemplateCounts } from './bracket-template-counts';

describe('planBracketTemplateCounts', () => {
  it.each([
    ['8팀 + 3·4위전', { kind: 'knockout', size: 8, thirdPlace: true }, { groups: 4, slots: 8, fixtures: 8, edges: 8 }],
    ['4팀 3·4위전 없음', { kind: 'knockout', size: 4, thirdPlace: false }, { groups: 2, slots: 4, fixtures: 3, edges: 2 }],
    // 12강: 12강 4 + 8강 4 + 4강 2 + 결승 1 + 3·4위전 1, 자리는 ENTRY 8 + 부전승 4
    ['12팀 + 3·4위전', { kind: 'knockout', size: 12, thirdPlace: true }, { groups: 5, slots: 12, fixtures: 12, edges: 12 }],
    ['12팀 3·4위전 없음', { kind: 'knockout', size: 12, thirdPlace: false }, { groups: 4, slots: 12, fixtures: 11, edges: 10 }],
    // 16강: 16강 8 + 8강 4 + 4강 2 + 결승 1 + 3·4위전 1, 부전승 없이 ENTRY 16
    ['16팀 + 3·4위전', { kind: 'knockout', size: 16, thirdPlace: true }, { groups: 5, slots: 16, fixtures: 16, edges: 16 }],
    ['16팀 3·4위전 없음', { kind: 'knockout', size: 16, thirdPlace: false }, { groups: 4, slots: 16, fixtures: 15, edges: 14 }],
    ['리그 6팀 2회전', { kind: 'league', teamCount: 6, legs: 2 }, { groups: 1, slots: 6, fixtures: 30, edges: 0 }],
    ['리그 4팀 1회전', { kind: 'league', teamCount: 4, legs: 1 }, { groups: 1, slots: 4, fixtures: 6, edges: 0 }],
  ] as const)('%s', (_name, input, expected) => {
    expect(planBracketTemplateCounts(input)).toEqual(expected);
  });

  it.each([
    ['2조 x 4팀 2팀 진출 1회전', { groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: false }, { groups: 4, slots: 12, fixtures: 15, edges: 2 }],
    ['같은 조건 + 3·4위전', { groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: true }, { groups: 5, slots: 12, fixtures: 16, edges: 4 }],
    ['4조 x 4팀 2팀 진출 2회전 + 3·4위전', { groupCount: 4, teamsPerGroup: 4, advancePerGroup: 2, legs: 2, thirdPlace: true }, { groups: 8, slots: 24, fixtures: 56, edges: 8 }],
    ['8조 x 3팀 1팀 진출', { groupCount: 8, teamsPerGroup: 3, advancePerGroup: 1, legs: 1, thirdPlace: false }, { groups: 11, slots: 32, fixtures: 31, edges: 6 }],
    ['2조 x 3팀 1팀 진출(결승만)', { groupCount: 2, teamsPerGroup: 3, advancePerGroup: 1, legs: 1, thirdPlace: false }, { groups: 3, slots: 8, fixtures: 7, edges: 0 }],
    ['4조 x 5팀 1팀 진출 2회전', { groupCount: 4, teamsPerGroup: 5, advancePerGroup: 1, legs: 2, thirdPlace: false }, { groups: 6, slots: 24, fixtures: 83, edges: 2 }],
    ['8조 x 4팀 2팀 진출(16강)', { groupCount: 8, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: false }, { groups: 12, slots: 48, fixtures: 63, edges: 14 }],
    ['8조 x 4팀 2팀 진출(16강) + 3·4위전', { groupCount: 8, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: true }, { groups: 13, slots: 48, fixtures: 64, edges: 16 }],
  ] as const)('조별+결선 %s', (_name, rest, expected) => {
    expect(planBracketTemplateCounts({ kind: 'group_knockout', ...rest })).toEqual(expected);
  });

  it.each([
    ['결선 크기 3 (3조 x 1팀)', { groupCount: 3, teamsPerGroup: 4, advancePerGroup: 1, legs: 1, thirdPlace: false }],
    ['결선 크기 6 (3조 x 2팀)', { groupCount: 3, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: false }],
    ['결승만인데 3·4위전', { groupCount: 2, teamsPerGroup: 4, advancePerGroup: 1, legs: 1, thirdPlace: true }],
  ] as const)('서버가 거절하는 조별+결선 조합은 미리보기가 없다(null) — %s', (_name, rest) => {
    expect(planBracketTemplateCounts({ kind: 'group_knockout', ...rest })).toBeNull();
  });
});

describe('exceedsFixtureLimit', () => {
  it('조별+결선은 8조 x 6팀 x 2회전(247경기)이 초과, 8조 x 5팀 x 2회전(167경기)은 허용', () => {
    const big = { kind: 'group_knockout', groupCount: 8, teamsPerGroup: 6, advancePerGroup: 1, legs: 2, thirdPlace: false } as const;
    expect(exceedsFixtureLimit(planBracketTemplateCounts(big)!)).toBe(true);
    expect(exceedsFixtureLimit(planBracketTemplateCounts({ ...big, teamsPerGroup: 5 })!)).toBe(false);
  });

  it('조별+결선 16강(8조 x 2팀)은 조별 경기와 결선 16경기를 합쳐 센다 — 8조 x 6팀 x 2회전은 256경기로 초과, 8조 x 5팀 x 2회전 3·4위전 없이(175)·8조 x 6팀 x 1회전(136)·8조 x 4팀 x 1회전(64)은 허용', () => {
    const extreme = { kind: 'group_knockout', groupCount: 8, teamsPerGroup: 6, advancePerGroup: 2, legs: 2, thirdPlace: true } as const;
    expect(planBracketTemplateCounts(extreme)!.fixtures).toBe(256);
    expect(exceedsFixtureLimit(planBracketTemplateCounts(extreme)!)).toBe(true);
    expect(exceedsFixtureLimit(planBracketTemplateCounts({ ...extreme, thirdPlace: false })!)).toBe(true);
    expect(planBracketTemplateCounts({ ...extreme, teamsPerGroup: 5, thirdPlace: false })!.fixtures).toBe(175);
    expect(exceedsFixtureLimit(planBracketTemplateCounts({ ...extreme, teamsPerGroup: 5 })!)).toBe(false);
    expect(exceedsFixtureLimit(planBracketTemplateCounts({ ...extreme, legs: 1 })!)).toBe(false);
    expect(exceedsFixtureLimit(planBracketTemplateCounts({ ...extreme, teamsPerGroup: 4, legs: 1 })!)).toBe(false);
  });

  it('경계: 16팀 2회전은 정확히 240경기라 허용, 17팀 2회전은 272경기라 초과', () => {
    expect(BRACKET_TEMPLATE_MAX_FIXTURES).toBe(240);
    expect(exceedsFixtureLimit(planBracketTemplateCounts({ kind: 'league', teamCount: 16, legs: 2 })!)).toBe(false);
    expect(exceedsFixtureLimit(planBracketTemplateCounts({ kind: 'league', teamCount: 17, legs: 2 })!)).toBe(true);
  });
});

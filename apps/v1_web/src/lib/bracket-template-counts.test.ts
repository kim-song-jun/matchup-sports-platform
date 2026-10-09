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

  it('조별+결선은 아직 미리보기를 계산하지 않는다(null)', () => {
    expect(
      planBracketTemplateCounts({ kind: 'group_knockout', groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: true }),
    ).toBeNull();
  });
});

describe('exceedsFixtureLimit', () => {
  it('경계: 16팀 2회전은 정확히 240경기라 허용, 17팀 2회전은 272경기라 초과', () => {
    expect(BRACKET_TEMPLATE_MAX_FIXTURES).toBe(240);
    expect(exceedsFixtureLimit(planBracketTemplateCounts({ kind: 'league', teamCount: 16, legs: 2 })!)).toBe(false);
    expect(exceedsFixtureLimit(planBracketTemplateCounts({ kind: 'league', teamCount: 17, legs: 2 })!)).toBe(true);
  });
});

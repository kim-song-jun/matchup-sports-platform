import type { BracketTemplateInput } from '@/types/api';

/** 서버 `BRACKET_TEMPLATE_MAX_FIXTURES` 와 같은 값 — 넘으면 422 `BRACKET_TEMPLATE_TOO_LARGE`. */
export const BRACKET_TEMPLATE_MAX_FIXTURES = 240;

export type TemplatePlanCounts = { groups: number; slots: number; fixtures: number; edges: number };

// 첫 라운드부터 결승까지 경기 수.
const KNOCKOUT_ROUNDS: Readonly<Record<4 | 8 | 12 | 16, readonly number[]>> = {
  4: [2, 1],
  8: [4, 2, 1],
  12: [4, 4, 2, 1],
  16: [8, 4, 2, 1],
};

export function planBracketTemplateCounts(input: BracketTemplateInput): TemplatePlanCounts | null {
  if (input.kind === 'knockout') {
    const rounds = KNOCKOUT_ROUNDS[input.size];
    const third = input.thirdPlace ? 1 : 0;
    // 12강 → 8강은 8강 경기마다 12강 승자 한 명만 들어오고 나머지 한 자리는 부전승 자리라 연결이 경기 수와 같다.
    const edges = rounds.reduce((sum, count, index) => {
      if (index === 0) return sum;
      return sum + (input.size === 12 && index === 1 ? count : count * 2);
    }, 0);
    return {
      groups: rounds.length + third,
      slots: input.size,
      fixtures: rounds.reduce((sum, count) => sum + count, 0) + third,
      edges: edges + third * 2,
    };
  }
  if (input.kind === 'league') {
    return { groups: 1, slots: input.teamCount, fixtures: ((input.teamCount * (input.teamCount - 1)) / 2) * input.legs, edges: 0 };
  }
  // 결선 크기(조 수 x 진출 팀 수)가 2·4·8·16 이 아니거나 결승만인데 3·4위전이면 서버가 거절하는 조합 — 미리보기도 없다.
  const size = input.groupCount * input.advancePerGroup;
  if (![2, 4, 8, 16].includes(size) || (size === 2 && input.thirdPlace)) return null;
  const third = input.thirdPlace ? 1 : 0;
  const stageFixtures = input.groupCount * ((input.teamsPerGroup * (input.teamsPerGroup - 1)) / 2) * input.legs;
  return {
    groups: input.groupCount + Math.log2(size) + third,
    slots: input.groupCount * input.teamsPerGroup + size,
    fixtures: stageFixtures + (size - 1) + third,
    // 결선 첫 라운드는 순위 자리가 대신해 연결선이 없다 — 둘째 라운드부터 양쪽 연결(size - 2) + 3·4위전 패자 2.
    edges: size - 2 + third * 2,
  };
}

export function exceedsFixtureLimit(counts: TemplatePlanCounts): boolean {
  return counts.fixtures > BRACKET_TEMPLATE_MAX_FIXTURES;
}

// apps/v1_api/src/tournaments/templates/group-rank-pairings.spec.ts
import { UnprocessableEntityException } from '@nestjs/common';
import { groupRankPairings, MAX_GROUP_RANK_SLOTS, type GroupRankRef } from './group-rank-pairings';

const label = (ref: GroupRankRef) => `${String.fromCharCode(65 + ref.group)}${ref.rank}`;
const labelsOf = (groupCount: number, advance: 1 | 2) =>
  groupRankPairings(groupCount, advance).map(([home, away]) => [label(home), label(away)]);

function codeOf(operation: () => unknown): { type: unknown; code: unknown } {
  try {
    operation();
  } catch (error) {
    const response = error instanceof UnprocessableEntityException ? (error.getResponse() as { code?: unknown }) : {};
    return { type: error instanceof UnprocessableEntityException, code: response.code };
  }
  throw new Error('예외가 나지 않았다');
}

describe('groupRankPairings — 스펙 S2 교차 대진 표', () => {
  it.each([
    ['2조 x 1팀 → 결승', 2, 1, [['A1', 'B1']]],
    ['2조 x 2팀 → 4강', 2, 2, [['A1', 'B2'], ['B1', 'A2']]],
    ['4조 x 1팀 → 4강', 4, 1, [['A1', 'D1'], ['B1', 'C1']]],
    ['4조 x 2팀 → 8강', 4, 2, [['A1', 'B2'], ['C1', 'D2'], ['B1', 'A2'], ['D1', 'C2']]],
    ['8조 x 1팀 → 8강', 8, 1, [['A1', 'H1'], ['D1', 'E1'], ['B1', 'G1'], ['C1', 'F1']]],
    [
      '8조 x 2팀 → 16강',
      8,
      2,
      [
        ['A1', 'B2'], ['C1', 'D2'], ['E1', 'F2'], ['G1', 'H2'],
        ['B1', 'A2'], ['D1', 'C2'], ['F1', 'E2'], ['H1', 'G2'],
      ],
    ],
  ] as const)('%s', (_name, groupCount, advance, expected) => {
    expect(labelsOf(groupCount, advance)).toEqual(expected);
  });

  it.each([
    [2, 1],
    [2, 2],
    [4, 1],
    [4, 2],
    [8, 1],
    [8, 2],
  ] as const)('%i조 x %i팀: 올라오는 모든 (조, 순위)가 정확히 한 번씩 나오고 같은 조끼리 붙지 않는다', (groupCount, advance) => {
    const refs = groupRankPairings(groupCount, advance).flat();
    expect(refs).toHaveLength(groupCount * advance);
    const seen = new Set(refs.map(label));
    expect(seen.size).toBe(groupCount * advance);
    for (let group = 0; group < groupCount; group += 1) {
      for (let rank = 1; rank <= advance; rank += 1) {
        expect(seen.has(`${String.fromCharCode(65 + group)}${rank}`)).toBe(true);
      }
    }
    for (const [home, away] of groupRankPairings(groupCount, advance)) expect(home.group).not.toBe(away.group);
  });

  it.each([
    [1, 1],
    [3, 1],
    [3, 2],
    [5, 1],
    [6, 1],
    [7, 1],
    [7, 2],
    [16, 1],
    [2.5, 1],
  ] as const)('지원하지 않는 %i조 x %i팀은 422 BRACKET_TEMPLATE_UNSUPPORTED', (groupCount, advance) => {
    expect(codeOf(() => groupRankPairings(groupCount, advance as 1 | 2))).toEqual({
      type: true,
      code: 'BRACKET_TEMPLATE_UNSUPPORTED',
    });
  });

  it('진출 팀 수가 1·2 가 아니면 422 (타입을 우회한 입력)', () => {
    expect(codeOf(() => groupRankPairings(4, 3 as unknown as 1))).toEqual({
      type: true,
      code: 'BRACKET_TEMPLATE_UNSUPPORTED',
    });
  });

  it('호출마다 새 배열을 준다 — 한 호출자가 바꿔도 다음 호출에 새지 않는다', () => {
    const first = groupRankPairings(2, 2);
    first[0][0].rank = 99;
    first.pop();
    expect(labelsOf(2, 2)).toEqual([['A1', 'B2'], ['B1', 'A2']]);
  });

  it('8조 x 2팀 16강: 8경기 모두 홈 1위·어웨이 2위이고, 앞 4경기는 A-B·C-D·E-F·G-H 조 쌍, 뒤 4경기는 같은 쌍의 반대 방향이다', () => {
    const pairs = groupRankPairings(8, 2);
    expect(pairs).toHaveLength(8);
    pairs.forEach(([home, away]) => expect([home.rank, away.rank]).toEqual([1, 2]));
    // 앞 4경기는 A-B·C-D·E-F·G-H 조 쌍, 뒤 4경기는 같은 쌍의 반대 방향
    expect(pairs.slice(0, 4).map(([h, a]) => [h.group, a.group])).toEqual([[0, 1], [2, 3], [4, 5], [6, 7]]);
    expect(pairs.slice(4).map(([h, a]) => [h.group, a.group])).toEqual([[1, 0], [3, 2], [5, 4], [7, 6]]);
  });

  it('MAX_GROUP_RANK_SLOTS 는 표에서 가장 큰 결선 크기(16)다', () => {
    expect(MAX_GROUP_RANK_SLOTS).toBe(16);
  });
});

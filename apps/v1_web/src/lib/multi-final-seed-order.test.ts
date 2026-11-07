import { describe, expect, it } from 'vitest';
import { byeSeedCount, orderRulesByRank } from './multi-final-seed-order';

describe('byeSeedCount', () => {
  it.each([
    [2, 0], [3, 1], [4, 0], [5, 3], [6, 2], [7, 1], [8, 0], [12, 4], [16, 0],
  ])('%i자리 대진은 시드 1부터 %i개가 부전승이다', (capacity, byes) => {
    expect(byeSeedCount(capacity)).toBe(byes);
  });
  it.each([0, 1, -3])('대진이 안 되는 %i자리는 부전승이 없다', capacity => {
    expect(byeSeedCount(capacity)).toBe(0);
  });
});

describe('orderRulesByRank', () => {
  const groupOrder = ['a', 'b', 'c'];
  it('순위 먼저, 같은 순위는 조 순서로 정렬하고 입력 배열은 바꾸지 않는다', () => {
    const typed = [1, 2].flatMap(rank => ['c', 'a', 'b'].map(groupId => ({ groupId, rank })));
    const snapshot = structuredClone(typed);
    expect(orderRulesByRank(typed, groupOrder).map(rule => `${rule.groupId}${rule.rank}`)).toEqual(['a1', 'b1', 'c1', 'a2', 'b2', 'c2']);
    expect(typed).toEqual(snapshot);
  });
});

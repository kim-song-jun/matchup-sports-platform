import { describe, expect, it } from 'vitest';
import { distributeGroupSeeds } from './seeded-group-assignment';

describe('조별 시드 분산', () => {
  it('불균등 조에도 시드를 지그재그로 분산하고 모든 팀을 한 번씩 배정한다', () => {
    const teams = Array.from({ length: 14 }, (_, i) => `t${i + 1}`);
    const result = distributeGroupSeeds([4, 4, 3, 3], teams.slice(0, 8), [...teams].reverse());
    expect(result.slice(0, 2)).toEqual(['t1', 't8']);
    expect(result.slice(4, 6)).toEqual(['t2', 't7']);
    expect(result.slice(8, 10)).toEqual(['t3', 't6']);
    expect(result.slice(11, 13)).toEqual(['t4', 't5']);
    expect([...result].sort()).toEqual([...teams].sort());
  });
  it('중복 시드와 참가하지 않은 시드를 거절한다', () => {
    expect(() => distributeGroupSeeds([2, 2], ['a', 'a'], ['a', 'b', 'c', 'd'])).toThrow();
    expect(() => distributeGroupSeeds([2, 2], ['other'], ['a', 'b', 'c', 'd'])).toThrow();
  });
});

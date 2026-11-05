import { randomInt } from 'node:crypto';
import { invalidMultiFinal } from './multi-finals-plan';
import type { NamedFinalDto } from './multi-finals.dto';

export type SeedGroup = { id: string; ranks: string[] };
export function supportsCrossGroupTopThree(final: NamedFinalDto, groupIds: string[]): boolean {
  return groupIds.length === 4 && final.rules.length === 12 && groupIds.every(groupId =>
    [1, 2, 3].every(rank => final.rules.filter(rule => rule.groupId === groupId && rule.rank === rank).length === 1));
}
function permutations<T>(items: T[]): T[][] {
  if (!items.length) return [[]];
  return items.flatMap((item, i) => permutations(items.filter((_, j) => i !== j)).map(rest => [item, ...rest]));
}
// Standard 12-team tree: seeds 1..4 have byes; these pairs feed A/B/C/D's quarterfinal.
export const CROSS_GROUP_LANES = [{ second: 8, third: 9 }, { second: 7, third: 10 }, { second: 6, third: 11 }, { second: 5, third: 12 }] as const;
export function crossGroupTopThree(groups: SeedGroup[], pick: (limit: number) => number = randomInt): string[] {
  if (groups.length !== 4 || groups.some(group => group.ranks.length !== 3) || new Set(groups.flatMap(group => group.ranks)).size !== 12) {
    return invalidMultiFinal('4개 조의 공식 1~3위가 모두 확정된 12팀 토너먼트에서 사용할 수 있어요.');
  }
  // A third-place team must differ from both the quarterfinal's group winner and its fixed runner-up.
  const choices = permutations([0, 1, 2, 3]).filter(order => order.every((third, winner) => third !== winner && third !== (winner + 1) % 4));
  const order = choices[pick(choices.length)];
  const seeds: string[] = Array(12);
  groups.forEach((group, winner) => {
    seeds[winner] = group.ranks[0];
    seeds[CROSS_GROUP_LANES[winner].second - 1] = groups[(winner + 1) % 4].ranks[1];
    seeds[CROSS_GROUP_LANES[winner].third - 1] = groups[order[winner]].ranks[2];
  });
  return seeds;
}
export function validCrossGroupTopThree(groups: SeedGroup[], seeds: readonly string[]): boolean {
  if (groups.length !== 4 || seeds.length !== 12 || new Set(seeds).size !== 12) return false;
  return groups.every((group, winner) => {
    const third = groups.findIndex(row => row.ranks[2] === seeds[CROSS_GROUP_LANES[winner].third - 1]);
    return seeds[winner] === group.ranks[0] && seeds[CROSS_GROUP_LANES[winner].second - 1] === groups[(winner + 1) % 4].ranks[1]
      && third >= 0 && third !== winner && third !== (winner + 1) % 4;
  });
}

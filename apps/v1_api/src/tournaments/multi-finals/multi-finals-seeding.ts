import { randomInt } from 'node:crypto';
import { invalidMultiFinal, namedFinalSize } from './multi-finals-plan';
import type { NamedFinalDto } from './multi-finals.dto';

export type SeedGroup = { id: string; ranks: string[] };
export function supportsCrossGroupTopThree(final: NamedFinalDto, groupIds: string[]): boolean {
  return groupIds.length === 4 && namedFinalSize(final) === 12 && final.rules.length === 12 && groupIds.every(groupId =>
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

/** Validate the saved graph too: operators can edit advancement links after generation. */
export function validCrossGroupBracket(groups: SeedGroup[], seeds: readonly string[], slots: Array<{ id: string; position: number }>, fixtures: Array<{
  id: string; phase: string; homeSlotId: string | null; awaySlotId: string | null;
  incoming: Array<{ sourceId: string; outcome: string }>;
}>): boolean {
  const quarters = fixtures.filter(fixture => fixture.phase === 'quarter');
  const round12 = fixtures.filter(fixture => fixture.phase === 'round16');
  if (groups.length !== 4 || seeds.length !== 12 || quarters.length !== 4 || round12.length !== 4) return false;
  const team = (slotId: string | null) => {
    const slot = slots.find(slot => slot.id === slotId);
    return slot ? seeds[slot.position - 1] : undefined;
  };
  const used = new Set<string>();
  const seenTeams: string[] = [];
  for (const quarter of quarters) {
    const direct = [team(quarter.homeSlotId), team(quarter.awaySlotId)].filter((id): id is string => id !== undefined);
    const winner = groups.findIndex(group => group.ranks[0] === direct[0]);
    if (direct.length !== 1 || winner < 0 || quarter.incoming.length !== 1 || quarter.incoming[0].outcome !== 'WINNER') return false;
    const source = round12.find(fixture => fixture.id === quarter.incoming[0].sourceId);
    if (!source || used.has(source.id) || source.incoming.length !== 0) return false;
    used.add(source.id);
    const players = [team(source.homeSlotId), team(source.awaySlotId)];
    if (!players.includes(groups[(winner + 1) % 4].ranks[1])) return false;
    const third = groups.findIndex(group => players.includes(group.ranks[2]));
    if (third < 0 || third === winner || third === (winner + 1) % 4) return false;
    seenTeams.push(direct[0], ...players.filter((id): id is string => id !== undefined));
  }
  return used.size === 4 && seenTeams.length === 12 && new Set(seenTeams).size === 12;
}

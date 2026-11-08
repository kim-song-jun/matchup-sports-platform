type RankRule = { groupId: string; rank: number };

/** Same ordering the API applies when it stores the rules: rank first, equal ranks follow `groupOrder`. Every rule's group must be listed. */
export function orderRulesByRank<T extends RankRule>(rules: readonly T[], groupOrder: readonly string[]): T[] {
  const position = new Map(groupOrder.map((groupId, index) => [groupId, index]));
  return [...rules].sort((a, b) => a.rank - b.rank || position.get(a.groupId)! - position.get(b.groupId)!);
}

/** A bracket narrower than the next power of two gives its byes to the lowest seed numbers. */
export function byeSeedCount(capacity: number): number {
  return capacity < 2 ? 0 : 2 ** Math.ceil(Math.log2(capacity)) - capacity;
}

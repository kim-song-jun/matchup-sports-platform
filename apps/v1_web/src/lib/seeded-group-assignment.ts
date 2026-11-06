/** Explicit seeds snake across groups; remaining teams retain the caller's draw order. */
export function distributeGroupSeeds(capacities: readonly number[], seeds: readonly string[], drawnTeams: readonly string[]): string[] {
  const count = capacities.reduce((sum, value) => sum + value, 0);
  if (drawnTeams.length !== count || new Set(drawnTeams).size !== count || new Set(seeds).size !== seeds.length
    || seeds.some(id => !drawnTeams.includes(id)) || capacities.some(value => !Number.isInteger(value) || value < 2 || value > 8)) {
    throw new Error('시드와 참가팀을 중복 없이 선택해 주세요.');
  }
  const order = [...seeds, ...drawnTeams.filter(id => !seeds.includes(id))];
  const groups = capacities.map(() => [] as string[]);
  let cursor = 0;
  for (let row = 0; cursor < order.length; row++) {
    const indices = capacities.map((_, i) => i);
    if (row % 2) indices.reverse();
    for (const index of indices) if (groups[index].length < capacities[index]) groups[index].push(order[cursor++]);
  }
  return groups.flat();
}

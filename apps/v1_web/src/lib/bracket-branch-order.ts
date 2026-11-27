/** Order feeders by their destination from the final back to the opening round.
 * Unconnected cards keep their places. A semifinal follows its winner path
 * when its loser also feeds a third-place playoff. */
export function bracketBranchOrder(
  columns: readonly (readonly string[])[],
  links: readonly { source: string; target: string; side: 'HOME' | 'AWAY'; outcome: string }[],
): string[][] {
  const destinations = new Map<string, (typeof links)[number]>();
  for (const link of links) {
    if (!destinations.has(link.source) || link.outcome !== 'LOSER') destinations.set(link.source, link);
  }
  const ranks = new Map<string, number>();
  const ordered = columns.map(column => [...column]);
  for (let index = ordered.length - 1; index >= 0; index--) {
    const column = ordered[index];
    const scores = new Map<string, number>();
    for (const id of column) {
      const dest = destinations.get(id);
      const rank = dest && ranks.get(dest.target);
      if (rank !== undefined && dest) scores.set(id, rank * 2 + Number(dest.side === 'AWAY'));
    }
    const connected = column.filter(id => scores.has(id)).sort((a, b) => scores.get(a)! - scores.get(b)!);
    let next = 0;
    ordered[index] = column.map(id => scores.has(id) ? connected[next++] : id);
    ordered[index].forEach((id, row) => ranks.set(id, row));
  }
  return ordered;
}

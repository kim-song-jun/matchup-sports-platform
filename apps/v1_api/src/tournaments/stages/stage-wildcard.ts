export type WildcardStanding = { registrationId: string; points: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; fairPlayPoints: number };
/** Cross-pool comparison uses per-game ratios; equal sporting records remain operator decisions. */
export function wildcardRankCandidates(rows: WildcardStanding[], position: number): string[] {
  const played = (row: WildcardStanding) => row.wins + row.draws + row.losses;
  if (rows.some(row => played(row) === 0) || position < 1 || position > rows.length) return [];
  const metrics = (row: WildcardStanding) => [row.points, row.goalsFor - row.goalsAgainst, row.goalsFor, -row.goalsAgainst, -row.fairPlayPoints];
  const compare = (a: WildcardStanding, b: WildcardStanding) => {
    const left = metrics(a), right = metrics(b);
    for (let i = 0; i < left.length; i++) { const diff = right[i] * played(a) - left[i] * played(b); if (diff) return diff; }
    return 0;
  };
  const ordered = [...rows].sort(compare), target = ordered[position - 1];
  return ordered.filter(row => compare(row, target) === 0).map(row => row.registrationId);
}

import { tournamentRoundLabel } from './tournament-round-label';

export function compareTournamentGroupNames(a: string, b: string): number {
  return a.trim().localeCompare(b.trim(), 'ko', { numeric: true, sensitivity: 'base' });
}

/** Match numbers restart in each round; they cannot determine competition order. */
export function compareTournamentRounds(a: string, b: string): number {
  const rank = (round: string): number => {
    const label = tournamentRoundLabel(round);
    if (label.includes('위') && label.includes('3')) return 101;
    if (label === '준결승' || label.includes('세미')) return -4;
    if (label.includes('결승')) return 100;
    return -Number(/^(\d+)강$/.exec(label)?.[1] ?? 0);
  };
  return rank(a) - rank(b);
}

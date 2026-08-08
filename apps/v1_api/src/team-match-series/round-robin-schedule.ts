export interface RoundRobinFixture {
  round: number;
  homeTeamId: string;
  awayTeamId: string;
}

const BYE: unique symbol = Symbol('bye');
type Slot = string | typeof BYE;

export function generateRoundRobinFixtures(
  teamIds: readonly string[],
  weeksCount: number,
): RoundRobinFixture[] {
  if (teamIds.length < 2 || weeksCount < 1) return [];

  const padded: Slot[] = teamIds.length % 2 === 0 ? [...teamIds] : [...teamIds, BYE];
  const cycleRounds = padded.length - 1;
  const homeCounts = new Map<string, number>(teamIds.map((id) => [id, 0]));
  const fixtures: RoundRobinFixture[] = [];

  for (let week = 1; week <= weeksCount; week++) {
    const cycleIndex = (week - 1) % cycleRounds;
    const arrangement = cycleIndex === 0 ? padded : rotateCircle(padded, cycleIndex);
    for (const [a, b] of circlePairs(arrangement)) {
      if (a === BYE || b === BYE) continue;
      const [homeTeamId, awayTeamId] = homeCounts.get(a)! <= homeCounts.get(b)! ? [a, b] : [b, a];
      homeCounts.set(homeTeamId, homeCounts.get(homeTeamId)! + 1);
      fixtures.push({ round: week, homeTeamId, awayTeamId });
    }
  }
  return fixtures;
}

/** base[0]을 고정하고 나머지를 시계방향으로 steps만큼 회전한다(표준 circle method). */
function rotateCircle(base: readonly Slot[], steps: number): Slot[] {
  const [fixed, ...rest] = base;
  const offset = steps % rest.length;
  return [fixed, ...rest.slice(rest.length - offset), ...rest.slice(0, rest.length - offset)];
}

function circlePairs(arrangement: readonly Slot[]): Array<[Slot, Slot]> {
  const n = arrangement.length;
  const pairs: Array<[Slot, Slot]> = [];
  for (let i = 0; i < n / 2; i++) pairs.push([arrangement[i], arrangement[n - 1 - i]]);
  return pairs;
}

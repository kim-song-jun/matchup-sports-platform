import { createHash } from 'node:crypto';
import { CompetitionConfig } from './competition-config.types';

export type StandingFixture = {
  homeRegistrationId: string;
  awayRegistrationId: string;
  homeScore: number;
  awayScore: number;
};

export type CalculatedStanding = {
  registrationId: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  fairPlayPoints: number;
  position: number;
};

type StandingWithoutPosition = Omit<CalculatedStanding, 'position'>;

function applyFixture(
  stats: Map<string, StandingWithoutPosition>,
  fixture: StandingFixture,
  points: CompetitionConfig['tieBreak']['points'],
) {
  const home = stats.get(fixture.homeRegistrationId);
  const away = stats.get(fixture.awayRegistrationId);
  if (!home || !away) return;
  home.goalsFor += fixture.homeScore;
  home.goalsAgainst += fixture.awayScore;
  away.goalsFor += fixture.awayScore;
  away.goalsAgainst += fixture.homeScore;
  if (fixture.homeScore > fixture.awayScore) {
    home.wins += 1;
    away.losses += 1;
    home.points += points.win;
    away.points += points.loss;
  } else if (fixture.homeScore < fixture.awayScore) {
    away.wins += 1;
    home.losses += 1;
    away.points += points.win;
    home.points += points.loss;
  } else {
    home.draws += 1;
    away.draws += 1;
    home.points += points.draw;
    away.points += points.draw;
  }
}

type DirectStanding = { points: number; goalsFor: number; goalsAgainst: number };

function directStanding(
  registrationIds: Set<string>,
  fixtures: StandingFixture[],
  points: CompetitionConfig['tieBreak']['points'],
) {
  const stats = new Map<string, DirectStanding>(
    [...registrationIds].map((registrationId) => [
      registrationId,
      { points: 0, goalsFor: 0, goalsAgainst: 0 },
    ]),
  );
  for (const fixture of fixtures) {
    if (
      !registrationIds.has(fixture.homeRegistrationId) ||
      !registrationIds.has(fixture.awayRegistrationId)
    ) {
      continue;
    }
    const home = stats.get(fixture.homeRegistrationId);
    const away = stats.get(fixture.awayRegistrationId);
    if (!home || !away) continue;
    home.goalsFor += fixture.homeScore;
    home.goalsAgainst += fixture.awayScore;
    away.goalsFor += fixture.awayScore;
    away.goalsAgainst += fixture.homeScore;
    if (fixture.homeScore > fixture.awayScore) {
      home.points += points.win;
      away.points += points.loss;
    } else if (fixture.homeScore < fixture.awayScore) {
      away.points += points.win;
      home.points += points.loss;
    } else {
      home.points += points.draw;
      away.points += points.draw;
    }
  }
  return stats;
}

type TieBreakKey = (team: StandingWithoutPosition, direct: DirectStanding) => number;
type MovableCriterion = Exclude<CompetitionConfig['tieBreak']['order'][number], 'points' | 'seeded_draw'>;

/**
 * Each movable criterion contributes the keys that separate teams level on points; a larger value
 * ranks higher. Head-to-head is three keys (mini-table points, goal difference, goals for) that always
 * stay together in this order.
 */
const CRITERION_KEYS: Record<MovableCriterion, readonly TieBreakKey[]> = {
  head_to_head: [
    (_team, direct) => direct.points,
    (_team, direct) => direct.goalsFor - direct.goalsAgainst,
    (_team, direct) => direct.goalsFor,
  ],
  goal_difference: [(team) => team.goalsFor - team.goalsAgainst],
  goals_for: [(team) => team.goalsFor],
  fair_play: [(team) => -team.fairPlayPoints],
};

/** The seeded draw always comes after the last key; `points` leads before any key is read. */
function tieBreakKeys(order: CompetitionConfig['tieBreak']['order']): TieBreakKey[] {
  return order.flatMap((criterion) =>
    criterion === 'points' || criterion === 'seeded_draw' ? [] : CRITERION_KEYS[criterion],
  );
}

export type CompetitionStandingsWithTies = {
  standings: CalculatedStanding[];
  /**
   * Teams no criterion before the seeded draw could separate, one array per bundle of two or more,
   * best position first. Their positions are an arbitrary draw result, not a ranking.
   */
  drawnTies: string[][];
};

export function calculateCompetitionStandingsWithTies(input: {
  tournamentId: string;
  configVersionId: string;
  registrationIds: string[];
  fixtures: StandingFixture[];
  config: CompetitionConfig;
  /**
   * registrationId → 누적 페어플레이 벌점(낮을수록 상위).
   * 주지 않으면 전부 0으로 두어 기존 동작을 유지한다.
   */
  fairPlayByRegistration?: ReadonlyMap<string, number>;
}): CompetitionStandingsWithTies {
  const stats = new Map<string, StandingWithoutPosition>(
    input.registrationIds.map((registrationId) => [
      registrationId,
      {
        registrationId,
        points: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        fairPlayPoints: input.fairPlayByRegistration?.get(registrationId) ?? 0,
      },
    ]),
  );
  for (const fixture of input.fixtures) {
    applyFixture(stats, fixture, input.config.tieBreak.points);
  }

  const criteria = tieBreakKeys(input.config.tieBreak.order);
  const lexicalIds = [...input.registrationIds].sort();
  const drawSeed = createHash('sha256')
    .update(`${input.tournamentId}:${input.configVersionId}:${lexicalIds.join(',')}`)
    .digest();
  const offset = drawSeed.readUInt32BE(0) % Math.max(lexicalIds.length, 1);
  const seededOrder = [...lexicalIds.slice(offset), ...lexicalIds.slice(0, offset)];
  const pointsGroups = new Map<number, StandingWithoutPosition[]>();
  for (const standing of stats.values()) {
    const group = pointsGroups.get(standing.points) ?? [];
    group.push(standing);
    pointsGroups.set(standing.points, group);
  }

  const sorted: StandingWithoutPosition[] = [];
  const drawnTies: string[][] = [];
  for (const points of [...pointsGroups.keys()].sort((left, right) => right - left)) {
    const tied = pointsGroups.get(points) ?? [];
    const headToHead = directStanding(
      new Set(tied.map((standing) => standing.registrationId)),
      input.fixtures,
      input.config.tieBreak.points,
    );
    const keysById = new Map(
      tied.map((standing) => [
        standing.registrationId,
        criteria.map((criterion) => criterion(standing, headToHead.get(standing.registrationId)!)),
      ]),
    );
    const keysOf = (standing: StandingWithoutPosition) => keysById.get(standing.registrationId)!;
    tied.sort((left, right) => {
      const leftKeys = keysOf(left);
      const rightKeys = keysOf(right);
      for (let index = 0; index < leftKeys.length; index += 1) {
        if (leftKeys[index] !== rightKeys[index]) return rightKeys[index] - leftKeys[index];
      }
      return seededOrder.indexOf(left.registrationId) - seededOrder.indexOf(right.registrationId);
    });
    let bundle: string[] = [];
    tied.forEach((standing, index) => {
      const sameAsPrevious = index > 0 && keysOf(tied[index - 1]).every((value, at) => value === keysOf(standing)[at]);
      if (!sameAsPrevious) {
        if (bundle.length > 1) drawnTies.push(bundle);
        bundle = [];
      }
      bundle.push(standing.registrationId);
    });
    if (bundle.length > 1) drawnTies.push(bundle);
    sorted.push(...tied);
  }
  return {
    standings: sorted.map((standing, index) => ({ ...standing, position: index + 1 })),
    drawnTies,
  };
}

export function calculateCompetitionStandings(
  input: Parameters<typeof calculateCompetitionStandingsWithTies>[0],
): CalculatedStanding[] {
  return calculateCompetitionStandingsWithTies(input).standings;
}

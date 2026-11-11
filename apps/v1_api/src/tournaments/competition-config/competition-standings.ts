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

type MovableCriterion = Exclude<CompetitionConfig['tieBreak']['order'][number], 'points' | 'seeded_draw'>;

function movableCriteria(order: CompetitionConfig['tieBreak']['order']): MovableCriterion[] {
  return order.filter(
    (criterion): criterion is MovableCriterion => criterion !== 'points' && criterion !== 'seeded_draw',
  );
}

/**
 * Values that separate `tied` by one criterion; a larger value ranks higher. Head-to-head reads the games
 * among exactly these teams (mini-table points, goal difference, goals for, kept together in this order).
 */
function criterionKeys(
  criterion: MovableCriterion,
  tied: StandingWithoutPosition[],
  fixtures: StandingFixture[],
  points: CompetitionConfig['tieBreak']['points'],
): (team: StandingWithoutPosition) => number[] {
  switch (criterion) {
    case 'head_to_head': {
      const direct = directStanding(new Set(tied.map((team) => team.registrationId)), fixtures, points);
      return (team) => {
        const standing = direct.get(team.registrationId)!;
        return [standing.points, standing.goalsFor - standing.goalsAgainst, standing.goalsFor];
      };
    }
    case 'goal_difference':
      return (team) => [team.goalsFor - team.goalsAgainst];
    case 'goals_for':
      return (team) => [team.goalsFor];
    case 'fewest_goals_against':
      return (team) => [-team.goalsAgainst];
    case 'fair_play':
      return (team) => [-team.fairPlayPoints];
  }
}

function compareKeys(left: number[], right: number[]) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

/**
 * Splits teams level on points by the criteria in order, best first. Each criterion only compares the
 * teams the earlier ones left level, so head-to-head placed after another criterion is a direct comparison
 * of those teams, not of everyone who shares the points. A returned group is level on every criterion.
 */
function separate(
  tied: StandingWithoutPosition[],
  criteria: readonly MovableCriterion[],
  fixtures: StandingFixture[],
  points: CompetitionConfig['tieBreak']['points'],
): StandingWithoutPosition[][] {
  const [criterion, ...rest] = criteria;
  if (!criterion || tied.length < 2) return [tied];
  const keyOf = criterionKeys(criterion, tied, fixtures, points);
  const keys = new Map(tied.map((team) => [team.registrationId, keyOf(team)]));
  const ranked = [...tied].sort((left, right) => compareKeys(keys.get(right.registrationId)!, keys.get(left.registrationId)!));
  const levelGroups: StandingWithoutPosition[][] = [];
  for (const team of ranked) {
    const last = levelGroups[levelGroups.length - 1];
    if (last && compareKeys(keys.get(last[0].registrationId)!, keys.get(team.registrationId)!) === 0) last.push(team);
    else levelGroups.push([team]);
  }
  return levelGroups.flatMap((group) => separate(group, rest, fixtures, points));
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

  const criteria = movableCriteria(input.config.tieBreak.order);
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
    for (const bundle of separate(pointsGroups.get(points) ?? [], criteria, input.fixtures, input.config.tieBreak.points)) {
      bundle.sort((left, right) => seededOrder.indexOf(left.registrationId) - seededOrder.indexOf(right.registrationId));
      if (bundle.length > 1) drawnTies.push(bundle.map((standing) => standing.registrationId));
      sorted.push(...bundle);
    }
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

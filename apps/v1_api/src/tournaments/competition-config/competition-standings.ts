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

function directStanding(
  registrationIds: Set<string>,
  fixtures: StandingFixture[],
  points: CompetitionConfig['tieBreak']['points'],
) {
  const stats = new Map(
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

export function calculateCompetitionStandings(input: {
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
}): CalculatedStanding[] {
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
  for (const points of [...pointsGroups.keys()].sort((left, right) => right - left)) {
    const tied = pointsGroups.get(points) ?? [];
    const headToHead = directStanding(
      new Set(tied.map((standing) => standing.registrationId)),
      input.fixtures,
      input.config.tieBreak.points,
    );
    tied.sort((left, right) => {
      const leftDirect = headToHead.get(left.registrationId);
      const rightDirect = headToHead.get(right.registrationId);
      if (leftDirect && rightDirect) {
        if (leftDirect.points !== rightDirect.points) {
          return rightDirect.points - leftDirect.points;
        }
        const leftDirectDifference = leftDirect.goalsFor - leftDirect.goalsAgainst;
        const rightDirectDifference = rightDirect.goalsFor - rightDirect.goalsAgainst;
        if (leftDirectDifference !== rightDirectDifference) {
          return rightDirectDifference - leftDirectDifference;
        }
        if (leftDirect.goalsFor !== rightDirect.goalsFor) {
          return rightDirect.goalsFor - leftDirect.goalsFor;
        }
      }
      const leftDifference = left.goalsFor - left.goalsAgainst;
      const rightDifference = right.goalsFor - right.goalsAgainst;
      if (leftDifference !== rightDifference) return rightDifference - leftDifference;
      if (left.goalsFor !== right.goalsFor) return right.goalsFor - left.goalsFor;
      if (left.fairPlayPoints !== right.fairPlayPoints) {
        return left.fairPlayPoints - right.fairPlayPoints;
      }
      return seededOrder.indexOf(left.registrationId) - seededOrder.indexOf(right.registrationId);
    });
    sorted.push(...tied);
  }
  return sorted.map((standing, index) => ({ ...standing, position: index + 1 }));
}

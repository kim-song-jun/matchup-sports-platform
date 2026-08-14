export interface SeriesStandingFixture {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
}

export interface SeriesStandingTotals {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface SeriesStanding extends SeriesStandingTotals {
  position: number;
}

export type SeriesTieBreakCriterion = 'points' | 'goalDifference' | 'goalsFor' | 'headToHead';

const POINTS = { win: 3, draw: 1, loss: 0 } as const;

function emptyTotals(teamId: string): SeriesStandingTotals {
  return { teamId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
}

function applyFixture(totals: Map<string, SeriesStandingTotals>, fixture: SeriesStandingFixture): void {
  const home = totals.get(fixture.homeTeamId);
  const away = totals.get(fixture.awayTeamId);
  if (!home || !away) return;
  home.played += 1;
  away.played += 1;
  home.goalsFor += fixture.homeScore;
  home.goalsAgainst += fixture.awayScore;
  away.goalsFor += fixture.awayScore;
  away.goalsAgainst += fixture.homeScore;
  if (fixture.homeScore > fixture.awayScore) {
    home.wins += 1;
    home.points += POINTS.win;
    away.losses += 1;
  } else if (fixture.homeScore < fixture.awayScore) {
    away.wins += 1;
    away.points += POINTS.win;
    home.losses += 1;
  } else {
    home.draws += 1;
    home.points += POINTS.draw;
    away.draws += 1;
    away.points += POINTS.draw;
  }
}

function totalsFor(
  teamIds: readonly string[],
  fixtures: readonly SeriesStandingFixture[],
): Map<string, SeriesStandingTotals> {
  const totals = new Map(teamIds.map((teamId) => [teamId, emptyTotals(teamId)]));
  for (const fixture of fixtures) {
    if (!totals.has(fixture.homeTeamId) || !totals.has(fixture.awayTeamId)) continue;
    applyFixture(totals, fixture);
  }
  return totals;
}

function criterionValue(
  totals: SeriesStandingTotals,
  criterion: Exclude<SeriesTieBreakCriterion, 'headToHead'>,
): number {
  if (criterion === 'points') return totals.points;
  if (criterion === 'goalDifference') return totals.goalsFor - totals.goalsAgainst;
  return totals.goalsFor;
}

/**
 * group을 criteria[0] 기준 동점 버킷으로 나누고('headToHead'면 group 내부 경기만으로 미니
 * 순위를 다시 계산해 그 승점으로 비교), 남은 criteria로 각 버킷을 재귀 정렬한다. 기준이
 * 모두 소진되면 팀ID 사전순으로 떨어뜨려 결과를 결정적으로 만든다.
 */
function orderGroup(
  group: readonly string[],
  overallFixtures: readonly SeriesStandingFixture[],
  overallTotals: Map<string, SeriesStandingTotals>,
  criteria: readonly SeriesTieBreakCriterion[],
): string[] {
  if (group.length <= 1 || criteria.length === 0) return [...group].sort();
  const [criterion, ...rest] = criteria;
  const valueOf: (teamId: string) => number =
    criterion === 'headToHead'
      ? (() => {
          const h2hFixtures = overallFixtures.filter(
            (f) => group.includes(f.homeTeamId) && group.includes(f.awayTeamId),
          );
          const h2hTotals = totalsFor(group, h2hFixtures);
          return (teamId: string) => h2hTotals.get(teamId)?.points ?? 0;
        })()
      : (teamId: string) => criterionValue(overallTotals.get(teamId)!, criterion);

  const buckets = new Map<number, string[]>();
  for (const teamId of group) {
    const value = valueOf(teamId);
    const bucket = buckets.get(value) ?? [];
    bucket.push(teamId);
    buckets.set(value, bucket);
  }
  const orderedValues = [...buckets.keys()].sort((a, b) => b - a);
  const result: string[] = [];
  for (const value of orderedValues) {
    result.push(...orderGroup(buckets.get(value)!, overallFixtures, overallTotals, rest));
  }
  return result;
}

export function calculateSeriesStandings(input: {
  teamIds: readonly string[];
  fixtures: readonly SeriesStandingFixture[];
  tieBreakOrder: readonly SeriesTieBreakCriterion[];
}): SeriesStanding[] {
  const totals = totalsFor(input.teamIds, input.fixtures);
  const order = orderGroup([...input.teamIds].sort(), input.fixtures, totals, input.tieBreakOrder);
  return order.map((teamId, index) => ({ ...totals.get(teamId)!, position: index + 1 }));
}

export interface LeagueStandingFixture {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
}

export interface LeagueStandingTotals {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface LeagueStanding extends LeagueStandingTotals {
  position: number;
}

export type LeagueTieBreakCriterion = 'points' | 'goalDifference' | 'goalsFor' | 'headToHead';

const POINTS = { win: 3, draw: 1, loss: 0 } as const;

function emptyTotals(teamId: string): LeagueStandingTotals {
  return { teamId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
}

function applyFixture(totals: Map<string, LeagueStandingTotals>, fixture: LeagueStandingFixture): void {
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
  fixtures: readonly LeagueStandingFixture[],
): Map<string, LeagueStandingTotals> {
  const totals = new Map(teamIds.map((teamId) => [teamId, emptyTotals(teamId)]));
  for (const fixture of fixtures) {
    if (!totals.has(fixture.homeTeamId) || !totals.has(fixture.awayTeamId)) continue;
    applyFixture(totals, fixture);
  }
  return totals;
}

function criterionValue(
  totals: LeagueStandingTotals,
  criterion: Exclude<LeagueTieBreakCriterion, 'headToHead'>,
): number {
  if (criterion === 'points') return totals.points;
  if (criterion === 'goalDifference') return totals.goalsFor - totals.goalsAgainst;
  return totals.goalsFor;
}

/**
 * group을 criteria[0] 기준 동점 버킷으로 나누고('headToHead'면 group 내부 경기만으로 미니
 * 순위를 다시 계산해 그 승점으로 비교), 남은 criteria로 각 버킷을 재귀 정렬한다. 기준이
 * 모두 소진되면 팀ID 사전순으로 떨어뜨려 결과를 결정적으로 만든다.
 *
 * `onTieBreakExhausted` 는 그 마지막 폴백이 실제로 발동한 순간(2팀 이상이 tieBreakOrder
 * 전체를 소진하고도 갈리지 않은 경우)을 감지용으로 통보한다. 정렬 결과(반환값)는 이
 * 콜백 유무와 무관하게 항상 동일하다 — 감지는 부수 효과일 뿐 결정성 있는 계산 자체를
 * 바꾸지 않는다(감사 H-5: 승강 확정 화면이 "동률이라 임의로 갈렸다"를 보여줘야 한다).
 */
function orderGroup(
  group: readonly string[],
  overallFixtures: readonly LeagueStandingFixture[],
  overallTotals: Map<string, LeagueStandingTotals>,
  criteria: readonly LeagueTieBreakCriterion[],
  onTieBreakExhausted?: (group: readonly string[]) => void,
): string[] {
  if (group.length <= 1) return [...group].sort();
  if (criteria.length === 0) {
    onTieBreakExhausted?.(group);
    return [...group].sort();
  }
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
    result.push(...orderGroup(buckets.get(value)!, overallFixtures, overallTotals, rest, onTieBreakExhausted));
  }
  return result;
}

export function calculateLeagueStandings(input: {
  teamIds: readonly string[];
  fixtures: readonly LeagueStandingFixture[];
  tieBreakOrder: readonly LeagueTieBreakCriterion[];
}): LeagueStanding[] {
  return calculateLeagueStandingsWithTieBreakInfo(input).standings;
}

/** tieBreakOrder 전체를 소진하고도 갈리지 않아 팀ID 사전순 폴백으로 순위가 결정된 팀들. */
export interface StandingsTieGroup {
  teamIds: string[];
}

/**
 * `calculateLeagueStandings` 와 완전히 같은 계산(같은 `orderGroup` 호출)을 하면서,
 * tie-break 기준이 모두 소진돼 결정적 폴백(팀ID 사전순)이 실제로 순위를 정한 그룹을
 * 함께 수집한다. `calculateLeagueStandings` 는 이 함수의 `standings` 만 돌려주는
 * 얇은 래퍼라 두 함수의 정렬 결과는 항상 동일하다 — 감지 로직 때문에 계산 로직이
 * 갈라질 여지가 없다.
 *
 * 승강 확정 화면(감사 H-5)이 "N팀이 승점·득실·다득점·맞대결까지 전부 같아서
 * 팀ID 순으로 갈렸어요" 같은 안내를 띄우는 데 쓴다. 부분적으로만 동률인 경우
 * (예: 승점만 같고 골득실로 갈림)는 tie-break 가 실제로 순위를 "결정"한 것이므로
 * 여기 포함하지 않는다 — 오직 모든 기준이 소진된 경우만 그룹으로 잡는다.
 */
export function calculateLeagueStandingsWithTieBreakInfo(input: {
  teamIds: readonly string[];
  fixtures: readonly LeagueStandingFixture[];
  tieBreakOrder: readonly LeagueTieBreakCriterion[];
}): { standings: LeagueStanding[]; tieGroups: StandingsTieGroup[] } {
  const totals = totalsFor(input.teamIds, input.fixtures);
  const tieGroups: StandingsTieGroup[] = [];
  const order = orderGroup([...input.teamIds].sort(), input.fixtures, totals, input.tieBreakOrder, (group) => {
    tieGroups.push({ teamIds: [...group].sort() });
  });
  const standings = order.map((teamId, index) => ({ ...totals.get(teamId)!, position: index + 1 }));
  return { standings, tieGroups };
}

/** 그룹 B(시즌 결산·시상 화면 감사) — 우승팀 표시에 필요한 최소 필드. */
export interface LeagueChampionTeam {
  teamId: string;
  teamName: string;
  teamLogoUrl: string | null;
}

/**
 * 우승팀(들) 판정 — 그룹 B(시즌 결산·시상). 1위 팀(`standings[0]`, 이미 순위순으로 정렬돼
 * 있다고 전제)이 `tieGroups`(calculateLeagueStandingsWithTieBreakInfo 가 감지한, tie-break
 * 기준을 전부 소진하고도 갈리지 않은 팀 묶음, 감사 H-5) 중 하나에 속해 있으면 그 묶음
 * 전체를 공동 우승으로 반환한다 -- 승점·득실차·다득점·(적용됐다면)맞대결까지 이 리그의
 * tieBreakOrder 로는 갈리지 않았다는 뜻이라 팀ID 사전순으로 매겨진 1·2위 구분은 우열이
 * 아니라 결정적 표시를 위한 임의 폴백일 뿐이기 때문이다(사용자 확정 2026-08-23).
 * `standings`가 비어 있으면(참가팀 0 또는 아직 아무 경기도 없음) 빈 배열.
 *
 * 새로 계산하지 않고 이미 계산된 tieGroups 를 그대로 조회하는 O(그룹 수) 함수라
 * 별도의 "공동 우승 판정" 로직을 새로 만들지 않는다 -- 판정 자체는 tie-break 계산과
 * 완전히 같은 소스(criteria exhaustion)를 공유한다.
 */
export function resolveLeagueChampions<T extends { teamId: string; teamName: string; teamLogoUrl: string | null }>(
  standings: readonly T[],
  tieGroups: readonly StandingsTieGroup[],
): LeagueChampionTeam[] {
  if (standings.length === 0) return [];
  const topTeamId = standings[0].teamId;
  const coChampionGroup = tieGroups.find((group) => group.teamIds.includes(topTeamId));
  const championTeamIds = new Set(coChampionGroup?.teamIds ?? [topTeamId]);
  return standings
    .filter((row) => championTeamIds.has(row.teamId))
    .map((row) => ({ teamId: row.teamId, teamName: row.teamName, teamLogoUrl: row.teamLogoUrl }));
}

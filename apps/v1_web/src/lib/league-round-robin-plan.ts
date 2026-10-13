/**
 * 리그 대진 "주차 수"를 팀 수로 제안한다(Task 180 G13 F40).
 *
 * 서버 라운드로빈(`apps/v1_api/src/common/scheduling/round-robin.ts`)과 같은 셈이어야 한다 —
 * 홀수 팀은 부전 한 자리를 더해 라운드 = (짝수로 맞춘 팀 수 − 1), 주차 수만큼 라운드를 돌리고
 * (넘치면 처음부터 다시 돈다) 한 라운드는 floor(팀 수 / 2)경기다. 서버는 총 라운드를
 * `weeksCount × gamesPerTeamPerDay` 로 만들되, `roundsCount` 를 주면 거기서 자른다.
 */

export type RoundRobinLegs = 1 | 2;

/** `fixtures` = 리그를 만들 때 정한 총 경기 수. 그 수를 채우는 라운드만 만들고 서버가 그 수에서 자른다. */
export type WeeksPlan =
  | { readonly kind: 'single' }
  | { readonly kind: 'double' }
  | { readonly kind: 'custom'; readonly weeks: number }
  | { readonly kind: 'fixtures'; readonly count: number };

export function roundRobinRounds(teamCount: number, legs: RoundRobinLegs): number {
  if (teamCount < 2) return 0;
  const padded = teamCount % 2 === 0 ? teamCount : teamCount + 1;
  return (padded - 1) * legs;
}

export function suggestedWeeks(teamCount: number, legs: RoundRobinLegs, gamesPerTeamPerDay = 1): number {
  return Math.max(1, Math.ceil(roundRobinRounds(teamCount, legs) / Math.max(1, gamesPerTeamPerDay)));
}

/**
 * 이 계획이 서버에 요청할 총 라운드 수. 단일/홈앤어웨이는 라운드로빈 한 바퀴(들)로 못 박는다 —
 * 팀당 하루 경기 수로 주차가 올림되어도 남는 칸에 앞 라운드를 다시 만들지 않는다.
 * 직접 입력은 `주차 × 하루 경기`를 그대로 쓴다(넘치면 서버가 처음부터 다시 돈다).
 */
/** 총 경기 수를 채우는 라운드 수(한 라운드 = floor(팀 수 / 2)경기). */
export function roundsForFixtureCount(teamCount: number, fixtureCount: number): number {
  const perRound = Math.floor(teamCount / 2);
  return perRound < 1 || fixtureCount < 1 ? 0 : Math.ceil(fixtureCount / perRound);
}

export function plannedRounds(plan: WeeksPlan, teamCount: number, weeksCount: number, gamesPerTeamPerDay = 1): number {
  if (plan.kind === 'custom') return weeksCount * Math.max(1, gamesPerTeamPerDay);
  if (plan.kind === 'fixtures') return roundsForFixtureCount(teamCount, plan.count);
  return roundRobinRounds(teamCount, plan.kind === 'double' ? 2 : 1);
}

export function resolveWeeksCount(plan: WeeksPlan, teamCount: number, gamesPerTeamPerDay = 1): number {
  if (plan.kind === 'custom') return plan.weeks;
  if (plan.kind === 'fixtures') return Math.max(1, Math.ceil(roundsForFixtureCount(teamCount, plan.count) / Math.max(1, gamesPerTeamPerDay)));
  return suggestedWeeks(teamCount, plan.kind === 'double' ? 2 : 1, gamesPerTeamPerDay);
}

/** 이 라운드 수로 만들어질 경기 수 — 서버와 같은 셈(한 라운드 = floor(팀 수 / 2)경기). */
export function plannedGameCount(teamCount: number, rounds: number): number {
  if (teamCount < 2 || rounds < 1) return 0;
  return rounds * Math.floor(teamCount / 2);
}

const PLAN_LABEL: Record<WeeksPlan['kind'], string> = {
  single: '단일 라운드로빈',
  double: '홈앤어웨이',
  custom: '직접 입력',
  fixtures: '총 경기 수',
};

export function weeksPlanLabel(plan: WeeksPlan): string {
  return PLAN_LABEL[plan.kind];
}

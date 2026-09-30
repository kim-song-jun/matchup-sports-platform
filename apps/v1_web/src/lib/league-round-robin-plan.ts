/**
 * 리그 대진 "주차 수"를 팀 수로 제안한다(Task 180 G13 F40).
 *
 * 서버 라운드로빈(`apps/v1_api/src/common/scheduling/round-robin.ts`)과 같은 셈이어야 한다 —
 * 홀수 팀은 부전 한 자리를 더해 라운드 = (짝수로 맞춘 팀 수 − 1), 주차 수만큼 라운드를 돌리고
 * (넘치면 처음부터 다시 돈다) 한 라운드는 floor(팀 수 / 2)경기다. 서버는 총 라운드를
 * `weeksCount × gamesPerTeamPerDay` 로 만든다.
 */

export type RoundRobinLegs = 1 | 2;

export type WeeksPlan = { readonly kind: 'single' } | { readonly kind: 'double' } | { readonly kind: 'custom'; readonly weeks: number };

export function roundRobinRounds(teamCount: number, legs: RoundRobinLegs): number {
  if (teamCount < 2) return 0;
  const padded = teamCount % 2 === 0 ? teamCount : teamCount + 1;
  return (padded - 1) * legs;
}

export function suggestedWeeks(teamCount: number, legs: RoundRobinLegs, gamesPerTeamPerDay = 1): number {
  return Math.max(1, Math.ceil(roundRobinRounds(teamCount, legs) / Math.max(1, gamesPerTeamPerDay)));
}

/**
 * 제안 주차가 라운드를 딱 담지 못해 서버가 처음 라운드부터 다시 돌리는 라운드 수. 남는 칸은
 * 팀당 하루 경기 수보다 적어 전부 마지막 주에 들어간다 — 예: 4팀 단일·하루 2경기 → 2주 4라운드 중 1개.
 */
export function repeatedRounds(teamCount: number, legs: RoundRobinLegs, gamesPerTeamPerDay = 1): number {
  const rounds = roundRobinRounds(teamCount, legs);
  if (rounds === 0) return 0;
  return suggestedWeeks(teamCount, legs, gamesPerTeamPerDay) * Math.max(1, gamesPerTeamPerDay) - rounds;
}

export function resolveWeeksCount(plan: WeeksPlan, teamCount: number, gamesPerTeamPerDay = 1): number {
  if (plan.kind === 'custom') return plan.weeks;
  return suggestedWeeks(teamCount, plan.kind === 'double' ? 2 : 1, gamesPerTeamPerDay);
}

/** 이 주차 수로 만들어질 경기 수 — 서버와 같은 셈. */
export function plannedGameCount(teamCount: number, weeksCount: number, gamesPerTeamPerDay = 1): number {
  if (teamCount < 2 || weeksCount < 1) return 0;
  return weeksCount * Math.max(1, gamesPerTeamPerDay) * Math.floor(teamCount / 2);
}

const PLAN_LABEL: Record<WeeksPlan['kind'], string> = {
  single: '단일 라운드로빈',
  double: '홈앤어웨이',
  custom: '직접 입력',
};

export function weeksPlanLabel(plan: WeeksPlan): string {
  return PLAN_LABEL[plan.kind];
}

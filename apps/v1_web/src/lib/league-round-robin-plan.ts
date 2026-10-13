/**
 * 리그 대진 계획 — 몇 라운드·몇 경기를 만들고, 경기 날짜가 며칠 필요한가(Task 180 G13 F40).
 *
 * 서버 라운드로빈(`apps/v1_api/src/common/scheduling/round-robin.ts`)과 같은 셈이어야 한다 —
 * 홀수 팀은 부전 한 자리를 더해 라운드 = (짝수로 맞춘 팀 수 − 1), 한 라운드는 floor(팀 수 / 2)경기다.
 * 하루 경기 수(전 팀 합계)를 주면 서버가 대진 순서대로 하루 그 수씩 묶고, 안 주면 하루에 한 라운드다
 * (2026-10-13 사용자 확정 — 예전 '팀당 하루 경기'는 하루 경기가 라운드 크기의 배수로만 정해졌다).
 */

export type RoundRobinLegs = 1 | 2;

/**
 * `fixtures` = 리그를 만들 때 정한 총 경기 수. 그 수를 채우는 라운드만 만들고 서버가 그 수에서 자른다.
 * `custom.weeks` = 운영자가 직접 넣은 경기 날짜(주차) 수 — 하루 경기 수만큼 곱해 경기 수가 된다.
 */
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

export interface FixturePlan {
  /** 서버에 보낼 라운드 수(`weeksCount`). */
  readonly rounds: number;
  /** 만들어질 경기 수. 마지막 라운드를 다 쓰지 않으면 서버에 `fixtureCount` 로 알린다. */
  readonly games: number;
  /** 필요한 경기 날짜(주차) 수 = ceil(경기 수 / 하루 경기 수). */
  readonly days: number;
}

/** 계획 → 라운드·경기·날짜 수. 팀이 2개 미만이면 만들 대진이 없지만 입력 칸은 1 이상으로 둔다. */
export function resolveFixturePlan(plan: WeeksPlan, teamCount: number, gamesPerDay: number | null): FixturePlan {
  const perRound = Math.floor(teamCount / 2);
  if (perRound < 1) return { rounds: 1, games: 0, days: 1 };
  const perDay = gamesPerDay !== null && gamesPerDay >= 1 ? gamesPerDay : perRound;
  const games =
    plan.kind === 'fixtures'
      ? plan.count
      : plan.kind === 'custom'
        ? plan.weeks * perDay
        : roundRobinRounds(teamCount, plan.kind === 'double' ? 2 : 1) * perRound;
  return { rounds: Math.max(1, Math.ceil(games / perRound)), games, days: Math.max(1, Math.ceil(games / perDay)) };
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

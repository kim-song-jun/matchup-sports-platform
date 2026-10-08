import { generateRoundRobinFixtures } from './round-robin-schedule';

export const LEAGUE_TEMPLATE_MIN_TEAMS = 3;
export const LEAGUE_TEMPLATE_MAX_TEAMS = 20;

export type LeagueTemplatePlan = {
  slotPositions: number[];
  fixtures: Array<{ round: number; homePosition: number; awayPosition: number }>;
  totalRounds: number;
};

/**
 * 정규 리그 빈 경기 계획. 팀 자리를 1..N 순번으로 두고 라운드로빈 페어링을 그대로 쓴다.
 * 자리 순번을 두 자리 0 패딩 문자열 id 로 넘기는 이유: 커널의 홈 균형 tie-break 가 id 를 문자열로
 * 비교하므로 `'2' < '10'` 같은 사전식 역전을 막는다.
 */
export function planLeagueTemplate(input: { teamCount: number; legs: 1 | 2 }): LeagueTemplatePlan {
  const slotPositions = Array.from({ length: input.teamCount }, (_, index) => index + 1);
  const cycleRounds = input.teamCount % 2 === 0 ? input.teamCount - 1 : input.teamCount;
  const totalRounds = cycleRounds * input.legs;
  const idOf = (position: number) => String(position).padStart(2, '0');
  const fixtures = generateRoundRobinFixtures(slotPositions.map(idOf), totalRounds).map((fixture) => ({
    round: fixture.round,
    homePosition: Number(fixture.homeTeamId),
    awayPosition: Number(fixture.awayTeamId),
  }));
  return { slotPositions, fixtures, totalRounds };
}

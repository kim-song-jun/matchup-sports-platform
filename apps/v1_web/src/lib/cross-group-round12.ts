import { formatTournamentTieBreakRule } from '@/lib/tournament-tie-break';
import type { V1TournamentTieBreakOrder } from '@/types/api';
import type { CrossGroupPreview, CrossGroupTeam } from '@/types/cross-group-round12';

/** 서버 `cross-group-round12-plan.ts` 와 같은 기준이다. 맞대결은 다른 조 팀끼리 경기가 없고, 페어플레이는 조 간 성적에 담기지 않아 건너뛴다. */
const CROSS_GROUP_VALUES = {
  goal_difference: (team: CrossGroupTeam) => team.goalsFor - team.goalsAgainst,
  goals_for: (team: CrossGroupTeam) => team.goalsFor,
} as const;
type CrossGroupCriterion = keyof typeof CROSS_GROUP_VALUES;

const crossGroupCriteria = (order: V1TournamentTieBreakOrder): CrossGroupCriterion[] =>
  order.filter((criterion): criterion is CrossGroupCriterion => criterion === 'goal_difference' || criterion === 'goals_for');

/** 승점이 먼저이고 그다음은 대회의 동점 순서에서 조 간에 쓸 수 있는 기준만 순서대로 본다. 0이면 완전 동률이다. */
export const compareCrossGroupTeams = (a: CrossGroupTeam, b: CrossGroupTeam, order: V1TournamentTieBreakOrder): number => {
  if (a.points !== b.points) return b.points - a.points;
  for (const criterion of crossGroupCriteria(order)) {
    const value = CROSS_GROUP_VALUES[criterion];
    if (value(a) !== value(b)) return value(b) - value(a);
  }
  return 0;
};

/** 화면 안내 문구용: "승점 → 득실차 → 다득점". 비교에 실제로 쓰는 기준만 같은 순서로 보여 준다. */
export const formatCrossGroupRule = (order: V1TournamentTieBreakOrder): string =>
  formatTournamentTieBreakRule(['points', ...crossGroupCriteria(order)]);

export function crossGroupRecommendation(preview: CrossGroupPreview, picks: readonly string[]) {
  if (picks.length !== 15 || picks.some((id) => !id) || new Set(picks).size !== 15) return null;
  const teams = new Map(preview.teams.map((team) => [team.registrationId, team]));
  if (picks.some((id, index) => !preview.ranks[index].candidates.includes(id) || !teams.has(id))) return null;
  return [1, 2, 3].flatMap((rank) => picks.filter((_, index) => preview.ranks[index].rank === rank)
    .sort((a, b) => compareCrossGroupTeams(teams.get(a)!, teams.get(b)!, preview.tieBreakOrder)));
}

/** 선택된 팀이 다른 자리에 있으면 두 자리 교환. 중복이 생기는 중간 초안도 만들지 않는다. */
export function swapRound12Assignment(assignments: readonly string[], index: number, selected: string): string[] {
  const next = [...assignments];
  const previous = next[index];
  const other = next.indexOf(selected);
  next[index] = selected;
  if (other >= 0 && other !== index) next[other] = previous;
  return next;
}

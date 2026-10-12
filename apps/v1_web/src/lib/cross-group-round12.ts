import type { CrossGroupPreview, CrossGroupTeam } from '@/types/cross-group-round12';
export const compareCrossGroupTeams = (a: CrossGroupTeam, b: CrossGroupTeam): number =>
  b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor;

export function crossGroupRecommendation(preview: CrossGroupPreview, picks: readonly string[]) {
  if (picks.length !== 15 || picks.some((id) => !id) || new Set(picks).size !== 15) return null;
  const teams = new Map(preview.teams.map((team) => [team.registrationId, team]));
  if (picks.some((id, index) => !preview.ranks[index].candidates.includes(id) || !teams.has(id))) return null;
  return [1, 2, 3].flatMap((rank) => picks.filter((_, index) => preview.ranks[index].rank === rank)
    .sort((a, b) => compareCrossGroupTeams(teams.get(a)!, teams.get(b)!)));
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

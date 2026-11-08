import { UnprocessableEntityException } from '@nestjs/common';
import type { TieBreakOrder } from '../competition-config/tournament-tie-break-order';

export type CrossGroupTeam = {
  registrationId: string; teamName: string; groupId: string; groupName: string;
  points: number; goalsFor: number; goalsAgainst: number;
};
export type CrossGroupRank = { groupId: string; groupName: string; rank: number; candidates: string[] };
export type CrossGroupTarget = {
  seed: number; label: string; fixtureId: string; side: 'HOME' | 'AWAY';
  slotId: string | null; currentRegistrationId: string | null;
  byePosition: number | null; groupId: string;
};
export type CrossGroupPreview = {
  version: string; tieBreakOrder: TieBreakOrder; teams: CrossGroupTeam[]; ranks: CrossGroupRank[]; targets: CrossGroupTarget[];
};
export type CrossGroupSelection = {
  rankPicks: string[]; rankingOrder: string[]; assignments: string[];
};

/** The only tie-break criteria that compare teams of different groups: head-to-head needs a game between them and fair play is not part of the cross-group stats. */
const CROSS_GROUP_VALUES = {
  goal_difference: (team: CrossGroupTeam) => team.goalsFor - team.goalsAgainst,
  goals_for: (team: CrossGroupTeam) => team.goalsFor,
} as const;
type CrossGroupCriterion = keyof typeof CROSS_GROUP_VALUES;

const crossGroupCriteria = (order: TieBreakOrder): CrossGroupCriterion[] =>
  order.filter((criterion): criterion is CrossGroupCriterion => criterion === 'goal_difference' || criterion === 'goals_for');

/** Points first, then the tournament's own tie-break order restricted to `crossGroupCriteria`; 0 means fully level. */
export const compareCrossGroupTeams = (a: CrossGroupTeam, b: CrossGroupTeam, order: TieBreakOrder): number => {
  if (a.points !== b.points) return b.points - a.points;
  for (const criterion of crossGroupCriteria(order)) {
    const value = CROSS_GROUP_VALUES[criterion];
    if (value(a) !== value(b)) return value(b) - value(a);
  }
  return 0;
};

function invalid(message: string): never {
  throw new UnprocessableEntityException({ code: 'ROUND12_SELECTION_INVALID', message });
}
const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && new Set(a).size === a.length && a.every((id) => b.includes(id));

/** 순위 선택과 배치는 분리한다. 진출팀 선정은 검증하고 진출 12팀 안의 자리 교환은 허용한다. */
export function validateCrossGroupSelection(preview: CrossGroupPreview, input: CrossGroupSelection): string[] {
  if (input.rankPicks.length !== 15 || input.rankingOrder.length !== 15 || input.assignments.length !== 12) {
    invalid('조별 순위 15자리와 진출팀 12자리를 모두 골라 주세요.');
  }
  const used = new Set<string>();
  preview.ranks.forEach((rank, index) => {
    const picked = input.rankPicks[index];
    if (!rank.candidates.includes(picked) || used.has(picked)) invalid('조별 순위 후보가 잘못됐거나 같은 팀을 두 번 골랐어요.');
    used.add(picked);
  });
  const teams = new Map(preview.teams.map((team) => [team.registrationId, team]));
  for (let rank = 1; rank <= 3; rank += 1) {
    const candidates = input.rankPicks.filter((_, index) => preview.ranks[index].rank === rank);
    const ordered = input.rankingOrder.slice((rank - 1) * 5, rank * 5);
    if (!sameSet(ordered, candidates)) invalid('서로 같은 조별 순위의 팀끼리 비교해 주세요.');
    for (let i = 1; i < ordered.length; i += 1) {
      if (compareCrossGroupTeams(teams.get(ordered[i - 1])!, teams.get(ordered[i])!, preview.tieBreakOrder) > 0) {
        invalid('조 간 성적 순서를 바꿀 수 없어요. 완전 동률인 팀만 순서를 정할 수 있어요.');
      }
    }
  }
  const qualified = input.rankingOrder.slice(0, 12);
  if (!sameSet(input.assignments, qualified)) invalid('선정된 진출 12팀을 중복 없이 배정해 주세요.');
  return qualified;
}

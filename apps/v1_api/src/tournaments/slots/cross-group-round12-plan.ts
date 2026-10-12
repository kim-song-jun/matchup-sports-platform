import { UnprocessableEntityException } from '@nestjs/common';

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
  version: string; teams: CrossGroupTeam[]; ranks: CrossGroupRank[]; targets: CrossGroupTarget[];
};
export type CrossGroupSelection = {
  rankPicks: string[]; rankingOrder: string[]; assignments: string[];
};
export const compareCrossGroupTeams = (a: CrossGroupTeam, b: CrossGroupTeam): number =>
  b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor;

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
      if (compareCrossGroupTeams(teams.get(ordered[i - 1])!, teams.get(ordered[i])!) > 0) {
        invalid('승점·골득실·다득점 순서를 바꿀 수 없어요. 완전 동률인 팀만 순서를 정할 수 있어요.');
      }
    }
  }
  const qualified = input.rankingOrder.slice(0, 12);
  if (!sameSet(input.assignments, qualified)) invalid('선정된 진출 12팀을 중복 없이 배정해 주세요.');
  return qualified;
}

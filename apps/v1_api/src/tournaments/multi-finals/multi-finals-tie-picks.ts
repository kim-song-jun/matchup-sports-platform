import { ConflictException } from '@nestjs/common';
import { invalidMultiFinal } from './multi-finals-plan';
import type { SeedGroup } from './multi-finals-seeding';
import { rankOrderSeeds, type TiePick } from './multi-finals-standings';

type Rule = { groupId: string; rank: number };
/** The slice of a view `finals[]` entry that the picks are checked against. */
export type TiePickFinal = {
  rules: readonly Rule[];
  unresolved: ReadonlyArray<Rule & { state: string; tiedRegistrationIds: readonly string[] }>;
  suggestedRegistrationIds: readonly string[];
};

export const rankTied = () => new ConflictException({ code: 'MULTI_FINAL_RANK_TIED', message: '동률 자리에 올릴 팀을 먼저 골라 주세요.' });
const seat = (rule: Rule) => `${rule.groupId}:${rule.rank}`;

/** Seat → picked team. Each pick must settle a drawn-tie seat of this final with one of that seat's tied teams, one team per seat. */
export function validateTiePicks(final: TiePickFinal, picks: readonly TiePick[]): Map<string, string> {
  const open = new Map(final.unresolved.filter(rule => rule.state === 'tied').map(rule => [seat(rule), rule.tiedRegistrationIds]));
  const chosen = new Map<string, string>(); const teams = new Set<string>();
  for (const pick of picks) {
    const candidates = open.get(seat(pick));
    if (!candidates) return invalidMultiFinal('동률인 자리에서만 팀을 고를 수 있어요.');
    if (!candidates.includes(pick.registrationId)) return invalidMultiFinal('그 자리의 동률 팀 중에서 골라 주세요.');
    if (chosen.has(seat(pick)) || teams.has(pick.registrationId)) return invalidMultiFinal('동률 자리마다 다른 팀을 골라 주세요.');
    chosen.set(seat(pick), pick.registrationId); teams.add(pick.registrationId);
  }
  return chosen;
}

/**
 * Per-group ranks 1-3 for cross placement: settled ranks come from the recommendation, drawn-tie ranks from the picks.
 * `groupOrder` is the config's group order, which fixes the A/B/C/D lanes.
 */
export function crossSeedGroups(final: TiePickFinal, groupOrder: readonly string[], picks: readonly TiePick[] = []): SeedGroup[] {
  const chosen = validateTiePicks(final, picks);
  const settled = rankOrderSeeds(final);
  const tied = new Set(final.unresolved.filter(rule => rule.state === 'tied').map(seat));
  const teamAt = new Map<string, string>();
  for (const [index, rule] of final.rules.entries()) {
    const team = settled[index] ?? chosen.get(seat(rule));
    if (team !== undefined) teamAt.set(seat(rule), team);
    else if (tied.has(seat(rule))) throw rankTied();
    else return invalidMultiFinal('예선 순위가 모두 정해진 뒤에 교차 배치할 수 있어요.');
  }
  return groupOrder.map(id => ({ id, ranks: [1, 2, 3].flatMap(rank => teamAt.get(seat({ groupId: id, rank })) ?? []) }));
}

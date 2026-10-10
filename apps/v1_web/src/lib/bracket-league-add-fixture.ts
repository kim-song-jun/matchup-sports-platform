import { buildLeagueGrid, leagueRoundLabel, sortLeagueGroups } from '@/lib/bracket-league-grid-model';
import type { V1AdminBracketFixture, V1AdminBracketGroup } from '@/types/api';

const NEW_LEAGUE_ROUND = 'new';

export type LeagueRoundChoice = { value: string; label: string; round: string; name: string };
export type LeagueRoundPlan = { choices: LeagueRoundChoice[]; defaultChoice: LeagueRoundChoice };

/** 서버가 리그 대회 조를 phase 'group' 으로만 허용한다 — 방어적으로 한 번 더 거른다. */
export function leagueAddableGroups(groups: readonly V1AdminBracketGroup[]): V1AdminBracketGroup[] {
  return sortLeagueGroups(groups.filter((group) => group.phase === 'group'));
}

const choiceOf = (n: number, isNew: boolean): LeagueRoundChoice => ({
  value: isNew ? NEW_LEAGUE_ROUND : `r${n}`,
  label: isNew ? `새 라운드 (${leagueRoundLabel(n)})` : leagueRoundLabel(n),
  round: `league_r${n}`,
  name: leagueRoundLabel(n),
});

export function leagueRoundPlan(input: {
  groups: readonly V1AdminBracketGroup[];
  fixtures: readonly V1AdminBracketFixture[];
}): LeagueRoundPlan {
  const numbers = buildLeagueGrid(input).rows.map((row) => row.roundNumber);
  const created = choiceOf((numbers.at(-1) ?? 0) + 1, true);
  const existing = numbers.map((n) => choiceOf(n, false));
  return { choices: [...existing, created], defaultChoice: existing.at(-1) ?? created };
}

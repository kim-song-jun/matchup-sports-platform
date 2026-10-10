import { leagueRoundLabel, leagueRoundNumber, sortLeagueGroups } from '@/lib/bracket-league-grid-model';
import type { V1AdminBracketFixture, V1AdminBracketGroup } from '@/types/api';

const NEW_LEAGUE_ROUND = 'new';

export type LeagueRoundChoice = { value: string; label: string; round: string; name: string };
export type LeagueRoundPlan = { choices: LeagueRoundChoice[]; defaultChoice: LeagueRoundChoice };
export type LeagueRoundResolution = { round: string; roundName: string | null };

/** 서버가 리그 대회 조를 phase 'group' 으로만 허용한다 — 방어적으로 한 번 더 거른다. */
export function leagueAddableGroups(groups: readonly V1AdminBracketGroup[]): V1AdminBracketGroup[] {
  return sortLeagueGroups(groups.filter((group) => group.phase === 'group'));
}

/**
 * 번호(league_r{n}) 경기가 하나도 없는 대진. 격자 모델은 대회 전체에 번호가 하나라도 생기면 옛 경기를
 * 조별 끊김 행에서 빼 한 행으로 뭉치므로, 이 경우 새 경기는 옛 round 값을 이어 써야 한다.
 */
export function isLegacyLeagueBracket(fixtures: readonly V1AdminBracketFixture[]): boolean {
  return fixtures.length > 0 && fixtures.every((fixture) => leagueRoundNumber(fixture.round) === null);
}

const choiceOf = (n: number, isNew: boolean): LeagueRoundChoice => ({
  value: isNew ? NEW_LEAGUE_ROUND : `r${n}`,
  label: isNew ? `새 라운드 (${leagueRoundLabel(n)})` : leagueRoundLabel(n),
  round: `league_r${n}`,
  name: leagueRoundLabel(n),
});

export function leagueRoundPlan(fixtures: readonly V1AdminBracketFixture[]): LeagueRoundPlan {
  const numbers = [...new Set(fixtures.flatMap((fixture) => {
    const n = leagueRoundNumber(fixture.round);
    return n === null ? [] : [n];
  }))].sort((a, b) => a - b);
  const latest = numbers.length === 0 ? 0 : numbers[numbers.length - 1];
  const created = choiceOf(latest + 1, true);
  const existing = numbers.map((n) => choiceOf(n, false));
  return { choices: [...existing, created], defaultChoice: existing.length === 0 ? created : existing[existing.length - 1] };
}

const newest = (list: readonly V1AdminBracketFixture[]) =>
  list.reduce<V1AdminBracketFixture | null>((best, fixture) => (best === null || fixture.fixtureNumber > best.fixtureNumber ? fixture : best), null);

export function resolveLeagueRound(input: {
  fixtures: readonly V1AdminBracketFixture[];
  groupId: string;
  choice: LeagueRoundChoice;
}): LeagueRoundResolution {
  const { fixtures, groupId, choice } = input;
  if (isLegacyLeagueBracket(fixtures)) {
    const reuse = newest(fixtures.filter((fixture) => fixture.groupId === groupId)) ?? newest(fixtures);
    if (reuse !== null) return { round: reuse.round, roundName: null };
  }
  return { round: choice.round, roundName: choice.name };
}

// apps/v1_api/src/tournaments/slots/group-rank-preview.ts
import {
  calculateLeagueStandingsWithTieBreakInfo,
  type LeagueStandingFixture,
} from '../../league-matches/league-standings';
import { LEAGUE_TIE_BREAK_ORDER } from '../../league-matches/league-tie-break';

export type RankFixtureInput = {
  homeRegistrationId: string | null;
  awayRegistrationId: string | null;
  official: { homeScore: number; awayScore: number } | null;
};
export type RankStandingInput = {
  registrationId: string;
  position: number | null;
  wins: number;
  draws: number;
  losses: number;
};
export type GroupRankSource = {
  registrationIds: readonly string[];
  fixtures: readonly RankFixtureInput[];
  standings: readonly RankStandingInput[];
};
export type GroupRankResolution =
  | { state: 'group_incomplete' }
  | { state: 'ready'; registrationId: string }
  | { state: 'tied'; tiedRegistrationIds: string[] };

const INCOMPLETE: GroupRankResolution = { state: 'group_incomplete' };

/** 확정된 결과만 모아 §5 계산 입력으로 바꾼다. 하나라도 덜 끝났거나 순위표가 낡았으면 null. */
function settledResults(source: GroupRankSource): LeagueStandingFixture[] | null {
  if (source.fixtures.length === 0) return null;
  const results: LeagueStandingFixture[] = [];
  for (const fixture of source.fixtures) {
    if (fixture.homeRegistrationId === null || fixture.awayRegistrationId === null || fixture.official === null) return null;
    results.push({
      homeTeamId: fixture.homeRegistrationId,
      awayTeamId: fixture.awayRegistrationId,
      homeScore: fixture.official.homeScore,
      awayScore: fixture.official.awayScore,
    });
  }
  const rowById = new Map(source.standings.map((row) => [row.registrationId, row]));
  let played = 0;
  for (const registrationId of source.registrationIds) {
    const row = rowById.get(registrationId);
    if (row === undefined || row.position === null) return null;
    played += row.wins + row.draws + row.losses;
  }
  // 순위 재계산은 결과 확정의 비동기 후속이다 — 확정 경기 수와 표의 소화 경기 수가 어긋나면 표가 낡은 것.
  return played === results.length * 2 ? results : null;
}

export function resolveGroupRank(source: GroupRankSource, rank: number): GroupRankResolution {
  const results = settledResults(source);
  if (results === null) return INCOMPLETE;
  const league = calculateLeagueStandingsWithTieBreakInfo({
    teamIds: source.registrationIds,
    fixtures: results,
    tieBreakOrder: LEAGUE_TIE_BREAK_ORDER,
  });
  const byRule = league.standings[rank - 1]?.teamId;
  if (byRule === undefined) return INCOMPLETE;
  const tie = league.tieGroups.find((group) => group.teamIds.includes(byRule));
  if (tie !== undefined) return { state: 'tied', tiedRegistrationIds: tie.teamIds };
  const stored = source.standings.find((row) => row.position === rank)?.registrationId;
  if (stored === undefined) return INCOMPLETE;
  // 저장 순위(대회 설정 규칙)와 §5 가 갈라지는 드문 경우 — 어느 쪽도 정답이라 못 박지 않고 운영자에게 넘긴다.
  if (stored !== byRule) return { state: 'tied', tiedRegistrationIds: [stored, byRule].sort() };
  return { state: 'ready', registrationId: stored };
}

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

export type GroupQualification = { advancingRegistrationIds: string[]; undecided: boolean };
export type GroupStandingSummary = {
  /** §5 로 끝까지 안 갈린 팀만 들어간다. 값 = 그 동률 묶음 팀들의 저장 position 중 최솟값. */
  sharedRankByRegistrationId: Map<string, number>;
  /** advanceCount 가 null 이면 null. */
  qualification: GroupQualification | null;
};

/**
 * 공개 순위표용 요약. 어드민의 "동률 — 직접 고르기" 판정(resolveGroupRank)과 같은 settledResults 를 쓴다.
 * 결선 대진에 실제로 들어간 팀이 하나라도 있으면 그 팀들이 진출 팀이다(어드민이 동률 자리에 직접 고른 결과).
 */
export function summarizeGroupStanding(
  source: GroupRankSource,
  advanceCount: number | null,
  placedRegistrationIds: ReadonlySet<string>,
): GroupStandingSummary | null {
  const results = settledResults(source);
  if (results === null) return null;
  const league = calculateLeagueStandingsWithTieBreakInfo({
    teamIds: source.registrationIds,
    fixtures: results,
    tieBreakOrder: LEAGUE_TIE_BREAK_ORDER,
  });
  const positionById = new Map(source.standings.map((row) => [row.registrationId, row.position]));
  const sharedRankByRegistrationId = new Map<string, number>();
  for (const tie of league.tieGroups) {
    if (tie.teamIds.length < 2) continue;
    const positions = tie.teamIds.flatMap((id) => positionById.get(id) ?? []);
    if (positions.length === 0) continue;
    const shared = Math.min(...positions);
    for (const id of tie.teamIds) sharedRankByRegistrationId.set(id, shared);
  }
  return { sharedRankByRegistrationId, qualification: qualificationOf(source, advanceCount, placedRegistrationIds) };
}

function qualificationOf(
  source: GroupRankSource,
  advanceCount: number | null,
  placedRegistrationIds: ReadonlySet<string>,
): GroupQualification | null {
  if (advanceCount === null) return null;
  const resolutions: GroupRankResolution[] = [];
  const effectiveCount = Math.min(advanceCount, source.registrationIds.length);
  for (let rank = 1; rank <= effectiveCount; rank += 1) {
    const resolution = resolveGroupRank(source, rank);
    if (resolution.state === 'group_incomplete') return null;
    resolutions.push(resolution);
  }
  // 조 전체가 올라가면 동률이 어디에 걸려도 진출 팀은 이미 정해졌다.
  if (effectiveCount >= source.registrationIds.length) {
    return { advancingRegistrationIds: [...source.registrationIds].sort(), undecided: false };
  }
  const anyTied = resolutions.some((resolution) => resolution.state === 'tied');
  const members = new Set(source.registrationIds);
  const placed = [...placedRegistrationIds].filter((id) => members.has(id)).sort();
  if (placed.length > 0) {
    return { advancingRegistrationIds: placed, undecided: placed.length < effectiveCount && anyTied };
  }
  return {
    advancingRegistrationIds: resolutions.flatMap((resolution) => (resolution.state === 'ready' ? [resolution.registrationId] : [])),
    undecided: anyTied,
  };
}

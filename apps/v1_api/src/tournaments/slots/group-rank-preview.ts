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
  /** 공식 리비전이 확정된 시각. 순위표가 이 결과를 반영했는지 가리는 데만 쓴다. */
  officialAt: Date | null;
};
export type RankStandingInput = {
  registrationId: string;
  position: number | null;
  wins: number;
  draws: number;
  losses: number;
  recalculatedAt: Date | null;
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
  if (played !== results.length * 2) return null;
  return isStandingStale(source) ? null : results;
}

/**
 * 결과 정정은 경기 수를 바꾸지 않아 소화 경기 수 검사로는 못 잡는다 — 정정된 공식 리비전이
 * 순위 재계산보다 늦으면 낡은 표다. 재계산 시각이 없는 옛 행이 있으면 비교하지 않는다.
 */
function isStandingStale(source: GroupRankSource): boolean {
  const members = new Set(source.registrationIds);
  const stamps: number[] = [];
  for (const row of source.standings) {
    if (!members.has(row.registrationId)) continue;
    if (row.recalculatedAt === null) return false;
    stamps.push(row.recalculatedAt.getTime());
  }
  const oldest = Math.min(...stamps);
  return source.fixtures.some((fixture) => fixture.officialAt !== null && fixture.officialAt.getTime() > oldest);
}

type GroupLeague = ReturnType<typeof calculateLeagueStandingsWithTieBreakInfo>;

function leagueOf(source: GroupRankSource, results: LeagueStandingFixture[]): GroupLeague {
  return calculateLeagueStandingsWithTieBreakInfo({
    teamIds: source.registrationIds,
    fixtures: results,
    tieBreakOrder: LEAGUE_TIE_BREAK_ORDER,
  });
}

function resolveRankIn(source: GroupRankSource, league: GroupLeague, rank: number): GroupRankResolution {
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

export function resolveGroupRank(source: GroupRankSource, rank: number): GroupRankResolution {
  const results = settledResults(source);
  if (results === null) return INCOMPLETE;
  return resolveRankIn(source, leagueOf(source, results), rank);
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
  const league = leagueOf(source, results);
  const positionById = new Map(source.standings.map((row) => [row.registrationId, row.position]));
  const sharedRankByRegistrationId = new Map<string, number>();
  for (const tie of league.tieGroups) {
    if (tie.teamIds.length < 2) continue;
    const positions = tie.teamIds.flatMap((id) => positionById.get(id) ?? []);
    if (positions.length === 0) continue;
    const shared = Math.min(...positions);
    for (const id of tie.teamIds) sharedRankByRegistrationId.set(id, shared);
  }
  return { sharedRankByRegistrationId, qualification: qualificationOf(source, league, advanceCount, placedRegistrationIds) };
}

function qualificationOf(
  source: GroupRankSource,
  league: GroupLeague,
  advanceCount: number | null,
  placedRegistrationIds: ReadonlySet<string>,
): GroupQualification | null {
  if (advanceCount === null) return null;
  const effectiveCount = Math.min(advanceCount, source.registrationIds.length);
  const orderIndexById = new Map(league.standings.map((row, index) => [row.teamId, index]));
  const positionById = new Map(source.standings.map((row) => [row.registrationId, row.position]));
  const isInsideLine = (id: string) =>
    (orderIndexById.get(id) ?? Infinity) < effectiveCount && (positionById.get(id) ?? Infinity) <= effectiveCount;
  // 진출 자리 순서대로 모은 확정 팀. 진출선 안쪽 동률은 누가 올라가는지는 정해졌고 시드만 미정이라 여기 넣는다.
  const decided = new Set<string>();
  let straddlesLine = false;
  for (let rank = 1; rank <= effectiveCount; rank += 1) {
    const resolution = resolveRankIn(source, league, rank);
    if (resolution.state === 'group_incomplete') return null;
    if (resolution.state === 'ready') decided.add(resolution.registrationId);
    else if (resolution.tiedRegistrationIds.every(isInsideLine)) resolution.tiedRegistrationIds.forEach((id) => decided.add(id));
    else straddlesLine = true;
  }
  // 조 전체가 올라가면 동률이 어디에 걸려도 진출 팀은 이미 정해졌다.
  if (effectiveCount >= source.registrationIds.length) {
    return { advancingRegistrationIds: [...source.registrationIds].sort(), undecided: false };
  }
  const members = new Set(source.registrationIds);
  const placed = [...placedRegistrationIds].filter((id) => members.has(id)).sort();
  if (placed.length > 0) {
    return { advancingRegistrationIds: placed, undecided: placed.length < effectiveCount && straddlesLine };
  }
  return { advancingRegistrationIds: [...decided], undecided: straddlesLine };
}

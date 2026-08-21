// ── 리그 수명주기 판정 — 순수 함수 ─────────────────────────────────────────────
// DB 를 모른다. 서비스가 읽어 온 행의 최소 형태만 받아 "그래서 어떻게 되는가"를 결정한다.
//
// 왜 서비스 밖으로 뺐나: 이 저장소의 v1_api 는 공유 Prisma 클라이언트가 생성돼 있지 않아
// `@prisma/client` 를 import 하는 파일은 로컬에서 컴파일되지 않는다(손대지 않은 dev 에서도
// 유닛 스위트 49개가 같은 이유로 깨진다). 판정 로직이 서비스 안에 있으면 그 로직을 검증하는
// 테스트도 같이 못 돌아 CI 에서만 확인하게 되는데, 아래 세 판정은 전부 **한 줄 조건이 뒤집히면
// 데이터가 잘못 확정되는** 종류라 반드시 로컬에서도 돌아가는 테스트가 필요하다.
// league-standings.ts / league-promotion.ts 가 이미 쓰는 것과 같은 패턴이다.

/** 리그 대진 한 건 중 완료 판정에 필요한 최소 정보. */
export interface LeagueFixtureCompletionRow {
  status: string;
  hasOfficialResult: boolean;
}

/**
 * "이 리그를 completed 로 전이해야 하는가" (D-3).
 *
 * 취소된 대진은 결과가 영원히 생기지 않으므로 조건에서 완전히 제외한다 — 넣어 두면
 * 취소 대진이 하나라도 있는 리그는 절대 자동 완료되지 않는다. 순위 집계(R8)가 취소를
 * 제외하는 기준과 정확히 같아야 "순위표가 최종인데 리그는 진행 중"이 안 생긴다.
 *
 * 대진이 하나도 없거나 전부 취소된 리그는 "모두 확정"의 의미가 없어 대상이 아니다 —
 * 이게 없으면 대진을 만들기도 전의 draft 리그가 completed 로 튀어 오른다.
 */
export function shouldCompleteLeague(input: {
  state: string;
  fixtures: readonly LeagueFixtureCompletionRow[];
}): boolean {
  if (input.state !== 'active') return false;
  const live = input.fixtures.filter((fixture) => fixture.status !== 'cancelled');
  if (live.length === 0) return false;
  return live.every((fixture) => fixture.hasOfficialResult);
}

/** 시즌에 속한 티어 리그 한 건 중 승강 게이트 판정에 필요한 최소 정보. */
export interface SeasonLeagueRow {
  id: string;
  tier: number | null;
  state: string;
}

/**
 * "이 시즌으로 승강을 계산해도 되는가" — 아직 끝나지 않은 티어 리그를 돌려준다.
 * 빈 배열이면 계산 가능.
 *
 * 게이트를 `pendingFixtures > 0` 로 두면 안 된다(2026-08-21 재감사 실측). pendingFixtures
 * 는 **존재하는** 대진 중 미확정인 것만 세므로, 대진이 아직 하나도 없는 리그(draft)나 전
 * 대진이 취소된 리그는 pending 이 0 이라 그냥 통과한다. 그러면 전 팀 0승0무0패·0점인
 * 순위표가 승강 계산으로 넘어가고, tie-break 가 전부 소진된 뒤 calculateLeagueStandings 의
 * 결정적 폴백(팀ID 사전순)이 순위를 정한다 — **한 경기도 치르지 않은 시즌의 강등 팀이
 * UUID 사전순으로 뽑힌다.** alpha 에서 3티어 전부 draft·대진 0건인 시리즈로 재현해
 * 201 + 완전한 승강안을 받아 확인했다.
 *
 * 그래서 D-3 이 이미 만들어 둔 리그 상태를 기준으로 삼는다. `completed` 는 "취소 제외 전
 * 대진이 공식 결과를 확보했다"를 뜻하므로 승강이 요구하는 "확정 순위표"와 같은 조건이고,
 * draft·빈 리그를 자동으로 배제한다.
 */
export function findUnfinishedSeasonLeagues(
  leagues: readonly SeasonLeagueRow[],
): SeasonLeagueRow[] {
  return leagues.filter((league) => league.state !== 'completed');
}

/** 승강 확정 결과 한 건 중 다음 시즌 편성에 필요한 최소 정보. */
export interface ResolvedPromotionRow {
  teamId: string;
  toTier: number;
  kind: string;
}

export interface NextSeasonTierPlan {
  tier: number;
  teamIds: string[];
}

export interface NextSeasonPlan {
  /** 실제로 만들 티어. 팀 2개 이상인 것만 들어온다. */
  tiers: NextSeasonTierPlan[];
  /** 팀이 1개뿐이라 만들지 않은 티어. 운영자에게 알려야 한다. */
  skipped: NextSeasonTierPlan[];
}

/**
 * 승강 확정 결과로 다음 시즌 티어 편성을 계산한다.
 *
 * `create()` 와 `seedSeason()` 이 강제하는 **"서로 다른 팀 2개 이상"** 불변식을 이 경로도
 * 지킨다. 안 지키면 1팀짜리 리그가 만들어지는데(alpha 실측 사례 존재) 그건 라운드로빈
 * 대진이 0건이라 영원히 completed 가 되지 않고, regenerateFixtures 도 LEAGUE_TEAM_INVALID
 * 로 막혀 복구가 안 되는 死 리그다. 게다가 다음 시즌 승강 계산에 "1팀 티어"로 계속 참여한다.
 *
 * 확정 자체를 막지는 않는다 — 승강 결정은 이미 유효하고, 팀이 모자란 티어만 비우는 편이
 * 운영자가 수습할 여지를 남긴다. 대신 `skipped` 로 반드시 돌려준다.
 *
 * 탈퇴(withdrawn) 팀은 다음 시즌에 넣지 않는다.
 */
export function planNextSeasonTiers(input: {
  resolved: readonly ResolvedPromotionRow[];
  tierCount: number;
}): NextSeasonPlan {
  const tiers: NextSeasonTierPlan[] = [];
  const skipped: NextSeasonTierPlan[] = [];
  for (let tier = 1; tier <= input.tierCount; tier += 1) {
    const teamIds = input.resolved
      .filter((row) => row.kind !== 'withdrawn' && row.toTier === tier)
      .map((row) => row.teamId);
    if (teamIds.length >= 2) tiers.push({ tier, teamIds });
    else if (teamIds.length > 0) skipped.push({ tier, teamIds });
  }
  return { tiers, skipped };
}

/**
 * 이미 확정된 몰수 결과를 **저장된 값 그대로** 되읽는다 (멱등 응답용).
 *
 * 요청 dto 로 계산한 값을 돌려주면, 운영자가 몰수팀을 반대로 지정해 재호출했을 때
 * "0:1 · B팀 몰수, 처리 완료" 라는 응답을 받는데 DB 에는 여전히 1:0 · A팀 몰수가 남는다 —
 * 잘못 넣은 몰수를 고쳤다고 착각하게 만드는 거짓 성공이다(alpha 실측으로 재현).
 *
 * `score` 는 Json 컬럼이라 타입이 unknown 이다. 형태가 기대와 다르면 null 을 돌려주고
 * 호출부가 요청값으로 폴백하게 둔다 — 레거시 행 때문에 500 이 새지 않도록.
 */
export function parseStoredScore(value: unknown): { home: number; away: number } | null {
  if (value === null || typeof value !== 'object') return null;
  const { home, away } = value as { home?: unknown; away?: unknown };
  if (typeof home !== 'number' || typeof away !== 'number') return null;
  return { home, away };
}

export interface StoredForfeitOutcome {
  noShowTeamId: string;
  winningTeamId: string;
  homeScore: number;
  awayScore: number;
  /** 요청한 몰수팀이 이미 확정된 몰수팀과 같은지. false 면 이번 호출은 아무것도 바꾸지 않았다. */
  requestMatchesStored: boolean;
}

export function resolveStoredForfeit(input: {
  storedScore: unknown;
  hostTeamId: string;
  awayTeamId: string;
  requestedNoShowTeamId: string;
  /** 저장된 점수를 읽을 수 없을 때 쓰는 폴백(요청 기준 계산값). */
  fallback: { homeScore: number; awayScore: number };
}): StoredForfeitOutcome {
  const stored = parseStoredScore(input.storedScore);
  if (stored === null) {
    return {
      noShowTeamId: input.requestedNoShowTeamId,
      winningTeamId:
        input.requestedNoShowTeamId === input.hostTeamId ? input.awayTeamId : input.hostTeamId,
      homeScore: input.fallback.homeScore,
      awayScore: input.fallback.awayScore,
      requestMatchesStored: true,
    };
  }
  // 몰수는 항상 승자 1 : 몰수팀 0 이므로 점수가 낮은 쪽이 몰수팀이다.
  const noShowTeamId = stored.home < stored.away ? input.hostTeamId : input.awayTeamId;
  return {
    noShowTeamId,
    winningTeamId: noShowTeamId === input.hostTeamId ? input.awayTeamId : input.hostTeamId,
    homeScore: stored.home,
    awayScore: stored.away,
    requestMatchesStored: noShowTeamId === input.requestedNoShowTeamId,
  };
}

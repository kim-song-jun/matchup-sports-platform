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
  /**
   * 팀이 **정확히 1개**뿐이라 리그로 성립하지 않는 티어. 서비스는 이게 비어 있지 않으면
   * 확정 자체를 422 로 막는다.
   *
   * 0팀 티어는 여기 넣지 않는다 — "다음 시즌에 그 티어를 열지 않는다"는 정상적인 결과이고
   * (예: 최하위 티어 전원이 승격), 막을 이유가 없다.
   */
  undersized: NextSeasonTierPlan[];
}

/**
 * 승강 확정 결과로 다음 시즌 티어 편성을 계산한다.
 *
 * `create()` 와 `seedSeason()` 이 강제하는 **"서로 다른 팀 2개 이상"** 불변식을 이 경로도
 * 지킨다. 안 지키면 1팀짜리 리그가 만들어지는데(alpha 실측 사례 존재) 그건 라운드로빈
 * 대진이 0건이라 영원히 completed 가 되지 않고, regenerateFixtures 도 LEAGUE_TEAM_INVALID
 * 로 막혀 복구가 안 되는 死 리그다. 승강으로 만들어졌으니 어드민이 팀을 더 넣을 경로도 없다.
 *
 * 그래서 **확정 자체를 막는다**(2026-08-21 사용자 확정). 그 티어만 조용히 비우는 쪽도
 * 검토했지만, 팀이 통째로 사라지는 결과를 운영자가 나중에 발견하는 것보다 지금 막고
 * 불참 처리·승강 결정을 조정하게 하는 편이 낫다.
 *
 * 탈퇴(withdrawn) 팀은 다음 시즌에 넣지 않는다.
 */
export function planNextSeasonTiers(input: {
  resolved: readonly ResolvedPromotionRow[];
  tierCount: number;
}): NextSeasonPlan {
  const tiers: NextSeasonTierPlan[] = [];
  const undersized: NextSeasonTierPlan[] = [];
  for (let tier = 1; tier <= input.tierCount; tier += 1) {
    const teamIds = input.resolved
      .filter((row) => row.kind !== 'withdrawn' && row.toTier === tier)
      .map((row) => row.teamId);
    if (teamIds.length >= 2) tiers.push({ tier, teamIds });
    else if (teamIds.length === 1) undersized.push({ tier, teamIds });
  }
  return { tiers, undersized };
}

/**
 * 리그 목록의 상태 우선순위: 진행 중 -> 준비 중 -> 종료.
 *
 * Prisma 의 enum 정렬(`state: 'asc'`)은 **선언 순서**를 쓰는데 V1LeagueState 는
 * `draft -> active -> completed` 라, 그대로 쓰면 아직 시작도 안 한 리그가 맨 위로 온다.
 * "지금 뛰는 리그"를 찾으러 온 사용자에게는 정확히 반대다(Copilot 리뷰가 잡은 결함).
 * DB 정렬로는 표현할 수 없으므로 우선순위를 여기서 명시한다.
 *
 * `sortMyLeaguesByState`("내 리그", 메모리 정렬)와 `league-match-public.service.ts`의
 * `list()`("공개 목록", 상태별 그룹 쿼리) 양쪽이 이 상수 하나를 공유한다 — 각자
 * 다시 정의하면 두 화면이 서로 다른 규칙으로 다시 갈라진다(2026-08-22 재감사: 공개
 * 목록만 createdAt desc 단독 정렬로 남아 있던 게 바로 이 문제였다).
 */
export const LEAGUE_STATE_PRIORITY: Record<string, number> = { active: 0, draft: 1, completed: 2 };

/**
 * 우선순위 순서로 나열한 상태 값. DB enum 정렬로는 이 순서를 못 만들므로, 상태별로
 * where 절을 나눠 이 순서대로 순회하며 쿼리하는 호출부(공개 목록의 상태-그룹 커서
 * 페이지네이션)가 쓴다. `LEAGUE_STATE_PRIORITY`에서 파생시켜 두 상수가 따로 놀지 않게 한다.
 */
export const LEAGUE_STATE_PRIORITY_ORDER = (Object.keys(LEAGUE_STATE_PRIORITY) as Array<
  keyof typeof LEAGUE_STATE_PRIORITY
>).sort((a, b) => LEAGUE_STATE_PRIORITY[a] - LEAGUE_STATE_PRIORITY[b]);

/**
 * "내 리그" 목록 전용 정렬 적용. 입력 순서(같은 상태 안에서의 정렬)는 보존한다 —
 * Array.prototype.sort 는 안정 정렬이라 호출부가 넘긴 createdAt desc 순서가 그대로
 * 유지된다.
 */
export function sortMyLeaguesByState<T extends { state: string }>(leagues: readonly T[]): T[] {
  return [...leagues].sort(
    (a, b) => (LEAGUE_STATE_PRIORITY[a.state] ?? 99) - (LEAGUE_STATE_PRIORITY[b.state] ?? 99),
  );
}

/** 상태-그룹 페이지네이션(아래 `paginateByStatePriority`)이 최소로 요구하는 행 모양. */
export interface StatePriorityPageRow {
  id: string;
  state: string;
}

/**
 * "<state>:<id>" 형태의 커서를 분해한다. 콜론이 없거나(레거시/손상) 빈 문자열이면
 * `null` -- 호출부는 이걸 "커서 없음"과 동일하게 처음부터 다시 훑는다.
 */
export function parseStatePriorityCursor(cursor: string | undefined): { state: string; id: string } | null {
  if (!cursor) return null;
  const sep = cursor.indexOf(':');
  if (sep <= 0 || sep === cursor.length - 1) return null;
  return { state: cursor.slice(0, sep), id: cursor.slice(sep + 1) };
}

/**
 * 상태 우선순위 그룹 순서(`LEAGUE_STATE_PRIORITY_ORDER`)대로 필요한 만큼만 채우는
 * 순수 페이지네이션 플래너.
 *
 * 공개 리그 목록(`league-match-public.service.ts` list())이 이 함수를 쓴다. **Prisma 를
 * 모른다** -- 실제 DB 조회는 `fetchGroup` 콜백이 담당하고, 이 함수는 "어느 그룹을
 * 얼마나 더 가져와야 하는가"와 "다음 커서가 무엇인가"만 결정한다. 이렇게 분리해 둔
 * 이유는 이 파일 맨 위 주석과 동일하다 -- `@prisma/client` 를 import 하는 서비스
 * 파일은 이 저장소 공유 Prisma client 가 최신 schema 와 드리프트돼 있는 동안 로컬에서
 * 컴파일되지 않는데, 상태 우선순위 정렬 자체는 그 드리프트와 무관한 로직이라 DB 없이도
 * 반드시 로컬에서 검증할 수 있어야 한다.
 *
 * DB enum 정렬(`state: 'asc'`)로는 상태 우선순위를 표현할 수 없으므로(선언 순서가
 * draft -> active -> completed 라 반대) 상태별로 쿼리를 나눠 우선순위 순서대로
 * 순회한다. `query.state` 필터가 있는 호출부는 `stateGroups`에 그 상태 하나만 넘기면
 * 되고, 그러면 아래 루프는 자연히 기존 단일 쿼리 커서 페이지네이션과 동일하게 축소된다.
 *
 * 커서는 "<state>:<id>" 복합값이다. 정렬 1순위가 createdAt이 아니라 상태 그룹이라,
 * id 하나만으로는 "어느 그룹의 몇 번째 행부터 이어가야 하는가"를 복원할 수 없다 --
 * 그룹을 건너뛴 뒤 이전 그룹의 id 를 그대로 커서로 주면 그 그룹의 결과 집합 안에서
 * 그 id 를 찾을 수 없어 페이지가 깨진다(중복 또는 누락). `fetchGroup`은 재개할 그룹에서만
 * `cursorId`를 받고, 그 앞뒤 그룹은 항상 처음부터(`cursorId: undefined`) 조회된다.
 */
export async function paginateByStatePriority<T extends StatePriorityPageRow>(input: {
  stateGroups: readonly string[];
  limit: number;
  cursor?: string;
  fetchGroup: (state: string, page: { cursorId?: string; take: number }) => Promise<T[]>;
}): Promise<{ items: T[]; hasNext: boolean; nextCursor: string | null }> {
  const parsedCursor = parseStatePriorityCursor(input.cursor);
  const resumeIndex = parsedCursor ? input.stateGroups.indexOf(parsedCursor.state) : -1;
  const startIndex = resumeIndex === -1 ? 0 : resumeIndex;

  // limit+1개를 모을 때까지(hasNext 판정용, team-matches.service.ts list()와 동일한 관례)
  // 우선순위 순서로 그룹을 순회한다. 조건이 `<= limit`인 이유: 그룹을 막 채워
  // collected.length 가 limit+1 이 되면 다음 반복 진입 전에 멈춰야 take가 0 이하로
  // 내려가는 무의미한 호출을 안 만든다.
  const collected: T[] = [];
  for (let i = startIndex; i < input.stateGroups.length && collected.length <= input.limit; i += 1) {
    const state = input.stateGroups[i];
    const isResumeGroup = i === startIndex && resumeIndex !== -1 && parsedCursor !== null;
    const rows = await input.fetchGroup(state, {
      cursorId: isResumeGroup ? parsedCursor!.id : undefined,
      take: input.limit + 1 - collected.length,
    });
    collected.push(...rows);
  }

  const items = collected.slice(0, input.limit);
  const hasNext = collected.length > input.limit;
  const last = items.at(-1);
  return { items, hasNext, nextCursor: hasNext && last ? `${last.state}:${last.id}` : null };
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

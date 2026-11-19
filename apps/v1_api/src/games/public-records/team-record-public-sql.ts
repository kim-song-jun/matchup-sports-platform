import { Prisma } from '@prisma/client';

/**
 * 팀 전적이 "공개해도 되는 공식 경기"로 세는 기준의 단일 소스.
 *
 * 팀 상세의 전적 요약(`PublicTeamRecordsService.fetchSummary`)과 팀 목록 카드의
 * "최근 3개월 N경기"(`countRecentPlayedByTeam`)가 **같은 조건**을 써야 두 화면의 숫자가
 * 어긋나지 않는다. 조건을 한쪽에서만 바꾸면 목록과 상세가 다른 경기 수를 보여 주므로
 * 이 두 조각을 고치는 것으로만 기준을 바꾼다. 쿼리의 별칭은 `trf`(v1_team_record_facts)로 맞춘다.
 *
 * - 그 게임의 **현재 공식 리비전**만 센다(정정 전 리비전·취소는 제외).
 * - 공개 정책 row 가 없는 경기는 fail-closed(=제외)라 INNER JOIN 이다.
 * - 숨김(HIDDEN)·결과 비공개(STATUS_ONLY) 경기는 경기 수로도 간접 노출되므로 뺀다 —
 *   effectivePublicVisibilityMode 를 SQL 로 옮겨 적은 자리다. LIVE 는 킬스위치와 무관하게 남는다.
 */
export const PUBLIC_OFFICIAL_TEAM_FACT_JOINS = Prisma.sql`
      INNER JOIN v1_games g ON g.id = trf.game_id AND g.current_official_revision_id = trf.revision_id
      INNER JOIN v1_game_visibility_policies vp ON vp.game_id = g.id
      LEFT JOIN v1_team_matches tm ON tm.id = g.team_match_id
      LEFT JOIN v1_tournaments league ON league.id = COALESCE(tm.league_id, tm.tournament_id)`;

/** 위 JOIN 의 별칭(`league`, `vp`)을 쓰는 공개 조건. WHERE 절에 AND 로 붙인다. */
export const PUBLIC_OFFICIAL_TEAM_FACT_FILTER = Prisma.sql`(league.id IS NULL OR league.is_public IS TRUE)
      AND vp.mode IN ('LIVE', 'OFFICIAL_ONLY')`;

type RawQueryClient = {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
};

/** 팀 카드의 "최근 3개월" 기준 시작 시각. `played_at` 은 UTC 벽시계 값이라 UTC 로 달을 뺀다. */
export function recentThreeMonthsSince(now: Date): Date {
  const since = new Date(now.getTime());
  since.setUTCMonth(since.getUTCMonth() - 3);
  return since;
}

/**
 * 주어진 팀들의 `since` 이후 공개·공식 경기 수 — **한 페이지 분량을 쿼리 1번**으로 센다(N+1 금지).
 * 경기가 없는 팀은 맵에 없다. 호출부가 `?? 0` 으로 읽는다("0경기"도 보여 주려면 0 이 필요하다).
 */
export async function countRecentPlayedByTeam(
  db: RawQueryClient,
  teamIds: readonly string[],
  since: Date,
): Promise<Map<string, number>> {
  if (teamIds.length === 0) return new Map();
  // `v1_team_record_facts.team_id` 는 uuid 가 아니라 text 다 — `::uuid[]` 로 쓰면 text = uuid 비교로 쿼리가 깨진다.
  const rows = await db.$queryRaw<ReadonlyArray<{ teamId: string; played: number }>>(Prisma.sql`
    SELECT trf.team_id AS "teamId", COUNT(*)::int AS played
    FROM v1_team_record_facts trf
    ${PUBLIC_OFFICIAL_TEAM_FACT_JOINS}
    WHERE trf.team_id = ANY(${[...teamIds]}::text[])
      AND trf.played_at >= ${since}
      AND ${PUBLIC_OFFICIAL_TEAM_FACT_FILTER}
    GROUP BY trf.team_id
  `);
  return new Map(rows.map((row) => [row.teamId, row.played]));
}

/**
 * 감사 로그의 대상 ID 를 그 대상 상세 화면으로 잇는 매핑.
 *
 * 두 가지를 일부러 좁게 잡았다:
 * 1. `targetType` 은 DB 에서 자유 문자열이라(enum 아님) 백엔드가 새 값을 추가해도
 *    컴파일 타임에 여기 누락이 잡히지 않는다 → **모르는 값은 링크 없음**으로 폴백한다.
 *    링크가 없는 것은 불편할 뿐이지만, 잘못된 링크는 404 로 데려간다.
 * 2. `targetId` 가 **그 라우트가 기대하는 id 와 같은 것**만 넣는다. 예를 들어
 *    `tournament_registration` 의 targetId 는 신청 id 이지 대회 id 가 아니라서
 *    `/admin/tournaments/<신청id>` 로 보내면 없는 대회를 연다.
 */
const TARGET_ROUTE: Record<string, (id: string) => string> = {
  user: (id) => `/admin/users/${encodeURIComponent(id)}`,
  team: (id) => `/admin/teams/${encodeURIComponent(id)}`,
  tournament: (id) => `/admin/tournaments/${encodeURIComponent(id)}`,
  match: (id) => `/admin/matches/${encodeURIComponent(id)}`,
  league_match: (id) => `/admin/league-matches/${encodeURIComponent(id)}`,
};

export function adminAuditTargetHref(
  targetType: string | null | undefined,
  targetId: string | null | undefined,
): string | null {
  if (!targetType || !targetId) return null;
  const build = TARGET_ROUTE[targetType];
  return build ? build(targetId) : null;
}

/**
 * 실행자 링크. `adminUserId` 는 **관리자 레코드 id** 라 회원 상세(`/admin/users/:userId`)가
 * 기대하는 값이 아니다 — 회원 id 인 `actorUserId` 가 있을 때만 잇는다.
 */
export function adminAuditActorHref(actorUserId: string | null | undefined): string | null {
  return actorUserId ? `/admin/users/${encodeURIComponent(actorUserId)}` : null;
}

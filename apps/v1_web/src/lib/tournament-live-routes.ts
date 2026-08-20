/**
 * 대회 현장 콘솔의 두 경로 표면.
 *
 * 화면과 인가는 하나인데 **URL 은 둘**이다:
 * - 스태프용 `/tournament-ops/tournaments/:id/…` — 마이페이지에서 담당 경기로 들어오는 길.
 *   일반 사용자에게 `/admin` URL 을 노출하지 않기 위해 그대로 둔다.
 * - 어드민용 `/admin/tournaments/:id/live/…` — 대회 관리 셸 안에서 이어지는 길.
 *
 * 셸의 nav 와 경기 콘솔 딥링크 판정은 **지금 어느 표면에 있는지**를 따라가야 한다.
 * 한쪽 경로를 하드코딩하면 다른 표면에서 nav 가 상대 표면으로 튕겨 나간다.
 */

export function staffLiveBase(tournamentId: string): string {
  return `/tournament-ops/tournaments/${tournamentId}`;
}

/**
 * 어드민 표면은 `/admin/tournaments/[id]/live` 가 아니라 **`/admin/live/[id]`** 다.
 * 전자는 대회 관리 셸(`/admin/tournaments/[id]/layout.tsx`)이 반드시 감싸게 되는데,
 * 현장 콘솔은 자기 셸(운영 nav)을 쓰므로 셸이 이중으로 겹친다. Next 는 중간 레이아웃을
 * 건너뛸 수 없어서 두 곳(어드민 게이트 + 대회 셸)에 예외 분기를 넣어야 하고, 그러면
 * "이 경로만 다르게 동작한다"는 규칙이 두 벌로 흩어진다. 형제 경로로 두면 예외는
 * 어드민 게이트 한 곳뿐이다.
 */
export function adminLiveBase(tournamentId: string): string {
  return `/admin/live/${tournamentId}`;
}

/** 지금 pathname 이 속한 표면의 base. 어느 쪽도 아니면 스태프 표면으로 본다(기존 동작). */
export function resolveTournamentLiveBase(pathname: string | null, tournamentId: string): string {
  if (pathname !== null && pathname.startsWith('/admin/')) return adminLiveBase(tournamentId);
  return staffLiveBase(tournamentId);
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    // 잘못 인코딩된 경로는 원문 그대로 비교한다 — 여기서 던지면 화면 전체가 죽는다.
    return segment;
  }
}

const CONSOLE_PATHS = [
  /^\/tournament-ops\/tournaments\/([^/]+)\/fixtures\/([^/]+)/,
  /^\/admin\/live\/([^/]+)\/fixtures\/([^/]+)/,
];

/**
 * 경기 콘솔 경로에서 fixtureId 를 꺼낸다. 두 표면 모두 인식한다. 그 외 경로면 null.
 *
 * 경로 세그먼트는 인코딩돼 있을 수 있고 params 의 tournamentId 는 디코딩된 값이라
 * 비교 전에 디코딩한다.
 */
export function fixtureIdFromConsolePath(pathname: string | null, tournamentId: string): string | null {
  if (pathname === null) return null;
  for (const pattern of CONSOLE_PATHS) {
    const match = pattern.exec(pathname);
    if (match === null) continue;
    if (decodeSegment(match[1]) !== tournamentId) continue;
    return decodeSegment(match[2]);
  }
  return null;
}

/** 어드민 대회 셸 안의 현장 콘솔 경로인지 — 어드민 게이트가 스태프를 통과시킬 구간이다. */
export function isAdminLiveConsolePath(pathname: string | null): boolean {
  if (pathname === null) return false;
  return /^\/admin\/live\/[^/]+(\/|$)/.test(pathname);
}

/** 어드민 현장 콘솔 경로에서 대회 id 를 꺼낸다. 아니면 null. */
export function tournamentIdFromAdminLivePath(pathname: string | null): string | null {
  if (pathname === null) return null;
  const match = /^\/admin\/live\/([^/]+)(\/|$)/.exec(pathname);
  return match === null ? null : decodeSegment(match[1]);
}

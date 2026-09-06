/**
 * **공개 명단 — 등번호 + 닉네임만.**
 *
 * 정본 §3 이 "명단은 등번호 + 이름(닉네임)" 이고 "명단 공개는 등번호·이름" 이라고 확정했다.
 * 그런데 기존 명단 응답(`TournamentPlayersService.serializePlayer`)은 `realName`·
 * `birthDateSnapshot`·`genderSnapshot`·`eligibilityStatus/Note` 까지 싣는다 — 그건 **자격
 * 가드에만 쓰라고 받은 값**이라 공개 화면에 그대로 내보내면 PII 유출이다. 그래서 그 함수를
 * 재사용하지 않고 **공개 전용 직렬화를 따로** 둔다.
 *
 * 실명 폴백도 두지 않는다. 닉네임을 못 찾으면(탈퇴·프로필 삭제) `null` 을 주고 **화면이
 * 자리표시자를 그린다** — 여기서 실명으로 떨어뜨리면 정본 위반이 조용히 살아난다.
 */
export type PublicRosterPlayer = {
  /** 명단 행 id. 화면 key 용이고 개인 식별에 쓰지 않는다. */
  id: string;
  /** 없으면 `null` — 화면이 `—` 로 그린다. */
  jerseyNumber: number | null;
  /** 탈퇴·프로필 삭제로 못 찾으면 `null` — 화면이 자리표시자를 그린다. */
  nickname: string | null;
};

type RosterRow = {
  id: string;
  userId: string;
  user?: {
    profile?: { nickname?: string | null; displayName?: string | null } | null;
  } | null;
};

/**
 * 명단 행 + 등번호 맵 → 공개 응답.
 *
 * 등번호 맵은 호출자가 **한 번에 배치로** 읽어 넘긴다(팀마다 따로 물으면 N+1 이다).
 */
export function toPublicRoster(
  rows: readonly RosterRow[],
  jerseyByPlayerId: ReadonlyMap<string, number>,
): PublicRosterPlayer[] {
  return rows.map((row) => ({
    id: row.id,
    jerseyNumber: jerseyByPlayerId.get(row.id) ?? null,
    nickname: row.user?.profile?.nickname ?? row.user?.profile?.displayName ?? null,
  }));
}

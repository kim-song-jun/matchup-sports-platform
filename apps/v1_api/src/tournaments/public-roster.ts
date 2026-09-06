/**
 * **공개 명단 — 등번호 + 닉네임만.**
 *
 * 정본 §3 이 "명단은 등번호 + 이름(닉네임)" 이고 "명단 공개는 등번호·이름" 이라고 확정했다.
 * 그런데 기존 명단 응답(`TournamentPlayersService.serializePlayer`)은 `realName`·
 * `birthDateSnapshot`·`genderSnapshot`·`eligibilityStatus/Note` 까지 싣는다 — 그건 **자격
 * 가드에만 쓰라고 받은 값**이라 공개 화면에 그대로 내보내면 PII 유출이다. 그래서 그 함수를
 * 재사용하지 않고 **공개 전용 직렬화를 따로** 둔다.
 *
 * **어떤 폴백도 두지 않는다.** 닉네임을 못 찾으면(탈퇴·프로필 삭제·닉네임 미설정) `null` 을
 * 주고 **화면이 자리표시자를 그린다**. `realName` 은 물론이고 `displayName` 도 쓰지 않는다 —
 * 그 자리에는 가입 경로에 따라 실명이 그대로 담길 수 있어서, 폴백 하나로 정본 위반이
 * 조용히 살아난다.
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
    // `displayName` 은 **일부러 없다** — 폴백에 쓰지 않으므로 타입에서도 뺀다.
    // 타입에 남겨 두면 다음 사람이 "왜 안 쓰지" 하고 되살린다.
    profile?: { nickname?: string | null } | null;
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
    // **`displayName` 으로 폴백하지 않는다.** 정본 §3 은 공개 명단을 "등번호 + 닉네임" 으로
    // 못 박았는데 `displayName` 은 **실명이 들어갈 수 있는 자리**다(가입 경로에 따라 실명이
    // 그대로 담긴다). 폴백을 두면 닉네임이 빈 사용자에게서 실명이 공개로 새 나간다 —
    // 주석은 "없으면 null" 이라고 적어 두고 구현만 폴백하고 있었다(Copilot 지적).
    nickname: row.user?.profile?.nickname ?? null,
  }));
}

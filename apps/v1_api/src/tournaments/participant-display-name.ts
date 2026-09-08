/**
 * 경기 참가자에 실을 이름. **닉네임이 먼저다** — 정본 §3 이 "명단은 등번호 + 이름(닉네임)"
 * 이고 명단 공개도 등번호·이름이다. `realName` 을 그대로 실으면 **자격 가드(실명·생년월일·
 * 휴대폰)에만 쓰라고 받은 실명이 경기 기록·관전 화면까지 흐른다.**
 *
 * 프로필이 없거나 닉네임이 비어 있으면 실명으로 폴백한다 — 이름 없는 참가자를 만드는 것보다
 * 낫고, 명단에 오르려면 실명이 이미 필수다.
 *
 * **이 파일이 따로 있는 이유**: 같은 규칙이 필요한 자리가 셋인데 한 곳에만 있었고, 나머지
 * 둘(`league-fixture-generator.service.ts` 의 리그 대진 생성 · `games/migration/
 * fixture-game-backfill.ts`)이 `realName` 을 그대로 박았다. **실측(2026-09-08 alpha)**:
 * 신원이 연결된(`userId` 있음) 참가자인데 공개 경기 상세에 실명이 그대로 떴다. 규칙을 다시
 * 한 곳에 두면 네 번째 경로에서 같은 일이 난다.
 *
 * ⚠️ **이 함수를 쓰려면 조회가 프로필을 실어야 한다.** 두 위반 자리의 공통 원인이 그거였다 —
 * `select: { id, userId, realName }` 라서 **닉네임을 쓰고 싶어도 쓸 수가 없었다.**
 *
 * ```ts
 * select: {
 *   id: true, userId: true, realName: true,
 *   user: { select: { profile: { select: { nickname: true, displayName: true } } } },
 * }
 * ```
 *
 * 팀 매치·리그 대진(`league-fixture-creation.ts`·`team-matches.service.ts`)은 **의도적으로
 * 이 함수를 쓰지 않는다** — 그쪽은 팀 멤버십에서 오는 값이라 실명 자체가 없고 폴백이
 * `'팀원'` 이다. 이 함수로 바꾸면 폴백이 실명으로 **약해진다.**
 */
export function participantDisplayName(player: {
  realName: string;
  /**
   * **optional 이 아니라 required 다(값은 nullable).** optional 로 두면 프로필을 안 실은
   * 조회도 그대로 컴파일되고 **조용히 실명 폴백**으로 떨어진다 — 이 결함이 정확히 그렇게
   * 났다. required 로 두면 `select` 에서 빠뜨린 자리를 tsc 가 잡는다.
   */
  user: { profile: { nickname: string | null; displayName: string | null } | null } | null;
}): string {
  return player.user?.profile?.nickname ?? player.user?.profile?.displayName ?? player.realName;
}

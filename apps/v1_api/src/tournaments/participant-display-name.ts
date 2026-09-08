/**
 * 경기 참가자에 실을 이름. **닉네임이 먼저다** — 정본 §3 이 "명단은 등번호 + 이름(닉네임)"
 * 이고 명단 공개도 등번호·이름이다. `realName` 을 그대로 실으면 **자격 가드(실명·생년월일·
 * 휴대폰)에만 쓰라고 받은 실명이 경기 기록·관전 화면까지 흐른다.**
 *
 * **폴백은 `'팀원'` 이다. 실명이 아니다.** 예전 주석은 실명 폴백을 *"이름 없는 참가자를 만드는
 * 것보다 낫다"* 로 정당화했는데 **스키마가 그 전제를 반증한다**:
 *   · `V1TournamentPlayer.userId` 는 non-null 이고 FK Restrict + `@@unique([registrationId,userId])`
 *     라 **계정 없는 명단 행이 구조적으로 불가능**하다.
 *   · `V1UserProfile.nickname` 도 non-null 이라 **프로필이 있으면 닉네임이 반드시 있다.**
 *   · 그래서 실제 발동 조건은 **`V1UserProfile` 행 부재** 하나뿐인데, **읽는 쪽 게이팅
 *     (`resolveParticipantDisplayName`)도 정확히 그 조건에서 스냅샷을 그대로 반환한다.**
 *     두 폴백이 **같은 구멍으로 함께 뚫린다** — 겹치는 방어가 아니었다.
 * 팀 매치·리그 대진(`league-fixture-creation.ts:152`·`team-matches.service.ts`)이 이미
 * `?? '팀원'` 이다. 그쪽이 맞고, 여기를 그쪽에 맞춘다.
 *
 * **이 파일이 따로 있는 이유**: 규칙이 한 곳에만 있었고 나머지 세 경로(리그 대진 생성 ·
 * 픽스처 게임 백필 · 쇼케이스 시드)가 `realName` 을 그대로 박았다. 규칙을 다시 한 곳에
 * 두면 새 경로에서 같은 일이 난다.
 *
 * ⚠️ **이 함수를 쓰려면 조회가 프로필을 실어야 한다.** 세 위반 자리의 공통 원인이 그거였다 —
 * `select: { id, userId, realName }` 라서 **닉네임을 쓰고 싶어도 쓸 수가 없었다.**
 *
 * ```ts
 * select: {
 *   id: true, userId: true, realName: true,
 *   user: { select: { profile: { select: { nickname: true, displayName: true } } } },
 * }
 * ```
 *
 * 팀 매치·리그 대진은 이 함수를 쓰지 않는다 — 그쪽 입력은 팀 멤버십이라 `realName` 필드
 * 자체가 없다. 폴백 문자열은 이제 양쪽이 같다.
 */
export function participantDisplayName(player: {
  /**
   * **optional 이 아니라 required 다(값은 nullable).** optional 로 두면 프로필을 안 실은
   * 조회도 그대로 컴파일되고 **조용히 실명 폴백**으로 떨어진다 — 이 결함이 정확히 그렇게
   * 났다. required 로 두면 `select` 에서 빠뜨린 자리를 tsc 가 잡는다.
   */
  user: { profile: { nickname: string | null; displayName: string | null } | null } | null;
}): string {
  return player.user?.profile?.nickname ?? player.user?.profile?.displayName ?? '팀원';
}

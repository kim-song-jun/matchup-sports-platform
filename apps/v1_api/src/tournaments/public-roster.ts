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

type RosterSqlClient = {
  $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};

type RosterSqlRow = {
  id: string;
  registration_id: string;
  jersey_number: number | null;
  nickname: string | null;
};

/**
 * **공개 명단을 등록 단위로 한 번에 읽는다.**
 *
 * 왜 raw 인가: 등번호(`jersey_number`)가 **생성된 Prisma 클라이언트에 없다**(모노레포 공유
 * 산출물이라 이 저장소에서 재생성하지 않는다). 명단 행과 등번호가 **같은 테이블**
 * (`v1_tournament_players`)에 있으므로 한 쿼리로 끝난다.
 *
 * 왜 조건부인가: 예전엔 `TOURNAMENT_DETAIL_INCLUDE` 가 **무조건** `players` 를 조인해서,
 * 명단을 감추는 상태(모집 중 · 비스태프)에서도 명단 행과 **닉네임 조인까지 읽고** presenter 가
 * 통째로 버렸다. 안 쓰는 PII 인접 필드를 응답 경로에 싣지 않는다는 이 파일의 원칙은
 * **읽지도 않는다**까지 가는 것이 일관된다(Copilot 지적). 그래서 호출자가 `hideIdentity` 일
 * 때 아예 부르지 않는다 — 숨김이면 쿼리 1개(기본 조회), 공개면 2개로 **예전과 같다.**
 *
 * **`jersey_number IS NOT NULL` 을 걸지 않는다.** 등번호는 **선택**이고, 거르면 번호를 아직
 * 안 받은 선수가 **명단에서 통째로 사라진다.** 번호가 없으면 `null` 로 내려가 화면이 `—` 를
 * 그린다. (등번호 전용 배치 리더는 이 조건을 갖고 있었는데, 그 함수는 등번호 맵만 만들었으므로
 * 맞았다 — 명단까지 합치면서 그대로 가져오면 결함이 된다.)
 *
 * 캐스팅이 `::text[]` 인 이유는 `registration_id` 의 실제 컬럼 타입이 `text` 이기 때문이다 —
 * `@default(uuid())` 는 값 생성 방식이지 타입이 아니다. `::uuid[]` 로 쓰면
 * `operator does not exist: text = uuid` 로 쿼리 전체가 죽는다(2026-09-06 alpha 실사고).
 */
export async function readPublicRostersForRegistrations(
  client: RosterSqlClient,
  registrationIds: readonly string[],
): Promise<Map<string, PublicRosterPlayer[]>> {
  const byRegistrationId = new Map<string, PublicRosterPlayer[]>();
  if (registrationIds.length === 0) return byRegistrationId;
  const rows = await client.$queryRaw<RosterSqlRow[]>`
    SELECT p.id, p.registration_id, p.jersey_number, prof.nickname
    FROM "v1_tournament_players" p
    LEFT JOIN "v1_user_profiles" prof ON prof.user_id = p.user_id
    WHERE p.registration_id = ANY(${[...registrationIds]}::text[])
      AND p.removed_at IS NULL
    ORDER BY p.id ASC
  `;
  for (const row of rows) {
    const bucket = byRegistrationId.get(row.registration_id) ?? [];
    bucket.push({
      id: row.id,
      jerseyNumber: row.jersey_number,
      // **`displayName` 으로 폴백하지 않는다.** 여기서
      // raw 로 옮겼다고 `real_name`·`display_name` 을 SELECT 하고 싶어지면, 그게 정확히
      // 정본 §3 이 막은 자리다(실명이 공개로 새 나간다).
      nickname: row.nickname,
    });
    byRegistrationId.set(row.registration_id, bucket);
  }
  return byRegistrationId;
}

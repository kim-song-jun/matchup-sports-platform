/**
 * 명단 **자동 확정 시각**(`roster_auto_confirmed_at`) — raw SQL 로 읽는다.
 *
 * 시즌 시작까지 명단을 안 낸 팀은 자동 확정 잡이 현재 멤버로 명단을 만들고 이 컬럼을
 * 남긴다(`jobs/league-roster/league-roster-autoconfirm.service.ts`). 그런데 그 값이
 * **어떤 API 응답에도 실리지 않아**, 운영자는 눈앞의 명단이 팀이 낸 것인지 시스템이
 * 만든 것인지 구분할 수 없었다 — 자동 확정 명단은 "팀이 검토한 적 없는 명단" 이라
 * 운영 판단이 달라진다.
 *
 * **raw 인 이유**: 생성된 Prisma 클라이언트는 모노레포 공유물이라 이 저장소에서 재생성하지
 * 않는데(CI 가 생성한다), 이 컬럼이 아직 거기 없다(2026-09-04 컴파일로 확인 — `TS2339`).
 * 자동 확정 잡이 쓰기를 raw 로 하는 것도 같은 이유다. 컬럼이 클라이언트에 들어오면
 * 이 파일은 통째로 지우고 일반 필드처럼 `select` 하면 된다.
 */
type SqlClient = {
  $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};

/**
 * 주어진 신청들의 자동 확정 시각. **자동 확정되지 않은 신청은 맵에 아예 들어오지 않는다** —
 * `null` 을 넣어 두면 "자동 확정됐는데 시각을 모른다" 와 구분되지 않는다.
 */
export async function readRosterAutoConfirmedAt(
  client: SqlClient,
  registrationIds: string[],
): Promise<Map<string, string>> {
  const byId = new Map<string, string>();
  // 빈 배열로 `IN ()` 를 만들면 SQL 문법 오류다. 물어볼 것이 없으면 묻지 않는다.
  if (registrationIds.length === 0) return byId;
  const rows = await client.$queryRaw<Array<{ id: string; roster_auto_confirmed_at: Date | null }>>`
    SELECT id, roster_auto_confirmed_at
    FROM "v1_tournament_registrations"
    WHERE id = ANY(${registrationIds}::uuid[])
      AND roster_auto_confirmed_at IS NOT NULL
  `;
  for (const row of rows) {
    if (row.roster_auto_confirmed_at !== null) {
      byId.set(row.id, row.roster_auto_confirmed_at.toISOString());
    }
  }
  return byId;
}

/**
 * **`v1Tournament.findFirst` mock 이 종류 조건을 실제로 판정하게 만든다.**
 *
 * 유닛 스펙의 prisma mock 은 보통 `mockResolvedValue(row)` 라 `where` 를 통째로 무시한다.
 * 그 상태에서 "리그 id 는 404" 를 단언하면 **호출부가 종류 조건을 안 걸어도 통과**한다 —
 * 봉쇄를 검증하려던 테스트가 아무것도 검증하지 못한다.
 *
 * 이 fake 는 헬퍼(`findTournamentOnSurface`)가 만든
 * `where: { AND: [{ OR: [{ kind: … }, …] }, <호출부 조건>] }` 에서 종류 절을 읽어,
 * 행의 `kind` 가 그 목록에 있을 때만 행을 돌려준다.
 *
 * ## 조건이 없을 때 **행을 돌려준다** — 이 한 줄이 vacuous 여부를 가른다
 * 실제 DB 는 `where` 에 종류 조건이 없으면 그 행을 **매칭시킨다.** fake 가 여기서 `null` 을
 * 돌려주면 필터를 지워도 404 가 유지돼, **음성 테스트가 뒤집힌다** — "막혔는가" 를 보려던
 * 단언이 "mock 이 null 을 준다" 만 확인하게 된다.
 *
 * 2026-08-31 실사고: 그렇게 짰다가 변이 실행에서 **3건 중 1건만 red** 인 것을 보고 잡았다.
 * 변이 red 개수를 세지 않았으면 vacuous 한 음성 테스트 2건을 그대로 올렸을 것이다.
 */
export function kindAwareFindFirst(row: Record<string, unknown> | null) {
  return (args: { where?: Record<string, unknown> }) => {
    if (row === null) return Promise.resolve(null);
    const and = (args.where?.AND ?? []) as Array<Record<string, unknown>>;
    const kindClause = and.find((clause) => Array.isArray(clause.OR));
    // 종류 조건이 없다 = 봉쇄가 안 걸렸다. 실제 DB 처럼 행을 그대로 준다.
    if (!kindClause) return Promise.resolve(row);
    const allowed = (kindClause.OR as Array<{ kind?: unknown }>).map((clause) => clause.kind);
    return Promise.resolve(allowed.includes(row.kind) ? row : null);
  };
}

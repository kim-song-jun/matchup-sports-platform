/**
 * Prisma `cursor + skip: 1` 대신 쓰는 "커서 행 다음부터" 읽기.
 *
 * Prisma 는 커서 행을 id 로 따로 찾아 그 정렬 값 위치에서 읽기를 시작한다 -- `where` 는 이 조회에
 * 적용되지 않는다. 그래서 커서 행이 그사이 `where` 를 벗어나면(시작 시각이 지나 모집 조건 탈락 등)
 * `skip: 1` 이 아직 못 본 진짜 첫 행을 버린다. 커서 행 자리를 포함해 `take + 1` 개를 읽고,
 * 첫 행이 실제로 커서 행일 때만 걷어내면 어느 쪽이든 누락이 없다.
 *
 * 이 파일은 `@prisma/client` 를 import 하지 않는다(단위 테스트가 DB 타입 없이 돌도록).
 */

/** `findMany` 에 펼쳐 넣을 `cursor`/`take`. 커서가 없으면 `take` 만 돌려준다. */
export function resumeAfterCursorArgs(cursorId: string | undefined, take: number): { take: number; cursor?: { id: string } } {
  return cursorId ? { cursor: { id: cursorId }, take: take + 1 } : { take };
}

/** `resumeAfterCursorArgs` 로 읽은 행에서 커서 행을 걷어내고 `take` 개로 자른다. */
export function dropCursorRow<T extends { id: string }>(rows: T[], cursorId: string | undefined, take: number): T[] {
  return (cursorId && rows[0]?.id === cursorId ? rows.slice(1) : rows).slice(0, take);
}

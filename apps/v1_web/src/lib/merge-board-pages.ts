/**
 * 보드를 쪽 단위로 읽는 동안 경기가 끝나면 서버 정렬이 바뀌어 같은 경기가 두 쪽에 올 수 있다.
 * `fixtureId` 마다 하나만 남기고, 나중 쪽(더 새 상태)이 앞 쪽을 덮는다. 첫 등장 순서는 지킨다.
 */
export function mergeByFixtureId<T extends { fixtureId: string }>(rows: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const row of rows) byId.set(row.fixtureId, row);
  return [...byId.values()];
}

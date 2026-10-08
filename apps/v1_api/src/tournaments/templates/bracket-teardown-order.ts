export type TeardownEdge = { sourceTeamMatchId: string; targetTeamMatchId: string };

/**
 * 하류(연결 대상)를 먼저 지우는 순서. 대상이 모두 지워진 경기가 "준비됨"이고, 준비된 경기는 id 순으로 낸다.
 * 연결 그래프는 인접 단계끼리만 이어져 DAG 다 — 순환은 데이터 손상이므로 삼키지 않고 던진다.
 */
export function orderFixturesForTeardown(
  fixtureIds: readonly string[],
  edges: readonly TeardownEdge[],
): string[] {
  const ids = new Set(fixtureIds);
  const pendingTargets = new Map<string, Set<string>>();
  const dependents = new Map<string, string[]>();
  for (const id of ids) pendingTargets.set(id, new Set());
  for (const { sourceTeamMatchId: source, targetTeamMatchId: target } of edges) {
    if (!ids.has(source) || !ids.has(target)) continue;
    (pendingTargets.get(source) as Set<string>).add(target);
    dependents.set(target, [...(dependents.get(target) ?? []), source]);
  }

  const ready = [...ids].filter((id) => (pendingTargets.get(id) as Set<string>).size === 0).sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift() as string;
    order.push(id);
    for (const source of dependents.get(id) ?? []) {
      const pending = pendingTargets.get(source) as Set<string>;
      pending.delete(id);
      if (pending.size === 0) {
        ready.push(source);
        ready.sort();
      }
    }
  }
  if (order.length !== ids.size) throw new Error('advancement edges contain a cycle');
  return order;
}

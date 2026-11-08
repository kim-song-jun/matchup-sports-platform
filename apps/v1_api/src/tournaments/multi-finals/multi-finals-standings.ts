/** Stored preliminary order of the groups one final draws from: group id → registration ids, best first. */
export type StandingsSnapshot = Array<{ groupId: string; registrationIds: string[] }>;
type StandingGroup = { groupId: string; rows: ReadonlyArray<{ registrationId: string; position: number | null }> };

export function standingOrder(groupStandings: readonly StandingGroup[], groupIds: readonly string[]): StandingsSnapshot {
  return groupIds.map(groupId => ({ groupId, registrationIds: (groupStandings.find(group => group.groupId === groupId)?.rows ?? [])
    .flatMap(row => row.position === null ? [] : [{ id: row.registrationId, position: row.position }])
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id)).map(row => row.id) }));
}

/**
 * True when the team at any rank the final's rules point at differs from the saved order (a rank filled on one side only counts as changed).
 * Order only: points or goals that move without reordering the teams do not count, and ranks no rule uses are ignored.
 */
export function standingsOrderChanged(saved: StandingsSnapshot, current: StandingsSnapshot, rules: ReadonlyArray<{ groupId: string; rank: number }>): boolean {
  return rules.some(({ groupId, rank }) => {
    const before = saved.find(group => group.groupId === groupId)?.registrationIds[rank - 1];
    const now = current.find(group => group.groupId === groupId)?.registrationIds[rank - 1];
    return before !== now;
  });
}

const isIdList = (value: unknown): value is string[] => Array.isArray(value) && value.every(id => typeof id === 'string');

/** The operator's choice of which tied team takes one drawn-tie seat (a group's rank) of a final. */
export type TiePick = { groupId: string; rank: number; registrationId: string };

/** An assign audit's payload, only while it still describes the roster that is saved now. */
function currentAssignment(afterJson: unknown, registrationIds: readonly string[]): { standingsSnapshot?: unknown; tiePicks?: unknown } | null {
  if (typeof afterJson !== 'object' || afterJson === null) return null;
  const { registrationIds: assigned } = afterJson as { registrationIds?: unknown };
  if (!isIdList(assigned) || assigned.length !== registrationIds.length || assigned.some((id, index) => id !== registrationIds[index])) return null;
  return afterJson as { standingsSnapshot?: unknown; tiePicks?: unknown };
}

/** The snapshot an assign audit stored, only while it still describes the roster that is saved now. */
export function savedStandingsSnapshot(afterJson: unknown, registrationIds: readonly string[]): StandingsSnapshot | null {
  const { standingsSnapshot } = currentAssignment(afterJson, registrationIds) ?? {};
  if (!Array.isArray(standingsSnapshot)) return null;
  const groups = standingsSnapshot as Array<{ groupId?: unknown; registrationIds?: unknown }>;
  if (!groups.every(group => typeof group?.groupId === 'string' && isIdList(group.registrationIds))) return null;
  return groups.map(group => ({ groupId: group.groupId as string, registrationIds: group.registrationIds as string[] }));
}

/** The tie picks an assign audit stored, only while it still describes the saved roster. Absent, old or malformed entries read as none. */
export function savedTiePicks(afterJson: unknown, registrationIds: readonly string[]): TiePick[] {
  const { tiePicks } = currentAssignment(afterJson, registrationIds) ?? {};
  if (!Array.isArray(tiePicks)) return [];
  const picks = tiePicks as Array<Partial<Record<keyof TiePick, unknown>> | null>;
  if (!picks.every(pick => typeof pick?.groupId === 'string' && Number.isInteger(pick.rank) && typeof pick.registrationId === 'string')) return [];
  return picks.map(pick => ({ groupId: pick!.groupId as string, rank: pick!.rank as number, registrationId: pick!.registrationId as string }));
}

type Rule = { groupId: string; rank: number };

/**
 * Seed list of the rank-order recommendation: one entry per rule, null where that rule's rank is tied.
 * `suggestedRegistrationIds` holds the settled rules' teams in rule order, so the tied ones are left out of it.
 */
export function rankOrderSeeds(final: { rules: readonly Rule[]; unresolved: readonly Rule[]; suggestedRegistrationIds: readonly string[] }): Array<string | null> {
  const open = new Set(final.unresolved.map(rule => `${rule.groupId}:${rule.rank}`));
  let next = 0;
  return final.rules.map(rule => open.has(`${rule.groupId}:${rule.rank}`) ? null : final.suggestedRegistrationIds[next++]);
}

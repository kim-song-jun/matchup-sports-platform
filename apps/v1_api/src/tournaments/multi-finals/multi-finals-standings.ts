/** Stored preliminary order of the groups one final draws from: group id → registration ids, best first. */
export type StandingsSnapshot = Array<{ groupId: string; registrationIds: string[] }>;
type StandingGroup = { groupId: string; rows: ReadonlyArray<{ registrationId: string; position: number | null }> };

export function standingOrder(groupStandings: readonly StandingGroup[], groupIds: readonly string[]): StandingsSnapshot {
  return groupIds.map(groupId => ({ groupId, registrationIds: (groupStandings.find(group => group.groupId === groupId)?.rows ?? [])
    .flatMap(row => row.position === null ? [] : [{ id: row.registrationId, position: row.position }])
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id)).map(row => row.id) }));
}

/** Order only: points or goals that move without reordering the teams do not count. */
export function standingsOrderChanged(saved: StandingsSnapshot, current: StandingsSnapshot): boolean {
  return saved.some(group => {
    const now = current.find(row => row.groupId === group.groupId)?.registrationIds;
    return now === undefined || now.length !== group.registrationIds.length || now.some((id, index) => id !== group.registrationIds[index]);
  });
}

const isIdList = (value: unknown): value is string[] => Array.isArray(value) && value.every(id => typeof id === 'string');

/** The snapshot an assign audit stored, only while it still describes the roster that is saved now. */
export function savedStandingsSnapshot(afterJson: unknown, registrationIds: readonly string[]): StandingsSnapshot | null {
  if (typeof afterJson !== 'object' || afterJson === null) return null;
  const { registrationIds: assigned, standingsSnapshot } = afterJson as { registrationIds?: unknown; standingsSnapshot?: unknown };
  if (!isIdList(assigned) || assigned.length !== registrationIds.length || assigned.some((id, index) => id !== registrationIds[index])) return null;
  if (!Array.isArray(standingsSnapshot)) return null;
  const groups = standingsSnapshot as Array<{ groupId?: unknown; registrationIds?: unknown }>;
  if (!groups.every(group => typeof group?.groupId === 'string' && isIdList(group.registrationIds))) return null;
  return groups.map(group => ({ groupId: group.groupId as string, registrationIds: group.registrationIds as string[] }));
}

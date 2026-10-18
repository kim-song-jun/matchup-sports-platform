import type { V1AdminBracketGroup, V1AdminBracketSlot } from '@/types/api';

/** Matches the API's assertPlaceable: a group-stage ENTRY can also advance to a BYE. */
export function placedRegistrationIdsForSlot(
  slots: readonly V1AdminBracketSlot[],
  target: V1AdminBracketSlot | undefined,
  groups: readonly V1AdminBracketGroup[] = [],
): ReadonlySet<string> {
  const stageGroups = new Set(groups.filter(group => group.phase === 'group').map(group => group.id));
  const stageEntry = (slot: V1AdminBracketSlot) => slot.kind === 'ENTRY' && slot.groupId !== null && stageGroups.has(slot.groupId);
  return new Set(slots.filter(slot => {
    if (slot.id === target?.id || slot.registrationId === null) return false;
    if (target?.kind === 'BYE') return !stageEntry(slot);
    if (target?.kind === 'GROUP_RANK') return slot.kind === 'GROUP_RANK' || slot.kind === 'BYE';
    if (target && stageEntry(target)) return slot.kind === 'ENTRY';
    return slot.kind === 'ENTRY' || slot.kind === 'BYE';
  }).map(slot => slot.registrationId as string));
}

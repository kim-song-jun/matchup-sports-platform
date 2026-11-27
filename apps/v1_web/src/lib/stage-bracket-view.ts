import type { V1AdminTournamentBracket } from '@/types/api';
import type { StagePool } from '@/types/stage-plan';

export function stageBracketView(bracket: V1AdminTournamentBracket, pool?: StagePool): V1AdminTournamentBracket {
  if (!pool) return bracket;
  const groups = bracket.groups.filter(group => group.bracketTrack === `stage:${pool.key}`);
  const groupIds = new Set(groups.map(group => group.id));
  const fixtures = bracket.fixtures.filter(fixture => fixture.groupId !== null && groupIds.has(fixture.groupId));
  const slotIds = new Set(fixtures.flatMap(fixture => [fixture.homeSlotId, fixture.awaySlotId]));
  return {
    groups, fixtures,
    slots: bracket.slots.filter(slot => (slot.groupId !== null && groupIds.has(slot.groupId)) || slotIds.has(slot.id)),
    standings: bracket.standings.filter(row => groupIds.has(row.groupId)),
  };
}

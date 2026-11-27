import { directPlacedRegistrationIds } from '@/lib/bracket-canvas-layout';
import type { V1AdminBracketFixture, V1AdminBracketSlot, V1AdminTournamentRegistration } from '@/types/api';

/** 참가팀 트레이의 「미배정」과 같은 기준 — 자리에 들어갔거나 경기에 직접 들어간 팀은 세지 않는다. */
export function unplacedTeamCount(
  registrations: readonly V1AdminTournamentRegistration[],
  bracket: { fixtures: readonly V1AdminBracketFixture[]; slots: readonly V1AdminBracketSlot[] },
): number {
  const placed = new Set(bracket.slots.filter(slot => slot.kind !== 'GROUP_RANK' && slot.registrationId !== null).map(slot => slot.registrationId));
  const direct = directPlacedRegistrationIds(bracket.fixtures, bracket.slots);
  return registrations.filter(registration => registration.status === 'confirmed' && !placed.has(registration.id) && !direct.has(registration.id)).length;
}

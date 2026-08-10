/**
 * Live-substitution addition — mirrors `apps/v1_api/src/games/core/
 * substitution.ts`'s derivation exactly (same fold, same ordering
 * requirement) so the console can decide, client-side, who is currently
 * on the pitch (for the "나갈 선수" step / quick-mode arm list) and who is on
 * the bench (for the "들어올 선수" step / quick-mode tap targets) WITHOUT
 * waiting on a round trip — the server (`assertSubstitution`) still
 * authoritatively re-validates every submit, this is purely a UI-side
 * filter so an operator is never even shown an invalid target.
 *
 * "On the pitch right now" is never a stored field — it is folded from
 * `GameLineupParticipant.started` (who began the match) plus every
 * NON-reversed SUBSTITUTION event so far, applied in `sequence` order.
 * Order matters: rolling substitutions can send the same player back on
 * later, so folding out of array order can produce the exact opposite of
 * the real final state.
 */

import type { GameEventRecord, GameLineupParticipant } from '@/types/game-operations';

function outParticipantIdOf(event: GameEventRecord): string | null {
  const value = event.payload.outParticipantId;
  return typeof value === 'string' ? value : null;
}

export function deriveOnPitchParticipantIds(
  participants: readonly GameLineupParticipant[],
  events: readonly GameEventRecord[],
): ReadonlySet<string> {
  const reversedIds = new Set(
    events.map((event) => event.reversesEventId).filter((id): id is string => id !== null),
  );
  const onPitch = new Set(participants.filter((p) => p.started).map((p) => p.id));
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
  for (const event of ordered) {
    if (event.type !== 'SUBSTITUTION' || reversedIds.has(event.id)) continue;
    const outParticipantId = outParticipantIdOf(event);
    if (event.participantId === null || outParticipantId === null) continue;
    onPitch.delete(outParticipantId);
    onPitch.add(event.participantId);
  }
  return onPitch;
}

/** Active (non-reversed) SUBSTITUTION count for one side — what the
 * "남은 횟수" (remaining count) display subtracts from `maxSubstitutions`. */
export function countActiveSubstitutions(sideId: string, events: readonly GameEventRecord[]): number {
  const reversedIds = new Set(
    events.map((event) => event.reversesEventId).filter((id): id is string => id !== null),
  );
  return events.filter(
    (event) => event.type === 'SUBSTITUTION' && event.sideId === sideId && !reversedIds.has(event.id),
  ).length;
}

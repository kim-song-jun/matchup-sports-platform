import type { GameEventRecord } from '@/types/game-operations';

/**
 * Live-substitution addition — mirrors `find-recent-goal-event.ts`'s exact
 * reasoning: a SUBSTITUTION commit goes through the offline-durable queue,
 * so at the moment an operator taps "되돌리기" (undo) on the quick-mode
 * confirmation toast, the just-recorded event may not be in `liveEvents`
 * yet. The same player pair can appear more than once across a match
 * (rolling substitutions swap back and forth), so `clockMs` — server-frozen
 * at commit — is what makes this combination unique enough to find the
 * RIGHT one, not just A matching one.
 */
export function findRecentSubstitutionEvent(
  liveEvents: readonly GameEventRecord[],
  captured: { readonly inParticipantId: string; readonly outParticipantId: string; readonly clockMs: number },
): GameEventRecord | undefined {
  return [...liveEvents]
    .reverse()
    .find(
      (event) =>
        event.type === 'SUBSTITUTION' &&
        event.participantId === captured.inParticipantId &&
        event.payload.outParticipantId === captured.outParticipantId &&
        event.clockMs === captured.clockMs,
    );
}

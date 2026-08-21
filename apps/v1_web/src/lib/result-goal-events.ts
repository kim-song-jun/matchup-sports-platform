import type { GameResultGoalEventInput } from '@/hooks/use-tournament-result-review';
import type { GameEventRecord } from '@/types/game-operations';

export function deriveEditableGoalEvents(
  stored: readonly GameResultGoalEventInput[] | null | undefined,
  events: readonly GameEventRecord[],
): GameResultGoalEventInput[] {
  if (stored) return stored.map((event) => ({ ...event }));

  const reversed = new Set(
    events
      .filter((event) => event.type === 'CORRECTION' && event.reversesEventId)
      .map((event) => event.reversesEventId as string),
  );

  return events
    .filter(
      (event) =>
        (event.type === 'GOAL' || event.type === 'OWN_GOAL') &&
        event.sideId !== null &&
        !reversed.has(event.id),
    )
    .map((event) => ({
      id: event.id,
      sideId: event.sideId as string,
      ...(event.participantId ? { participantId: event.participantId } : {}),
      minute: Math.ceil(event.clockMs / 60_000),
      period: event.period,
      ownGoal: event.type === 'OWN_GOAL',
    }));
}

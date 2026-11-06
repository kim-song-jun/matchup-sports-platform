export type ResultCardEvent = {
  id: string;
  card: 'YELLOW' | 'RED';
  minute?: number;
  period?: number;
};

type LiveCard = {
  id: string; type: string; sideId: string | null; participantId: string | null;
  period: number; clockMs: number; payload: unknown; reversesEventId: string | null;
};

/** Official participant totals bound old live events; explicit events replace them, including []. */
export function resolveResultCardEvents(
  participants: readonly { participantId: string; sideId: string; cards: unknown }[],
  liveEvents: readonly LiveCard[],
): Array<ResultCardEvent & { participantId: string; sideId: string; clockMs?: number }> {
  const reversed = new Set(liveEvents.map((event) => event.reversesEventId));
  return participants.flatMap((participant) => {
    const cards = participant.cards as { yellow?: number; red?: number; events?: ResultCardEvent[] };
    if (Array.isArray(cards?.events)) {
      return cards.events.map((event) => ({ ...event, participantId: participant.participantId, sideId: participant.sideId }));
    }
    return (['YELLOW', 'RED'] as const).flatMap((card) => {
      const count = cards?.[card === 'YELLOW' ? 'yellow' : 'red'] ?? 0;
      const matching = liveEvents.filter((event) => event.type === 'CARD' && !reversed.has(event.id)
        && event.participantId === participant.participantId && event.sideId === participant.sideId
        && (event.payload as { card?: string } | null)?.card === card);
      return Array.from({ length: count }, (_, index) => {
        const live = matching[index];
        return {
          id: live?.id ?? `card-${participant.participantId}-${card}-${index}`,
          card, participantId: participant.participantId, sideId: participant.sideId,
          ...(live ? { minute: Math.ceil(live.clockMs / 60000), period: live.period, clockMs: live.clockMs } : {}),
        };
      });
    });
  });
}

import type { V1GameResultCardEvent, V1GameResultCards, V1GameResultParticipantInput } from '@/types/api';
import type { GameEventRecord } from '@/types/game-operations';

export type EditableCardEvent = V1GameResultCardEvent & { participantId: string; sideId: string };

/** Preserve explicit snapshots; reconstruct aggregate-only cards without inventing a time. */
export function deriveEditableCardEvents(
  participants: readonly Pick<V1GameResultParticipantInput, 'participantId' | 'sideId' | 'cards'>[],
  liveEvents: readonly GameEventRecord[] = [],
): EditableCardEvent[] {
  const reversed = new Set(liveEvents.map((event) => event.reversesEventId));
  return participants.flatMap((participant) => {
    if (participant.cards.events !== undefined) {
      return participant.cards.events.map((event) => ({ ...event, participantId: participant.participantId, sideId: participant.sideId }));
    }
    return (['YELLOW', 'RED'] as const).flatMap((card) => {
      const matching = liveEvents.filter((event) => event.type === 'CARD' && !reversed.has(event.id)
        && event.participantId === participant.participantId && event.sideId === participant.sideId && event.payload.card === card);
      return Array.from({ length: participant.cards[card === 'YELLOW' ? 'yellow' : 'red'] }, (_, index) => {
        const live = matching[index];
        return { id: live?.id ?? `card-${participant.participantId}-${card}-${index}`, card,
          participantId: participant.participantId, sideId: participant.sideId,
          ...(live ? { minute: Math.ceil(live.clockMs / 60000), period: live.period } : {}) };
      });
    });
  });
}

export function cardsForParticipant(events: readonly EditableCardEvent[], participantId: string): V1GameResultCards {
  const own = events.filter((event) => event.participantId === participantId);
  return {
    yellow: own.filter((event) => event.card === 'YELLOW').length,
    red: own.filter((event) => event.card === 'RED').length,
    events: own.map(({ participantId: _participantId, sideId: _sideId, ...event }) => event),
  };
}

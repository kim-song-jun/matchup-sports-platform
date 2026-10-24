import { describe, expect, it } from 'vitest';
import { deriveEditableCardEvents, cardsForParticipant } from './result-card-events';
import type { GameEventRecord } from '@/types/game-operations';

describe('editable card timeline', () => {
  it('restores live time, skips reversals, and fills missing aggregate cards', () => {
    const live: GameEventRecord = { id: 'live', gameId: 'game', sequence: 1, clientEventId: 'client', payloadHash: 'hash',
      type: 'CARD', participantId: 'p', sideId: 's', payload: { card: 'YELLOW' }, clockMs: 600000, period: 2,
      reversesEventId: null, assistParticipantId: null, occurredAt: '2026-10-24T00:00:00Z',
      receivedAt: '2026-10-24T00:00:00Z', actorUserId: 'actor' };
    const participants = [{ participantId: 'p', sideId: 's', cards: { yellow: 2, red: 1 } }];
    const events = deriveEditableCardEvents(participants, [live]);
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ minute: 10, period: 2 });
    expect(events[1].minute).toBeUndefined();
    expect(cardsForParticipant(events, 'p')).toMatchObject({ yellow: 2, red: 1 });
    expect(deriveEditableCardEvents(participants, [live, { ...live, id: 'undo', type: 'CORRECTION', reversesEventId: live.id }])
      .every((event) => event.minute === undefined)).toBe(true);
  });
  it('preserves explicit snapshots and explicit deletions over live data', () => {
    const cards = { yellow: 0, red: 1, events: [{ id: 'red', card: 'RED' as const, minute: 0 }] };
    const events = deriveEditableCardEvents([{ participantId: 'p', sideId: 's', cards }]);
    expect(cardsForParticipant(events, 'p')).toEqual(cards);
    expect(cardsForParticipant([], 'p')).toEqual({ yellow: 0, red: 0, events: [] });
  });
});

import { describe, expect, it } from 'vitest';
import { countActiveSubstitutions, deriveOnPitchParticipantIds, deriveSentOffParticipantIds } from './on-pitch-state';
import type { GameEventRecord, GameLineupParticipant } from '@/types/game-operations';

function participant(id: string, sideId: string, started: boolean): GameLineupParticipant {
  return {
    id,
    gameId: 'g-1',
    sideId,
    lineupId: `lineup-${sideId}`,
    userId: null,
    displayNameSnapshot: id,
    jerseyNumber: null,
    position: null,
    positionX: null,
    positionY: null,
    started,
    arrivedAt: null,
    createdAt: '',
    updatedAt: '',
  };
}

function subEvent(
  id: string,
  sequence: number,
  sideId: string,
  inParticipantId: string,
  outParticipantId: string,
  reversesEventId: string | null = null,
): GameEventRecord {
  return {
    id,
    gameId: 'g-1',
    sequence,
    clientEventId: `client-${id}`,
    payloadHash: 'hash',
    type: 'SUBSTITUTION',
    sideId,
    participantId: inParticipantId,
    assistParticipantId: null,
    period: 1,
    clockMs: 0,
    occurredAt: '2026-08-09T00:00:00.000Z',
    receivedAt: '2026-08-09T00:00:00.000Z',
    actorUserId: 'actor-1',
    reversesEventId,
    payload: { outParticipantId },
  };
}

describe('deriveOnPitchParticipantIds', () => {
  it('starts from `started` lineup participants when there are no events yet', () => {
    const participants = [participant('p1', 'side-home', true), participant('p2', 'side-home', false)];
    expect(deriveOnPitchParticipantIds(participants, [])).toEqual(new Set(['p1']));
  });

  it('folds a substitution: outgoing leaves, incoming joins', () => {
    const participants = [participant('p1', 'side-home', true), participant('p2', 'side-home', false)];
    const onPitch = deriveOnPitchParticipantIds(participants, [subEvent('e1', 1, 'side-home', 'p2', 'p1')]);
    expect(onPitch.has('p1')).toBe(false);
    expect(onPitch.has('p2')).toBe(true);
  });

  it('applies events in sequence order, not array order — rolling subs can send a player back on', () => {
    const participants = [participant('p1', 'side-home', true), participant('p2', 'side-home', false)];
    const events = [subEvent('e2', 2, 'side-home', 'p1', 'p2'), subEvent('e1', 1, 'side-home', 'p2', 'p1')];
    const onPitch = deriveOnPitchParticipantIds(participants, events);
    expect(onPitch.has('p1')).toBe(true);
    expect(onPitch.has('p2')).toBe(false);
  });

  it('ignores a reversed SUBSTITUTION event — reversal restores prior on-pitch state', () => {
    const participants = [participant('p1', 'side-home', true), participant('p2', 'side-home', false)];
    const events: GameEventRecord[] = [
      subEvent('e1', 1, 'side-home', 'p2', 'p1'),
      {
        ...subEvent('e2', 2, 'side-home', 'p1', 'p2'),
        type: 'CORRECTION',
        reversesEventId: 'e1',
        payload: { reason: 'misclick' },
      },
    ];
    const onPitch = deriveOnPitchParticipantIds(participants, events);
    expect(onPitch.has('p1')).toBe(true);
    expect(onPitch.has('p2')).toBe(false);
  });
});

describe('countActiveSubstitutions', () => {
  it('counts only non-reversed SUBSTITUTION events for the given side', () => {
    const events: GameEventRecord[] = [
      subEvent('e1', 1, 'side-home', 'p2', 'p1'),
      subEvent('e2', 2, 'side-away', 'p4', 'p3'),
      subEvent('e3', 3, 'side-home', 'p5', 'p2'),
      { ...subEvent('e4', 4, 'side-home', 'p2', 'p5'), type: 'CORRECTION', reversesEventId: 'e3', payload: {} },
    ];
    expect(countActiveSubstitutions('side-home', events)).toBe(1);
    expect(countActiveSubstitutions('side-away', events)).toBe(1);
  });
});

describe('deriveSentOffParticipantIds', () => {
  const cardEvent = (
    id: string,
    participantId: string | null,
    card: 'RED' | 'YELLOW',
    overrides: Partial<GameEventRecord> = {},
  ): GameEventRecord => ({
    ...subEvent(id, 1, 'side-home', 'x', 'y'),
    type: 'CARD',
    participantId,
    payload: { card },
    ...overrides,
  });

  it('collects players with a red card on either side and ignores yellows, other event types and anonymous cards', () => {
    const events = [
      cardEvent('e1', 'p1', 'RED'),
      cardEvent('e2', 'p2', 'YELLOW'),
      cardEvent('e3', 'p3', 'RED', { sideId: 'side-away' }),
      cardEvent('e4', null, 'RED'),
      subEvent('e5', 5, 'side-home', 'p4', 'p2'),
    ];
    expect(deriveSentOffParticipantIds(events)).toEqual(new Set(['p1', 'p3']));
  });

  it('drops a red card that was reversed by a correction while keeping the others', () => {
    const events = [
      cardEvent('e1', 'p1', 'RED'),
      cardEvent('e2', 'p2', 'RED'),
      cardEvent('e3', 'p1', 'YELLOW', { type: 'CORRECTION', reversesEventId: 'e1', payload: {} }),
    ];
    expect(deriveSentOffParticipantIds(events)).toEqual(new Set(['p2']));
  });
});

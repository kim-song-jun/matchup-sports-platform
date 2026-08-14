import { describe, expect, it } from 'vitest';
import { countActiveSubstitutions, deriveOnPitchParticipantIds } from './on-pitch-state';
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

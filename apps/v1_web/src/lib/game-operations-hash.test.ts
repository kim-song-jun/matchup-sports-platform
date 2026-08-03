import { describe, expect, it } from 'vitest';
import {
  canonicalGameEventJson,
  canonicalGameEventPayloadHash,
  type HashableGameEvent,
} from './game-operations-hash';

const goal: HashableGameEvent = {
  type: 'GOAL',
  sideId: 'side-home',
  participantId: 'participant-7',
  period: 1,
  clockMs: 125000,
  occurredAt: '2026-08-03T12:00:00.000Z',
  payload: { assistParticipantId: 'participant-9' },
};

// Same value, keys in a different order at every level.
const goalReordered: HashableGameEvent = {
  payload: { assistParticipantId: 'participant-9' },
  occurredAt: '2026-08-03T12:00:00.000Z',
  clockMs: 125000,
  period: 1,
  participantId: 'participant-7',
  sideId: 'side-home',
  type: 'GOAL',
};

describe('canonicalGameEventJson', () => {
  it('sorts object keys alphabetically at every nesting level, independent of insertion order', () => {
    expect(canonicalGameEventJson(goal)).toBe(canonicalGameEventJson(goalReordered));
    expect(canonicalGameEventJson(goal)).toBe(
      '{"clockMs":125000,"occurredAt":"2026-08-03T12:00:00.000Z","participantId":"participant-7","payload":{"assistParticipantId":"participant-9"},"period":1,"sideId":"side-home","type":"GOAL"}',
    );
  });
});

describe('canonicalGameEventPayloadHash', () => {
  it('produces the exact sha256 hex digest the backend computes for the same event (fixed fixture, computed offline with the identical canonicalize+sha256 algorithm)', async () => {
    const hash = await canonicalGameEventPayloadHash(goal);
    expect(hash).toBe('6da02c570dca496dda472f9f556c7163b1b617f2e71a6c8cee00c2bd1433f7d9');
  });

  it('is independent of source key order (matches canonicalGameEventJson)', async () => {
    const first = await canonicalGameEventPayloadHash(goal);
    const second = await canonicalGameEventPayloadHash(goalReordered);
    expect(first).toBe(second);
  });

  it('changes when the event content changes', async () => {
    const goalHash = await canonicalGameEventPayloadHash(goal);
    const cardHash = await canonicalGameEventPayloadHash({
      ...goal,
      type: 'CARD',
      payload: { card: 'YELLOW' },
    });
    expect(cardHash).not.toBe(goalHash);
  });
});

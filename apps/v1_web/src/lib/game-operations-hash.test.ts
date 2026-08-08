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
  assistParticipantId: 'participant-9',
  period: 1,
  clockMs: 125000,
  occurredAt: '2026-08-03T12:00:00.000Z',
  payload: {},
};

// Same value, keys in a different order at every level.
const goalReordered: HashableGameEvent = {
  payload: {},
  occurredAt: '2026-08-03T12:00:00.000Z',
  clockMs: 125000,
  period: 1,
  assistParticipantId: 'participant-9',
  participantId: 'participant-7',
  sideId: 'side-home',
  type: 'GOAL',
};

const foul: HashableGameEvent = {
  type: 'FOUL',
  sideId: 'side-home',
  participantId: 'participant-7',
  period: 1,
  clockMs: 30000,
  occurredAt: '2026-08-03T12:00:00.000Z',
  payload: {},
};

describe('canonicalGameEventJson', () => {
  it('sorts object keys alphabetically at every nesting level, independent of insertion order', () => {
    expect(canonicalGameEventJson(goal)).toBe(canonicalGameEventJson(goalReordered));
    expect(canonicalGameEventJson(goal)).toBe(
      '{"assistParticipantId":"participant-9","clockMs":125000,"occurredAt":"2026-08-03T12:00:00.000Z","participantId":"participant-7","payload":{},"period":1,"sideId":"side-home","type":"GOAL"}',
    );
  });

  it('omits assistParticipantId from the canonical JSON when absent, distinguishing it from an explicit value', () => {
    const { assistParticipantId: _drop, ...noAssist } = goal;
    expect(canonicalGameEventJson(noAssist)).not.toContain('assistParticipantId');
  });
});

describe('canonicalGameEventPayloadHash', () => {
  it('produces the exact sha256 hex digest the backend computes for a GOAL event carrying a top-level assistParticipantId', async () => {
    const hash = await canonicalGameEventPayloadHash(goal);
    expect(hash).toBe('fc8436f01058c1229642c601b7503498e2e4f23726676ddcb84464e454a062c5');
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
      assistParticipantId: undefined,
      payload: { card: 'YELLOW' },
    });
    expect(cardHash).not.toBe(goalHash);
  });

  it('produces the exact sha256 hex digest for a FOUL event (new V1GameEventType.FOUL)', async () => {
    const hash = await canonicalGameEventPayloadHash(foul);
    expect(hash).toBe('75cd46d009aaed85e1b53c48fdcdb848cdceec053a65239c1e26cf4288191a2c');
  });
});

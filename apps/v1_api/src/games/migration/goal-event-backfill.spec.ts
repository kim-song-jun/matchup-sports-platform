import { V1GameSideKey } from '@prisma/client';
import { planGameGoalEvents, type GameGoalCandidate } from './goal-event-backfill';

const HOME_SIDE_ID = 'side-home';
const AWAY_SIDE_ID = 'side-away';
const GAME_ID = 'game-1';
const CREATED_AT = new Date('2026-05-01T10:00:00.000Z');

function candidate(overrides: Partial<GameGoalCandidate>): GameGoalCandidate {
  return {
    gameId: GAME_ID,
    lastSequence: 0,
    createdAt: CREATED_AT,
    goals: [],
    sides: [
      { id: HOME_SIDE_ID, sideKey: V1GameSideKey.HOME },
      { id: AWAY_SIDE_ID, sideKey: V1GameSideKey.AWAY },
    ],
    participants: [],
    ...overrides,
  };
}

describe('planGameGoalEvents', () => {
  it('creates a participant-less GOAL event for a guest/non-roster scorer (playerId null)', () => {
    const { toInsert, quarantine } = planGameGoalEvents(
      candidate({
        goals: [{ team: 'home', playerId: null, playerName: '대타 김철수', minute: 23 }],
      }),
    );

    expect(quarantine).toEqual([]);
    expect(toInsert).toHaveLength(1);
    expect(toInsert[0]).toMatchObject({
      gameId: GAME_ID,
      sequence: 1,
      sideId: HOME_SIDE_ID,
      participantId: null,
      period: 1,
      clockMs: 23 * 60_000,
      occurredAt: CREATED_AT,
      actorUserId: 'SYSTEM:GOAL_EVENT_BACKFILL',
    });
    expect(toInsert[0].clientEventId).toBe(`GOAL_BACKFILL:${GAME_ID}:0`);
    expect(toInsert[0].payloadHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('resolves participantId when exactly one roster participant matches the goal on the correct side', () => {
    const { toInsert, quarantine } = planGameGoalEvents(
      candidate({
        goals: [{ team: 'away', playerId: 'legacy-player-1', playerName: '이영희', minute: 71 }],
        participants: [
          { id: 'participant-away-1', sideId: AWAY_SIDE_ID, displayNameSnapshot: '이영희' },
          // Same name on the wrong side must NOT be picked -- proves the match is
          // scoped by side, not name alone.
          { id: 'participant-home-1', sideId: HOME_SIDE_ID, displayNameSnapshot: '이영희' },
        ],
      }),
    );

    expect(quarantine).toEqual([]);
    expect(toInsert).toHaveLength(1);
    expect(toInsert[0].participantId).toBe('participant-away-1');
  });

  it('quarantines (does not create an event for) a known-identity goal with no matching participant', () => {
    const { toInsert, quarantine } = planGameGoalEvents(
      candidate({
        goals: [{ team: 'home', playerId: 'legacy-player-2', playerName: '박민수', minute: 10 }],
        participants: [], // the real production shape for every backfilled game today
      }),
    );

    expect(toInsert).toEqual([]);
    expect(quarantine).toEqual([{ gameId: GAME_ID, goalIndex: 0, reason: 'PARTICIPANT_UNRESOLVED' }]);
  });

  it('quarantines a known-identity goal with an ambiguous (multiple) participant match', () => {
    const { toInsert, quarantine } = planGameGoalEvents(
      candidate({
        goals: [{ team: 'home', playerId: 'legacy-player-3', playerName: '김동일', minute: 5 }],
        participants: [
          { id: 'p1', sideId: HOME_SIDE_ID, displayNameSnapshot: '김동일' },
          { id: 'p2', sideId: HOME_SIDE_ID, displayNameSnapshot: '김동일' },
        ],
      }),
    );

    expect(toInsert).toEqual([]);
    expect(quarantine).toEqual([{ gameId: GAME_ID, goalIndex: 0, reason: 'PARTICIPANT_UNRESOLVED' }]);
  });

  it('quarantines a goal with no recorded minute instead of fabricating clockMs: 0', () => {
    const { toInsert, quarantine } = planGameGoalEvents(
      candidate({
        goals: [{ team: 'home', playerId: null, playerName: '대타', minute: null }],
      }),
    );

    expect(toInsert).toEqual([]);
    expect(quarantine).toEqual([{ gameId: GAME_ID, goalIndex: 0, reason: 'MINUTE_MISSING' }]);
  });

  it('assigns sequence numbers only to inserted goals, skipping quarantined ones without reserving a gap', () => {
    const { toInsert, quarantine } = planGameGoalEvents(
      candidate({
        lastSequence: 5,
        goals: [
          { team: 'home', playerId: null, playerName: '선수A', minute: 10 },
          { team: 'away', playerId: 'unresolved', playerName: '선수B', minute: 20 },
          { team: 'home', playerId: null, playerName: '선수C', minute: 30 },
        ],
      }),
    );

    expect(quarantine).toEqual([{ gameId: GAME_ID, goalIndex: 1, reason: 'PARTICIPANT_UNRESOLVED' }]);
    expect(toInsert.map((event) => event.sequence)).toEqual([6, 7]);
    expect(toInsert.map((event) => event.clientEventId)).toEqual([
      `GOAL_BACKFILL:${GAME_ID}:0`,
      `GOAL_BACKFILL:${GAME_ID}:2`,
    ]);
  });

  it('produces distinct payload hashes for goals that differ in side, minute, or scorer', () => {
    const { toInsert } = planGameGoalEvents(
      candidate({
        goals: [
          { team: 'home', playerId: null, playerName: 'A', minute: 10 },
          { team: 'away', playerId: null, playerName: 'A', minute: 10 },
          { team: 'home', playerId: null, playerName: 'A', minute: 11 },
        ],
      }),
    );

    const hashes = new Set(toInsert.map((event) => event.payloadHash));
    expect(hashes.size).toBe(3);
  });
});

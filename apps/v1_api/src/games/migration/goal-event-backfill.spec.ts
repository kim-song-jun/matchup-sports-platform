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
    // Goal-level idempotency input (see the "골 단위 멱등" describe block
    // below for why the gate moved off the game-level `events: { none: ... }`
    // WHERE clause). Defaulted to empty here so every pre-existing case in
    // this file keeps reading as "nothing backfilled yet for this game".
    alreadyInsertedClientEventIds: new Set<string>(),
    ...overrides,
  };
}

function clientEventIdFor(goalIndex: number, gameId = GAME_ID): string {
  return `GOAL_BACKFILL:${gameId}:${goalIndex}`;
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

  it('records a goal with no recorded minute instead of quarantining it, carrying "minute unknown" in the payload', () => {
    // Replaces the previous assertion, which pinned the MINUTE_MISSING
    // quarantine. That quarantine dropped the goal from the event lineage
    // permanently: the game-level candidate gate meant a game that got any
    // event inserted never came back, so a minute-less goal could never be
    // retried and simply ceased to exist outside the frozen score JSON.
    // Writing `clockMs: 0` alone would assert "scored in minute 0", so the
    // unknown-ness has to ride along in the payload for readers to honour.
    const { toInsert, quarantine } = planGameGoalEvents(
      candidate({
        goals: [{ team: 'home', playerId: null, playerName: '대타', minute: null }],
      }),
    );

    expect(quarantine).toEqual([]);
    expect(toInsert).toHaveLength(1);
    expect(toInsert[0]).toMatchObject({
      sideId: HOME_SIDE_ID,
      participantId: null,
      clockMs: 0,
      sequence: 1,
    });
    expect(toInsert[0].payload).toMatchObject({ minuteKnown: false });
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

/**
 * "minute unknown" must survive as data, not as an absence.
 *
 * A minute-less goal is written with `clockMs: 0` because the column is
 * non-null, so `clockMs` alone can no longer distinguish "scored in the
 * opening minute" from "we never recorded when". The payload carries that
 * distinction, and every read path keys off `payload.minuteKnown === false`.
 */
describe('planGameGoalEvents — minuteKnown', () => {
  it('omits minuteKnown entirely when the legacy minute is known', () => {
    // Deliberately omitted rather than written as `minuteKnown: true`.
    //
    // Idempotency here is keyed on `clientEventId`, not on the payload, so a
    // rerun will never rewrite a row that an earlier run already inserted.
    // Every goal an earlier run *could* have inserted had a known minute (a
    // minute-less one was quarantined before this change), so stamping a
    // redundant `minuteKnown: true` on newly inserted known-minute goals
    // would leave the same logical fact recorded two different ways across
    // rows depending on which run happened to write them. Omitting keeps the
    // new field strictly additive: it appears only on rows that previously
    // could not exist at all.
    const { toInsert } = planGameGoalEvents(
      candidate({ goals: [{ team: 'home', playerId: null, playerName: '김철수', minute: 23 }] }),
    );

    expect(toInsert).toHaveLength(1);
    expect(toInsert[0].clockMs).toBe(23 * 60_000);
    expect(toInsert[0].payload).not.toHaveProperty('minuteKnown');
  });

  it('distinguishes a genuine minute-0 goal from an unknown-minute goal in the payload hash', () => {
    // Both land on `clockMs: 0`. If the unknown-ness were not part of the
    // hashed payload, these two materially different goals would be
    // indistinguishable to anything hashing the event — and the "0 means
    // unknown" marker would be decorative rather than load-bearing.
    const { toInsert, quarantine } = planGameGoalEvents(
      candidate({
        goals: [
          { team: 'home', playerId: null, playerName: '동일선수', minute: 0 },
          { team: 'home', playerId: null, playerName: '동일선수', minute: null },
        ],
      }),
    );

    expect(quarantine).toEqual([]);
    expect(toInsert).toHaveLength(2);
    expect(toInsert[0].clockMs).toBe(0);
    expect(toInsert[1].clockMs).toBe(0);
    expect(toInsert[0].payload).not.toHaveProperty('minuteKnown');
    expect(toInsert[1].payload).toMatchObject({ minuteKnown: false });
    expect(toInsert[0].payloadHash).not.toBe(toInsert[1].payloadHash);
  });

  it('still quarantines an unresolvable known-identity scorer, even though minute is no longer a quarantine reason', () => {
    // Regression fence for the boundary this change deliberately does NOT
    // cross. Synthesizing a V1GameParticipant for these goals is a separate,
    // larger effort: `V1GameParticipant` has no (gameId, userId) uniqueness,
    // so a synthesized row plus a later real lineup save would double-count
    // one player's appearances. Dropping MINUTE_MISSING must not quietly
    // drag PARTICIPANT_UNRESOLVED along with it.
    const { toInsert, quarantine } = planGameGoalEvents(
      candidate({
        goals: [
          { team: 'home', playerId: 'legacy-player-1', playerName: '박민수', minute: null },
          { team: 'home', playerId: 'legacy-player-2', playerName: '이영희', minute: 33 },
        ],
        participants: [],
      }),
    );

    expect(toInsert).toEqual([]);
    expect(quarantine).toEqual([
      { gameId: GAME_ID, goalIndex: 0, reason: 'PARTICIPANT_UNRESOLVED' },
      { gameId: GAME_ID, goalIndex: 1, reason: 'PARTICIPANT_UNRESOLVED' },
    ]);
  });
});

/**
 * Goal-level (not game-level) idempotency.
 *
 * The candidate query used to exclude any game already holding a GOAL event,
 * which made a partially backfilled game permanently unreachable: one run
 * could insert some goals and quarantine others, and the quarantined ones
 * could never be retried even once their cause was resolved. The gate is now
 * per goal, keyed on the deterministic `clientEventId`
 * (`GOAL_BACKFILL:<gameId>:<goalIndex>`), so a rerun fills only the holes.
 */
describe('planGameGoalEvents — goal-level idempotency', () => {
  it('plans the goals that are still missing even though the game already holds backfilled events', () => {
    const { toInsert, quarantine } = planGameGoalEvents(
      candidate({
        lastSequence: 1,
        goals: [
          { team: 'home', playerId: null, playerName: '이미들어간골', minute: 10 },
          { team: 'away', playerId: null, playerName: '아직안들어간골', minute: 20 },
        ],
        alreadyInsertedClientEventIds: new Set([clientEventIdFor(0)]),
      }),
    );

    expect(quarantine).toEqual([]);
    expect(toInsert).toHaveLength(1);
    expect(toInsert[0].clientEventId).toBe(clientEventIdFor(1));
    expect(toInsert[0].sideId).toBe(AWAY_SIDE_ID);
    // The skipped goal must not burn a sequence number: sequences continue
    // from the game's current lastSequence, which already accounts for the
    // event inserted by the earlier run.
    expect(toInsert[0].sequence).toBe(2);
  });

  it('retries a goal that an earlier run quarantined, once its blocker is resolved', () => {
    // The whole point of the change. Goal 0 went in on the first run; goal 1
    // was quarantined as PARTICIPANT_UNRESOLVED. Under the old game-level
    // gate this game was excluded from every future run, so goal 1 stayed
    // missing forever even after its participant appeared.
    const { toInsert, quarantine } = planGameGoalEvents(
      candidate({
        lastSequence: 1,
        goals: [
          { team: 'home', playerId: null, playerName: '대타', minute: 10 },
          { team: 'away', playerId: 'legacy-player-1', playerName: '이영희', minute: 71 },
        ],
        participants: [{ id: 'participant-away-1', sideId: AWAY_SIDE_ID, displayNameSnapshot: '이영희' }],
        alreadyInsertedClientEventIds: new Set([clientEventIdFor(0)]),
      }),
    );

    expect(quarantine).toEqual([]);
    expect(toInsert).toHaveLength(1);
    expect(toInsert[0].clientEventId).toBe(clientEventIdFor(1));
    expect(toInsert[0].participantId).toBe('participant-away-1');
  });

  it('plans nothing when every goal of the game is already inserted', () => {
    const { toInsert, quarantine } = planGameGoalEvents(
      candidate({
        lastSequence: 2,
        goals: [
          { team: 'home', playerId: null, playerName: 'A', minute: 10 },
          { team: 'away', playerId: null, playerName: 'B', minute: 20 },
        ],
        alreadyInsertedClientEventIds: new Set([clientEventIdFor(0), clientEventIdFor(1)]),
      }),
    );

    expect(toInsert).toEqual([]);
    expect(quarantine).toEqual([]);
  });

  it('does not re-quarantine an already-inserted goal that would otherwise look unresolvable', () => {
    // A goal that made it in is settled. Re-reporting it as quarantined on
    // every subsequent run would make the operational quarantine report grow
    // without bound and misrepresent stable data as needing attention.
    const { toInsert, quarantine } = planGameGoalEvents(
      candidate({
        lastSequence: 1,
        goals: [{ team: 'home', playerId: 'legacy-player-1', playerName: '박민수', minute: 10 }],
        participants: [],
        alreadyInsertedClientEventIds: new Set([clientEventIdFor(0)]),
      }),
    );

    expect(toInsert).toEqual([]);
    expect(quarantine).toEqual([]);
  });

  it('matches already-inserted ids by the goal index, not by position among the remaining goals', () => {
    // Guards the off-by-one an implementation invites if it filters the goal
    // list first and then enumerates: goalIndex must stay anchored to the
    // goal's position in the frozen score.goals[] array, because that is what
    // the clientEventId of the earlier run was built from.
    const { toInsert } = planGameGoalEvents(
      candidate({
        lastSequence: 1,
        goals: [
          { team: 'home', playerId: null, playerName: 'A', minute: 10 },
          { team: 'home', playerId: null, playerName: 'B', minute: 20 },
          { team: 'home', playerId: null, playerName: 'C', minute: 30 },
        ],
        alreadyInsertedClientEventIds: new Set([clientEventIdFor(1)]),
      }),
    );

    expect(toInsert.map((event) => event.clientEventId)).toEqual([
      clientEventIdFor(0),
      clientEventIdFor(2),
    ]);
    expect(toInsert.map((event) => event.sequence)).toEqual([2, 3]);
  });
});

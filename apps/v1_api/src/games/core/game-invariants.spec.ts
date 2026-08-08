import { V1GameEventType, V1GameSourceType } from '@prisma/client';
import { validateGameResultInvariants } from './game-invariants';

// Task 17: in the ordinary flow a TEAM_MATCH carries zero V1GameEvent rows —
// the host self-reports the score and the opponent approves it; there is no
// live officiating — so `eventScore` derived from `input.events` is
// {HOME: 0, AWAY: 0}. Before this fix, validateGameResultInvariants
// cross-checked the submitted score against that empty event stream and
// rejected every non-0:0 team result with SCORE_EVENT_MISMATCH (the bug every
// test in game-team-result-authority.integration-spec.ts happened to miss,
// because they all submit {home: 0, away: 0}).
//
// Option A (the chosen fix): for a team match WITH NO EVENTS the SUBMITTED
// score is authoritative. The gate is on the events actually being absent, not
// on sourceType alone: resolveActor's event_append/event_reverse forbid is only
// reached by team members, while an active non-support platform_ops admin hits
// an earlier unconditional early-return and POST /games/:gameId/events has no
// sourceType guard — so an admin CAN append real events to a team match. If
// events exist they are evidence, and the score must still agree with them.
// TOURNAMENT_FIXTURE keeps the event-derived cross-check exactly as before.
describe('validateGameResultInvariants — Task 17 TEAM_MATCH event-vs-score exemption', () => {
  const twoSides = [
    { id: 'side-home', sideKey: 'HOME' as const },
    { id: 'side-away', sideKey: 'AWAY' as const },
  ];

  it('accepts a real non-zero TEAM_MATCH score with zero events (would 422 SCORE_EVENT_MISMATCH if the exemption is reverted)', () => {
    expect(() =>
      validateGameResultInvariants({
        sourceType: V1GameSourceType.TEAM_MATCH,
        score: { home: 3, away: 1 },
        sides: twoSides,
        participants: [
          { id: 'p1', sideId: 'side-home', goals: 2, cards: { yellow: 0, red: 0 } },
          { id: 'p2', sideId: 'side-home', goals: 1, cards: { yellow: 0, red: 0 } },
          { id: 'p3', sideId: 'side-away', goals: 1, cards: { yellow: 1, red: 0 } },
        ],
        // No events at all — this is the structural reality for TEAM_MATCH.
        events: [],
        scorerPolicy: 'optional_with_warning',
        missingScorer: false,
      }),
    ).not.toThrow();
  });

  it('accepts per-participant goals that sum to the submitted non-zero score with zero events', () => {
    // Isolates the participant-goal-vs-event branch specifically: each
    // participant's goals total (2 + 1 + 1 = 4 goals, split 3:1 by side)
    // agrees with the submitted score even though eventGoalsByParticipant
    // is empty for every participant.
    expect(() =>
      validateGameResultInvariants({
        sourceType: V1GameSourceType.TEAM_MATCH,
        score: { home: 3, away: 1 },
        sides: twoSides,
        participants: [
          { id: 'p1', sideId: 'side-home', goals: 2, cards: { yellow: 0, red: 0 } },
          { id: 'p2', sideId: 'side-home', goals: 1, cards: { yellow: 1, red: 0 } },
          { id: 'p3', sideId: 'side-away', goals: 1, cards: { yellow: 0, red: 1 } },
        ],
        events: [],
        scorerPolicy: 'optional_with_warning',
        missingScorer: false,
      }),
    ).not.toThrow();
  });

  it('keeps every non-event invariant in force for TEAM_MATCH: negative score still rejected', () => {
    expect(() =>
      validateGameResultInvariants({
        sourceType: V1GameSourceType.TEAM_MATCH,
        score: { home: -1, away: 0 },
        sides: twoSides,
        participants: [],
        events: [],
        scorerPolicy: 'optional_with_warning',
        missingScorer: false,
      }),
    ).toThrow(expect.objectContaining({ code: 'SCORE_INVALID' }));
  });

  it('keeps side topology in force for TEAM_MATCH: missing an AWAY side still rejected', () => {
    expect(() =>
      validateGameResultInvariants({
        sourceType: V1GameSourceType.TEAM_MATCH,
        score: { home: 0, away: 0 },
        sides: [{ id: 'side-home', sideKey: 'HOME' as const }],
        participants: [],
        events: [],
        scorerPolicy: 'optional_with_warning',
        missingScorer: false,
      }),
    ).toThrow(expect.objectContaining({ code: 'PARTICIPANT_INVALID' }));
  });

  it('keeps participant uniqueness/side-membership in force for TEAM_MATCH: duplicate participant id still rejected', () => {
    expect(() =>
      validateGameResultInvariants({
        sourceType: V1GameSourceType.TEAM_MATCH,
        score: { home: 2, away: 0 },
        sides: twoSides,
        participants: [
          { id: 'p1', sideId: 'side-home', goals: 1, cards: { yellow: 0, red: 0 } },
          { id: 'p1', sideId: 'side-home', goals: 1, cards: { yellow: 0, red: 0 } },
        ],
        events: [],
        scorerPolicy: 'optional_with_warning',
        missingScorer: false,
      }),
    ).toThrow(expect.objectContaining({ code: 'PARTICIPANT_INVALID' }));
  });

  it('keeps non-negative participant goal/card validation in force for TEAM_MATCH', () => {
    expect(() =>
      validateGameResultInvariants({
        sourceType: V1GameSourceType.TEAM_MATCH,
        score: { home: 0, away: 0 },
        sides: twoSides,
        participants: [{ id: 'p1', sideId: 'side-home', goals: -1, cards: { yellow: 0, red: 0 } }],
        events: [],
        scorerPolicy: 'optional_with_warning',
        missingScorer: false,
      }),
    ).toThrow(expect.objectContaining({ code: 'SCORE_INVALID' }));
  });

  it('keeps MVP-must-be-a-real-participant in force for TEAM_MATCH', () => {
    expect(() =>
      validateGameResultInvariants({
        sourceType: V1GameSourceType.TEAM_MATCH,
        score: { home: 1, away: 0 },
        sides: twoSides,
        participants: [{ id: 'p1', sideId: 'side-home', goals: 1, cards: { yellow: 0, red: 0 } }],
        events: [],
        scorerPolicy: 'optional_with_warning',
        missingScorer: false,
        mvpParticipantId: 'not-a-real-participant',
      }),
    ).toThrow(expect.objectContaining({ code: 'PARTICIPANT_INVALID' }));
  });

  it('does not leak the exemption to TOURNAMENT_FIXTURE: a mismatched score is still rejected with SCORE_EVENT_MISMATCH', () => {
    expect(() =>
      validateGameResultInvariants({
        sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
        score: { home: 3, away: 1 },
        sides: twoSides,
        participants: [
          { id: 'p1', sideId: 'side-home', goals: 1, cards: { yellow: 0, red: 0 } },
        ],
        // Only one real goal event exists (home, p1) — nowhere near the
        // submitted 3:1. If TEAM_MATCH's exemption ever regressed to cover
        // all source types, this would wrongly pass.
        events: [
          {
            type: V1GameEventType.GOAL,
            sideId: 'side-home',
            participantId: 'p1',
            period: 1,
            clockMs: 1,
          },
        ],
        scorerPolicy: 'required',
        missingScorer: false,
      }),
    ).toThrow(expect.objectContaining({ code: 'SCORE_EVENT_MISMATCH' }));
  });

  // The exemption is gated on the events being ABSENT, not on sourceType. An
  // active non-support platform_ops admin can append real events to a team
  // match (resolveActor's TEAM_MATCH event forbid is only reached by team
  // members, and POST /games/:gameId/events has no sourceType guard). Once such
  // events exist they are evidence, so a contradicting submitted score must
  // still be rejected. Widen the gate back to `sourceType !== TEAM_MATCH` and
  // this test goes green when it must not.
  it('still rejects a TEAM_MATCH score that contradicts events which really do exist', () => {
    expect(() =>
      validateGameResultInvariants({
        sourceType: V1GameSourceType.TEAM_MATCH,
        score: { home: 3, away: 1 },
        sides: twoSides,
        participants: [
          { id: 'p1', sideId: 'side-home', goals: 1, cards: { yellow: 0, red: 0 } },
        ],
        events: [
          {
            type: V1GameEventType.GOAL,
            sideId: 'side-home',
            participantId: 'p1',
            period: 1,
            clockMs: 1,
          },
        ],
        scorerPolicy: 'required',
        missingScorer: false,
      }),
    ).toThrow(expect.objectContaining({ code: 'SCORE_EVENT_MISMATCH' }));
  });
});

describe('validateGameResultInvariants — assist/foul cross-check (T1-4)', () => {
  const twoSides = [
    { id: 'side-home', sideKey: 'HOME' as const },
    { id: 'side-away', sideKey: 'AWAY' as const },
  ];

  it('rejects a submitted assist total that does not match active assist events', () => {
    expect(() =>
      validateGameResultInvariants({
        sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
        score: { home: 1, away: 0 },
        sides: twoSides,
        participants: [
          { id: 'scorer', sideId: 'side-home', goals: 1, cards: { yellow: 0, red: 0 }, assists: 0, fouls: 0 },
          { id: 'assister', sideId: 'side-home', goals: 0, cards: { yellow: 0, red: 0 }, assists: 2, fouls: 0 },
        ],
        events: [
          { type: V1GameEventType.GOAL, sideId: 'side-home', participantId: 'scorer', assistParticipantId: 'assister', period: 1, clockMs: 1000 },
        ],
        scorerPolicy: 'required',
        missingScorer: false,
      }),
    ).toThrow(expect.objectContaining({ code: 'SCORE_EVENT_MISMATCH' }));
  });

  it('accepts a submitted assist total that matches the one real assist event', () => {
    expect(() =>
      validateGameResultInvariants({
        sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
        score: { home: 1, away: 0 },
        sides: twoSides,
        participants: [
          { id: 'scorer', sideId: 'side-home', goals: 1, cards: { yellow: 0, red: 0 }, assists: 0, fouls: 0 },
          { id: 'assister', sideId: 'side-home', goals: 0, cards: { yellow: 0, red: 0 }, assists: 1, fouls: 0 },
        ],
        events: [
          { type: V1GameEventType.GOAL, sideId: 'side-home', participantId: 'scorer', assistParticipantId: 'assister', period: 1, clockMs: 1000 },
        ],
        scorerPolicy: 'required',
        missingScorer: false,
      }),
    ).not.toThrow();
  });

  it('rejects a submitted foul total that does not match active FOUL events', () => {
    expect(() =>
      validateGameResultInvariants({
        sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
        score: { home: 0, away: 0 },
        sides: twoSides,
        participants: [{ id: 'fouler', sideId: 'side-home', goals: 0, cards: { yellow: 0, red: 0 }, assists: 0, fouls: 2 }],
        events: [
          { type: 'FOUL' as V1GameEventType, sideId: 'side-home', participantId: 'fouler', period: 1, clockMs: 500 },
        ],
        scorerPolicy: 'required',
        missingScorer: false,
      }),
    ).toThrow(expect.objectContaining({ code: 'SCORE_EVENT_MISMATCH' }));
  });

  it('rejects an assist recorded on a non-GOAL event as a shape violation', () => {
    expect(() =>
      validateGameResultInvariants({
        sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
        score: { home: 0, away: 0 },
        sides: twoSides,
        participants: [
          { id: 'p1', sideId: 'side-home', goals: 0, cards: { yellow: 0, red: 0 } },
          { id: 'p2', sideId: 'side-home', goals: 0, cards: { yellow: 0, red: 0 } },
        ],
        events: [
          { type: 'FOUL' as V1GameEventType, sideId: 'side-home', participantId: 'p1', assistParticipantId: 'p2', period: 1, clockMs: 500 },
        ],
        scorerPolicy: 'required',
        missingScorer: false,
      }),
    ).toThrow(expect.objectContaining({ code: 'EVENT_INVALID' }));
  });

  it('rejects a FOUL event with no participant as a shape violation', () => {
    expect(() =>
      validateGameResultInvariants({
        sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
        score: { home: 0, away: 0 },
        sides: twoSides,
        participants: [],
        events: [{ type: 'FOUL' as V1GameEventType, sideId: 'side-home', period: 1, clockMs: 500 }],
        scorerPolicy: 'required',
        missingScorer: false,
      }),
    ).toThrow(expect.objectContaining({ code: 'EVENT_INVALID' }));
  });
});

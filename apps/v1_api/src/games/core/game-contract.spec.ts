import {
  V1GameEventType,
  V1GameResultRevisionState,
  V1GameSourceType,
  V1GameState,
} from '@prisma/client';
import {
  assertGameCommandContext,
  assertGameLifecycleTransition,
  GameContractError,
  resolveGameIdempotency,
} from './game-contract';
import {
  assertAppendOnlyEventOperation,
  assertRevisionMutationAllowed,
  assertRevisionSupersession,
  assertRevisionTransition,
} from './revision-state-machine';
import { validateGameResultInvariants } from './game-invariants';
import { serializeGameVisibility } from './visibility-serializer';

const lifecycleStates = Object.values(V1GameState);

describe('Game core contract', () => {
  it('pins the generated Prisma enums used by the pure domain contract', () => {
    expect(lifecycleStates).toEqual([
      'SCHEDULED',
      'LIVE',
      'PAUSED',
      'ENDED',
      'CANCELLED',
    ]);
    expect(Object.values(V1GameResultRevisionState)).toEqual([
      'DRAFT',
      'SUBMITTED',
      'CHANGE_REQUESTED',
      'SUPPLEMENT_REQUESTED',
      'REJECTED',
      'OFFICIAL',
      'VOID',
    ]);
  });

  it('decides every tournament lifecycle pair and allows only the frozen transitions', () => {
    const allowed = new Set([
      'SCHEDULED>LIVE',
      'SCHEDULED>CANCELLED',
      'LIVE>PAUSED',
      'LIVE>ENDED',
      'LIVE>CANCELLED',
      'PAUSED>LIVE',
      'PAUSED>ENDED',
      'PAUSED>CANCELLED',
    ]);
    let allowedCount = 0;
    let rejectedCount = 0;

    for (const from of lifecycleStates) {
      for (const to of lifecycleStates) {
        const key = `${from}>${to}`;
        if (allowed.has(key)) {
          expect(() =>
            assertGameLifecycleTransition({
              sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
              trigger: 'TOURNAMENT_COMMAND',
              from,
              to,
            }),
          ).not.toThrow();
          allowedCount += 1;
        } else {
          expect(() =>
            assertGameLifecycleTransition({
              sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
              trigger: 'TOURNAMENT_COMMAND',
              from,
              to,
            }),
          ).toThrow(expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }));
          rejectedCount += 1;
        }
      }
    }

    expect({ allowedCount, rejectedCount }).toEqual({ allowedCount: 8, rejectedCount: 17 });
  });

  it('reserves team-match ending for validated result submission and permits cancellation', () => {
    for (const from of [V1GameState.SCHEDULED, V1GameState.LIVE, V1GameState.PAUSED]) {
      expect(() =>
        assertGameLifecycleTransition({
          sourceType: V1GameSourceType.TEAM_MATCH,
          trigger: 'TEAM_RESULT_SUBMISSION',
          from,
          to: V1GameState.ENDED,
        }),
      ).not.toThrow();
      expect(() =>
        assertGameLifecycleTransition({
          sourceType: V1GameSourceType.TEAM_MATCH,
          trigger: 'CANCEL',
          from,
          to: V1GameState.CANCELLED,
        }),
      ).not.toThrow();
    }
    expect(() =>
      assertGameLifecycleTransition({
        sourceType: V1GameSourceType.TEAM_MATCH,
        trigger: 'TOURNAMENT_COMMAND',
        from: V1GameState.SCHEDULED,
        to: V1GameState.LIVE,
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }));
  });

  it('rejects terminal lifecycle exits and unknown states', () => {
    for (const from of [V1GameState.ENDED, V1GameState.CANCELLED]) {
      for (const to of lifecycleStates) {
        expect(() =>
          assertGameLifecycleTransition({
            sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
            trigger: 'TOURNAMENT_COMMAND',
            from,
            to,
          }),
        ).toThrow(GameContractError);
      }
    }
    expect(() =>
      assertGameLifecycleTransition({
        sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
        trigger: 'TOURNAMENT_COMMAND',
        from: 'UNKNOWN',
        to: V1GameState.LIVE,
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_GAME_STATE' }));
  });

  it('requires one normalized durable command ID and a non-stale version contract', () => {
    expect(
      assertGameCommandContext({
        actor: { actorType: 'USER', actorUserId: 'user-1', role: 'field_operator' },
        expectedVersion: 4,
        currentVersion: 4,
        headerIdempotencyKey: 'command-1',
        bodyClientCommandId: 'command-1',
        payloadHash: 'a'.repeat(64),
      }),
    ).toEqual(expect.objectContaining({ durableCommandId: 'command-1', expectedVersion: 4 }));

    expect(() =>
      assertGameCommandContext({
        actor: { actorType: 'USER', actorUserId: 'user-1', role: 'field_operator' },
        expectedVersion: 4,
        currentVersion: 4,
        headerIdempotencyKey: 'command-1',
        bodyClientCommandId: 'command-2',
        payloadHash: 'a'.repeat(64),
      }),
    ).toThrow(expect.objectContaining({ code: 'COMMAND_IDEMPOTENCY_KEY_MISMATCH' }));
    expect(() =>
      assertGameCommandContext({
        actor: { actorType: 'USER', actorUserId: 'user-1', role: 'field_operator' },
        expectedVersion: 3,
        currentVersion: 4,
        headerIdempotencyKey: 'command-1',
        bodyClientCommandId: 'command-1',
        payloadHash: 'a'.repeat(64),
      }),
    ).toThrow(expect.objectContaining({ code: 'VERSION_CONFLICT' }));
  });

  it('replays a byte-identical durable command and rejects payload reuse', () => {
    const committed = {
      payloadHash: 'a'.repeat(64),
      responseStatus: 200,
      responseBody: { gameId: 'game-1', version: 5 },
    };
    expect(resolveGameIdempotency(committed, 'a'.repeat(64))).toEqual({
      kind: 'REPLAY',
      responseStatus: 200,
      responseBody: { gameId: 'game-1', version: 5 },
    });
    expect(() => resolveGameIdempotency(committed, 'b'.repeat(64))).toThrow(
      expect.objectContaining({ code: 'IDEMPOTENCY_PAYLOAD_CONFLICT' }),
    );
  });

  it('freezes revision content at submit and rejects every mutation of terminal revisions', () => {
    expect(() =>
      assertRevisionTransition({
        from: V1GameResultRevisionState.DRAFT,
        to: V1GameResultRevisionState.SUBMITTED,
        flow: 'STANDARD',
      }),
    ).not.toThrow();
    expect(() =>
      assertRevisionMutationAllowed(V1GameResultRevisionState.SUBMITTED, 'CONTENT'),
    ).toThrow(expect.objectContaining({ code: 'REVISION_CONTENT_FROZEN' }));

    for (const terminal of [
      V1GameResultRevisionState.CHANGE_REQUESTED,
      V1GameResultRevisionState.SUPPLEMENT_REQUESTED,
      V1GameResultRevisionState.REJECTED,
      V1GameResultRevisionState.OFFICIAL,
      V1GameResultRevisionState.VOID,
    ]) {
      for (const mutation of ['CONTENT', 'PARTICIPANTS', 'STATE', 'DELETE'] as const) {
        expect(() => assertRevisionMutationAllowed(terminal, mutation)).toThrow(
          expect.objectContaining({ code: 'TERMINAL_REVISION_IMMUTABLE' }),
        );
      }
    }
  });

  it('supports only frozen standard and correction revision paths', () => {
    expect(() =>
      assertRevisionTransition({
        from: V1GameResultRevisionState.SUBMITTED,
        to: V1GameResultRevisionState.OFFICIAL,
        flow: 'STANDARD',
      }),
    ).not.toThrow();
    expect(() =>
      assertRevisionTransition({
        from: V1GameResultRevisionState.DRAFT,
        to: V1GameResultRevisionState.OFFICIAL,
        flow: 'CORRECTION',
      }),
    ).not.toThrow();
    expect(() =>
      assertRevisionTransition({
        from: V1GameResultRevisionState.OFFICIAL,
        to: V1GameResultRevisionState.DRAFT,
        flow: 'CORRECTION',
      }),
    ).toThrow(expect.objectContaining({ code: 'REVISION_MUST_BE_SUPERSEDED' }));

    expect(() =>
      assertRevisionSupersession({
        baseGameId: 'game-1',
        successorGameId: 'game-1',
        baseRevisionId: 'revision-1',
        supersedesRevisionId: 'revision-1',
        baseState: V1GameResultRevisionState.OFFICIAL,
        successorState: V1GameResultRevisionState.DRAFT,
        purpose: 'CORRECTION',
      }),
    ).not.toThrow();
    expect(() =>
      assertRevisionSupersession({
        baseGameId: 'game-1',
        successorGameId: 'game-2',
        baseRevisionId: 'revision-1',
        supersedesRevisionId: 'revision-1',
        baseState: V1GameResultRevisionState.OFFICIAL,
        successorState: V1GameResultRevisionState.DRAFT,
        purpose: 'CORRECTION',
      }),
    ).toThrow(expect.objectContaining({ code: 'REVISION_MUST_BE_SUPERSEDED' }));
  });

  it('makes event and official history append-only', () => {
    expect(() => assertAppendOnlyEventOperation('APPEND')).not.toThrow();
    expect(() => assertAppendOnlyEventOperation('UPDATE')).toThrow(
      expect.objectContaining({ code: 'EVENT_STREAM_APPEND_ONLY' }),
    );
    expect(() => assertAppendOnlyEventOperation('DELETE')).toThrow(
      expect.objectContaining({ code: 'EVENT_STREAM_APPEND_ONLY' }),
    );
  });

  it('accepts a score, event, and participant set that agrees', () => {
    expect(() =>
      validateGameResultInvariants({
        score: { home: 2, away: 1 },
        sides: [
          { id: 'side-home', sideKey: 'HOME' },
          { id: 'side-away', sideKey: 'AWAY' },
        ],
        participants: [
          { id: 'p1', sideId: 'side-home', goals: 2, cards: { yellow: 0, red: 0 } },
          { id: 'p2', sideId: 'side-away', goals: 1, cards: { yellow: 1, red: 0 } },
        ],
        events: [
          { type: V1GameEventType.GOAL, sideId: 'side-home', participantId: 'p1', period: 1, clockMs: 1 },
          { type: V1GameEventType.GOAL, sideId: 'side-home', participantId: 'p1', period: 1, clockMs: 2 },
          { type: V1GameEventType.GOAL, sideId: 'side-away', participantId: 'p2', period: 2, clockMs: 3 },
          {
            type: V1GameEventType.CARD,
            sideId: 'side-away',
            participantId: 'p2',
            period: 2,
            clockMs: 4,
            card: 'YELLOW',
          },
        ],
        scorerPolicy: 'required',
        missingScorer: false,
        mvpParticipantId: 'p1',
      }),
    ).not.toThrow();
  });

  it('rejects negative scores, malformed events, foreign participants, and score mismatches', () => {
    const validBase = {
      sides: [
        { id: 'side-home', sideKey: 'HOME' as const },
        { id: 'side-away', sideKey: 'AWAY' as const },
      ],
      participants: [
        { id: 'p1', sideId: 'side-home', goals: 1, cards: { yellow: 0, red: 0 } },
      ],
      scorerPolicy: 'required' as const,
      missingScorer: false,
    };
    expect(() =>
      validateGameResultInvariants({ ...validBase, score: { home: -1, away: 0 }, events: [] }),
    ).toThrow(expect.objectContaining({ code: 'SCORE_INVALID' }));
    expect(() =>
      validateGameResultInvariants({
        ...validBase,
        score: { home: 1, away: 0 },
        events: [{ type: 'UNKNOWN', sideId: 'side-home', participantId: 'p1', period: 1, clockMs: 1 }],
      }),
    ).toThrow(expect.objectContaining({ code: 'EVENT_INVALID' }));
    expect(() =>
      validateGameResultInvariants({
        ...validBase,
        score: { home: 1, away: 0 },
        events: [
          { type: V1GameEventType.GOAL, sideId: 'side-away', participantId: 'p1', period: 1, clockMs: 1 },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'PARTICIPANT_SIDE_MISMATCH' }));
    expect(() =>
      validateGameResultInvariants({
        ...validBase,
        score: { home: 2, away: 0 },
        events: [
          { type: V1GameEventType.GOAL, sideId: 'side-home', participantId: 'p1', period: 1, clockMs: 1 },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'SCORE_EVENT_MISMATCH' }));
  });

  it('filters hidden, status-only, live-demoted, and official-only public data', () => {
    const snapshot = {
      gameId: 'game-1',
      state: V1GameState.LIVE,
      lineup: [{ participantId: 'p1', displayName: 'Player 1' }],
      liveScore: { home: 1, away: 0 },
      liveEvents: [{ sequence: 1, type: V1GameEventType.GOAL }],
      officialScore: { home: 2, away: 1 },
      officialEvents: [{ sequence: 2, type: V1GameEventType.GOAL }],
      officialRecords: [{ recordId: 'record-1' }],
    };

    expect(
      serializeGameVisibility(snapshot, {
        mode: 'hidden',
        publicLiveEnabled: true,
        lineupEligible: true,
      }),
    ).toBeNull();
    expect(
      serializeGameVisibility(snapshot, {
        mode: 'status_only',
        publicLiveEnabled: true,
        lineupEligible: true,
      }),
    ).toEqual(
      expect.objectContaining({ lineup: null, score: null, events: [], records: [{ recordId: 'record-1' }] }),
    );
    expect(
      serializeGameVisibility(snapshot, {
        mode: 'live',
        publicLiveEnabled: false,
        lineupEligible: true,
      }),
    ).toEqual(
      expect.objectContaining({ effectiveMode: 'status_only', lineup: null, score: null, events: [] }),
    );
    expect(
      serializeGameVisibility(snapshot, {
        mode: 'official_only',
        publicLiveEnabled: true,
        lineupEligible: true,
      }),
    ).toEqual(
      expect.objectContaining({
        lineup: null,
        score: { home: 2, away: 1 },
        events: [{ sequence: 2, type: V1GameEventType.GOAL }],
        records: [{ recordId: 'record-1' }],
      }),
    );
  });
});

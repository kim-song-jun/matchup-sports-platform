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
    // 콘솔 진행(`TOURNAMENT_COMMAND`)이 `TEAM_MATCH` 에서 무엇을 할 수 있는지는 이 테스트가
    // 아니라 **아래 전용 describe(#25)** 가 한 벌로 맡는다 — 여기서 또 단언하면 같은 계약이
    // 두 곳에 갈려 적히고, 나중에 한쪽만 고쳐져 서로 어긋난다.
  });

  it('permits a TEAM_RESULT_SUBMISSION resubmit from ENDED (the correction loop) but never from CANCELLED', () => {
    // Task 16 deadlock regression: a corrected revision (created after the
    // opponent's change-request on an already-ENDED game) must be able to
    // resubmit without the Game lifecycle guard rejecting it just because
    // the Game is already ENDED. If this predicate ever narrows back to
    // only activeGameStates, the correction loop dead-ends at "corrected
    // draft created" and can never reach SUBMITTED/OFFICIAL again.
    expect(() =>
      assertGameLifecycleTransition({
        sourceType: V1GameSourceType.TEAM_MATCH,
        trigger: 'TEAM_RESULT_SUBMISSION',
        from: V1GameState.ENDED,
        to: V1GameState.ENDED,
      }),
    ).not.toThrow();

    // Cancellation must stay terminal for result submission even though
    // ENDED is now allowed — the guard must not degrade into a blanket
    // "any from state goes" permission.
    expect(() =>
      assertGameLifecycleTransition({
        sourceType: V1GameSourceType.TEAM_MATCH,
        trigger: 'TEAM_RESULT_SUBMISSION',
        from: V1GameState.CANCELLED,
        to: V1GameState.ENDED,
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
        // TOURNAMENT_FIXTURE keeps the event-based score cross-check enforced
        // (Task 17 exempts only TEAM_MATCH — see game-invariants.ts).
        sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
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
      // TOURNAMENT_FIXTURE keeps the event-based score cross-check enforced
      // (Task 17 exempts only TEAM_MATCH — see game-invariants.ts).
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
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

/**
 * **리그 경기를 콘솔로 진행한다 (결함 #25, 2026-09-06 alpha 실측).**
 *
 * 리그 대진의 게임은 `TEAM_MATCH` 소스로 만들어지는데(`league-fixture-creation.ts`),
 * `TOURNAMENT_COMMAND` 트리거가 `TOURNAMENT_FIXTURE` 에만 열려 있어서 **콘솔에서 경기를
 * 시작조차 못 했다** — `TEAM_MATCH/TOURNAMENT_COMMAND cannot transition SCHEDULED to LIVE`.
 * 인가(#23)를 고친 직후 그 뒤에서 드러난 두 번째 벽이다.
 *
 * 정본이 이미 정한 사안이다: "리그도 대회와 **같은 경기 운영 콘솔**을 쓴다(Task 165)" 이고,
 * §6 결정 이력이 대가까지 적어 뒀다 — **"잃는 것: 콘솔이 팀 매치 출처를 알아야 한다"**.
 */
describe('assertGameLifecycleTransition — 팀 매치 출처의 콘솔 진행 (#25)', () => {
  it('리그 대진(TEAM_MATCH)도 콘솔로 SCHEDULED → LIVE 할 수 있다', () => {
    expect(() =>
      assertGameLifecycleTransition({
        sourceType: V1GameSourceType.TEAM_MATCH,
        trigger: 'TOURNAMENT_COMMAND',
        from: V1GameState.SCHEDULED,
        to: V1GameState.LIVE,
      }),
    ).not.toThrow();
  });

  it('전이 표는 대회와 **같은 것을 쓴다** — 표를 갈라 두면 두 벌이 어긋난다', () => {
    // LIVE→ENDED 는 허용, SCHEDULED→ENDED 는 불허 — 대회와 같은 규칙이다.
    expect(() =>
      assertGameLifecycleTransition({
        sourceType: V1GameSourceType.TEAM_MATCH,
        trigger: 'TOURNAMENT_COMMAND',
        from: V1GameState.LIVE,
        to: V1GameState.ENDED,
      }),
    ).not.toThrow();
    expect(() =>
      assertGameLifecycleTransition({
        sourceType: V1GameSourceType.TEAM_MATCH,
        trigger: 'TOURNAMENT_COMMAND',
        from: V1GameState.SCHEDULED,
        to: V1GameState.ENDED,
      }),
    ).toThrow(GameContractError);
  });

  it('친선 팀매치는 그대로다 — 결과 제출로 ENDED 만 (회귀 방지)', () => {
    // **이 케이스가 이 변경의 안전판이다.** 친선은 콘솔을 안 쓰고 `TEAM_RESULT_SUBMISSION`
    // 으로만 끝내는데, 그 경로가 여전히 같은 규칙인지 고정한다.
    expect(() =>
      assertGameLifecycleTransition({
        sourceType: V1GameSourceType.TEAM_MATCH,
        trigger: 'TEAM_RESULT_SUBMISSION',
        from: V1GameState.SCHEDULED,
        to: V1GameState.ENDED,
      }),
    ).not.toThrow();
    // 결과 제출로는 LIVE 로 못 간다 — 친선에 콘솔 진행을 열어 준 것이 아니다.
    expect(() =>
      assertGameLifecycleTransition({
        sourceType: V1GameSourceType.TEAM_MATCH,
        trigger: 'TEAM_RESULT_SUBMISSION',
        from: V1GameState.SCHEDULED,
        to: V1GameState.LIVE,
      }),
    ).toThrow(GameContractError);
  });

  it('대회 경기(TOURNAMENT_FIXTURE)는 그대로다 (회귀 방지)', () => {
    expect(() =>
      assertGameLifecycleTransition({
        sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
        trigger: 'TOURNAMENT_COMMAND',
        from: V1GameState.SCHEDULED,
        to: V1GameState.LIVE,
      }),
    ).not.toThrow();
  });
});

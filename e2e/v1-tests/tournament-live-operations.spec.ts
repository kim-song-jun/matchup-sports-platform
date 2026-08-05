import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { apiGet, apiPost, commandId, unwrap } from './helpers/v1-http';
import { createTournamentFixtureGame, runGameCommand } from './helpers/tournament-fixture';
import { acquireGameTakeover } from './helpers/ws-takeover';

/**
 * E2E-TOUR-02 -- live tournament commands: end->submitted atomicity/recovery,
 * clock drift, duplicate command, 5-minute offline token reacquire/rebase,
 * rebase conflict, platform_ops token subject, late event, reversal
 * uniqueness, takeover, revoke (plan Todo 20/21 scope; routes in
 * `apps/v1_api/src/games/games.controller.ts`:
 * `POST :gameId/commands/:command`, `POST/GET :gameId/events`,
 * `POST :gameId/events/:eventId/reverse`,
 * `POST :gameId/result-recovery/derive-and-submit`).
 *
 * ## What this spec verifies for real
 *
 * The same two outermost guards `tournament-result-review.spec.ts`
 * (E2E-TOUR-01) verifies for the review surface, applied to the live-command
 * surface instead:
 *   - No auth headers -> 401 `UNAUTHENTICATED` on `POST .../commands/:command`
 *     and `POST .../events`.
 *   - A syntactically valid but nonexistent `gameId` -> 404, proving
 *     `GamesService.resolveActor`'s `tx.v1Game.findUnique` early-exit runs
 *     (and therefore that both routes are actually wired end-to-end),
 *     regardless of persona.
 *   - `GameCommandName` enum validation: an invalid `:command` segment is
 *     rejected by Nest's default `ParseEnumPipe` failure (400, no custom
 *     `errorHttpStatusCode` on this param) BEFORE the request ever reaches
 *     `GamesService`, independent of auth or game existence -- this is a
 *     real, deterministic contract check on the route's own enum gate.
 *
 * PLUS (2026-08-05, previously blocked on WS takeover -- see
 * `helpers/ws-takeover.ts`) the non-time-based part of the scenario's actual
 * subject, against a real live `TOURNAMENT_FIXTURE` game:
 *   - start -> end atomicity: `start` transitions SCHEDULED -> LIVE; `end`
 *     transitions LIVE -> ENDED and, in the same command, derives + submits
 *     the game's first result revision (`GamesService.deriveTournamentRevision`).
 *   - duplicate command idempotency: replaying the exact same `start` call
 *     (same `Idempotency-Key` header AND body `clientCommandId`) returns the
 *     identical response with `replayed: true` and an UNCHANGED game
 *     version -- no second state transition happens.
 *   - takeover exclusivity + revoke: a takeover grant is exclusive per game
 *     by construction (`GameTakeoverService.grant`'s class doc: "a fresh
 *     grant always replaces whatever token currently holds the game"). A
 *     second `game.takeover.request` for the same game silently invalidates
 *     the first grant's token; using that now-stale token on a subsequent
 *     REST command fails closed with `403 TAKEOVER_TOKEN_EXPIRED`, and the
 *     fresh token from the second grant still works.
 *
 * ## What stays genuinely out of scope (time-based, per task instruction)
 *
 * Clock-drift rejection and the 5-minute offline-reacquire/rebase window are
 * explicitly time-based behavior the task instructions defer to a later
 * "headed controlled-network" run rather than fake-clock-injecting into this
 * harness. `test.fixme()` below marks only that narrower remainder now.
 */
test.describe('[E2E-TOUR-02] 실시간 대회 운영 커맨드', () => {
  // 400(422 아님): games.controller.ts의 `new ParseEnumPipe(GameCommandName)`가 Nest 기본
  // BadRequest를 던진다. 아래 단언은 처음부터 400이었고, 제목만 422로 어긋나 있었다.
  test('미인증은 401, 존재하지 않는 gameId는 404, 잘못된 command는 400', async ({ request }) => {
    const missingGameId = randomUUID();

    const unauthenticatedCommand = await apiPost(request, `/api/v1/games/${missingGameId}/commands/start`, {
      email: null,
      data: { expectedVersion: 0, clientCommandId: 'e2e-probe' },
    });
    expect(unauthenticatedCommand.status).toBe(401);
    expect((unauthenticatedCommand.body as { code?: string }).code).toBe('UNAUTHENTICATED');

    const unauthenticatedEvents = await apiGet(request, `/api/v1/games/${missingGameId}/events`, { email: null });
    expect(unauthenticatedEvents.status).toBe(401);

    // GameCommandDto가 takeoverToken/occurredAt/payload를 필수로 요구하게 된 뒤로는
    // 이 필드들을 안 채우면 존재 확인 이전에 400 VALIDATION_ERROR가 먼저 뜬다 —
    // 404 분기를 실제로 타려면 DTO 형태부터 유효해야 한다.
    const notFoundCommand = await apiPost(request, `/api/v1/games/${missingGameId}/commands/start`, {
      email: 'admin@teameet.v1',
      idempotencyKey: 'e2e-tour-02-probe',
      data: {
        expectedVersion: 0,
        clientCommandId: 'e2e-probe',
        takeoverToken: 'e2e-probe-token',
        occurredAt: new Date().toISOString(),
        payload: {},
      },
    });
    expect(notFoundCommand.status, JSON.stringify(notFoundCommand.body)).toBe(404);

    const invalidCommand = await apiPost(request, `/api/v1/games/${missingGameId}/commands/not_a_real_command`, {
      email: 'admin@teameet.v1',
      idempotencyKey: 'e2e-tour-02-probe-2',
      data: {
        expectedVersion: 0,
        clientCommandId: 'e2e-probe',
        takeoverToken: 'e2e-probe-token',
        occurredAt: new Date().toISOString(),
        payload: {},
      },
    });
    expect(invalidCommand.status).toBe(400); // Nest's default `ParseEnumPipe` failure status (no custom errorHttpStatusCode on this param)
  });

  test('start/end 원자성, 중복 커맨드 멱등, 인계 배타성·회수', async ({ request }) => {
    const email = 'admin@teameet.v1';
    const { gameId } = await createTournamentFixtureGame(request, { titlePrefix: 'E2E-TOUR-02' });

    const takeoverA = await acquireGameTakeover(email, gameId);
    try {
      const startId = commandId();
      const startOccurredAt = new Date().toISOString();
      const startBody = {
        expectedVersion: 0,
        clientCommandId: startId,
        takeoverToken: takeoverA.grant.takeoverToken,
        occurredAt: startOccurredAt,
        payload: {},
      };
      const start = await apiPost(request, `/api/v1/games/${gameId}/commands/start`, {
        email,
        idempotencyKey: startId,
        data: startBody,
      });
      const startData = unwrap<{ state: string; version: number; replayed: boolean }>(start);
      expect(startData).toMatchObject({ state: 'LIVE', version: 1, replayed: false });

      // duplicate command idempotency: exact same Idempotency-Key + clientCommandId + body.
      const replay = await apiPost(request, `/api/v1/games/${gameId}/commands/start`, {
        email,
        idempotencyKey: startId,
        data: startBody,
      });
      const replayData = unwrap<{ state: string; version: number; replayed: boolean }>(replay);
      expect(replayData).toMatchObject({ state: 'LIVE', version: 1, replayed: true });

      // takeover exclusivity: a second grant for the SAME game invalidates the first token.
      const takeoverB = await acquireGameTakeover(email, gameId);
      try {
        const endWithStaleToken = await runGameCommand(request, {
          gameId,
          command: 'end',
          email,
          expectedVersion: 1,
          takeoverToken: takeoverA.grant.takeoverToken,
        });
        expect(endWithStaleToken.status, JSON.stringify(endWithStaleToken.body)).toBe(403);
        expect((endWithStaleToken.body as { code?: string }).code).toBe('TAKEOVER_TOKEN_EXPIRED');

        // takeover revoke's other half: the fresh (second) grant's token still works.
        const end = await runGameCommand(request, {
          gameId,
          command: 'end',
          email,
          expectedVersion: 1,
          takeoverToken: takeoverB.grant.takeoverToken,
        });
        const endData = unwrap<{ state: string; version: number; revisionState: string }>(end);
        expect(endData).toMatchObject({ state: 'ENDED', version: 2, revisionState: 'SUBMITTED' });
      } finally {
        takeoverB.close();
      }
    } finally {
      takeoverA.close();
    }
  });

  // MUST stay `test.fixme(title, body)` (a DECLARED fixme test), never the bare
  // `test.fixme(true, description)` modifier -- that form annotates the WHOLE describe suite in
  // Playwright 1.58.2 and would silently skip the passing tests above. See the identical note in
  // tournament-result-review.spec.ts for the runtime evidence.
  test.fixme(
    '클럭 드리프트 거부, 오프라인 재획득 5분 rebase 윈도우',
    async () => {
      // BLOCKED (scope, not harness): both remaining behaviors are explicitly time-based --
      // `assertClockNotDrifted` rejecting a drifted `occurredAt`, and the takeover token's 90s TTL
      // interacting with a 5-minute offline-reacquire/rebase window -- and the task instructions
      // for this pass explicitly defer time-based E2E-TOUR-02 coverage to a later
      // "headed controlled-network" run rather than fake-clock-injecting into this harness.
      // start/end atomicity, duplicate-command idempotency, and takeover exclusivity/revoke are
      // now covered by the real test above.
    },
  );
});

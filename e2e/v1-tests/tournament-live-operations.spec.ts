import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { apiGet, apiPost } from './helpers/v1-http';

/**
 * E2E-TOUR-02 -- live tournament commands: end->submitted atomicity/recovery,
 * clock drift, duplicate command, 5-minute offline token reacquire/rebase,
 * rebase conflict, platform_ops token subject, late event, reversal
 * uniqueness, takeover, revoke (plan Todo 20/21 scope; routes in
 * `apps/v1_api/src/games/games.controller.ts`:
 * `POST :gameId/commands/:command`, `POST/GET :gameId/events`,
 * `POST :gameId/events/:eventId/reverse`,
 * `POST :gameId/result-recovery/derive-and-submit`). The plan itself
 * describes this scenario's full execution as "headed controlled-network
 * E2E-TOUR-02 ... executed later by V26" -- i.e. even the plan does not
 * expect this scenario to run to completion inside the standard
 * `playwright test --config v1.config.ts` harness; Todo 26's job is to
 * author it, not to fully drive it here.
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
 * ## What is genuinely blocked, and why (not silently passed)
 *
 * Every named behavior in the scenario title -- start/end command
 * atomicity, clock-drift rejection, duplicate-command idempotency, the
 * offline reacquire-token 5-minute window and rebase-conflict handling,
 * platform_ops token subject verification, late-event ordering, reversal
 * uniqueness, staff takeover, and staff revoke -- is state-machine behavior
 * that only exists once a live `V1Game` (TOURNAMENT_FIXTURE, IN_PROGRESS)
 * is actually running commands against it. That precondition has the exact
 * same "no seed data, requires the full admin bracket-publish chain" gap
 * documented in `tournament-result-correction.spec.ts` (E2E-CORR-01) and
 * `tournament-result-review.spec.ts` (E2E-TOUR-01); on top of that, several
 * of the named behaviors (clock drift, 5-minute offline token expiry,
 * takeover) are explicitly time-based and require either fake-clock control
 * this HTTP-only Playwright harness has no hook for, or the "headed
 * controlled-network" execution mode the plan itself defers to a later run.
 *
 * `test.fixme()` marks the blocked business-logic assertions explicitly.
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

    const notFoundCommand = await apiPost(request, `/api/v1/games/${missingGameId}/commands/start`, {
      email: 'admin@teameet.v1',
      idempotencyKey: 'e2e-tour-02-probe',
      data: { expectedVersion: 0, clientCommandId: 'e2e-probe' },
    });
    expect(notFoundCommand.status, JSON.stringify(notFoundCommand.body)).toBe(404);

    const invalidCommand = await apiPost(request, `/api/v1/games/${missingGameId}/commands/not_a_real_command`, {
      email: 'admin@teameet.v1',
      idempotencyKey: 'e2e-tour-02-probe-2',
      data: { expectedVersion: 0, clientCommandId: 'e2e-probe' },
    });
    expect(invalidCommand.status).toBe(400); // Nest's default `ParseEnumPipe` failure status (no custom errorHttpStatusCode on this param)
  });

  // MUST stay `test.fixme(title, body)` (a DECLARED fixme test), never the bare
  // `test.fixme(true, description)` modifier -- that form annotates the WHOLE describe suite in
  // Playwright 1.58.2 and would silently skip the passing boundary test above. See the identical
  // note in tournament-result-review.spec.ts for the runtime evidence.
  test.fixme(
    'start/end 원자성, 클럭 드리프트 거부, 중복 커맨드 멱등, 오프라인 재획득 rebase, 인계·회수',
    async () => {
      // BLOCKED: all of these need a live IN_PROGRESS TOURNAMENT_FIXTURE Game (the same unmet
      // precondition as E2E-TOUR-01/E2E-CORR-01) plus, for the time-based behaviors specifically,
      // either fake-clock control this harness has no hook for or the headed controlled-network
      // execution mode the plan defers to a later run ("executed later by V26"). See the
      // file-level doc comment above for the full breakdown.
    },
  );
});

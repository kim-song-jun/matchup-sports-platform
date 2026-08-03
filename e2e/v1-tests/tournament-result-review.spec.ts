import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { apiPost, commandId } from './helpers/v1-http';

/**
 * E2E-TOUR-01 -- tournament result review: reject / request_supplement /
 * supersede-and-submit, wrong-base rejection, atomic successor rollback
 * (plan Todo 22/23 scope; routes in
 * `apps/v1_api/src/tournament-operations/results/
 * tournament-result-review.controller.ts`).
 *
 * ## What this spec verifies for real
 *
 * The two outermost, route-shape-independent guards that run before ANY
 * business logic on every endpoint in this controller
 * (`review-decision`/`supersede-and-submit`/`officialize`/`void`/
 * `corrections`):
 *   - No auth headers at all -> 401 `UNAUTHENTICATED` (`V1AuthGuard`).
 *   - A syntactically valid but nonexistent `gameId` -> 404 (`this.notFound()`
 *     in `TournamentResultReviewService.withResultCommand`, which resolves
 *     the `V1Game` row BEFORE ever calling `TournamentStaffAccessService
 *     .assertAccess()` -- so this 404 is reachable and deterministic
 *     regardless of which persona calls it, proving the route is actually
 *     wired end-to-end through `TournamentResultReviewController` into the
 *     service, not merely that a guard exists).
 *
 * ## What is genuinely blocked, and why (not silently passed)
 *
 * The scenario's actual subject -- a director/platform_ops actually
 * rejecting or requesting supplement on a SUBMITTED tournament result,
 * resubmitting via supersede-and-submit, rejecting a supersede against the
 * wrong base revision, and observing the atomic successor rollback on a
 * failed CAS -- requires a real `V1Game` with `sourceType =
 * TOURNAMENT_FIXTURE` carrying an actual SUBMITTED `V1GameResultRevision`.
 * As documented in detail in `tournament-result-correction.spec.ts`'s file
 * doc (E2E-CORR-01, same underlying precondition), no seed script in this
 * repo produces one -- `V1TournamentFixture` rows created via raw Prisma
 * writes in `seed-alpha-tournament-qa.ts` bypass
 * `TournamentBracketService.publishBracket`, the only code path that
 * creates the backing `V1Game`. Provisioning one from this spec requires
 * the full admin bracket chain plus a granted `tournament_director`/
 * `platform_ops` staff assignment and a submitted lineup+result, none of
 * which this task's scout pass reached far enough to construct correctly
 * (`admin-registrations.controller.ts` and the group/group-team/fixture DTOs
 * in `apps/v1_api/src/tournaments/dto/admin-bracket.dto.ts` were not read).
 *
 * `test.fixme()` marks the blocked business-logic assertions explicitly so
 * they show as a flagged, non-passing entry in the report rather than a
 * spec that "passes" without ever exercising review-decision/supersede.
 */
test.describe('[E2E-TOUR-01] 대회 결과 검토 (반려/보완요청/재제출)', () => {
  test('미인증은 401, 존재하지 않는 gameId는 404 -- review-decision/supersede-and-submit 공통 경계', async ({
    request,
  }) => {
    const missingGameId = randomUUID();
    const missingRevisionId = randomUUID();

    for (const [route, body] of [
      [
        `review-decision`,
        { expectedVersion: 0, clientCommandId: commandId(), decision: 'reject', reason: 'e2e probe' },
      ],
      [
        `supersede-and-submit`,
        {
          expectedVersion: 0,
          clientCommandId: commandId(),
          score: { home: 0, away: 0 },
          actualParticipants: [],
          eventsHash: 'e2e-probe',
          reason: 'e2e probe',
        },
      ],
    ] as const) {
      const unauthenticated = await apiPost(
        request,
        `/api/v1/games/${missingGameId}/result-revisions/${missingRevisionId}/${route}`,
        { email: null, data: body },
      );
      expect(unauthenticated.status, `${route}: expected 401 for no auth`).toBe(401);
      expect((unauthenticated.body as { code?: string }).code).toBe('UNAUTHENTICATED');

      const notFound = await apiPost(
        request,
        `/api/v1/games/${missingGameId}/result-revisions/${missingRevisionId}/${route}`,
        { email: 'admin@teameet.v1', idempotencyKey: commandId(), data: body },
      );
      expect(notFound.status, `${route}: expected 404 for nonexistent game (body=${JSON.stringify(notFound.body)})`).toBe(
        404,
      );
    }
  });

  // MUST stay `test.fixme(title, body)` (a DECLARED fixme test), never the bare
  // `test.fixme(true, description)` modifier. Verified against Playwright 1.58.2's runtime
  // (`common/testType.js:_modifier` -> `suite._staticAnnotations`, applied in
  // `common/suiteUtils.js` by walking each test's parent chain AFTER the file finishes loading):
  // the boolean-condition form called in a describe body annotates the WHOLE suite, so the
  // passing boundary test above would silently become `expectedStatus: 'skipped'` too --
  // declaration order does not protect it. Confirmed empirically with `playwright test --list`.
  test.fixme(
    'reject/request_supplement 결정, supersede-and-submit 재제출, wrong-base 거부, 원자적 후속 롤백',
    async () => {
      // BLOCKED: every assertion here needs a live TOURNAMENT_FIXTURE Game carrying a real
      // SUBMITTED result revision, reachable only through the full admin bracket-publish chain --
      // see the file-level doc comment above and tournament-result-correction.spec.ts
      // (E2E-CORR-01) for the exact precondition and why this harness cannot provision it.
    },
  );
});

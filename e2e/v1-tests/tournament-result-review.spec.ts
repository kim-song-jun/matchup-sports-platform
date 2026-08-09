import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { apiGet, apiPost, commandId, unwrap } from './helpers/v1-http';
import {
  createTournamentFixtureGame,
  endGameToSubmittedRevision,
} from './helpers/tournament-fixture';

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
 * PLUS (2026-08-05, previously blocked, now unblocked -- see
 * `helpers/tournament-fixture.ts` and `helpers/ws-takeover.ts` for the full
 * provisioning chain) the scenario's actual subject on a real
 * `TOURNAMENT_FIXTURE` game carrying a real result revision:
 *   - `review-decision` `reject` on a SUBMITTED revision -> REJECTED.
 *   - `supersede-and-submit` against a base that is NOT REJECTED/
 *     SUPPLEMENT_REQUESTED (still SUBMITTED) -> 409
 *     `RESULT_RESUBMISSION_NOT_ALLOWED`, the "wrong-base rejection".
 *   - `supersede-and-submit` with a stale `expectedVersion` against an
 *     otherwise-eligible REJECTED base -> 409 `VERSION_CONFLICT`, and the
 *     revision list is unchanged afterward (no orphan DRAFT successor row) --
 *     the "atomic successor rollback" (`assertGameCommandContext`'s CAS check
 *     runs and throws before `withResultCommand`'s `mutate()` callback ever
 *     creates the successor row, and the whole command runs inside one
 *     `$transaction`, so a mid-callback throw would roll back any partial
 *     write just the same).
 *   - `supersede-and-submit` with the correct `expectedVersion` against the
 *     REJECTED base -> a new SUBMITTED successor revision (resubmission).
 *   - `review-decision` `request_supplement` on that successor ->
 *     SUPPLEMENT_REQUESTED.
 *
 * Every mutation reuses the same all-zero score (`{home:0,away:0}`) the
 * `end` command derives from an empty event log -- `supersede-and-submit`'s
 * `validateGameResultInvariants` 422s `SCORE_EVENT_MISMATCH` against any
 * score that doesn't match the actually-appended goal events, and these
 * specs never append any.
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

  test('reject/request_supplement 결정, supersede-and-submit 재제출, wrong-base 거부, 원자적 후속 롤백', async ({
    request,
  }) => {
    const email = 'admin@teameet.v1';
    const { gameId } = await createTournamentFixtureGame(request, { titlePrefix: 'E2E-TOUR-01' });
    const submitted = await endGameToSubmittedRevision(request, { gameId, email });

    // wrong-base rejection: the base is still SUBMITTED, not REJECTED/SUPPLEMENT_REQUESTED.
    const wrongBaseId = commandId();
    const wrongBase = await apiPost(
      request,
      `/api/v1/games/${gameId}/result-revisions/${submitted.revisionId}/supersede-and-submit`,
      {
        email,
        idempotencyKey: wrongBaseId,
        data: {
          expectedVersion: submitted.gameVersion,
          clientCommandId: wrongBaseId,
          score: { home: 0, away: 0 },
          actualParticipants: [],
          eventsHash: submitted.eventsHash,
          reason: 'wrong-base probe',
        },
      },
    );
    expect(wrongBase.status, JSON.stringify(wrongBase.body)).toBe(409);
    expect((wrongBase.body as { code?: string }).code).toBe('RESULT_RESUBMISSION_NOT_ALLOWED');

    // reject the SUBMITTED revision.
    const rejectId = commandId();
    const rejected = await apiPost(
      request,
      `/api/v1/games/${gameId}/result-revisions/${submitted.revisionId}/review-decision`,
      {
        email,
        idempotencyKey: rejectId,
        data: {
          expectedVersion: submitted.gameVersion,
          clientCommandId: rejectId,
          decision: 'reject',
          reason: 'missing scorer detail',
        },
      },
    );
    const rejectedData = unwrap<{ version: number; revisionState: string }>(rejected);
    expect(rejectedData.revisionState).toBe('REJECTED');
    const gameVersionAfterReject = rejectedData.version;

    // atomic successor rollback: supersede-and-submit with a STALE expectedVersion against the
    // now-eligible REJECTED base must fail closed and create zero new rows.
    const staleId = commandId();
    const staleAttempt = await apiPost(
      request,
      `/api/v1/games/${gameId}/result-revisions/${submitted.revisionId}/supersede-and-submit`,
      {
        email,
        idempotencyKey: staleId,
        data: {
          expectedVersion: gameVersionAfterReject - 1,
          clientCommandId: staleId,
          score: { home: 0, away: 0 },
          actualParticipants: [],
          eventsHash: submitted.eventsHash,
          reason: 'stale version probe',
        },
      },
    );
    expect(staleAttempt.status, JSON.stringify(staleAttempt.body)).toBe(409);
    expect((staleAttempt.body as { code?: string }).code).toBe('VERSION_CONFLICT');

    const revisionsAfterStaleAttempt = unwrap<unknown[]>(
      await apiGet(request, `/api/v1/games/${gameId}/result-revisions`, { email }),
    );
    expect(revisionsAfterStaleAttempt).toHaveLength(1);

    // resubmission: supersede-and-submit with the CORRECT expectedVersion succeeds.
    const resubmitId = commandId();
    const resubmitted = await apiPost(
      request,
      `/api/v1/games/${gameId}/result-revisions/${submitted.revisionId}/supersede-and-submit`,
      {
        email,
        idempotencyKey: resubmitId,
        data: {
          expectedVersion: gameVersionAfterReject,
          clientCommandId: resubmitId,
          score: { home: 0, away: 0 },
          actualParticipants: [],
          eventsHash: submitted.eventsHash,
          reason: 'resubmit after reject',
        },
      },
    );
    const resubmittedData = unwrap<{ version: number; revisionId: string; revisionState: string }>(
      resubmitted,
    );
    expect(resubmittedData.revisionState).toBe('SUBMITTED');
    expect(resubmittedData.revisionId).not.toBe(submitted.revisionId);

    const revisionsAfterResubmit = unwrap<unknown[]>(
      await apiGet(request, `/api/v1/games/${gameId}/result-revisions`, { email }),
    );
    expect(revisionsAfterResubmit).toHaveLength(2);

    // request_supplement on the new SUBMITTED successor.
    const supplementId = commandId();
    const supplemented = await apiPost(
      request,
      `/api/v1/games/${gameId}/result-revisions/${resubmittedData.revisionId}/review-decision`,
      {
        email,
        idempotencyKey: supplementId,
        data: {
          expectedVersion: resubmittedData.version,
          clientCommandId: supplementId,
          decision: 'request_supplement',
          reason: 'need lineup detail',
        },
      },
    );
    const supplementedData = unwrap<{ revisionState: string }>(supplemented);
    expect(supplementedData.revisionState).toBe('SUPPLEMENT_REQUESTED');
  });
});

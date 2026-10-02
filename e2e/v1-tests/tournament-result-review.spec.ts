import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { apiGet, apiPost, commandId, unwrap } from './helpers/v1-http';
import {
  createTournamentFixtureGame,
  endGameToSubmittedRevision,
  projectionPreviewHash,
} from './helpers/tournament-fixture';

/**
 * E2E-TOUR-01 -- tournament result review: supersede-and-submit from a
 * SUBMITTED base (Task 166 — 되돌려 보내는 왕복 없이 그 자리에서 고친다),
 * stale-version rollback, stale-officialize refusal
 * (plan Todo 22/23 scope; routes in
 * `apps/v1_api/src/tournament-operations/results/
 * tournament-result-review.controller.ts`).
 *
 * ## What this spec verifies for real
 *
 * The two outermost, route-shape-independent guards that run before ANY
 * business logic on every endpoint in this controller
 * (`supersede-and-submit`/`officialize`/`void`/`corrections` — Task 166 이
 * `review-decision` 을 없앴다):
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
 *   - `supersede-and-submit` with a stale `expectedVersion` against the
 *     SUBMITTED base -> 409 `VERSION_CONFLICT`, and the revision list is
 *     unchanged afterward (no orphan DRAFT successor row) -- the "atomic
 *     successor rollback" (`assertGameCommandContext`'s CAS check runs and
 *     throws before `withResultCommand`'s `mutate()` callback ever creates
 *     the successor row, and the whole command runs inside one
 *     `$transaction`, so a mid-callback throw would roll back any partial
 *     write just the same).
 *   - `supersede-and-submit` with the correct `expectedVersion` against the
 *     SUBMITTED base -> a new SUBMITTED successor (Task 166: 어드민이 되돌려
 *     보내지 않고 **그 자리에서 고친다**).
 *   - `officialize` on the now-superseded base -> 409. base 의 `state` 는
 *     SUBMITTED 그대로라 상태만 보면 확정 가능해 보인다 — `supersedesId` 로
 *     따로 판정하지 않으면 **고치기 전 결과가 공식이 된다.**
 *
 * Every mutation reuses the same all-zero score (`{home:0,away:0}`) the
 * `end` command derives from an empty event log -- `supersede-and-submit`'s
 * `validateGameResultInvariants` 422s `SCORE_EVENT_MISMATCH` against any
 * score that doesn't match the actually-appended goal events, and these
 * specs never append any.
 */
test.describe('[E2E-TOUR-01] 대회 결과 검토 (그 자리에서 고쳐 재제출)', () => {
  test('미인증은 401, 존재하지 않는 gameId는 404 -- supersede-and-submit 경계', async ({
    request,
  }) => {
    const missingGameId = randomUUID();
    const missingRevisionId = randomUUID();

    for (const [route, body] of [
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

  test('SUBMITTED 를 그 자리에서 재제출로 대체한다 — DRAFT base 거부, 원자적 후속 롤백 (Task 166)', async ({
    request,
  }) => {
    // Task 166: 예전 시나리오는 `review-decision('reject')` 로 **팀에게 되돌려 보낸 뒤**에야
    // 재제출이 가능했다(base = REJECTED). 정본 §4 가 그 왕복을 없애 base 가 SUBMITTED 다 —
    // 어드민은 되돌려 보내지 않고 그 자리에서 고쳐 확정한다.
    const email = 'admin@teameet.v1';
    const { gameId } = await createTournamentFixtureGame(request, { titlePrefix: 'E2E-TOUR-01' });
    const submitted = await endGameToSubmittedRevision(request, { gameId, email });

    // 원자적 후속 롤백: **stale expectedVersion** 이면 실패하고 새 행이 하나도 안 생긴다.
    // (예전엔 이 자리에 'wrong-base 거부(base 가 아직 SUBMITTED)' 가 있었는데, 그건 이제
    //  정상 경로라 음성 케이스가 되지 못한다 — 버전 충돌로 바꿔 원자성만 그대로 잰다.)
    const staleId = commandId();
    const staleAttempt = await apiPost(
      request,
      `/api/v1/games/${gameId}/result-revisions/${submitted.revisionId}/supersede-and-submit`,
      {
        email,
        idempotencyKey: staleId,
        data: {
          expectedVersion: submitted.gameVersion - 1,
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

    // 재제출: 올바른 expectedVersion 이면 SUBMITTED base 에서 곧바로 성공한다.
    const resubmitId = commandId();
    const resubmitted = await apiPost(
      request,
      `/api/v1/games/${gameId}/result-revisions/${submitted.revisionId}/supersede-and-submit`,
      {
        email,
        idempotencyKey: resubmitId,
        data: {
          expectedVersion: submitted.gameVersion,
          clientCommandId: resubmitId,
          score: { home: 0, away: 0 },
          actualParticipants: [],
          eventsHash: submitted.eventsHash,
          reason: 'fixed in place',
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

    // **대체된 base 는 확정할 수 없다.** base 의 state 는 SUBMITTED 그대로라(supersede 는
    // predecessor 를 건드리지 않는다) 상태만 보면 확정 가능해 보인다 — officialize 가
    // `supersedesId` 로 따로 판정한다. 이게 없으면 어드민의 오래된 화면이 **고치기 전**
    // 결과를 공식으로 만들 수 있다.
    //
    // ⚠️ **hash 는 맞게 보낸다.** projection-preview 검사가 supersede 검사보다 먼저 걸리므로
    // 아무 문자열이나 넣으면 `PROJECTION_PREVIEW_MISMATCH` 에서 멈춰 **정작 재려는 가드에
    // 도달하지 못한다** — 상태 코드만 보면 둘 다 409 라 통과로 읽힌다. 그래서 base 리비전
    // 내용으로 진짜 hash 를 만들고, **에러 코드까지** 단언한다.
    const baseRevision = unwrap<Array<{ id: string; score: unknown; goalEvents: unknown; eventsHash: string; mvpParticipantId: string | null }>>(
      await apiGet(request, `/api/v1/games/${gameId}/result-revisions`, { email }),
    ).find((revision) => revision.id === submitted.revisionId);
    expect(baseRevision, 'base 리비전을 목록에서 찾지 못했다').toBeTruthy();

    const staleOfficialId = commandId();
    const staleOfficialize = await apiPost(
      request,
      `/api/v1/games/${gameId}/result-revisions/${submitted.revisionId}/officialize`,
      {
        email,
        idempotencyKey: staleOfficialId,
        data: {
          expectedVersion: resubmittedData.version,
          clientCommandId: staleOfficialId,
          projectionPreviewHash: projectionPreviewHash(baseRevision!),
        },
      },
    );
    expect(staleOfficialize.status, JSON.stringify(staleOfficialize.body)).toBe(409);
    expect((staleOfficialize.body as { code?: string }).code).toBe('REVISION_MUST_BE_SUPERSEDED');
  });
});

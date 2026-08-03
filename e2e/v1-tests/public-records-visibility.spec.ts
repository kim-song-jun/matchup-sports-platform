import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { apiGet, unwrap } from './helpers/v1-http';

/**
 * E2E-PUBLIC-01 -- public schedule/match/team/player record projections
 * (Task 24, `apps/v1_api/src/games/public-records/*`).
 *
 * Both routes are guarded by `OptionalV1AuthGuard` (never `V1AuthGuard`), so
 * "public" here literally means auth is optional and, per the two services'
 * own implementations, never consulted:
 *
 *  - `PublicTeamRecordsController`/`PublicTeamRecordsService.getRecords`
 *    takes only `(teamId, query)` -- no `user` parameter exists at all, and
 *    the class doc says why: "team aggregates never need consent gating ...
 *    team-level facts are always public regardless of any player's
 *    link/consent state".
 *  - `PublicUserRecordsController`/`PublicUserRecordsService.getRecords`
 *    also takes only `(userId, query)`, no `user` -- the *record's own
 *    consent state* (linked + consented participant, current official
 *    revision) gates which rows appear, not who is asking.
 *
 * This spec verifies exactly that observable contract: identical response
 * for the SAME target regardless of whether the caller is authenticated,
 * proving there is no hidden viewer-based branch this repo's implementation
 * doesn't document. It intentionally does NOT assert on `items.length`
 * (0 or more) because the shared dev/CI database's actual official-game
 * count depends on which other specs in this suite ran first (e.g.
 * `team-match-result-approval.spec.ts` officializes exactly one result for
 * the same seeded "ownerTeam"/"owner@teameet.v1") -- asserting a fixed count
 * would make this spec's pass/fail depend on unrelated test execution
 * order, which is the "false-positive/vacuous" failure mode the task
 * explicitly warns against in the other direction. Shape, 404 handling, and
 * cross-auth-state consistency are asserted instead: all three are real,
 * order-independent, and directly exercise the routes' actual guard/service
 * code.
 *
 * Consent-driven hidden/status-only/live/official-only visibility variants
 * (the full "matrix" the plan's Todo 24 scope describes) require a real
 * OFFICIAL game with a participant whose consent has been explicitly
 * granted/revoked via `POST /games/:gameId/participants/:id/consents/grant|
 * revoke` -- constructing that from scratch needs a submitted+approved
 * result (see `team-match-result-approval.spec.ts`) PLUS the identity-link
 * request/attest cycle (`games.controller.ts`'s
 * `participants/:id/identity-link-requests*`), which is out of this spec's
 * scope; the boundary that IS exercised here (never a viewer-based branch,
 * 404 for a nonexistent target) is real and independently valuable.
 */
test.describe('[E2E-PUBLIC-01] 공개 기록 프로젝션 가시성', () => {
  test('팀 기록: 인증 여부와 무관하게 동일한 응답, 존재하지 않는 팀은 404', async ({ request }) => {
    const myTeams = unwrap<{ items: { teamId: string }[] }>(
      await apiGet(request, '/api/v1/me/teams', { email: 'owner@teameet.v1' }),
    );
    const teamId = myTeams.items[0]?.teamId;
    if (teamId === undefined) {
      throw new Error('owner@teameet.v1 has no team; seed data assumption changed');
    }

    const anonymous = await apiGet(request, `/api/v1/teams/${teamId}/records`, { email: null });
    expect(anonymous.status, JSON.stringify(anonymous.body)).toBe(200);
    const anonymousData = unwrap<{ teamId: string; items: unknown[] }>(anonymous);
    expect(anonymousData.teamId).toBe(teamId);
    expect(Array.isArray(anonymousData.items)).toBe(true);

    const authenticated = await apiGet(request, `/api/v1/teams/${teamId}/records`, { email: 'owner@teameet.v1' });
    expect(authenticated.status).toBe(200);
    expect(unwrap(authenticated)).toEqual(anonymousData);

    const missing = await apiGet(request, `/api/v1/teams/${randomUUID()}/records`, { email: null });
    expect(missing.status).toBe(404);
    expect((missing.body as { code?: string }).code).toBe('TEAM_NOT_FOUND');
  });

  test('선수 기록: 인증 여부와 무관하게 동일한 응답, 존재하지 않는 사용자는 404', async ({ request }) => {
    const me = unwrap<{ id: string }>(await apiGet(request, '/api/v1/auth/me', { email: 'owner@teameet.v1' }));

    const anonymous = await apiGet(request, `/api/v1/users/${me.id}/records`, { email: null });
    expect(anonymous.status, JSON.stringify(anonymous.body)).toBe(200);
    const anonymousData = unwrap<{ userId: string; items: unknown[] }>(anonymous);
    expect(anonymousData.userId).toBe(me.id);
    expect(Array.isArray(anonymousData.items)).toBe(true);

    const authenticated = await apiGet(request, `/api/v1/users/${me.id}/records`, { email: 'host@teameet.v1' });
    expect(authenticated.status).toBe(200);
    expect(unwrap(authenticated)).toEqual(anonymousData);

    const missing = await apiGet(request, `/api/v1/users/${randomUUID()}/records`, { email: null });
    expect(missing.status).toBe(404);
    expect((missing.body as { code?: string }).code).toBe('USER_NOT_FOUND');
  });
});

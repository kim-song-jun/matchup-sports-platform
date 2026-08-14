import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { apiGet, apiPost, commandId, unwrap } from './helpers/v1-http';

/**
 * E2E-AUTH-01 -- actor-authorization matrix from
 * `docs/api/domains/tournament-operations-auth.md` (this scenario's own
 * definition, per the plan: "named only in Todo 26's own scope line ...
 * appears to be Todo 26's own new addition covering the actor-authorization
 * matrix").
 *
 * Two independent boundaries are exercised, both gated by
 * `apps/v1_api/src/tournaments/staff/tournament-staff-access.service.ts`'s
 * `assertAccess()` (staff scope) and
 * `apps/v1_api/src/common/admin-context.service.ts`'s `getMutationAdmin()`
 * (platform admin), which is the same dual-gate every tournament-ops
 * mutation in this codebase composes from:
 *
 *  1. `GET /tournament-ops/tournaments/:tournamentId/staff` -- readable by
 *     platform_ops (any active non-support `V1AdminUser`) without a
 *     per-tournament assignment at all (`assertAccess`'s admin branch
 *     resolves platform_ops globally, before ever touching
 *     `V1TournamentStaffAssignment` rows -- proven here by using a
 *     syntactically-valid but non-existent tournamentId: the admin branch
 *     denies on `decideTournamentStaffAccess`, not on tournament existence,
 *     so a 200 with an empty list is the correct, real response, not a
 *     false positive from an accidentally-matching id). Denied (403
 *     `STAFF_SCOPE_DENIED`) for an authenticated non-staff, non-admin
 *     persona, and denied (401 `UNAUTHENTICATED`) unauthenticated.
 *  2. `GET /tournament-ops/operation-flags/:key` -- platform_ops only, no
 *     tournament scope at all (`GameOperationFlagsService.getFlag` ->
 *     `assertPlatformOps` -> `AdminContextService.getMutationAdmin`).
 *     Same three-way matrix, with the admin's 200 additionally proving the
 *     documented `DIRECTOR_OFFICIALIZE` default (`off`) is what's actually
 *     live (see `GAME_OPERATION_FLAG_DEFAULTS` in
 *     `apps/v1_api/src/config/game-operation-flags.ts`) -- load-bearing for
 *     E2E-CORR-01, which asserts the same default from the other spec.
 *
 * A THIRD layer -- the full grant -> self-read -> revoke -> denied-again
 * lifecycle for a real `tournament_director` assignment -- is exercised
 * against a tournament this spec creates and cleans up itself
 * (`POST /admin/tournaments` + `POST .../status {status:'cancelled'}`),
 * since granting a role is a real DB write requiring a real
 * `V1Tournament` FK target, unlike the read-only boundary checks above.
 */
test.describe('[E2E-AUTH-01] 대회 운영 액터 권한 매트릭스', () => {
  test('플랫폼 운영자·비인증·미인증 3단 경계 -- 스태프 목록 조회', async ({ request }) => {
    const randomTournamentId = randomUUID();

    const unauthenticated = await apiGet(request, `/api/v1/tournament-ops/tournaments/${randomTournamentId}/staff`, {
      email: null,
    });
    expect(unauthenticated.status).toBe(401);
    expect((unauthenticated.body as { code?: string }).code).toBe('UNAUTHENTICATED');

    const nonStaff = await apiGet(request, `/api/v1/tournament-ops/tournaments/${randomTournamentId}/staff`, {
      email: 'member@teameet.v1',
    });
    expect(nonStaff.status).toBe(403);
    expect((nonStaff.body as { code?: string }).code).toBe('STAFF_SCOPE_DENIED');

    const platformOps = await apiGet(request, `/api/v1/tournament-ops/tournaments/${randomTournamentId}/staff`, {
      email: 'admin@teameet.v1',
    });
    expect(platformOps.status, JSON.stringify(platformOps.body)).toBe(200);
    expect(unwrap<{ items: unknown[] }>(platformOps).items).toEqual([]);
  });

  test('플랫폼 운영자·비인증·미인증 3단 경계 -- DIRECTOR_OFFICIALIZE 플래그 조회', async ({ request }) => {
    const unauthenticated = await apiGet(request, '/api/v1/tournament-ops/operation-flags/DIRECTOR_OFFICIALIZE', {
      email: null,
    });
    expect(unauthenticated.status).toBe(401);

    const nonAdmin = await apiGet(request, '/api/v1/tournament-ops/operation-flags/DIRECTOR_OFFICIALIZE', {
      email: 'member@teameet.v1',
    });
    expect(nonAdmin.status).toBe(403);
    expect((nonAdmin.body as { code?: string }).code).toBe('PERMISSION_DENIED');

    const admin = await apiGet(request, '/api/v1/tournament-ops/operation-flags/DIRECTOR_OFFICIALIZE', {
      email: 'admin@teameet.v1',
    });
    expect(admin.status, JSON.stringify(admin.body)).toBe(200);
    expect(unwrap<{ key: string; value: string }>(admin)).toMatchObject({
      key: 'DIRECTOR_OFFICIALIZE',
      value: 'off',
    });
  });

  test('tournament_director 부여 -> 본인 읽기 성공 -> 회수 -> 다시 거부', async ({ request }) => {
    const [sportsResult, meResult] = await Promise.all([
      apiGet<{ items: { id: string; code: string }[] }>(request, '/api/v1/master/sports'),
      apiGet<{ id: string }>(request, '/api/v1/auth/me', { email: 'owner@teameet.v1' }),
    ]);
    const sportId = unwrap(sportsResult).items[0]?.id;
    if (sportId === undefined) {
      throw new Error('master/sports returned no sports; cannot create a tournament fixture for this test');
    }
    const targetUserId = unwrap(meResult).id;

    const created = await apiPost(request, '/api/v1/admin/tournaments', {
      email: 'admin@teameet.v1',
      data: { sportId, title: `E2E-AUTH-01 ${commandId().slice(0, 8)}`, teamCount: 2 },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const tournamentId = unwrap<{ id: string }>(created).id;

    try {
      // Given: 이 대회에는 아직 활성 director가 없다 -> grant는 bootstrapFirstDirector 경로를 탄다
      // (TournamentOperationsStaffService.grant()).
      const grant = await apiPost(request, `/api/v1/tournament-ops/tournaments/${tournamentId}/staff`, {
        email: 'admin@teameet.v1',
        idempotencyKey: commandId(),
        data: { userId: targetUserId, role: 'TOURNAMENT_DIRECTOR' },
      });
      expect(grant.status, JSON.stringify(grant.body)).toBe(201);
      const assignment = unwrap<{ id: string; role: string; version: number; revokedAt: string | null }>(grant);
      expect(assignment.role).toBe('TOURNAMENT_DIRECTOR');
      expect(assignment.revokedAt).toBeNull();

      // When: 방금 director 권한을 받은 owner@teameet.v1 본인이 스태프 목록을 조회 -> 200
      // (`allowsRoleAction('tournament_director', 'read')` === true, tournament-staff-policy.ts).
      const selfRead = await apiGet(request, `/api/v1/tournament-ops/tournaments/${tournamentId}/staff`, {
        email: 'owner@teameet.v1',
      });
      expect(selfRead.status, JSON.stringify(selfRead.body)).toBe(200);
      const items = unwrap<{ items: { id: string; userId: string; revokedAt: string | null }[] }>(selfRead).items;
      expect(items.some((item) => item.id === assignment.id && item.userId === targetUserId)).toBe(true);

      // When: platform_ops가 회수 -> 200, revokedAt 채워짐.
      const revoke = await apiPost(
        request,
        `/api/v1/tournament-ops/tournaments/${tournamentId}/staff/${assignment.id}/revoke`,
        {
          email: 'admin@teameet.v1',
          idempotencyKey: commandId(),
          data: { expectedVersion: assignment.version, reason: 'e2e cleanup' },
        },
      );
      expect(revoke.status, JSON.stringify(revoke.body)).toBe(200);
      expect(unwrap<{ revokedAt: string | null }>(revoke).revokedAt).not.toBeNull();

      // Then: 회수된 director는 더 이상 이 액션을 수행할 권한이 없다 -- 같은 조회를 다시 시도하면 403.
      const afterRevoke = await apiGet(request, `/api/v1/tournament-ops/tournaments/${tournamentId}/staff`, {
        email: 'owner@teameet.v1',
      });
      expect(afterRevoke.status).toBe(403);
      expect((afterRevoke.body as { code?: string }).code).toBe('STAFF_SCOPE_DENIED');
    } finally {
      await apiPost(request, `/api/v1/admin/tournaments/${tournamentId}/status`, {
        email: 'admin@teameet.v1',
        data: { status: 'cancelled', reason: 'e2e cleanup' },
      });
    }
  });
});

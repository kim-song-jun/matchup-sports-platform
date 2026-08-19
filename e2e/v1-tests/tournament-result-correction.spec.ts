import { test, expect } from '@playwright/test';
import { apiGet, apiPatch, apiPost, commandId, unwrap } from './helpers/v1-http';
import {
  createTournamentFixtureGame,
  ensureSignupTermsAccepted,
  endGameToSubmittedRevision,
  grantTournamentStaff,
  projectionPreviewHash,
} from './helpers/tournament-fixture';

/**
 * E2E-CORR-01 -- "platform_ops void plus director flag off -> on -> off
 * UI/API behavior" (plan Todo 26's exact acceptance-criterion wording).
 *
 * Routes: `POST /games/:gameId/result-revisions/:revisionId/void`
 * (platform_ops always; tournament_director only while `DIRECTOR_OFFICIALIZE`
 * is `on`) and `PATCH /tournament-ops/operation-flags/DIRECTOR_OFFICIALIZE`
 * (the flag toggle), both in `apps/v1_api/src/tournament-operations/results/
 * tournament-result-review.service.ts` / `apps/v1_api/src/config/
 * game-operation-flags.ts`.
 *
 * ## What this spec verifies for real
 *
 * 1. The flag's actual live default is `off`
 *    (`GAME_OPERATION_FLAG_DEFAULTS.DIRECTOR_OFFICIALIZE`), read via
 *    `GET /tournament-ops/operation-flags/DIRECTOR_OFFICIALIZE` as
 *    platform_ops -- the "off" starting state the scenario name begins
 *    from.
 * 2. The flag genuinely CANNOT be toggled without a cryptographically
 *    verified gate-evidence bundle: `PATCH .../DIRECTOR_OFFICIALIZE` with a
 *    well-formed-but-fabricated `gateBundlePath`/`gateBundleHash` (correct
 *    DTO shape: 64 lowercase-hex chars, non-empty path) as platform_ops with
 *    the correct `expectedVersion` still 400s `INVALID_GATE_BUNDLE`
 *    (`verifyGateBundle` -> `readImmutableJson`'s canonical-root check,
 *    `game-operation-flags.ts`). This is not this spec inventing a reason to
 *    skip the toggle -- it is the literal enforcement the toggle mutation
 *    performs, proven by a real 400 response, not asserted from reading the
 *    source alone.
 *
 * PLUS (2026-08-05, previously blocked on WS takeover -- see
 * `helpers/tournament-fixture.ts` and `helpers/ws-takeover.ts`) the
 * "platform_ops void succeeds / tournament_director void is gated by the
 * flag" half of the scenario, against a real OFFICIAL result revision:
 *   - platform_ops void ALWAYS succeeds, regardless of `DIRECTOR_OFFICIALIZE`
 *     -- `voidResultRevision`'s `staffAction: 'result_officialize'` gate in
 *     `withResultCommand` only special-cases `principal.role ===
 *     'tournament_director'`, never `platform_ops`.
 *   - a granted `tournament_director` void is DENIED while the flag is at
 *     its live default (`off`) with `403 DIRECTOR_OFFICIALIZE_DISABLED` --
 *     this needs no flag mutation at all, just the flag's real, unmodified
 *     default state plus a real per-tournament staff assignment.
 *
 * ## What stays genuinely blocked, and why (a deliberate security property,
 * not a harness gap)
 *
 * The actual "off -> on -> off" toggle -- and therefore observing a granted
 * director's void flip from denied to allowed and back -- needs a REAL
 * gate-evidence bundle for `PATCH .../DIRECTOR_OFFICIALIZE`: a JSON document
 * at a path under the API process's own OS temp dir
 * (`resolveGameOperationGateRoot()`) that `verifyGateBundle`
 * (`game-operation-flags.ts`, ~1080-1420) independently re-verifies --
 * exact immutable-file permissions (mode `0444`, non-symlink, canonical
 * realpath), a filename derived from `attemptId`/phase/transition, and a
 * chain of its OWN nested prerequisite receipts referencing prior release
 * phases (R1/R2/B before a Phase C authority-tuple bundle is even
 * considered). This is deliberately not something a bundle's `baselineSHA`/
 * `candidateSHA` alone can satisfy by supplying a real git commit SHA --
 * the whole point of the gate is that it can only be produced by a real
 * release-engineering CLI process across actual deployment phases. Point 2
 * above already proves a well-formed-but-fabricated bundle is rejected
 * (`INVALID_GATE_BUNDLE`); fabricating a bundle that would actually pass
 * would mean reimplementing that entire external gate-evidence pipeline
 * inside a test, which would defeat the property the gate exists to
 * guarantee rather than test it. `test.fixme()` below marks only this
 * narrower remainder now.
 */
test.describe('[E2E-CORR-01] platform_ops void + director 플래그 off->on->off', () => {
  test('DIRECTOR_OFFICIALIZE 플래그의 실제 기본값은 off이고, 유효한 gate bundle 없이는 전환할 수 없다', async ({
    request,
  }) => {
    const before = await apiGet(request, '/api/v1/tournament-ops/operation-flags/DIRECTOR_OFFICIALIZE', {
      email: 'admin@teameet.v1',
    });
    expect(before.status, JSON.stringify(before.body)).toBe(200);
    const flag = unwrap<{ key: string; value: string; version: number }>(before);
    expect(flag.key).toBe('DIRECTOR_OFFICIALIZE');
    expect(flag.value).toBe('off');

    const forgedToggle = await apiPatch(request, '/api/v1/tournament-ops/operation-flags/DIRECTOR_OFFICIALIZE', {
      email: 'admin@teameet.v1',
      idempotencyKey: 'e2e-corr-01-forged-gate-probe',
      data: {
        expectedVersion: flag.version,
        value: 'on',
        gateBundlePath: '/tmp/e2e-corr-01-fabricated-gate-bundle.json',
        gateBundleHash: 'a'.repeat(64),
        reason: 'E2E-CORR-01: verifying the toggle rejects a fabricated gate bundle',
      },
    });
    expect(forgedToggle.status, JSON.stringify(forgedToggle.body)).toBe(400);
    expect((forgedToggle.body as { code?: string }).code).toBe('INVALID_GATE_BUNDLE');

    // Then: the rejected toggle attempt must not have moved the flag at all.
    // (응답 DTO가 ownerActor/rollbackValue/updatedAt/updatedByUserId 필드를 얻어
    // 엄격한 toEqual 전체 일치가 깨졌다 — 이 테스트가 실제로 증명하려는 건 value/version
    // 불변이므로 objectContaining으로 그 의도만 검증한다.)
    const after = await apiGet(request, '/api/v1/tournament-ops/operation-flags/DIRECTOR_OFFICIALIZE', {
      email: 'admin@teameet.v1',
    });
    expect(unwrap<{ value: string; version: number }>(after)).toEqual(
      expect.objectContaining({ value: 'off', version: flag.version }),
    );
  });

  test('platform_ops는 항상 void 가능, 플래그 off인 director의 void는 거부된다', async ({ request }) => {
    const adminEmail = 'admin@teameet.v1';
    const directorEmail = 'owner@teameet.v1';

    const { tournamentId, gameId } = await createTournamentFixtureGame(request, {
      titlePrefix: 'E2E-CORR-01',
    });
    await ensureSignupTermsAccepted(request, directorEmail);

    const me = await apiGet<{ user: { id: string } }>(request, '/api/v1/auth/me', { email: directorEmail });
    const directorUserId = unwrap<{ user: { id: string } }>(me).user.id;
    await grantTournamentStaff(request, {
      tournamentId,
      userId: directorUserId,
      role: 'TOURNAMENT_DIRECTOR',
      adminEmail,
    });

    const submitted = await endGameToSubmittedRevision(request, { gameId, email: adminEmail });
    const officializeId = commandId();
    const officialized = await apiPost(
      request,
      `/api/v1/games/${gameId}/result-revisions/${submitted.revisionId}/officialize`,
      {
        email: adminEmail,
        idempotencyKey: officializeId,
        data: {
          expectedVersion: submitted.gameVersion,
          clientCommandId: officializeId,
          projectionPreviewHash: projectionPreviewHash({
            score: { home: 0, away: 0 },
            goalEvents: [],
            eventsHash: submitted.eventsHash,
            mvpParticipantId: null,
          }),
        },
      },
    );
    const officializedData = unwrap<{ version: number; revisionState: string }>(officialized);
    expect(officializedData.revisionState).toBe('OFFICIAL');

    // Given: DIRECTOR_OFFICIALIZE is still at its live, unmodified default (off) -- verified by
    // the sibling test above, and untouched by this test.
    const directorVoidId = commandId();
    const directorVoid = await apiPost(
      request,
      `/api/v1/games/${gameId}/result-revisions/${submitted.revisionId}/void`,
      {
        email: directorEmail,
        idempotencyKey: directorVoidId,
        data: {
          expectedVersion: officializedData.version,
          clientCommandId: directorVoidId,
          reason: 'director void probe while flag is off',
        },
      },
    );
    expect(directorVoid.status, JSON.stringify(directorVoid.body)).toBe(403);
    expect((directorVoid.body as { code?: string }).code).toBe('DIRECTOR_OFFICIALIZE_DISABLED');

    // platform_ops voids the same OFFICIAL revision regardless of the flag.
    const adminVoidId = commandId();
    const adminVoid = await apiPost(
      request,
      `/api/v1/games/${gameId}/result-revisions/${submitted.revisionId}/void`,
      {
        email: adminEmail,
        idempotencyKey: adminVoidId,
        data: {
          expectedVersion: officializedData.version,
          clientCommandId: adminVoidId,
          reason: 'platform_ops void',
        },
      },
    );
    const adminVoidData = unwrap<{ revisionState: string }>(adminVoid);
    expect(adminVoidData.revisionState).toBe('VOID');
  });

  // MUST stay `test.fixme(title, body)` (a DECLARED fixme test), never the bare
  // `test.fixme(true, description)` modifier -- that form annotates the WHOLE describe suite in
  // Playwright 1.58.2 and would silently skip the passing tests above. See the identical note in
  // tournament-result-review.spec.ts for the runtime evidence.
  test.fixme(
    'DIRECTOR_OFFICIALIZE 플래그 off→on→off 전환과 director void 허용 여부 변화',
    async () => {
      // BLOCKED (deliberate security property, not a harness gap): the actual toggle needs a REAL
      // gate-evidence bundle only a genuine release-engineering CLI process can produce across
      // actual deployment phases -- see the file-level doc comment above for exactly what
      // `verifyGateBundle` independently re-verifies and why fabricating a passing bundle inside
      // this spec would defeat the property the gate exists to guarantee. The flag's real default
      // (off) and its effect on both actors (platform_ops always allowed, director denied) are now
      // covered by the real test above.
    },
  );
});

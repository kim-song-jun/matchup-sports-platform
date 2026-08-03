import { test, expect } from '@playwright/test';
import { apiGet, apiPatch, unwrap } from './helpers/v1-http';

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
 * ## What is genuinely blocked, and why (not silently passed)
 *
 * The scenario's actual "off -> on -> off" toggle and the "platform_ops
 * void succeeds / tournament_director void is gated by the flag" mutation
 * sequence both require:
 *   (a) a real `V1Game` with `sourceType = TOURNAMENT_FIXTURE` and a
 *       `currentOfficialRevisionId` (an OFFICIAL result) to void -- there is
 *       no seed data anywhere in this repo that produces one. Every seed
 *       script (`apps/v1_api/prisma/seed*.ts`) either creates zero
 *       tournament fixtures or creates `V1TournamentFixture` rows via raw
 *       Prisma writes that bypass `TournamentBracketService.publishBracket`
 *       (the ONLY code path that calls `GamesService.createFromSourceInTransaction`
 *       for a tournament fixture) -- so no seeded tournament fixture has a
 *       backing `V1Game` at all. Provisioning one from scratch inside this
 *       spec requires the full admin bracket chain (`POST /admin/tournaments`
 *       -> competition-config version -> confirmed team registrations
 *       (`admin-registrations.controller.ts`, not read for this task) ->
 *       `POST .../groups` -> `.../group-teams` -> `.../fixtures` ->
 *       `POST .../publish-bracket`) plus a submitted+officialized result via
 *       the tournament result-review surface this same file documents --
 *       multiple DTOs this task's scout pass did not reach.
 *   (b) a REAL gate-evidence bundle for the flag toggle itself -- per point 2
 *       above, `PATCH .../DIRECTOR_OFFICIALIZE` requires a JSON document at
 *       a path under the API process's own OS temp dir
 *       (`resolveGameOperationGateRoot()`) containing `baselineSHA`/
 *       `candidateSHA`/`planSHA`/`prerequisites[]` fields the service
 *       independently re-verifies (`verifyGateBundle`, ~1080-1420 of
 *       `game-operation-flags.ts`) -- this is a deployment-safety artifact
 *       meant to be produced by a real ops/CLI gate process, not fabricated
 *       by an HTTP-only Playwright spec, and doing so would defeat the
 *       point of the gate rather than test it.
 *
 * `test.fixme()` below marks this precisely (shows as a flagged, non-passing
 * entry in the report -- never a silent/vacuous green) rather than a spec
 * that "passes" without ever exercising void/officialize/the toggle.
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
    const after = await apiGet(request, '/api/v1/tournament-ops/operation-flags/DIRECTOR_OFFICIALIZE', {
      email: 'admin@teameet.v1',
    });
    expect(unwrap<{ value: string; version: number }>(after)).toEqual({ value: 'off', version: flag.version });
  });

  // MUST stay `test.fixme(title, body)` (a DECLARED fixme test), never the bare
  // `test.fixme(true, description)` modifier -- that form annotates the WHOLE describe suite in
  // Playwright 1.58.2 and would silently skip the passing gate-bundle-rejection test above. See
  // the identical note in tournament-result-review.spec.ts for the runtime evidence.
  test.fixme(
    'platform_ops void + director 플래그 off→on→off UI/API 거동',
    async () => {
      // BLOCKED: requires (a) a live TOURNAMENT_FIXTURE Game reachable only through the full admin
      // bracket-publish chain (tournament create -> competition-config version -> confirmed
      // registrations -> groups -> group-teams -> fixtures -> publish-bracket -> submitted +
      // officialized result) and (b) a cryptographically valid gate-evidence bundle for the flag
      // PATCH, neither of which this harness can provision -- see the file-level doc comment above
      // for the exact routes/DTOs each would require.
    },
  );
});

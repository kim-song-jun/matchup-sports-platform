/**
 * Task 10 live-cutover runtime manifest producer.
 *
 * `scripts/qa/verify-game-result-cutover.mjs`'s `--mode live` step
 * (`liveCutover()` / `runtimeManifest()`, ~line 700-770 of that file) reads a
 * JSON manifest from `process.env.TASK10_RUNTIME_FILE` that nothing in this
 * repository ever wrote — the live stage could not run at all. This CLI is
 * that producer. It is invoked once, in `.github/workflows/deploy.yml`'s
 * `task10-game-result-cutover` job, after the isolated CI database has been
 * migrated + seeded by the backfill CLI (`seed`/`inventory`/`apply`) and
 * before the `--mode live` step boots the API.
 *
 * It does two things, and nothing else:
 *   1. Idempotently seeds a dedicated tournament/fixture/game — carrying a
 *      CURRENT OFFICIAL result — and a dedicated ops-admin principal into the
 *      SAME isolated Task 10 CI database, using ids namespaced under a
 *      `20000000-…` prefix so this seed can never collide with (or be
 *      mutated by) `test/fixtures/game-backfill.fixture.ts`'s own
 *      `10000000-…` ids, which the backfill CLI's `inject-mismatch` /
 *      `latch-probe` modes actively mutate later in the SAME `live` run.
 *   2. Writes the runtime manifest `verify-game-result-cutover.mjs`'s
 *      `runtimeManifest()` asserts on: `schemaVersion`, `opsToken`,
 *      `tournamentId`, `compareTransition`, `killSwitchTransition`.
 *
 * SCOPE NOTE — this producer does NOT implement, and cannot make green,
 * `GET /api/v1/tournament-ops/tournaments/:id/operations`. That endpoint is
 * owned by Task 18 and is not on this branch. The `live` stage's very first
 * HTTP call (`legacy = await curlJson({ url: operationsUrl, ... })` in
 * `liveCutover()`) 404s until Task 18 merges — that is expected and is not a
 * defect in this producer.
 *
 * FOUR ADDITIONAL, INDEPENDENTLY-VERIFIED BLOCKERS (beyond the missing
 * endpoint) will keep `compareTransition`/`killSwitchTransition` failing even
 * after Task 18 merges, because they live in already-shipped code this task
 * is not scoped to change (`apps/v1_api/src/config/game-operation-flags.ts`,
 * Task 5; `scripts/qa/verify-game-result-cutover.mjs`'s `curlJson()`). See
 * this task's completion report for the full evidence trail; summarized
 * here so the gap travels with the code:
 *
 *   (a) `curlJson()` only ever sends `Authorization: Bearer <opsToken>`.
 *       `V1AuthGuard` / `resolveV1RequestIdentity` (`src/auth/v1-session.ts`)
 *       never reads the Authorization header — only a signed
 *       `teameet_v1_session` cookie, or (non-production only)
 *       `x-v1-user-id` / `x-v1-user-email` headers. `startApi()` in the
 *       harness always boots the API with `NODE_ENV=production`, which
 *       unconditionally disables the header path. No request this producer's
 *       `opsToken` travels on can authenticate as written.
 *   (b) Neither `PatchGameOperationFlagDto` nor `TupleGameOperationFlagsDto`
 *       has an optional `Idempotency-Key` — `patchFlag()`/`tupleTransition()`
 *       both call `requireIdempotencyKey()` and 400 without it — but
 *       `curlJson()` never sends that header.
 *   (c) Both mutations require a cryptographically verified "gate bundle"
 *       evidence file (`verifyGateBundle()`, immutable mode-0444, exact
 *       SHA-256, referencing real prerequisite gate receipts such as V10/V25
 *       from the full ULW rollout pipeline). No CI script can fabricate a
 *       genuine one; `compareGate`/`killSwitchGate` below are structurally
 *       valid placeholders only, and will fail `verifyGateBundle()`.
 *   (d) `tupleTransition()` hard-requires its `transitions` array be exactly
 *       `{GAME_READ, GAME_WRITE}`, both moving backward together (see the
 *       existing Task 5 test at
 *       `test/jobs/game-operations-control.integration-spec.ts:343-417`,
 *       which only ever exercises it with both flags at `new`). Task 10 never
 *       advances GAME_WRITE, so a GAME_READ-only `compare -> legacy` kill
 *       switch has no valid tuple-transition body under the current
 *       contract — `killSwitchTransition` below intentionally omits
 *       GAME_WRITE so the real 409 `TUPLE_TRANSITION_REQUIRED` surfaces
 *       plainly instead of a fabricated, equally-invalid GAME_WRITE leg.
 */

// Must be the first import — mirrors game-result-backfill.cli.ts's own
// requirement: PrismaService is an `@nestjs/common` `@Injectable()` class
// constructed here with `new`, outside Nest's bootstrap.
import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { renameSync, writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import { FOOTBALL_V1_CONFIG } from '../../tournaments/competition-config/competition-config';

const RUNTIME_MANIFEST_SCHEMA_VERSION = 1;
const CREATED_AT = new Date('2026-08-01T00:00:00.000Z');

// `20000000-…` — deliberately namespaced away from
// test/fixtures/game-backfill.fixture.ts's `10000000-…` ids (see file
// header). Every id below is a distinct row this script alone owns.
const id = (suffix: string) => `20000000-0000-4000-8000-${suffix}`;
const IDS = {
  user: id('000000000001'),
  admin: id('000000000002'),
  sport: id('000000000003'),
  region: id('000000000004'),
  homeTeam: id('000000000005'),
  awayTeam: id('000000000006'),
  tournament: id('000000000007'),
  homeRegistration: id('000000000008'),
  awayRegistration: id('000000000009'),
  competitionConfigVersion: id('000000000010'),
  fixture: id('000000000011'),
  game: id('000000000012'),
  homeSide: id('000000000013'),
  awaySide: id('000000000014'),
  revision: id('000000000015'),
} as const;

class RuntimeManifestProducerError extends Error {}

function fail(message: string): never {
  throw new RuntimeManifestProducerError(message);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0) fail(`${name} is required`);
  return value;
}

// Idempotent — safe to re-run if the workflow step is retried. Seeds exactly
// what a real operations-board read needs per this task's brief: a
// tournament with at least one fixture whose game carries a CURRENT OFFICIAL
// result. Shape (Game + 2 sides + one OFFICIAL result revision +
// currentOfficialRevisionId) mirrors the production-proven pattern already
// used by `seedFixtureSources()`'s "imported" game in
// game-result-backfill.cli.ts and by
// test/games/game-backfill.integration-spec.ts's `seedTask10Sources()`.
async function seedOperationsBoardFixture(prisma: PrismaService): Promise<void> {
  const alreadySeeded = await prisma.v1User.findUnique({ where: { id: IDS.user } });
  if (alreadySeeded) return;

  await prisma.v1User.create({
    data: {
      id: IDS.user,
      email: 'task-10-ops-principal@example.test',
      onboardingStatus: 'completed',
      phoneVerifiedAt: CREATED_AT,
      createdAt: CREATED_AT,
    },
  });
  // Ops-role admin — AdminContextService.getMutationAdmin() (called by every
  // GameOperationFlagsService mutation) accepts owner/ops and rejects
  // support; this is the SAME mechanism (and the SAME row shape) every other
  // integration test in this repo uses to identify a platform-ops actor.
  await prisma.v1AdminUser.create({
    data: { id: IDS.admin, userId: IDS.user, adminRole: 'ops', createdAt: CREATED_AT },
  });
  await prisma.v1Sport.create({
    data: {
      id: IDS.sport,
      code: 'task10-ops-football',
      name: 'Task 10 Ops Football',
      createdAt: CREATED_AT,
    },
  });
  await prisma.v1Region.create({
    data: {
      id: IDS.region,
      code: 'TASK_10_OPS_DISTRICT',
      name: 'Task 10 Ops District',
      level: 2,
      createdAt: CREATED_AT,
    },
  });
  await prisma.v1CompetitionConfigVersion.create({
    data: {
      id: IDS.competitionConfigVersion,
      sportCode: 'task10-ops-football',
      name: 'task10-ops-football-v1',
      version: 1,
      status: 'ACTIVE',
      periods: FOOTBALL_V1_CONFIG.periods,
      events: FOOTBALL_V1_CONFIG.events,
      lineup: FOOTBALL_V1_CONFIG.lineup,
      result: FOOTBALL_V1_CONFIG.result,
      tieBreak: FOOTBALL_V1_CONFIG.tieBreak,
      visibility: FOOTBALL_V1_CONFIG.visibility,
      contentHash: 'task-10-ops-board-competition-config-version',
      createdAt: CREATED_AT,
    },
  });
  await prisma.v1Team.createMany({
    data: [
      {
        id: IDS.homeTeam,
        ownerUserId: IDS.user,
        sportId: IDS.sport,
        regionId: IDS.region,
        name: 'Task 10 Ops Home',
        createdAt: CREATED_AT,
      },
      {
        id: IDS.awayTeam,
        ownerUserId: IDS.user,
        sportId: IDS.sport,
        regionId: IDS.region,
        name: 'Task 10 Ops Away',
        createdAt: CREATED_AT,
      },
    ],
  });
  await prisma.v1Tournament.create({
    data: {
      id: IDS.tournament,
      sportId: IDS.sport,
      title: 'Task 10 Operations Board Tournament',
      competitionConfigVersionId: IDS.competitionConfigVersion,
      createdAt: CREATED_AT,
    },
  });
  await prisma.v1TournamentRegistration.createMany({
    data: [
      {
        id: IDS.homeRegistration,
        tournamentId: IDS.tournament,
        teamId: IDS.homeTeam,
        appliedByUserId: IDS.user,
        status: 'confirmed',
        createdAt: CREATED_AT,
      },
      {
        id: IDS.awayRegistration,
        tournamentId: IDS.tournament,
        teamId: IDS.awayTeam,
        appliedByUserId: IDS.user,
        status: 'confirmed',
        createdAt: CREATED_AT,
      },
    ],
  });
  await prisma.v1TournamentFixture.create({
    data: {
      id: IDS.fixture,
      tournamentId: IDS.tournament,
      round: 'group',
      fixtureNumber: 1,
      homeRegistrationId: IDS.homeRegistration,
      awayRegistrationId: IDS.awayRegistration,
      status: 'completed',
      competitionConfigVersionId: IDS.competitionConfigVersion,
      createdAt: CREATED_AT,
    },
  });
  await prisma.v1Game.create({
    data: {
      id: IDS.game,
      sourceType: 'TOURNAMENT_FIXTURE',
      tournamentFixtureId: IDS.fixture,
      state: 'ENDED',
      version: 1,
      competitionConfigVersionId: IDS.competitionConfigVersion,
      createdAt: CREATED_AT,
      sides: {
        create: [
          {
            id: IDS.homeSide,
            sideKey: 'HOME',
            teamId: IDS.homeTeam,
            displayNameSnapshot: 'Task 10 Ops Home',
          },
          {
            id: IDS.awaySide,
            sideKey: 'AWAY',
            teamId: IDS.awayTeam,
            displayNameSnapshot: 'Task 10 Ops Away',
          },
        ],
      },
      resultRevisions: {
        create: {
          id: IDS.revision,
          revision: 1,
          state: 'OFFICIAL',
          score: {
            regulation: { home: 2, away: 1 },
            penalty: null,
            goals: [],
            incomplete: false,
            provenance: 'TOURNAMENT_FIXTURE_RESULT',
          },
          eventsHash: 'task10-ops-board:no-reconstructable-goals',
          missingScorer: false,
          createdByActorType: 'SYSTEM',
          createdBySystemActor: 'TASK10_RUNTIME_MANIFEST_PRODUCER',
          submittedAt: CREATED_AT,
          officialAt: CREATED_AT,
          createdAt: CREATED_AT,
        },
      },
    },
  });
  // The current-official-revision FK is circular with the revision row
  // itself, so it is set in a second statement — same two-step pattern
  // `seedFixtureSources()` in game-result-backfill.cli.ts already uses.
  await prisma.v1Game.update({
    where: { id: IDS.game },
    data: { currentOfficialRevisionId: IDS.revision },
  });
}

// Structurally valid per `PatchGameOperationFlagDto` /
// `TupleGameOperationFlagsDto` (non-empty path, exactly 64 lowercase-hex
// chars) — NOT a real, `verifyGateBundle()`-accepted gate bundle. See blocker
// (c) in this file's header comment.
function placeholderGateBundle(label: string): { path: string; hash: string } {
  return {
    path: `/nonexistent/task10-live-cutover-rehearsal/${label}.json`,
    hash: createHash('sha256').update(`task10-live-cutover-rehearsal:${label}`).digest('hex'),
  };
}

function buildManifest(): Record<string, unknown> {
  const compareGate = placeholderGateBundle('game-read-legacy-to-compare');
  const killSwitchGate = placeholderGateBundle('game-read-compare-to-legacy-kill-switch');

  return {
    schemaVersion: RUNTIME_MANIFEST_SCHEMA_VERSION,
    // Reuses this repo's existing header-based dev-auth identity convention
    // (`x-v1-user-id`, see src/auth/v1-session.ts's resolveV1RequestIdentity
    // and every integration spec's `.set('x-v1-user-id', ids.user)`) rather
    // than inventing a new credential shape — the value is the real,
    // just-seeded ops-admin's user id. See blocker (a) above for why this
    // still cannot authenticate through curlJson()'s Bearer transport today.
    opsToken: IDS.user,
    tournamentId: IDS.tournament,
    compareTransition: {
      method: 'PATCH',
      path: '/api/v1/tournament-ops/operation-flags/GAME_READ',
      body: {
        expectedVersion: 0,
        value: 'compare',
        gateBundlePath: compareGate.path,
        gateBundleHash: compareGate.hash,
        reason:
          'Task 10 live cutover rehearsal: enable GAME_READ dual-read comparison ' +
          '(legacy -> compare) to validate the backfilled legacy result against the ' +
          'new projection before any write cutover.',
      },
    },
    killSwitchTransition: {
      method: 'POST',
      path: '/api/v1/tournament-ops/operation-flags/tuple-transition',
      body: {
        expectedVersions: { GAME_READ: 1 },
        transitions: [{ key: 'GAME_READ', from: 'compare', to: 'legacy' }],
        gateBundlePath: killSwitchGate.path,
        gateBundleHash: killSwitchGate.hash,
        reason:
          'Task 10 live cutover rehearsal: dual-read comparator detected a mismatch ' +
          'against the legacy source; kill-switch GAME_READ back to legacy ' +
          '(compare -> legacy) pending investigation. See blocker (d) in this file’s ' +
          'header comment for why GAME_WRITE is intentionally not included here.',
      },
    },
  };
}

function writeManifestAtomically(path: string, manifest: Record<string, unknown>): void {
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

async function main(): Promise<void> {
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true') {
    fail('This producer is GitHub Actions CI only');
  }
  const runtimeFilePath = requireEnv('TASK10_RUNTIME_FILE');
  if (!isAbsolute(runtimeFilePath)) fail('TASK10_RUNTIME_FILE must be an absolute path');
  requireEnv('DATABASE_URL');

  const prisma = new PrismaService();
  try {
    await seedOperationsBoardFixture(prisma);
  } finally {
    await prisma.$disconnect();
  }

  // Never logged, never written under the evidence directory — opsToken is
  // live credential material. Only the tournament id (not secret) is
  // reported to stdout.
  writeManifestAtomically(runtimeFilePath, buildManifest());
  process.stdout.write(
    `Task 10 runtime manifest written for tournamentId=${IDS.tournament}\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

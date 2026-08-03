/**
 * Task 10 CLI adapter for the game-result migration boundary.
 *
 * This is a thin wrapper invoked by `scripts/qa/verify-game-result-cutover.mjs` as:
 *
 *   pnpm exec ts-node --transpile-only src/games/migration/game-result-backfill.cli.ts \
 *     --mode <seed|inventory|apply|inject-mismatch|latch-probe> \
 *     --fixture <repo-relative fixture path> \
 *     --evidence-dir <absolute evidence dir>
 *
 * It reuses the already-implemented production migration logic
 * (`runGameResultBackfillEvidence`, `GameOperationFlagsService`) verbatim — this file does
 * not reimplement backfill, comparison, hashing, or operation-flag logic. It only:
 *   - seeds the deterministic Task 10 fixture sources (idempotent, `seed` mode),
 *   - calls the production `runGameResultBackfillEvidence()` entrypoint — a single
 *     consistent snapshot that runs the REAL comparator alongside the dry-run/apply and
 *     hashing logic — and reshapes its output into the CLI's stdout contract
 *     (`seed` / `inventory` / `apply` modes always emit the comparator's real mismatch
 *     list, never a fabricated empty one; `apply` additionally refuses to emit a payload
 *     at all if any mismatch survives the insert),
 *   - injects a single deterministic legacy/projected drift and reports it, from the same
 *     single-snapshot evidence call, as a real mismatch (`inject-mismatch` mode, only ever
 *     invoked from inside the harness's own `live` mode),
 *   - drives a real write through `GameOperationFlagsService.withNewWriteAuthority()` (the
 *     only production code path that latches `V1GameCutoverEpoch`), exercises that the
 *     latch survives a second write and a deliberately failing protected operation, and
 *     then attempts the REAL rollback transition through
 *     `GameOperationFlagsService.tupleTransition()` — reporting `rollbackBlocked` from an
 *     actually-observed `CUTOVER_LATCHED` rejection, never derived from the latch
 *     timestamp alone (`latch-probe` mode, also only invoked from `live`).
 *
 * Exactly one JSON object is printed to stdout per invocation and nothing else — all
 * diagnostics go to stderr (redacted — see redactSecrets()). The process exits non-zero
 * (via an uncaught rejection) on any failure instead of printing a partial object.
 */

// Must be the first import: latch-probe mode constructs `@Injectable()`-decorated
// classes (GameOperationFlagsService, AdminContextService, PrismaService) directly with
// `new`, outside Nest's own bootstrap (which normally loads this polyfill first via
// main.ts). Without it, those classes' decorators throw at module-load time for every
// CLI mode, not just latch-probe, since imports are evaluated eagerly. Mirrors the same
// explicit import already required by this repo's own decorated-DTO spec files (e.g.
// src/auth/dto/register.dto.spec.ts).
import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  runGameResultBackfillEvidence,
  type GameBackfillHashes,
  type GameBackfillRunResult,
} from './game-result-backfill';
import type { GameResultMismatch } from './compare-game-result-reads';
import { FOOTBALL_V1_CONFIG } from '../../tournaments/competition-config/competition-config';
import { AdminContextService } from '../../common/admin-context.service';
import {
  GameOperationFlagsService,
  resolveGameOperationGateRoot,
} from '../../config/game-operation-flags';
import { PrismaService } from '../../prisma/prisma.service';
// Type-only: erased by ts-node --transpile-only, never evaluated at runtime. The actual
// fixture module is loaded dynamically from the --fixture argument below.
import type { gameBackfillFixture as GameBackfillFixtureConstType } from '../../../test/fixtures/game-backfill.fixture';

type GameBackfillFixture = typeof GameBackfillFixtureConstType;

const CLI_MODES = ['seed', 'inventory', 'apply', 'inject-mismatch', 'latch-probe'] as const;
type BackfillCliMode = (typeof CLI_MODES)[number];

const GAME_CUTOVER_EPOCH_ID = 'game-cutover';

type ParsedArgs = {
  mode: BackfillCliMode;
  fixture: string;
  evidenceDir: string;
};

class CliError extends Error {}

function fail(message: string): never {
  throw new CliError(message);
}

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length % 2 !== 0) fail('Arguments must be flag/value pairs');
  let mode: string | null = null;
  let fixture: string | null = null;
  let evidenceDir: string | null = null;
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (typeof value !== 'string' || value.length === 0) fail(`Missing value for ${flag}`);
    if (flag === '--mode') mode = value;
    else if (flag === '--fixture') fixture = value;
    else if (flag === '--evidence-dir') evidenceDir = value;
    else fail(`Unknown argument: ${flag}`);
  }
  if (mode === null || !(CLI_MODES as readonly string[]).includes(mode)) {
    fail(`--mode must be one of ${CLI_MODES.join(', ')}`);
  }
  if (fixture === null) fail('--fixture is required');
  if (evidenceDir === null) fail('--evidence-dir is required');
  return { mode: mode as BackfillCliMode, fixture, evidenceDir };
}

function loadFixture(fixtureArg: string): GameBackfillFixture {
  const resolved = resolvePath(process.cwd(), fixtureArg);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const loaded: unknown = require(resolved);
  if (
    loaded === null ||
    typeof loaded !== 'object' ||
    !('gameBackfillFixture' in loaded) ||
    typeof (loaded as { gameBackfillFixture: unknown }).gameBackfillFixture !== 'object'
  ) {
    fail('Fixture module must export gameBackfillFixture');
  }
  return (loaded as { gameBackfillFixture: GameBackfillFixture }).gameBackfillFixture;
}

function emit(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

/**
 * Idempotently seeds the deterministic Task 10 legacy-result sources described by the
 * fixture: 1 reconstructable tournament fixture, 1 partial (score-less) team match, 1
 * already-imported tournament fixture (with a pre-existing V1Game + revision), 1
 * corrupt-result fixture, and 1 soft-deleted team match. Mirrors
 * `test/games/game-backfill.integration-spec.ts`'s `seedTask10Sources()` exactly so the
 * production migration module classifies the same 5-row population.
 */
async function seedFixtureSources(prisma: PrismaClient, fixture: GameBackfillFixture): Promise<void> {
  const { ids, timestamps } = fixture;

  const alreadySeeded = await prisma.v1User.findUnique({ where: { id: ids.user } });
  if (alreadySeeded) return;

  await prisma.v1User.create({
    data: {
      id: ids.user,
      email: 'task-10-backfill@example.test',
      onboardingStatus: 'completed',
      phoneVerifiedAt: timestamps.created,
      createdAt: timestamps.created,
    },
  });
  await prisma.v1AdminUser.create({
    data: { id: ids.admin, userId: ids.user, adminRole: 'ops', createdAt: timestamps.created },
  });
  await prisma.v1Sport.create({
    data: { id: ids.sport, code: 'football', name: 'Football', createdAt: timestamps.created },
  });
  await prisma.v1Region.create({
    data: {
      id: ids.region,
      code: 'TASK_10_DISTRICT',
      name: 'Task 10 District',
      level: 2,
      createdAt: timestamps.created,
    },
  });
  await prisma.v1CompetitionConfigVersion.create({
    data: {
      id: ids.competitionConfigVersion,
      sportCode: 'football',
      name: 'task10-football-v1',
      version: 1,
      status: 'ACTIVE',
      periods: FOOTBALL_V1_CONFIG.periods,
      events: FOOTBALL_V1_CONFIG.events,
      lineup: FOOTBALL_V1_CONFIG.lineup,
      result: FOOTBALL_V1_CONFIG.result,
      tieBreak: FOOTBALL_V1_CONFIG.tieBreak,
      visibility: FOOTBALL_V1_CONFIG.visibility,
      contentHash: 'task-10-exact-competition-config-version',
      createdAt: timestamps.created,
    },
  });
  await prisma.v1Team.createMany({
    data: [
      {
        id: ids.homeTeam,
        ownerUserId: ids.user,
        sportId: ids.sport,
        regionId: ids.region,
        name: 'Task 10 Home',
        createdAt: timestamps.created,
      },
      {
        id: ids.awayTeam,
        ownerUserId: ids.user,
        sportId: ids.sport,
        regionId: ids.region,
        name: 'Task 10 Away',
        createdAt: timestamps.created,
      },
    ],
  });
  await prisma.v1Tournament.create({
    data: {
      id: ids.tournament,
      sportId: ids.sport,
      title: 'Task 10 Tournament',
      competitionConfigVersionId: ids.competitionConfigVersion,
      createdAt: timestamps.created,
    },
  });
  await prisma.v1TournamentRegistration.createMany({
    data: [
      {
        id: ids.homeRegistration,
        tournamentId: ids.tournament,
        teamId: ids.homeTeam,
        appliedByUserId: ids.user,
        status: 'confirmed',
        createdAt: timestamps.created,
      },
      {
        id: ids.awayRegistration,
        tournamentId: ids.tournament,
        teamId: ids.awayTeam,
        appliedByUserId: ids.user,
        status: 'confirmed',
        createdAt: timestamps.created,
      },
    ],
  });

  const commonFixture = {
    tournamentId: ids.tournament,
    round: 'group',
    homeRegistrationId: ids.homeRegistration,
    awayRegistrationId: ids.awayRegistration,
    status: 'completed' as const,
    competitionConfigVersionId: ids.competitionConfigVersion,
    createdAt: timestamps.created,
  };
  await prisma.v1TournamentFixture.createMany({
    data: [
      { ...commonFixture, id: ids.validFixture, fixtureNumber: 1 },
      { ...commonFixture, id: ids.corruptFixture, fixtureNumber: 2 },
      { ...commonFixture, id: ids.importedFixture, fixtureNumber: 3 },
    ],
  });
  await prisma.v1TournamentFixtureResult.createMany({
    data: [
      {
        id: ids.validFixtureResult,
        fixtureId: ids.validFixture,
        homeScore: 3,
        awayScore: 1,
        note: 'official legacy result',
        recordedAt: timestamps.tournamentRecorded,
        createdAt: timestamps.tournamentRecorded,
        updatedAt: timestamps.tournamentRecorded,
      },
      {
        id: ids.corruptFixtureResult,
        fixtureId: ids.corruptFixture,
        homeScore: -1,
        awayScore: 2,
        note: 'negative score is corrupt',
        recordedAt: timestamps.tournamentRecorded,
        createdAt: timestamps.tournamentRecorded,
        updatedAt: timestamps.tournamentRecorded,
      },
      {
        id: ids.importedFixtureResult,
        fixtureId: ids.importedFixture,
        homeScore: 2,
        awayScore: 0,
        note: 'already imported',
        recordedAt: timestamps.tournamentRecorded,
        createdAt: timestamps.tournamentRecorded,
        updatedAt: timestamps.tournamentRecorded,
      },
    ],
  });
  await prisma.v1TournamentFixtureGoal.createMany({
    data: [
      {
        id: ids.validHomeGoal,
        fixtureResultId: ids.validFixtureResult,
        team: 'home',
        playerName: 'Legacy Home Nine',
        minute: 12,
        createdAt: timestamps.tournamentRecorded,
      },
      {
        id: ids.validAwayGoal,
        fixtureResultId: ids.validFixtureResult,
        team: 'away',
        playerName: 'Legacy Away Seven',
        minute: 54,
        createdAt: new Date(timestamps.tournamentRecorded.getTime() + 1),
      },
    ],
  });
  await prisma.v1TeamMatch.createMany({
    data: [
      {
        id: ids.completedTeamMatch,
        hostTeamId: ids.homeTeam,
        createdByUserId: ids.user,
        sportId: ids.sport,
        regionId: ids.region,
        title: 'Completed without a legacy score',
        placeName: 'Task 10 Ground',
        startAt: new Date('2026-07-11T08:45:00.000Z'),
        endAt: timestamps.teamMatchCompleted,
        status: 'completed',
        completedAt: timestamps.teamMatchCompleted,
        competitionConfigVersionId: ids.competitionConfigVersion,
        createdAt: timestamps.created,
      },
      {
        id: ids.deletedTeamMatch,
        hostTeamId: ids.homeTeam,
        createdByUserId: ids.user,
        sportId: ids.sport,
        regionId: ids.region,
        title: 'Deleted completed source',
        placeName: 'Task 10 Ground',
        startAt: new Date('2026-07-12T10:00:00.000Z'),
        endAt: timestamps.deleted,
        status: 'completed',
        completedAt: timestamps.deleted,
        deletedAt: timestamps.deleted,
        competitionConfigVersionId: ids.competitionConfigVersion,
        createdAt: timestamps.created,
      },
    ],
  });

  await prisma.v1Game.create({
    data: {
      id: ids.importedGame,
      sourceType: 'TOURNAMENT_FIXTURE',
      tournamentFixtureId: ids.importedFixture,
      state: 'ENDED',
      version: 1,
      competitionConfigVersionId: ids.competitionConfigVersion,
      createdAt: timestamps.tournamentRecorded,
      sides: {
        create: [
          {
            id: ids.importedHomeSide,
            sideKey: 'HOME',
            teamId: ids.homeTeam,
            displayNameSnapshot: 'Task 10 Home',
          },
          {
            id: ids.importedAwaySide,
            sideKey: 'AWAY',
            teamId: ids.awayTeam,
            displayNameSnapshot: 'Task 10 Away',
          },
        ],
      },
      resultRevisions: {
        create: {
          id: ids.importedRevision,
          revision: 1,
          state: 'OFFICIAL',
          score: {
            regulation: { home: 2, away: 0 },
            penalty: null,
            goals: [],
            incomplete: false,
            provenance: 'TOURNAMENT_FIXTURE_RESULT',
          },
          eventsHash: 'legacy:no-reconstructable-goals',
          missingScorer: false,
          createdByActorType: 'SYSTEM',
          createdBySystemActor: 'GAME_BACKFILL',
          submittedAt: timestamps.tournamentRecorded,
          officialAt: timestamps.tournamentRecorded,
          createdAt: timestamps.tournamentRecorded,
        },
      },
    },
  });
  await prisma.v1Game.update({
    where: { id: ids.importedGame },
    data: { currentOfficialRevisionId: ids.importedRevision },
  });
}

// Real mismatch shape shared by every mode that surfaces comparator output —
// `entity`/`revision` are flattened to strings (matching the pre-existing
// inject-mismatch contract the harness already asserts on) while `legacy`/
// `projected` are passed through verbatim so genuine drift (including the
// comparator's `$missingProjection` forced-mismatch marker) is visible, not
// summarized away.
function toCliMismatches(
  mismatches: readonly GameResultMismatch[],
): Array<{ entity: string; revision: string; field: string; legacy: unknown; projected: unknown }> {
  return mismatches.map((mismatch) => ({
    entity: `${mismatch.entityType}:${mismatch.entityId}`,
    revision: mismatch.revisionId,
    field: mismatch.field,
    legacy: mismatch.legacy,
    projected: mismatch.projected,
  }));
}

// `mismatches` must always be the REAL comparator output for this exact
// snapshot — never a hardcoded `[]`. A previous version of this function
// fabricated an empty mismatch list unconditionally, which meant seed/
// inventory/apply evidence could always claim "no drift" even when the
// production comparator would have reported real divergence against the
// legacy source. `quarantine` is likewise the real per-source list (not just
// a count) so quarantined rows and their reasons survive the CLI/evidence
// boundary instead of disappearing into `bucketCounts.quarantined`.
function backfillResultToCliPayload(
  mode: BackfillCliMode,
  result: GameBackfillRunResult,
  hashes: GameBackfillHashes,
  mismatches: readonly GameResultMismatch[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    mode,
    bucketCounts: result.counts,
    sourceHash: hashes.sourceHash,
    resultHash: hashes.resultHash,
    mismatches: toCliMismatches(mismatches),
    quarantine: result.quarantine,
    ...extra,
  };
}

/**
 * Structural mirror of the (unexported) `ScoreSnapshot` shape written by
 * `game-result-backfill.ts` — every `V1GameResultRevision.score` row in this
 * migration follows exactly this JSON shape (see `seedFixtureSources` above and
 * `createImportedGame` in the production module). Declared with no index
 * signature so every property is a concrete, JSON-safe leaf type
 * (string/number/boolean/null/nested object/array), which makes it — and
 * spreads of it — structurally assignable to Prisma's `InputJsonValue`
 * without an `any`/`unknown` escape hatch.
 */
type ScoreJson = {
  regulation: { home: number; away: number } | null;
  penalty: { home: number; away: number } | null;
  goals: Array<{
    team: 'home' | 'away';
    playerId: string | null;
    playerName: string;
    minute: number | null;
  }>;
  incomplete: boolean;
  provenance: 'TOURNAMENT_FIXTURE_RESULT' | 'TEAM_MATCH_COMPLETION_ONLY';
};

/**
 * Injects one deterministic legacy/projected drift on the reconstructable (tournament
 * fixture) game — a new OFFICIAL revision with `regulation.home` incremented by one over
 * whatever the current official revision recorded — so a caller re-running the comparator
 * afterward sees the drift surface as exactly one mismatch. Mirrors the drift injection in
 * `test/games/game-backfill.integration-spec.ts`'s "RED blocks compare-read" case, except
 * the mutation is derived from the currently-official score rather than a hardcoded value,
 * so it stays correct however the reconstructable game got backfilled.
 *
 * Does not itself return a comparison — the caller re-derives one via
 * `runGameResultBackfillEvidence()` AFTER this returns, from a single fresh
 * snapshot that also supplies sourceHash/resultHash/quarantine consistently
 * with the just-injected mutation, rather than pairing this function's own
 * (now-stale-by-the-time-hashes-are-read) comparison with a separately timed
 * hash read.
 */
async function injectMismatch(
  prisma: PrismaClient,
  fixture: GameBackfillFixture,
): Promise<void> {
  const game = await prisma.v1Game.findUniqueOrThrow({
    where: { tournamentFixtureId: fixture.ids.validFixture },
    select: {
      id: true,
      currentOfficialRevisionId: true,
      resultRevisions: { select: { revision: true }, orderBy: { revision: 'desc' }, take: 1 },
    },
  });
  if (game.currentOfficialRevisionId === null) {
    fail('Task 10 reconstructable game has no official revision to mutate for inject-mismatch');
  }
  const officialRevision = await prisma.v1GameResultRevision.findUniqueOrThrow({
    where: { id: game.currentOfficialRevisionId },
    select: { score: true },
  });
  // The raw Prisma `JsonValue` is opaque; recast it to the known ScoreJson shape
  // (no `unknown` index signature) rather than widening through `unknown`.
  const score = officialRevision.score as unknown as ScoreJson;
  if (score.regulation === null) {
    fail('Task 10 reconstructable game score has no regulation to mutate for inject-mismatch');
  }
  const mutatedScore: ScoreJson = {
    ...score,
    regulation: { home: score.regulation.home + 1, away: score.regulation.away },
  };
  // Both writes must land together. Creating the revision and repointing
  // currentOfficialRevisionId as two independent calls leaves the game with an
  // orphan OFFICIAL revision (or a stale pointer) whenever the process is
  // interrupted or another invocation races between them, which produces a
  // partially-injected database that the live stage cannot diagnose.
  // The next revision number is re-read INSIDE the transaction rather than
  // reused from the earlier snapshot, so a concurrent writer cannot make two
  // invocations pick the same number.
  const newRevisionId = randomUUID();
  await prisma.$transaction(async (tx) => {
    const latest = await tx.v1GameResultRevision.findFirst({
      where: { gameId: game.id },
      orderBy: { revision: 'desc' },
      select: { revision: true },
    });
    await tx.v1GameResultRevision.create({
      data: {
        id: newRevisionId,
        gameId: game.id,
        revision: (latest?.revision ?? 0) + 1,
        state: 'OFFICIAL',
        score: mutatedScore,
        eventsHash: `task10-inject-mismatch:${newRevisionId}`,
        missingScorer: false,
        createdByActorType: 'SYSTEM',
        createdBySystemActor: 'GAME_BACKFILL',
        submittedAt: fixture.timestamps.tournamentRecorded,
        officialAt: fixture.timestamps.tournamentRecorded,
        createdAt: fixture.timestamps.tournamentRecorded,
      },
    });
    await tx.v1Game.update({
      where: { id: game.id },
      data: { currentOfficialRevisionId: newRevisionId },
    });
  });
}

const LATCH_PROBE_RUNTIME_CHECK_PREFIX = 'task10-latch-probe';

// Deliberately chosen to mirror the realistic post-cutover version history
// (GAME_WRITE: legacy(v0) -> new(v1); GAME_READ: legacy(v0) -> compare(v1) ->
// new(v2)) — the exact combination already exercised by this repo's own
// `game-operations-control.integration-spec.ts` ("serializes tuple rollback
// against the first new-authority write with no split brain"), so the
// rollback-attempt gate bundle built below is a proven-valid shape, not a
// speculative one.
const LATCH_PROBE_WRITE_VERSION = 1;
const LATCH_PROBE_READ_VERSION = 2;

const LATCH_PROBE_ROLLBACK_TRANSITION = 'authority-tuple-rollback';
// Format-valid placeholders (see SHA_PATTERN/SHA256_PATTERN in
// game-operation-flags.ts) — the gate bundle verifier only checks these are
// internally consistent and correctly shaped, not that they resolve to a
// real git commit, so any fixed hex string of the right length is sufficient
// for a test-only probe attempt.
const LATCH_PROBE_BASELINE_SHA = '0'.repeat(40);
const LATCH_PROBE_CANDIDATE_SHA = '1'.repeat(40);
const LATCH_PROBE_PLAN_SHA = '2'.repeat(64);

type GateFlagVersion = { value: string; version: number };

// Mirrors GameOperationFlagsService's own `stableStringify()` byte-for-byte —
// `readImmutableJson()` re-serializes the file it reads back and requires an
// EXACT match against the bytes on disk, so this canonicalization must be
// identical (sorted object keys, no extra whitespace) or a genuinely valid
// gate bundle would be rejected as "not canonical JSON".
function canonicalGateJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) fail('Latch probe gate bundle content is not JSON serializable');
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalGateJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalGateJson(record[key])}`)
    .join(',')}}`;
}

function writeImmutableGateJson(path: string, value: unknown): { path: string; sha256: string } {
  const bytes = Buffer.from(canonicalGateJson(value));
  // 'wx' (write, fail if exists) + 0o444 (read-only): the verifier requires
  // both an immutable mode and byte-for-byte stability while it reads the
  // file, matching the same construction this repo's Task 5 integration spec
  // uses for real gate bundles.
  writeFileSync(path, bytes, { flag: 'wx', mode: 0o444 });
  return { path, sha256: createHash('sha256').update(bytes).digest('hex') };
}

// Builds a REAL, verifier-accepted gate bundle (+ its V10/V25 prerequisite
// receipts) for the GAME_READ/GAME_WRITE authority-tuple rollback transition,
// so `attemptRealRollback()` below can drive
// `GameOperationFlagsService.tupleTransition()` through its actual
// `verifyGateBundle()` gate instead of bypassing it — the same gate a real
// operator's rollback request has to pass.
function buildRollbackGateBundle(
  attemptId: string,
  fromTuple: Record<'GAME_READ' | 'GAME_WRITE', GateFlagVersion>,
  toTuple: Record<'GAME_READ' | 'GAME_WRITE', GateFlagVersion>,
): { path: string; sha256: string } {
  const gateRoot = resolveGameOperationGateRoot();
  const receiptDir = join(gateRoot, `task10-latch-probe-${attemptId}`);
  mkdirSync(receiptDir, { recursive: true, mode: 0o700 });
  const gates: Array<{ gateId: string; commandId: string }> = [
    { gateId: 'V10', commandId: 'V10' },
    { gateId: 'V25', commandId: 'V25' },
  ];
  const prerequisites = gates.map((gate, index) => {
    const receipt = writeImmutableGateJson(
      join(receiptDir, `receipt-${index}-C-${gate.gateId}-${gate.commandId}.json`),
      {
        schemaVersion: 1,
        gateId: gate.gateId,
        phase: 'C',
        commandId: gate.commandId,
        attemptId,
        baselineSHA: LATCH_PROBE_BASELINE_SHA,
        candidateSHA: LATCH_PROBE_CANDIDATE_SHA,
        planSHA: LATCH_PROBE_PLAN_SHA,
        verdict: 'accepted',
        createdAt: new Date().toISOString(),
      },
    );
    return {
      gateId: gate.gateId,
      phase: 'C',
      commandId: gate.commandId,
      path: receipt.path,
      sha256: receipt.sha256,
      verdict: 'accepted',
    };
  });
  const bundlePath = join(
    gateRoot,
    `flag-gate-${attemptId}-C-${LATCH_PROBE_ROLLBACK_TRANSITION}.json`,
  );
  return writeImmutableGateJson(bundlePath, {
    schemaVersion: 1,
    phase: 'C',
    attemptId,
    baselineSHA: LATCH_PROBE_BASELINE_SHA,
    candidateSHA: LATCH_PROBE_CANDIDATE_SHA,
    planSHA: LATCH_PROBE_PLAN_SHA,
    transition: LATCH_PROBE_ROLLBACK_TRANSITION,
    tupleKeys: ['GAME_READ', 'GAME_WRITE'],
    fromTuple,
    toTuple,
    prerequisites,
    createdAt: new Date().toISOString(),
  });
}

// Extracts the `{ code }` NestJS puts on an HttpException's response body
// (e.g. `{ code: 'CUTOVER_LATCHED' }`) without importing the exception
// classes themselves — this CLI only needs to read the code, not construct
// or type-check against the exception hierarchy.
function extractOpsErrorCode(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const withResponse = error as Error & { getResponse?: () => unknown };
  if (typeof withResponse.getResponse !== 'function') return null;
  const response = withResponse.getResponse();
  if (response === null || typeof response !== 'object' || !('code' in response)) return null;
  const code = (response as Record<string, unknown>).code;
  return typeof code === 'string' ? code : null;
}

// Actually attempts the production rollback transition —
// `GameOperationFlagsService.tupleTransition()` rolling GAME_WRITE/GAME_READ
// back from 'new' — through its real gate-bundle-verified, CAS-checked code
// path, rather than deriving `rollbackBlocked` from the latch timestamp
// alone. Returns `blocked: true` ONLY when production itself rejected the
// attempt with the exact `CUTOVER_LATCHED` blocker; any other outcome
// (success, or rejection for an unrelated reason) is reported honestly
// instead of being coerced into "blocked".
async function attemptRealRollback(
  gameOperationFlags: GameOperationFlagsService,
  actorUserId: string,
): Promise<{ blocked: boolean; blockerCode: string | null }> {
  const attemptId = randomUUID();
  const fromTuple: Record<'GAME_READ' | 'GAME_WRITE', GateFlagVersion> = {
    GAME_READ: { value: 'new', version: LATCH_PROBE_READ_VERSION },
    GAME_WRITE: { value: 'new', version: LATCH_PROBE_WRITE_VERSION },
  };
  const toTuple: Record<'GAME_READ' | 'GAME_WRITE', GateFlagVersion> = {
    GAME_READ: { value: 'compare', version: LATCH_PROBE_READ_VERSION + 1 },
    GAME_WRITE: { value: 'legacy', version: LATCH_PROBE_WRITE_VERSION + 1 },
  };
  const bundle = buildRollbackGateBundle(attemptId, fromTuple, toTuple);
  try {
    await gameOperationFlags.tupleTransition(
      actorUserId,
      {
        expectedVersions: {
          GAME_WRITE: LATCH_PROBE_WRITE_VERSION,
          GAME_READ: LATCH_PROBE_READ_VERSION,
        },
        transitions: [
          { key: 'GAME_WRITE', from: 'new', to: 'legacy' },
          { key: 'GAME_READ', from: 'new', to: 'compare' },
        ],
        gateBundlePath: bundle.path,
        gateBundleHash: bundle.sha256,
        reason: 'task10-latch-probe-rollback-attempt',
      },
      `task10-latch-probe-rollback:${attemptId}`,
    );
    // No throw at all: production let the rollback through despite the
    // latch. This IS the broken-guard case this probe exists to catch —
    // report it honestly rather than defaulting to "blocked".
    return { blocked: false, blockerCode: null };
  } catch (error) {
    const blockerCode = extractOpsErrorCode(error);
    if (blockerCode === 'CUTOVER_LATCHED') return { blocked: true, blockerCode };
    // Any other rejection (malformed gate bundle, version drift, permission
    // error) means THIS PROBE's own setup is broken, not that production
    // genuinely exercised and enforced the rollback-blocking guard — must
    // not be silently reported as "blocked", or a probe bug would mask a
    // real production regression.
    throw error;
  }
}

/**
 * Resets the read/write-authority flags and the singleton
 * `V1GameCutoverEpoch` row to a clean pre-latch state (test-only setup — there
 * is no production "reset" transition, and driving the full gate-bundle
 * verified flag lifecycle to get here has nothing to do with what this probe
 * verifies), captures that as `before`, then drives a REAL new write through
 * `GameOperationFlagsService.withNewWriteAuthority()` — the ONLY production
 * code path that latches `firstNewWriteAt` / `firstNewWriteResourceId` (see
 * `withNewWriteAuthority` in `../../config/game-operation-flags.ts`). `after`
 * is read fresh from the epoch row — never a value this CLI wrote itself.
 *
 * Three further checks all exercise REAL production code, not derived
 * values:
 *   - a second real new-authority write (different resource) must not move
 *     the latch off the first resource;
 *   - a real new-authority write whose protected operation deliberately
 *     throws must commit neither its own write nor a new latch state (the
 *     transaction must roll back atomically);
 *   - a real rollback attempt through `GameOperationFlagsService
 *     .tupleTransition()` must be rejected with `CUTOVER_LATCHED` — this is
 *     `rollbackBlocked`'s ONLY source, never the latch timestamp.
 *
 * Any of these observing the wrong outcome fails the probe outright (via
 * `fail()`/an uncaught rejection) rather than folding into a permissive
 * boolean, so a broken production guard cannot silently report as passing.
 */
async function latchProbe(
  prisma: PrismaClient,
  gameOperationFlags: GameOperationFlagsService,
  fixture: GameBackfillFixture,
): Promise<{
  before: { firstNewWriteAt: Date | null; firstNewWriteResourceId: string | null };
  after: { firstNewWriteAt: Date | null; firstNewWriteResourceId: string | null };
  rollbackBlocked: boolean;
  rollbackBlockerCode: string | null;
}> {
  // The rollback attempt below drives GameOperationFlagsService as a real
  // platform-ops actor, so that actor must exist as an active, non-support
  // admin — idempotent, and safe regardless of whether `seed` mode already
  // ran earlier in this same invocation sequence.
  await seedFixtureSources(prisma, fixture);

  // Setup only: put GAME_WRITE + GAME_READ + the epoch into the preconditions
  // withNewWriteAuthority() requires (writeFlag.value === 'new' &&
  // epoch.write_mode === 'new'), with the epoch's latch fields cleared, and
  // GAME_READ also at 'new' (with a known version) so the rollback attempt
  // below has a real tuple to roll back.
  await prisma.v1GameOperationFlag.upsert({
    where: { key: 'GAME_WRITE' },
    create: {
      key: 'GAME_WRITE',
      value: 'new',
      version: LATCH_PROBE_WRITE_VERSION,
      ownerActor: 'platform_ops',
    },
    update: {
      value: 'new',
      version: LATCH_PROBE_WRITE_VERSION,
      ownerActor: 'platform_ops',
      rollbackValue: 'legacy',
    },
  });
  await prisma.v1GameOperationFlag.upsert({
    where: { key: 'GAME_READ' },
    create: {
      key: 'GAME_READ',
      value: 'new',
      version: LATCH_PROBE_READ_VERSION,
      ownerActor: 'platform_ops',
    },
    update: {
      value: 'new',
      version: LATCH_PROBE_READ_VERSION,
      ownerActor: 'platform_ops',
      rollbackValue: 'compare',
    },
  });
  await prisma.v1GameCutoverEpoch.upsert({
    where: { id: GAME_CUTOVER_EPOCH_ID },
    create: { id: GAME_CUTOVER_EPOCH_ID, version: 0, writeMode: 'new' },
    update: { writeMode: 'new', firstNewWriteAt: null, firstNewWriteResourceId: null },
  });

  const before = await prisma.v1GameCutoverEpoch.findUniqueOrThrow({
    where: { id: GAME_CUTOVER_EPOCH_ID },
    select: { firstNewWriteAt: true, firstNewWriteResourceId: true },
  });

  const resourceId = randomUUID();
  // The genuine "first new write": a real write performed inside the
  // transaction withNewWriteAuthority() opens, gated on GAME_WRITE==='new'.
  // Only after this operation succeeds does the production code itself flip
  // the latch (see withNewWriteAuthority's post-operation UPDATE).
  await gameOperationFlags.withNewWriteAuthority(resourceId, async (tx) => {
    const key = `${LATCH_PROBE_RUNTIME_CHECK_PREFIX}:${resourceId}`;
    await tx.v1RuntimeCheck.upsert({
      where: { key },
      create: { key, value: 'game-result-backfill-cli-latch-probe' },
      update: { value: 'game-result-backfill-cli-latch-probe' },
    });
  });

  const after = await prisma.v1GameCutoverEpoch.findUniqueOrThrow({
    where: { id: GAME_CUTOVER_EPOCH_ID },
    select: { firstNewWriteAt: true, firstNewWriteResourceId: true },
  });

  // A SECOND real new-authority write must not move the latch off the FIRST
  // resource — otherwise the "first write" invariant the rollback-blocking
  // guarantee depends on would be silently false.
  const secondResourceId = randomUUID();
  await gameOperationFlags.withNewWriteAuthority(secondResourceId, async (tx) => {
    const key = `${LATCH_PROBE_RUNTIME_CHECK_PREFIX}:${secondResourceId}`;
    await tx.v1RuntimeCheck.upsert({
      where: { key },
      create: { key, value: 'game-result-backfill-cli-latch-probe-second-write' },
      update: { value: 'game-result-backfill-cli-latch-probe-second-write' },
    });
  });
  const afterSecondWrite = await prisma.v1GameCutoverEpoch.findUniqueOrThrow({
    where: { id: GAME_CUTOVER_EPOCH_ID },
    select: { firstNewWriteResourceId: true },
  });
  if (afterSecondWrite.firstNewWriteResourceId !== resourceId) {
    fail(
      `Latch probe: a second new-authority write moved the latch off the first resource ` +
        `(expected '${resourceId}', observed '${String(afterSecondWrite.firstNewWriteResourceId)}')`,
    );
  }

  // A protected operation that itself throws must commit neither its own
  // write nor a new latch state — the transaction must roll back atomically.
  class LatchProbeInducedFailure extends Error {}
  const failingResourceId = randomUUID();
  let failingWriteRejected = false;
  try {
    await gameOperationFlags.withNewWriteAuthority(failingResourceId, async () => {
      throw new LatchProbeInducedFailure('task10-latch-probe deliberate failure');
    });
  } catch (error) {
    if (!(error instanceof LatchProbeInducedFailure)) throw error;
    failingWriteRejected = true;
  }
  if (!failingWriteRejected) {
    fail('Latch probe: a deliberately failing protected operation did not reject');
  }
  const afterFailingWrite = await prisma.v1GameCutoverEpoch.findUniqueOrThrow({
    where: { id: GAME_CUTOVER_EPOCH_ID },
    select: { firstNewWriteResourceId: true },
  });
  if (afterFailingWrite.firstNewWriteResourceId !== resourceId) {
    fail('Latch probe: the latch changed after a deliberately failing protected operation');
  }
  const failingRuntimeCheck = await prisma.v1RuntimeCheck.findUnique({
    where: { key: `${LATCH_PROBE_RUNTIME_CHECK_PREFIX}:${failingResourceId}` },
  });
  if (failingRuntimeCheck !== null) {
    fail('Latch probe: a write committed despite its protected operation throwing');
  }

  // The real test: attempt the production rollback transition through
  // GameOperationFlagsService.tupleTransition() now that the latch is set,
  // and report whether production genuinely rejected it with
  // CUTOVER_LATCHED — not a value derived from the latch timestamp alone.
  const rollback = await attemptRealRollback(gameOperationFlags, fixture.ids.user);

  return {
    before,
    after,
    rollbackBlocked: rollback.blocked,
    rollbackBlockerCode: rollback.blockerCode,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const fixture = loadFixture(args.fixture);

  // PrismaService (not plain PrismaClient) so it can be passed directly into
  // GameOperationFlagsService's constructor for the latch-probe mode below —
  // it is a strict subtype of PrismaClient, so every other call site in this
  // file that expects a PrismaClient still accepts it unchanged.
  const prisma = new PrismaService();
  const adminContext = new AdminContextService(prisma);
  const gameOperationFlags = new GameOperationFlagsService(prisma, adminContext);

  try {
    if (args.mode === 'seed') {
      await seedFixtureSources(prisma, fixture);
      const evidence = await runGameResultBackfillEvidence(prisma, { mode: 'dry-run' });
      emit(
        backfillResultToCliPayload(
          'seed',
          evidence.result,
          evidence.hashes,
          evidence.comparison.mismatches,
        ),
      );
      return;
    }

    if (args.mode === 'inventory') {
      const evidence = await runGameResultBackfillEvidence(prisma, { mode: 'dry-run' });
      emit(
        backfillResultToCliPayload(
          'inventory',
          evidence.result,
          evidence.hashes,
          evidence.comparison.mismatches,
        ),
      );
      return;
    }

    if (args.mode === 'apply') {
      // A single consistent snapshot: result/hashes/comparison all derived
      // from the SAME post-insert read (see runGameResultBackfillEvidence's
      // own doc) — never three separate calls that could observe different
      // concurrent writes.
      const evidence = await runGameResultBackfillEvidence(prisma, { mode: 'apply' });
      if (evidence.comparison.counts.mismatched > 0) {
        // Fail closed: apply must never report success (or a fabricated
        // empty mismatch list) while the real comparator still shows
        // divergence against the legacy source for what this call just
        // persisted. No payload is emitted — the process exits non-zero via
        // the uncaught-rejection path below instead of printing a partial
        // "green" object.
        fail(
          `Apply produced ${evidence.comparison.counts.mismatched} unresolved mismatch(es) ` +
            `against the legacy source after insert: ${evidence.comparison.mismatches
              .map((mismatch) => `${mismatch.entityType}:${mismatch.entityId}#${mismatch.field}`)
              .join(', ')}`,
        );
      }
      emit(
        backfillResultToCliPayload(
          'apply',
          evidence.result,
          evidence.hashes,
          evidence.comparison.mismatches,
          {
            insertedCount: evidence.result.inserted,
            incompleteCount: evidence.result.counts.partial,
          },
        ),
      );
      return;
    }

    if (args.mode === 'inject-mismatch') {
      await injectMismatch(prisma, fixture);
      // Re-derive hashes/comparison/quarantine from ONE fresh snapshot taken
      // AFTER the injected mutation, rather than pairing an earlier,
      // separately-timed comparison with a later hash read.
      const evidence = await runGameResultBackfillEvidence(prisma, { mode: 'dry-run' });
      emit({
        mode: 'inject-mismatch',
        bucketCounts: evidence.comparison.counts,
        sourceHash: evidence.hashes.sourceHash,
        resultHash: evidence.hashes.resultHash,
        mismatches: toCliMismatches(evidence.comparison.mismatches),
        quarantine: evidence.result.quarantine,
      });
      return;
    }

    // latch-probe
    const latch = await latchProbe(prisma, gameOperationFlags, fixture);
    emit(latch);
  } finally {
    await prisma.$disconnect();
  }
}

// Redacts secret-shaped fragments from a free-form error message before it
// ever leaves this process — the ONE place this CLI writes uncontrolled,
// non-JSON text (an underlying Prisma/Node error's own .message, which this
// CLI does not construct and cannot guarantee is secret-free, e.g. a
// misconfigured-datasource error can echo the connection string). Redacting
// at the source, in one synchronous write, closes the whole class of
// downstream per-chunk-boundary redaction gaps a streaming log capture (this
// CLI's stdout/stderr consumer) can otherwise have: there is no secret
// substring left to be split across a chunk boundary if it was never
// written in the first place.
const DATABASE_URL_PATTERN = /postgres(?:ql)?:\/\/[^\s"']+/gi;
const BEARER_TOKEN_PATTERN = /(bearer\s+)[A-Za-z0-9._~+\/-]+/gi;

function redactSecrets(value: string): string {
  return value
    .replaceAll(DATABASE_URL_PATTERN, '[REDACTED_DATABASE_URL]')
    .replaceAll(BEARER_TOKEN_PATTERN, '$1[REDACTED_TOKEN]');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${redactSecrets(message)}\n`);
  process.exitCode = 1;
});

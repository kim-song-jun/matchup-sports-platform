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
 * (`runGameResultBackfill`, `compareGameResultReads`, `computeGameBackfillHashes`) verbatim —
 * this file does not reimplement backfill, comparison, or hashing logic. It only:
 *   - seeds the deterministic Task 10 fixture sources (idempotent, `seed` mode),
 *   - calls the production dry-run/apply entrypoints and reshapes their output into the
 *     CLI's stdout contract (`inventory` / `apply` modes), pairing every response with the
 *     source- and result-side hashes from `computeGameBackfillHashes` (never a
 *     source-only-derived stand-in for both),
 *   - injects a single deterministic legacy/projected drift and reports it via
 *     `compareGameResultReads` (`inject-mismatch` mode, only ever invoked from inside the
 *     harness's own `live` mode),
 *   - drives a real write through `GameOperationFlagsService.withNewWriteAuthority()` (the
 *     only production code path that latches `V1GameCutoverEpoch`) after resetting the flag
 *     and epoch rows to a clean pre-latch state, and reports the before/after state that
 *     production code itself produced (`latch-probe` mode, also only invoked from `live`).
 *
 * Exactly one JSON object is printed to stdout per invocation and nothing else — all
 * diagnostics go to stderr. The process exits non-zero (via an uncaught rejection) on any
 * failure instead of printing a partial object.
 */

// Must be the first import: latch-probe mode constructs `@Injectable()`-decorated
// classes (GameOperationFlagsService, AdminContextService, PrismaService) directly with
// `new`, outside Nest's own bootstrap (which normally loads this polyfill first via
// main.ts). Without it, those classes' decorators throw at module-load time for every
// CLI mode, not just latch-probe, since imports are evaluated eagerly. Mirrors the same
// explicit import already required by this repo's own decorated-DTO spec files (e.g.
// src/auth/dto/register.dto.spec.ts).
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { resolve as resolvePath } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  compareGameResultReads,
  computeGameBackfillHashes,
  runGameResultBackfill,
  type GameBackfillHashes,
  type GameBackfillRunResult,
} from './game-result-backfill';
import type { GameResultComparison } from './compare-game-result-reads';
import { FOOTBALL_V1_CONFIG } from '../../tournaments/competition-config/competition-config';
import { AdminContextService } from '../../common/admin-context.service';
import { GameOperationFlagsService } from '../../config/game-operation-flags';
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

function backfillResultToCliPayload(
  mode: BackfillCliMode,
  result: GameBackfillRunResult,
  hashes: GameBackfillHashes,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    mode,
    bucketCounts: result.counts,
    sourceHash: hashes.sourceHash,
    resultHash: hashes.resultHash,
    mismatches: [],
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
 * whatever the current official revision recorded — then re-runs `compareGameResultReads`
 * so the drift surfaces as exactly one mismatch. Mirrors the drift injection in
 * `test/games/game-backfill.integration-spec.ts`'s "RED blocks compare-read" case, except
 * the mutation is derived from the currently-official score rather than a hardcoded value,
 * so it stays correct however the reconstructable game got backfilled.
 */
async function injectMismatch(
  prisma: PrismaClient,
  fixture: GameBackfillFixture,
): Promise<GameResultComparison> {
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
  const nextRevisionNumber = (game.resultRevisions[0]?.revision ?? 0) + 1;
  const newRevisionId = randomUUID();
  await prisma.v1GameResultRevision.create({
    data: {
      id: newRevisionId,
      gameId: game.id,
      revision: nextRevisionNumber,
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
  await prisma.v1Game.update({
    where: { id: game.id },
    data: { currentOfficialRevisionId: newRevisionId },
  });

  return compareGameResultReads(prisma);
}

const LATCH_PROBE_RUNTIME_CHECK_PREFIX = 'task10-latch-probe';

/**
 * Resets the read/write-authority flag row and the singleton
 * `V1GameCutoverEpoch` row to a clean pre-latch state (test-only setup — there
 * is no production "reset" transition, and driving the full gate-bundle
 * verified flag lifecycle to get GAME_WRITE to 'new' has nothing to do with
 * what this probe verifies), captures that as `before`, then drives a REAL
 * new write through `GameOperationFlagsService.withNewWriteAuthority()` — the
 * ONLY production code path that latches `firstNewWriteAt` /
 * `firstNewWriteResourceId` (see `withNewWriteAuthority` in
 * `../../config/game-operation-flags.ts`). `after` and `rollbackBlocked` are
 * both derived from a fresh read of the epoch row performed AFTER that call
 * returns — never from a value this CLI wrote itself — so a broken or
 * missing `withNewWriteAuthority()` latch would be caught here.
 */
async function latchProbe(
  prisma: PrismaClient,
  gameOperationFlags: GameOperationFlagsService,
): Promise<{
  before: { firstNewWriteAt: Date | null; firstNewWriteResourceId: string | null };
  after: { firstNewWriteAt: Date | null; firstNewWriteResourceId: string | null };
  rollbackBlocked: boolean;
}> {
  // Setup only: put GAME_WRITE + the epoch into the preconditions
  // withNewWriteAuthority() itself requires (writeFlag.value === 'new' &&
  // epoch.write_mode === 'new'), with the epoch's latch fields cleared.
  await prisma.v1GameOperationFlag.upsert({
    where: { key: 'GAME_WRITE' },
    create: { key: 'GAME_WRITE', value: 'new', ownerActor: 'platform_ops' },
    update: { value: 'new', ownerActor: 'platform_ops', rollbackValue: 'legacy' },
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

  return {
    before,
    after,
    rollbackBlocked: after.firstNewWriteAt !== null,
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
      const result = await runGameResultBackfill(prisma, { mode: 'dry-run' });
      const hashes = await computeGameBackfillHashes(prisma);
      emit(backfillResultToCliPayload('seed', result, hashes));
      return;
    }

    if (args.mode === 'inventory') {
      const result = await runGameResultBackfill(prisma, { mode: 'dry-run' });
      const hashes = await computeGameBackfillHashes(prisma);
      emit(backfillResultToCliPayload('inventory', result, hashes));
      return;
    }

    if (args.mode === 'apply') {
      const result = await runGameResultBackfill(prisma, { mode: 'apply' });
      const hashes = await computeGameBackfillHashes(prisma);
      emit(
        backfillResultToCliPayload('apply', result, hashes, {
          insertedCount: result.inserted,
          incompleteCount: result.counts.partial,
        }),
      );
      return;
    }

    if (args.mode === 'inject-mismatch') {
      const comparison = await injectMismatch(prisma, fixture);
      const hashes = await computeGameBackfillHashes(prisma);
      const mismatches = comparison.mismatches.map((mismatch) => ({
        entity: `${mismatch.entityType}:${mismatch.entityId}`,
        revision: mismatch.revisionId,
        field: mismatch.field,
        legacy: mismatch.legacy,
        projected: mismatch.projected,
      }));
      emit({
        mode: 'inject-mismatch',
        bucketCounts: comparison.counts,
        sourceHash: hashes.sourceHash,
        resultHash: hashes.resultHash,
        mismatches,
      });
      return;
    }

    // latch-probe
    const latch = await latchProbe(prisma, gameOperationFlags);
    emit(latch);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

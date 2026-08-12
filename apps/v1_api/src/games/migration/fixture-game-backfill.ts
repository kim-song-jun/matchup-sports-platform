import { Prisma, PrismaClient, V1GameSideKey, V1GameSourceType, V1VisibilityMode } from '@prisma/client';
import { GameContractError } from '../core';
import { computePeriodCount, jsonObject } from '../games.service';

/**
 * Operational backfill for the "public tournament schedule is always empty"
 * bug: `v1_tournament_fixtures` rows that predate the Game domain
 * (2026-08 Task 6+) have no corresponding `V1Game` row at all, so
 * `PublicTournamentRecordsService.presentScheduleEntry()` reads
 * `fixture.game?.visibilityPolicy?.mode ?? 'HIDDEN'` and every one of them
 * resolves to `hidden` and gets filtered out.
 *
 * Design (documented here because two shapes were both defensible — see the
 * PR description for the full writeup):
 *
 *   - `status: 'completed'` fixtures are NOT given a Game by this module.
 *     Task 10's one-time historical backfill (`game-result-backfill.ts`,
 *     retired once the GAME_WRITE/GAME_READ cutover completed -- see
 *     `apps/v1_api/src/config/game-operation-flags.ts`) already created the
 *     Game + OFFICIAL result revision for every legacy `status: 'completed'`
 *     fixture that existed at cutover time, from each fixture's actual
 *     recorded score — reimplementing that here would risk a second,
 *     subtly different reconstruction of the same result. This module only
 *     adds the `V1GamePeriod` rows and `V1GameVisibilityPolicy` row that
 *     one-time backfill's `createImportedGame()` never wrote (confirmed by
 *     reading it: it has no `v1GamePeriod`/`visibilityPolicy` write at
 *     all), for whichever Game already exists at the time this runs. A
 *     `status: 'completed'` fixture with no Game and no history of ever
 *     going through Task 10's backfill is outside both modules' scope.
 *   - `status: 'scheduled' | 'in_progress'` fixtures have no Task 10
 *     equivalent (that module only reads `status: 'completed'` sources), so
 *     this module creates the Game itself, mirroring
 *     `GamesService.createFromSourceInTransaction()` /
 *     `TournamentBracketService.createFixture()`'s game-creation step field
 *     for field: sides, per-side lineup, participants (from each
 *     registration's non-removed players), periods (`computePeriodCount`),
 *     and the visibility policy (`visibility.mode === 'status_only' ? ... :
 *     LIVE`, the exact same derivation games.service.ts uses — imported, not
 *     re-transcribed). The Game's `state` is left at its schema default
 *     (`SCHEDULED`), exactly like every other path that creates a Game
 *     always does — this module does not invent a state mapping from
 *     `fixture.status`, since production only ever creates a Game in the
 *     SCHEDULED state and moves it via explicit live commands afterward.
 *     A backfilled `in_progress` fixture's public status will therefore read
 *     "scheduled" (not "live") until that game is actually started through
 *     the live console — a known, honest limitation, not a fabricated
 *     "live" state with no real event history behind it.
 *   - It never creates a second Game for a fixture that already has one
 *     (the `game: null` filter on the create-candidate query), so this can
 *     run before or after Task 10's backfill, in any order, repeatedly,
 *     without ever double-creating.
 *
 * Idempotent by construction: re-running finds zero create-candidates (every
 * fixture already has a `game`), zero period-backfill candidates (every
 * TOURNAMENT_FIXTURE game already has periods), and zero policy-backfill
 * candidates (every TOURNAMENT_FIXTURE game already has a policy) — see
 * fixture-game-backfill.integration-spec.ts's idempotency test.
 *
 * Kept out of prisma/migrations/ entirely (not just the DML): this repo's
 * expand-contract alpha rollback gate (`scripts/qa/
 * check-expand-contract-migrations.mjs`) rejects any non-additive statement
 * in a migration file, and a Game-creating backfill is inherently a write —
 * following the same split Task 10 and D-21 (`game-result-backfill.ts`,
 * `game-period-live-backfill.ts`) already established: schema stays
 * additive-only, one-time data repairs run as a post-deploy CLI (see
 * fixture-game-backfill.cli.ts).
 */

export type FixtureGameBackfillQuarantineReason =
  | 'CONFIG_MISSING'
  | 'CONFIG_INACTIVE'
  | 'REGISTRATION_INVALID';

export type FixtureGameBackfillQuarantine = {
  fixtureId: string;
  reason: FixtureGameBackfillQuarantineReason;
};

export type FixtureGameBackfillCounts = {
  gamesCreated: number;
  periodsBackfilled: number;
  visibilityPoliciesBackfilled: number;
  quarantined: number;
};

export type FixtureGameBackfillResult = {
  counts: FixtureGameBackfillCounts;
  quarantine: FixtureGameBackfillQuarantine[];
};

type ConfigRow = {
  id: string;
  status: string;
  periods: Prisma.JsonValue;
  visibility: Prisma.JsonValue;
};

// Exported so fixture-game-backfill.integration-spec.ts can drive
// createScheduledGame() directly with a deliberately malformed candidate
// (a participant referencing a sideKey missing from `sides`) to prove the
// PARTICIPANT_INVALID guard below actually throws instead of silently
// dropping the participant -- collectCandidates() itself always builds
// `sides` with both HOME and AWAY, so that guard is unreachable through the
// normal candidate-building path and can only be exercised this way.
export type CreateCandidate = {
  fixtureId: string;
  configId: string;
  visibilityMode: V1VisibilityMode;
  periodCount: number;
  sides: Array<{ sideKey: V1GameSideKey; teamId: string | null; displayNameSnapshot: string }>;
  participants: Array<{ sideKey: V1GameSideKey; displayNameSnapshot: string }>;
};

type PeriodBackfillCandidate = { gameId: string; periodCount: number };
type PolicyBackfillCandidate = { gameId: string; mode: V1VisibilityMode };

type Candidates = {
  toCreate: CreateCandidate[];
  periodBackfill: PeriodBackfillCandidate[];
  policyBackfill: PolicyBackfillCandidate[];
  quarantine: FixtureGameBackfillQuarantine[];
};

// Structural subset of PrismaClient — satisfied by both PrismaClient itself
// (dry-run) and a Prisma.TransactionClient (inside the apply transaction),
// mirroring the same MigrationReadClient split game-result-backfill.ts uses.
type MigrationReadClient = Pick<
  PrismaClient,
  'v1TournamentFixture' | 'v1CompetitionConfigVersion' | 'v1TournamentRegistration' | 'v1Game'
>;

const SERIALIZABLE_RETRY_LIMIT = 3;

function visibilityModeFromConfig(config: ConfigRow): V1VisibilityMode {
  const visibility = jsonObject(config.visibility);
  return visibility.mode === 'status_only' ? V1VisibilityMode.STATUS_ONLY : V1VisibilityMode.LIVE;
}

/**
 * Single source of truth for what needs doing, read (never written) by both
 * the dry-run path and the first step of the apply transaction — so the two
 * can never report different counts for the same database state.
 */
async function collectCandidates(client: MigrationReadClient): Promise<Candidates> {
  const fixtures = await client.v1TournamentFixture.findMany({
    where: { status: { in: ['scheduled', 'in_progress'] }, game: null },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      competitionConfigVersionId: true,
      homeRegistrationId: true,
      awayRegistrationId: true,
    },
  });

  // Narrowed at the DB level to exactly the games this module could still
  // have work to do for -- `periods: { none: {} }` is Prisma's relation
  // filter for "zero related V1GamePeriod rows" (equivalent to the
  // `_count.periods === 0` check below, just evaluated in SQL instead of
  // pulling every TOURNAMENT_FIXTURE game into memory to filter there) and
  // `visibilityPolicy: null` is the same "no related row" filter already
  // used above for `game: null` on the optional 1-1 relation. A game
  // matching neither has nothing left for this module to backfill, so it
  // can never appear in `periodBackfill`/`policyBackfill` below regardless
  // of whether it is excluded here in SQL or in the JS loop -- this WHERE
  // only removes rows the loop would discard anyway (proven by
  // fixture-game-backfill.integration-spec.ts's bare-Game-backfill and
  // idempotency tests still passing unchanged against this narrower query).
  const existingGames = await client.v1Game.findMany({
    where: {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      OR: [{ periods: { none: {} } }, { visibilityPolicy: null }],
    },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      competitionConfigVersionId: true,
      _count: { select: { periods: true } },
      visibilityPolicy: { select: { gameId: true } },
    },
  });

  const configIds = [
    ...new Set([
      ...fixtures
        .map((fixture) => fixture.competitionConfigVersionId)
        .filter((id): id is string => id !== null),
      ...existingGames.map((game) => game.competitionConfigVersionId),
    ]),
  ];
  const configs = await client.v1CompetitionConfigVersion.findMany({
    where: { id: { in: configIds } },
    select: { id: true, status: true, periods: true, visibility: true },
  });
  const configById = new Map(configs.map((config) => [config.id, config]));

  const registrationIds = [
    ...new Set(
      fixtures
        .flatMap((fixture) => [fixture.homeRegistrationId, fixture.awayRegistrationId])
        .filter((id): id is string => id !== null),
    ),
  ];
  const registrations = await client.v1TournamentRegistration.findMany({
    where: { id: { in: registrationIds }, status: 'confirmed' },
    select: {
      id: true,
      team: { select: { id: true, name: true } },
      players: { where: { removedAt: null }, select: { realName: true }, orderBy: { id: 'asc' } },
    },
  });
  const registrationById = new Map(registrations.map((registration) => [registration.id, registration]));

  const toCreate: CreateCandidate[] = [];
  const quarantine: FixtureGameBackfillQuarantine[] = [];

  for (const fixture of fixtures) {
    if (fixture.competitionConfigVersionId === null) {
      quarantine.push({ fixtureId: fixture.id, reason: 'CONFIG_MISSING' });
      continue;
    }
    const config = configById.get(fixture.competitionConfigVersionId);
    if (config === undefined || config.status !== 'ACTIVE') {
      quarantine.push({ fixtureId: fixture.id, reason: 'CONFIG_INACTIVE' });
      continue;
    }
    const home = fixture.homeRegistrationId ? registrationById.get(fixture.homeRegistrationId) : undefined;
    if (fixture.homeRegistrationId !== null && home === undefined) {
      quarantine.push({ fixtureId: fixture.id, reason: 'REGISTRATION_INVALID' });
      continue;
    }
    const away = fixture.awayRegistrationId ? registrationById.get(fixture.awayRegistrationId) : undefined;
    if (fixture.awayRegistrationId !== null && away === undefined) {
      quarantine.push({ fixtureId: fixture.id, reason: 'REGISTRATION_INVALID' });
      continue;
    }

    toCreate.push({
      fixtureId: fixture.id,
      configId: config.id,
      visibilityMode: visibilityModeFromConfig(config),
      periodCount: computePeriodCount(config.periods),
      sides: [
        {
          sideKey: V1GameSideKey.HOME,
          teamId: home?.team.id ?? null,
          displayNameSnapshot: home?.team.name ?? '홈 팀 미정',
        },
        {
          sideKey: V1GameSideKey.AWAY,
          teamId: away?.team.id ?? null,
          displayNameSnapshot: away?.team.name ?? '어웨이 팀 미정',
        },
      ],
      participants: [
        ...(home?.players ?? []).map((player) => ({
          sideKey: V1GameSideKey.HOME,
          displayNameSnapshot: player.realName,
        })),
        ...(away?.players ?? []).map((player) => ({
          sideKey: V1GameSideKey.AWAY,
          displayNameSnapshot: player.realName,
        })),
      ],
    });
  }

  const periodBackfill: PeriodBackfillCandidate[] = [];
  const policyBackfill: PolicyBackfillCandidate[] = [];
  for (const game of existingGames) {
    // The FK on V1Game.competitionConfigVersionId is onDelete: Restrict, so a
    // config row for an existing game is always findable in principle; this
    // guard exists purely so a not-yet-understood data anomaly skips that one
    // game defensively instead of throwing away the whole batch's progress.
    const config = configById.get(game.competitionConfigVersionId);
    if (config === undefined) continue;
    if (game._count.periods === 0) {
      periodBackfill.push({ gameId: game.id, periodCount: computePeriodCount(config.periods) });
    }
    if (game.visibilityPolicy === null) {
      policyBackfill.push({ gameId: game.id, mode: visibilityModeFromConfig(config) });
    }
  }

  return { toCreate, periodBackfill, policyBackfill, quarantine };
}

function toResult(candidates: Candidates): FixtureGameBackfillResult {
  return {
    counts: {
      gamesCreated: candidates.toCreate.length,
      periodsBackfilled: candidates.periodBackfill.length,
      visibilityPoliciesBackfilled: candidates.policyBackfill.length,
      quarantined: candidates.quarantine.length,
    },
    quarantine: candidates.quarantine,
  };
}

/**
 * Mirrors GamesService.createFromSourceInTransaction()'s writes for a
 * TOURNAMENT_FIXTURE source (game + sides + one lineup per side +
 * participants + periods + visibility policy) minus the command envelope
 * (idempotency record, audit write, actor/version assertions) that machinery
 * exists for live user commands, not a one-time data repair — following the
 * same choice game-result-backfill.ts's createImportedGame() already made.
 */
export async function createScheduledGame(tx: Prisma.TransactionClient, candidate: CreateCandidate): Promise<void> {
  const game = await tx.v1Game.create({
    data: {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      tournamentFixtureId: candidate.fixtureId,
      competitionConfigVersionId: candidate.configId,
    },
  });

  const sideByKey = new Map<V1GameSideKey, { id: string; lineupId: string }>();
  for (const side of candidate.sides) {
    const createdSide = await tx.v1GameSide.create({
      data: {
        gameId: game.id,
        sideKey: side.sideKey,
        teamId: side.teamId,
        displayNameSnapshot: side.displayNameSnapshot,
      },
    });
    const lineup = await tx.v1GameLineup.create({
      data: { gameId: game.id, sideId: createdSide.id, revision: 1 },
    });
    sideByKey.set(side.sideKey, { id: createdSide.id, lineupId: lineup.id });
  }

  for (const participant of candidate.participants) {
    const side = sideByKey.get(participant.sideKey);
    if (side === undefined) {
      // `candidate.sides` is built a few lines above to always contain both
      // HOME and AWAY, so this should be unreachable — but an unreachable
      // invariant is only real if violating it is impossible, not just
      // undocumented. Mirrors the exact failure games.service.ts's own
      // source-create path uses for this same condition
      // (createFromSourceInTransaction's participant loop): same error type,
      // same code, same message. Throwing here (instead of silently
      // `continue`-ing past the participant) aborts and rolls back this
      // candidate's transaction rather than persisting a partially-built
      // Game that looks like a successful backfill.
      throw new GameContractError('PARTICIPANT_INVALID', 'Participant side is missing', {
        fixtureId: candidate.fixtureId,
        sideKey: participant.sideKey,
      });
    }
    await tx.v1GameParticipant.create({
      data: {
        gameId: game.id,
        sideId: side.id,
        lineupId: side.lineupId,
        displayNameSnapshot: participant.displayNameSnapshot,
      },
    });
  }

  await tx.v1GamePeriod.createMany({
    data: Array.from({ length: candidate.periodCount }, (_, index) => ({
      gameId: game.id,
      number: index + 1,
    })),
  });
  await tx.v1GameVisibilityPolicy.create({
    data: { gameId: game.id, mode: candidate.visibilityMode },
  });
}

async function backfillPeriods(tx: Prisma.TransactionClient, candidate: PeriodBackfillCandidate): Promise<void> {
  await tx.v1GamePeriod.createMany({
    data: Array.from({ length: candidate.periodCount }, (_, index) => ({
      gameId: candidate.gameId,
      number: index + 1,
    })),
  });
}

async function backfillPolicy(tx: Prisma.TransactionClient, candidate: PolicyBackfillCandidate): Promise<void> {
  await tx.v1GameVisibilityPolicy.create({
    data: { gameId: candidate.gameId, mode: candidate.mode },
  });
}

export async function runFixtureGameBackfill(
  prisma: PrismaClient,
  input: { mode: 'dry-run' | 'apply' },
): Promise<FixtureGameBackfillResult> {
  if (input.mode === 'dry-run') {
    return toResult(await collectCandidates(prisma));
  }

  return withSerializableRetry(prisma, async (tx) => {
    const candidates = await collectCandidates(tx);
    for (const candidate of candidates.toCreate) {
      await createScheduledGame(tx, candidate);
    }
    for (const candidate of candidates.periodBackfill) {
      await backfillPeriods(tx, candidate);
    }
    for (const candidate of candidates.policyBackfill) {
      await backfillPolicy(tx, candidate);
    }
    return toResult(candidates);
  });
}

async function withSerializableRetry<T>(
  prisma: PrismaClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isRetryableTransactionConflict(error) || attempt === SERIALIZABLE_RETRY_LIMIT) {
        throw error;
      }
    }
  }
  throw new Error('Serializable fixture-game backfill retry limit was exhausted');
}

function isRetryableTransactionConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2034' || error.code === 'P2002')
  );
}

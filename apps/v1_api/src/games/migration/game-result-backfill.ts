import { Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import {
  compareGameResultSnapshots,
  type GameResultComparison,
  type GameResultEntityType,
} from './compare-game-result-reads';

export type GameBackfillQuarantine = {
  sourceType: GameResultEntityType;
  sourceId: string;
  reason: 'CORRUPT_RESULT' | 'SOURCE_DELETED';
};

export type GameBackfillRunResult = {
  counts: {
    sourceRows: number;
    reconstructable: number;
    partial: number;
    alreadyImported: number;
    quarantined: number;
  };
  populationHash: string;
  inserted: number;
  quarantine: GameBackfillQuarantine[];
};

/**
 * Distinct from GameBackfillRunResult.populationHash (which hashes the
 * pre-import SOURCE snapshot only). sourceHash mirrors that value; resultHash
 * hashes the RESULT side: the persisted score for sources this process has
 * already imported (or the projected equivalent that would be persisted, for
 * sources not yet imported), paired with `sides` — which is always taken
 * from the freshly recomputed SOURCE snapshot, never read back from
 * persisted V1GameSide rows (see resultProjection() below). Score drift
 * between the two hashes is therefore detectable; a corruption confined to
 * the persisted sides alone is not, since sides here doesn't reflect what
 * was actually written.
 */
export type GameBackfillHashes = {
  sourceHash: string;
  resultHash: string;
};

type ScoreSnapshot = {
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

type SideSnapshot = {
  sideKey: 'HOME' | 'AWAY';
  teamId: string | null;
  displayNameSnapshot: string;
};

type SourceSnapshot = {
  entityType: GameResultEntityType;
  entityId: string;
  sourceTimestamp: Date;
  competitionConfigVersionId: string;
  score: ScoreSnapshot;
  sides: SideSnapshot[];
};

type ClassifiedSource =
  | {
      bucket: 'reconstructable' | 'partial';
      source: SourceSnapshot;
      // Set when a prior apply call within this same migration already
      // persisted a GAME_BACKFILL-authored revision for this source. Kept
      // orthogonal to `bucket` so eligibility counts stay stable across
      // reruns (see classifyImported) while comparison/result-hash logic can
      // still see the actually-persisted state.
      existingRevision: { id: string; score: Prisma.JsonValue } | null;
    }
  | { bucket: 'alreadyImported'; source: SourceSnapshot; revisionId: string; projected: unknown }
  | { bucket: 'quarantined'; quarantine: GameBackfillQuarantine; hashInput: unknown };

type Inventory = {
  classified: ClassifiedSource[];
  result: GameBackfillRunResult;
};

type MigrationReadClient = Pick<
  PrismaClient,
  'v1CompetitionConfigVersion' | 'v1Game' | 'v1TeamMatch' | 'v1TournamentFixture'
>;

const SERIALIZABLE_RETRY_LIMIT = 3;

export async function runGameResultBackfill(
  prisma: PrismaClient,
  input: { mode: 'dry-run' | 'apply' },
): Promise<GameBackfillRunResult> {
  if (input.mode === 'dry-run') {
    return (await inventorySources(prisma)).result;
  }

  return withSerializableRetry(prisma, async (transaction) => {
    const inventory = await inventorySources(transaction);
    let inserted = 0;
    for (const entry of inventory.classified) {
      if (entry.bucket !== 'reconstructable' && entry.bucket !== 'partial') continue;
      // A prior apply call in this same migration already backfilled this
      // source (its Game/revision exist, authored by GAME_BACKFILL) — do
      // not insert again. classifyImported() keeps it bucketed as
      // reconstructable/partial (not alreadyImported) precisely so repeated
      // apply calls report identical eligibility counts.
      if (entry.existingRevision) continue;
      await createImportedGame(transaction, entry.source);
      inserted += 1;
    }
    return { ...inventory.result, inserted };
  });
}

/**
 * Computes the two 64-hex hashes the CLI/CI contract requires:
 * - sourceHash: the pre-import source/quarantine snapshot hash (identical to
 *   GameBackfillRunResult.populationHash).
 * - resultHash: a hash of the RESULT side — the persisted score for sources
 *   this process has already imported (this run or a prior apply call), or
 *   the projected equivalent (what would be persisted) for sources not yet
 *   imported. `sides` in this hash is always the recomputed SOURCE snapshot
 *   (see resultProjection() below), never read back from persisted
 *   V1GameSide rows, so this hash detects score corruption but not a
 *   corruption confined to the persisted sides. Distinct computation from
 *   sourceHash so score-side corruption is independently detectable.
 *
 * Exposed as a standalone read so callers (e.g. a CLI wrapper) can obtain
 * both hashes without changing the shape of GameBackfillRunResult, which is
 * pinned by existing integration coverage.
 */
export async function computeGameBackfillHashes(
  prisma: PrismaClient,
): Promise<GameBackfillHashes> {
  const inventory = await inventorySources(prisma);
  return {
    sourceHash: inventory.result.populationHash,
    resultHash: hashCanonical(inventory.classified.map(resultProjection)),
  };
}

function resultProjection(entry: ClassifiedSource): unknown {
  if (entry.bucket === 'quarantined') {
    return { bucket: 'quarantined', quarantine: entry.quarantine };
  }
  if (entry.bucket === 'alreadyImported') {
    return {
      entityType: entry.source.entityType,
      entityId: entry.source.entityId,
      revisionId: entry.revisionId,
      sides: entry.source.sides,
      score: entry.projected,
    };
  }
  // Deliberately excludes the revision id. For these buckets the revision is
  // created by THIS backfill (createImportedGame mints a random uuid), so
  // including it would make resultHash differ between the pre-apply
  // 'inventory' read (null) and the post-apply read (fresh uuid), breaking the
  // harness's `Inventory/apply hashes differ` equality gate on every run.
  // Hashing content only keeps the hash stable across that transition while
  // still reading the PERSISTED score once the revision exists, so a corrupted
  // or non-idempotent result-side write still diverges from the projection.
  return {
    entityType: entry.source.entityType,
    entityId: entry.source.entityId,
    sides: entry.source.sides,
    score: entry.existingRevision?.score ?? entry.source.score,
  };
}

export async function compareGameResultReads(
  prisma: PrismaClient,
): Promise<GameResultComparison> {
  const inventory = await inventorySources(prisma);
  const pairs = inventory.classified.flatMap((entry) => {
    if (entry.bucket === 'quarantined') return [];
    // Compare every non-quarantined source, not just the ones classified as
    // 'alreadyImported' — reconstructable/partial sources that this process
    // has already backfilled (existingRevision set) must still be checked
    // for legacy/projected drift. Sources not yet imported at all compare
    // against their own freshly-computed score (no persisted revision to
    // diverge from yet), which trivially matches.
    const revisionId =
      entry.bucket === 'alreadyImported' ? entry.revisionId : entry.existingRevision?.id;
    const projectedScore =
      entry.bucket === 'alreadyImported'
        ? entry.projected
        : entry.existingRevision?.score ?? entry.source.score;
    return [{
      identity: {
        entityType: entry.source.entityType,
        entityId: entry.source.entityId,
        revisionId: revisionId ?? entry.source.entityId,
      },
      legacy: { score: entry.source.score },
      projected: { score: projectedScore },
    }];
  });

  return compareGameResultSnapshots({
    populationHash: inventory.result.populationHash,
    sourceRows: inventory.result.counts.sourceRows,
    partial: inventory.result.counts.partial,
    quarantined: inventory.result.counts.quarantined,
    pairs,
  });
}

async function inventorySources(client: MigrationReadClient): Promise<Inventory> {
  const [configIds, fixtures, teamMatches] = await Promise.all([
    // Only an ACTIVE config version counts as a verified Task-11 pin — DRAFT
    // (not yet reviewed) and RETIRED (superseded) versions must not let a
    // source pass the config-pin check.
    client.v1CompetitionConfigVersion.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    }),
    client.v1TournamentFixture.findMany({
      where: { status: 'completed' },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        competitionConfigVersionId: true,
        createdAt: true,
        homeRegistration: { select: { team: { select: { id: true, name: true } } } },
        awayRegistration: { select: { team: { select: { id: true, name: true } } } },
        result: {
          select: {
            homeScore: true,
            awayScore: true,
            hasPenalty: true,
            homePenaltyScore: true,
            awayPenaltyScore: true,
            recordedAt: true,
            goals: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              select: {
                team: true,
                playerId: true,
                playerName: true,
                minute: true,
              },
            },
          },
        },
        game: {
          select: {
            currentOfficialRevision: { select: { id: true, score: true, eventsHash: true } },
          },
        },
      },
    }),
    client.v1TeamMatch.findMany({
      where: { status: 'completed' },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        completedAt: true,
        endAt: true,
        createdAt: true,
        deletedAt: true,
        competitionConfigVersionId: true,
        hostTeam: { select: { id: true, name: true } },
        approvedApplicantTeam: { select: { id: true, name: true } },
        game: {
          select: {
            currentOfficialRevision: { select: { id: true, score: true, eventsHash: true } },
          },
        },
      },
    }),
  ]);
  const validConfigIds = new Set(configIds.map((config) => config.id));
  const classified: ClassifiedSource[] = [];

  for (const fixture of fixtures) {
    const hashInput = {
      entityType: 'TOURNAMENT_FIXTURE',
      entityId: fixture.id,
      competitionConfigVersionId: fixture.competitionConfigVersionId,
      createdAt: fixture.createdAt,
      result: fixture.result,
      homeTeamId: fixture.homeRegistration?.team.id ?? null,
      awayTeamId: fixture.awayRegistration?.team.id ?? null,
    };
    if (!validConfigIds.has(fixture.competitionConfigVersionId) || !isValidFixture(fixture)) {
      classified.push({
        bucket: 'quarantined',
        quarantine: {
          sourceType: 'TOURNAMENT_FIXTURE',
          sourceId: fixture.id,
          reason: 'CORRUPT_RESULT',
        },
        hashInput,
      });
      continue;
    }

    const result = fixture.result;
    const source: SourceSnapshot = {
      entityType: 'TOURNAMENT_FIXTURE',
      entityId: fixture.id,
      sourceTimestamp: result.recordedAt,
      competitionConfigVersionId: fixture.competitionConfigVersionId,
      score: {
        regulation: { home: result.homeScore, away: result.awayScore },
        penalty: penaltyScore(result),
        goals: result.goals.map((goal) => ({
          team: goal.team,
          playerId: goal.playerId,
          playerName: goal.playerName,
          minute: goal.minute,
        })),
        incomplete: false,
        provenance: 'TOURNAMENT_FIXTURE_RESULT',
      },
      sides: [
        {
          sideKey: 'HOME',
          teamId: fixture.homeRegistration.team.id,
          displayNameSnapshot: fixture.homeRegistration.team.name,
        },
        {
          sideKey: 'AWAY',
          teamId: fixture.awayRegistration.team.id,
          displayNameSnapshot: fixture.awayRegistration.team.name,
        },
      ],
    };
    classified.push(classifyImported(source, fixture.game?.currentOfficialRevision));
  }

  for (const teamMatch of teamMatches) {
    const sourceTimestamp = teamMatch.completedAt ?? teamMatch.endAt;
    const hashInput = {
      entityType: 'TEAM_MATCH',
      entityId: teamMatch.id,
      competitionConfigVersionId: teamMatch.competitionConfigVersionId,
      createdAt: teamMatch.createdAt,
      completedAt: teamMatch.completedAt,
      endAt: teamMatch.endAt,
      deletedAt: teamMatch.deletedAt,
      hostTeamId: teamMatch.hostTeam.id,
      approvedApplicantTeamId: teamMatch.approvedApplicantTeam?.id ?? null,
    };
    if (teamMatch.deletedAt !== null) {
      classified.push({
        bucket: 'quarantined',
        quarantine: {
          sourceType: 'TEAM_MATCH',
          sourceId: teamMatch.id,
          reason: 'SOURCE_DELETED',
        },
        hashInput,
      });
      continue;
    }
    if (!validConfigIds.has(teamMatch.competitionConfigVersionId) || sourceTimestamp === null) {
      classified.push({
        bucket: 'quarantined',
        quarantine: {
          sourceType: 'TEAM_MATCH',
          sourceId: teamMatch.id,
          reason: 'CORRUPT_RESULT',
        },
        hashInput,
      });
      continue;
    }

    const source: SourceSnapshot = {
      entityType: 'TEAM_MATCH',
      entityId: teamMatch.id,
      sourceTimestamp,
      competitionConfigVersionId: teamMatch.competitionConfigVersionId,
      score: {
        regulation: null,
        penalty: null,
        goals: [],
        incomplete: true,
        provenance: 'TEAM_MATCH_COMPLETION_ONLY',
      },
      sides: [
        {
          sideKey: 'HOME',
          teamId: teamMatch.hostTeam.id,
          displayNameSnapshot: teamMatch.hostTeam.name,
        },
        ...(teamMatch.approvedApplicantTeam
          ? [{
              sideKey: 'AWAY' as const,
              teamId: teamMatch.approvedApplicantTeam.id,
              displayNameSnapshot: teamMatch.approvedApplicantTeam.name,
            }]
          : []),
      ],
    };
    classified.push(classifyImported(source, teamMatch.game?.currentOfficialRevision));
  }

  // Build the quarantine list from original discovery order (fixtures loop
  // before teamMatches loop, above) BEFORE sorting `classified` — the
  // sourceKey sort below is `${entityType}:${entityId}`, and
  // 'TEAM_MATCH' < 'TOURNAMENT_FIXTURE' lexicographically, which would
  // otherwise always reorder a deleted-team-match quarantine entry ahead of
  // a corrupt-fixture one regardless of discovery order.
  const quarantine = classified.flatMap((entry) =>
    entry.bucket === 'quarantined' ? [entry.quarantine] : [],
  );

  classified.sort((left, right) => sourceKey(left).localeCompare(sourceKey(right)));
  const counts = {
    sourceRows: classified.length,
    reconstructable: classified.filter((entry) => entry.bucket === 'reconstructable').length,
    partial: classified.filter((entry) => entry.bucket === 'partial').length,
    alreadyImported: classified.filter((entry) => entry.bucket === 'alreadyImported').length,
    quarantined: classified.filter((entry) => entry.bucket === 'quarantined').length,
  };
  const populationHash = hashCanonical(
    classified.map((entry) =>
      entry.bucket === 'quarantined'
        ? { bucket: entry.bucket, quarantine: entry.quarantine, source: entry.hashInput }
        : { source: entry.source },
    ),
  );

  return {
    classified,
    result: {
      counts,
      populationHash,
      inserted: counts.reconstructable + counts.partial,
      quarantine,
    },
  };
}

function classifyImported(
  source: SourceSnapshot,
  revision: { id: string; score: Prisma.JsonValue; eventsHash: string } | null | undefined,
): ClassifiedSource {
  // `createdByActorType`/`createdBySystemActor` alone cannot distinguish
  // "already imported before this backfill process started" from "a prior
  // apply call in THIS migration created it" — a genuinely pre-existing
  // legacy import can legitimately carry the same GAME_BACKFILL system
  // actor label. Instead, compare the revision's eventsHash against the
  // exact deterministic hash createImportedGame() computes for THIS
  // source (see below): only a revision this process itself authored for
  // this exact entityType/entityId will match it. If it matches, the
  // source stays bucketed as reconstructable/partial (not alreadyImported)
  // so repeated apply calls keep reporting identical eligibility counts —
  // an entry this process already imported must never re-enter
  // 'alreadyImported' on a later inventorySources() read.
  const selfAuthoredEventsHash = createImportedGameEventsHash(source);
  if (revision && revision.eventsHash !== selfAuthoredEventsHash) {
    return {
      bucket: 'alreadyImported',
      source,
      revisionId: revision.id,
      projected: revision.score,
    };
  }
  return {
    bucket: source.score.incomplete ? 'partial' : 'reconstructable',
    source,
    existingRevision: revision ? { id: revision.id, score: revision.score } : null,
  };
}

function createImportedGameEventsHash(source: SourceSnapshot): string {
  return hashCanonical({ source: source.entityType, id: source.entityId, events: [] });
}

function isValidFixture(fixture: {
  result: {
    homeScore: number;
    awayScore: number;
    hasPenalty: boolean;
    homePenaltyScore: number | null;
    awayPenaltyScore: number | null;
    recordedAt: Date;
    goals: Array<{
      team: 'home' | 'away';
      playerName: string;
      minute: number | null;
    }>;
  } | null;
  homeRegistration: { team: { id: string; name: string } } | null;
  awayRegistration: { team: { id: string; name: string } } | null;
}): fixture is typeof fixture & {
  result: NonNullable<typeof fixture.result>;
  homeRegistration: NonNullable<typeof fixture.homeRegistration>;
  awayRegistration: NonNullable<typeof fixture.awayRegistration>;
} {
  const result = fixture.result;
  if (!result || !fixture.homeRegistration || !fixture.awayRegistration) return false;
  if (!isNonnegativeInteger(result.homeScore) || !isNonnegativeInteger(result.awayScore)) return false;
  const penaltyComplete =
    result.hasPenalty &&
    isNonnegativeInteger(result.homePenaltyScore) &&
    isNonnegativeInteger(result.awayPenaltyScore);
  const penaltyAbsent =
    !result.hasPenalty &&
    result.homePenaltyScore === null &&
    result.awayPenaltyScore === null;
  if (!penaltyComplete && !penaltyAbsent) return false;
  return result.goals.every((goal) =>
    (goal.team === 'home' || goal.team === 'away') &&
    goal.playerName.trim().length > 0 &&
    (goal.minute === null || isNonnegativeInteger(goal.minute)),
  );
}

function isNonnegativeInteger(value: number | null): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function penaltyScore(result: {
  hasPenalty: boolean;
  homePenaltyScore: number | null;
  awayPenaltyScore: number | null;
}): { home: number; away: number } | null {
  if (!result.hasPenalty) return null;
  if (
    !isNonnegativeInteger(result.homePenaltyScore) ||
    !isNonnegativeInteger(result.awayPenaltyScore)
  ) {
    throw new Error('Validated fixture has an invalid penalty score');
  }
  return { home: result.homePenaltyScore, away: result.awayPenaltyScore };
}

async function createImportedGame(
  transaction: Prisma.TransactionClient,
  source: SourceSnapshot,
): Promise<void> {
  const gameId = randomUUID();
  const revisionId = randomUUID();
  await transaction.v1Game.create({
    data: {
      id: gameId,
      sourceType: source.entityType,
      teamMatchId: source.entityType === 'TEAM_MATCH' ? source.entityId : null,
      tournamentFixtureId:
        source.entityType === 'TOURNAMENT_FIXTURE' ? source.entityId : null,
      state: 'ENDED',
      version: 1,
      competitionConfigVersionId: source.competitionConfigVersionId,
      createdAt: source.sourceTimestamp,
      sides: {
        create: source.sides.map((side) => ({
          sideKey: side.sideKey,
          teamId: side.teamId,
          displayNameSnapshot: side.displayNameSnapshot,
          createdAt: source.sourceTimestamp,
        })),
      },
      resultRevisions: {
        create: {
          id: revisionId,
          revision: 1,
          state: 'OFFICIAL',
          score: source.score,
          eventsHash: createImportedGameEventsHash(source),
          missingScorer: false,
          createdByActorType: 'SYSTEM',
          createdByUserId: null,
          createdBySystemActor: 'GAME_BACKFILL',
          submittedAt: source.sourceTimestamp,
          officialAt: source.sourceTimestamp,
          createdAt: source.sourceTimestamp,
        },
      },
    },
  });
  await transaction.v1Game.update({
    where: { id: gameId },
    data: { currentOfficialRevisionId: revisionId },
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
  throw new Error('Serializable backfill retry limit was exhausted');
}

function isRetryableTransactionConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2034' || error.code === 'P2002')
  );
}

function sourceKey(entry: ClassifiedSource): string {
  if (entry.bucket === 'quarantined') {
    return `${entry.quarantine.sourceType}:${entry.quarantine.sourceId}`;
  }
  return `${entry.source.entityType}:${entry.source.entityId}`;
}

function hashCanonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error('Backfill source is not JSON serializable');
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

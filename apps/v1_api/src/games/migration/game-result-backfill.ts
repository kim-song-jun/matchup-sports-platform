import { Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import {
  compareGameResultSnapshots,
  type SnapshotPair,
  type GameResultComparison,
  type GameResultEntityType,
} from './compare-game-result-reads';

export type GameBackfillQuarantine = {
  sourceType: GameResultEntityType;
  sourceId: string;
  // 'INCOMPLETE_PROJECTED_GAME': a V1Game row exists for this source but has
  // no currentOfficialRevision — this must never be treated as "not yet
  // imported" (which would attempt to create a second Game row for the same
  // source and either collide on the unique teamMatchId/tournamentFixtureId
  // constraint or, worse, silently duplicate it). See hasIncompleteProjectedGame().
  reason: 'CORRUPT_RESULT' | 'SOURCE_DELETED' | 'INCOMPLETE_PROJECTED_GAME';
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
 * hashes the RESULT side: for a source with a persisted GAME_BACKFILL-authored
 * game+revision (this run's insert, or a prior apply call), the hash reads
 * the ACTUAL PERSISTED content back from the database — game
 * state/version/sourceType/competitionConfigVersionId/createdAt, every
 * persisted V1GameSide row, and the persisted revision's
 * state/score/missingScorer/actor/submittedAt/officialAt/createdAt (score is
 * runtime-validated: a persisted JSON `null` or malformed score is never
 * silently substituted with the source value — see validatePersistedScore()).
 * For a source not yet persisted by any apply call, the hash instead projects
 * what createImportedGame() would deterministically write for that exact
 * source (see expectedPersistedContent()), which is why this hash stays
 * stable across the pre-apply 'inventory' read and the post-apply re-read as
 * long as nothing was corrupted in between — but a corruption of ANY of the
 * fields above (not just score) now changes resultHash, closing the earlier
 * gap where corruption confined to persisted sides/game/revision metadata
 * went undetected because only the source-recomputed score was hashed.
 */
export type GameBackfillHashes = {
  sourceHash: string;
  resultHash: string;
};

export type GameBackfillEvidence = {
  result: GameBackfillRunResult;
  hashes: GameBackfillHashes;
  comparison: GameResultComparison;
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

// Structural shape of the `game` relation as selected by inventorySources()
// below. Declared independently (rather than derived from Prisma's generated
// payload types) so classifyImported()/persistedGameContent() stay decoupled
// from the exact query shape, matching this file's existing convention (see
// isValidFixture()).
type PersistedRevisionFields = {
  id: string;
  state: string;
  score: Prisma.JsonValue;
  eventsHash: string;
  missingScorer: boolean;
  createdByActorType: string;
  createdByUserId: string | null;
  createdBySystemActor: string | null;
  submittedAt: Date | null;
  officialAt: Date | null;
  createdAt: Date;
};

type PersistedGameFields = {
  state: string;
  version: number;
  sourceType: string;
  competitionConfigVersionId: string;
  createdAt: Date;
  sides: Array<{
    sideKey: string;
    teamId: string | null;
    displayNameSnapshot: string;
    createdAt: Date;
  }>;
  currentOfficialRevision: PersistedRevisionFields | null;
};

// Same as PersistedGameFields but with currentOfficialRevision narrowed to
// non-null — the only shape ClassifiedSource ever stores, since a Game with a
// null currentOfficialRevision is quarantined as INCOMPLETE_PROJECTED_GAME
// before classifyImported() is reached (see hasIncompleteProjectedGame()).
type PersistedGame = Omit<PersistedGameFields, 'currentOfficialRevision'> & {
  currentOfficialRevision: PersistedRevisionFields;
};

type ClassifiedSource =
  | {
      bucket: 'reconstructable' | 'partial';
      source: SourceSnapshot;
      // Non-null when a prior apply call within this same migration (this
      // run or an earlier one) already persisted a GAME_BACKFILL-authored
      // game+revision for this source. Kept orthogonal to `bucket` so
      // eligibility counts stay stable across reruns (see classifyImported)
      // while comparison/result-hash logic can still see the actually
      // persisted state instead of recomputing from source.
      persistedGame: PersistedGame | null;
    }
  | { bucket: 'alreadyImported'; source: SourceSnapshot; persistedGame: PersistedGame }
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

const IMPORTED_GAME_STATE = 'ENDED' as const;
const IMPORTED_GAME_VERSION = 1 as const;
const IMPORTED_REVISION_STATE = 'OFFICIAL' as const;
const IMPORTED_REVISION_ACTOR_TYPE = 'SYSTEM' as const;
const IMPORTED_REVISION_SYSTEM_ACTOR = 'GAME_BACKFILL' as const;

export async function runGameResultBackfill(
  prisma: PrismaClient,
  input: { mode: 'dry-run' | 'apply' },
): Promise<GameBackfillRunResult> {
  if (input.mode === 'dry-run') {
    return (await snapshotInventory(prisma)).result;
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
      if (entry.persistedGame) continue;
      await createImportedGame(transaction, entry.source);
      inserted += 1;
    }
    return { ...inventory.result, inserted };
  });
}

/**
 * Computes the two 64-hex hashes the CLI/CI contract requires. See the
 * GameBackfillHashes type doc above for exactly what resultHash covers.
 *
 * Exposed as a standalone read so callers (e.g. a CLI wrapper) can obtain
 * both hashes without changing the shape of GameBackfillRunResult, which is
 * pinned by existing integration coverage.
 */
export async function computeGameBackfillHashes(
  prisma: PrismaClient,
): Promise<GameBackfillHashes> {
  return buildHashes(await snapshotInventory(prisma));
}

export async function compareGameResultReads(
  prisma: PrismaClient,
): Promise<GameResultComparison> {
  return buildComparison(await snapshotInventory(prisma));
}

/**
 * Combined evidence for one CLI invocation: result/hashes/comparison all
 * derived from a SINGLE inventory snapshot — for 'apply', from the
 * post-insert state re-read inside the SAME serializable transaction that
 * performed the insert, rather than a separate, later, non-transactional
 * call. This closes the cross-call inconsistency window that calling
 * runGameResultBackfill() + computeGameBackfillHashes() (+ a separate
 * compareGameResultReads()) as independent statements/transactions leaves
 * open: each of those, called separately, can observe a different DB
 * snapshot if a concurrent write lands between them, so counts/hashes can
 * describe different populations while still coincidentally reporting the
 * same totals.
 *
 * Exported so a caller (CLI, operations endpoint) can adopt this in place of
 * three separate calls; until it does, this function has no effect on
 * whatever evidence that caller already emits.
 */
export async function runGameResultBackfillEvidence(
  prisma: PrismaClient,
  input: { mode: 'dry-run' | 'apply' },
): Promise<GameBackfillEvidence> {
  if (input.mode === 'dry-run') {
    const inventory = await snapshotInventory(prisma);
    return {
      result: inventory.result,
      hashes: buildHashes(inventory),
      comparison: buildComparison(inventory),
    };
  }

  return withSerializableRetry(prisma, async (transaction) => {
    const preInsert = await inventorySources(transaction);
    let inserted = 0;
    for (const entry of preInsert.classified) {
      if (entry.bucket !== 'reconstructable' && entry.bucket !== 'partial') continue;
      if (entry.persistedGame) continue;
      await createImportedGame(transaction, entry.source);
      inserted += 1;
    }
    // Re-read within the SAME transaction (same DB snapshot, now including
    // this call's own writes) so hashes/comparison reflect what was actually
    // just persisted rather than the pre-insert view.
    const postInsert = inserted > 0 ? await inventorySources(transaction) : preInsert;
    return {
      result: { ...postInsert.result, inserted },
      hashes: buildHashes(postInsert),
      comparison: buildComparison(postInsert),
    };
  });
}

// A read-only serializable snapshot so population/result hashes and
// comparison pairs are all derived from ONE consistent view of the
// database — not three independent statements (config versions / fixtures /
// team matches, each via its own READ COMMITTED read) that could each
// observe a different concurrent write. Reuses withSerializableRetry() (safe
// for a pure read: no side effects to worry about on retry) so the rare SSI
// abort a read-only serializable transaction can still hit under concurrent
// writes doesn't turn into a flake with no retry.
async function snapshotInventory(prisma: PrismaClient): Promise<Inventory> {
  return withSerializableRetry(prisma, (transaction) => inventorySources(transaction));
}

function buildHashes(inventory: Inventory): GameBackfillHashes {
  return {
    sourceHash: inventory.result.populationHash,
    resultHash: hashCanonical(inventory.classified.map(resultProjection)),
  };
}

function buildComparison(inventory: Inventory): GameResultComparison {
  const pairs = inventory.classified.flatMap(buildComparisonPairs);
  return compareGameResultSnapshots({
    populationHash: inventory.result.populationHash,
    sourceRows: inventory.result.counts.sourceRows,
    partial: inventory.result.counts.partial,
    quarantined: inventory.result.counts.quarantined,
    pairs,
  });
}

function resultProjection(entry: ClassifiedSource): unknown {
  if (entry.bucket === 'quarantined') {
    return { bucket: 'quarantined', quarantine: entry.quarantine };
  }
  if (entry.persistedGame) {
    return {
      entityType: entry.source.entityType,
      entityId: entry.source.entityId,
      persisted: persistedGameContent(entry.persistedGame),
    };
  }
  // Not yet persisted by any apply call — project what createImportedGame()
  // would deterministically write for this exact source. This keeps the
  // hash stable across the pre-apply 'inventory' read (this branch) and the
  // post-apply re-read (the `persistedGame` branch above) as long as the
  // actual write matches this projection unchanged, while still reading the
  // REAL persisted content once a revision exists, so a corrupted or
  // non-idempotent write still diverges from the projection.
  return {
    entityType: entry.source.entityType,
    entityId: entry.source.entityId,
    persisted: expectedPersistedContent(entry.source),
  };
}

// Explicit return type on purpose. Without it TypeScript infers a union of two DIFFERENT array
// types (the missing-projection shape and the projected shape), and `Array.flatMap`'s callback
// signature wants `U | readonly U[]` - a union of two array types does not satisfy it (TS2345).
// Annotating with the consumer's own SnapshotPair also makes the compiler enforce the contract
// here at the producer rather than at the call site.
function buildComparisonPairs(entry: ClassifiedSource): SnapshotPair[] {
  if (entry.bucket === 'quarantined') return [];

  if (!entry.persistedGame) {
    // No persisted projection exists yet for this source (never imported by
    // any apply call). This must NOT be compared against the source itself —
    // that previously made every not-yet-imported source count as a trivial
    // "match" purely by construction, before any actual comparison happened.
    // `missingProjection: true` forces this pair to be reported as an
    // unconditional mismatch instead (see compare-game-result-reads.ts). The
    // revisionId placeholder is a distinguishable, non-fabricated marker —
    // never presented as if it were a real revision id.
    return [
      {
        identity: {
          entityType: entry.source.entityType,
          entityId: entry.source.entityId,
          revisionId: `pending-import:${entry.source.entityId}`,
        },
        legacy: { score: entry.source.score },
        projected: null,
        missingProjection: true,
      },
    ];
  }

  return [
    {
      identity: {
        entityType: entry.source.entityType,
        entityId: entry.source.entityId,
        revisionId: entry.persistedGame.currentOfficialRevision.id,
      },
      legacy: { score: entry.source.score },
      projected: { score: validatePersistedScore(entry.persistedGame.currentOfficialRevision.score) },
    },
  ];
}

function sortedSides<T extends { sideKey: string }>(sides: readonly T[]): T[] {
  return [...sides].sort((left, right) => left.sideKey.localeCompare(right.sideKey));
}

function expectedPersistedContent(source: SourceSnapshot): unknown {
  return {
    state: IMPORTED_GAME_STATE,
    version: IMPORTED_GAME_VERSION,
    sourceType: source.entityType,
    competitionConfigVersionId: source.competitionConfigVersionId,
    createdAt: source.sourceTimestamp,
    sides: sortedSides(source.sides.map((side) => ({ ...side, createdAt: source.sourceTimestamp }))),
    revision: {
      state: IMPORTED_REVISION_STATE,
      score: source.score,
      missingScorer: computeMissingScorer(source.score),
      createdByActorType: IMPORTED_REVISION_ACTOR_TYPE,
      createdByUserId: null,
      createdBySystemActor: IMPORTED_REVISION_SYSTEM_ACTOR,
      submittedAt: source.sourceTimestamp,
      officialAt: source.sourceTimestamp,
      createdAt: source.sourceTimestamp,
    },
  };
}

function persistedGameContent(game: PersistedGame): unknown {
  const revision = game.currentOfficialRevision;
  return {
    state: game.state,
    version: game.version,
    sourceType: game.sourceType,
    competitionConfigVersionId: game.competitionConfigVersionId,
    createdAt: game.createdAt,
    sides: sortedSides(game.sides),
    revision: {
      state: revision.state,
      score: validatePersistedScore(revision.score),
      missingScorer: revision.missingScorer,
      createdByActorType: revision.createdByActorType,
      createdByUserId: revision.createdByUserId,
      createdBySystemActor: revision.createdBySystemActor,
      submittedAt: revision.submittedAt,
      officialAt: revision.officialAt,
      createdAt: revision.createdAt,
    },
  };
}

const INVALID_PERSISTED_SCORE_MARKER = '__gameBackfillInvalidPersistedScore' as const;

// Runtime guard over the persisted `V1GameResultRevision.score` JSONB
// column. The DB has no shape constraint on this column, so a corrupted or
// hand-edited row (JSON `null`, a truncated object, an unrelated shape) must
// never be treated as if it were a normal ScoreSnapshot. Previously
// `entry.existingRevision?.score ?? entry.source.score` silently replaced a
// corrupted persisted `null`/garbage value with the (unrelated) source
// score, so both resultHash and compare-read stayed green. Returning a
// distinct marker object for anything that fails this shape check means
// corruption always changes resultHash (it can never coincidentally collapse
// back to looking like the source) and always produces a real structural
// mismatch in compareGameResultReads() rather than silently matching.
function validatePersistedScore(value: Prisma.JsonValue): unknown {
  if (!isValidScoreShape(value)) {
    return { [INVALID_PERSISTED_SCORE_MARKER]: true, raw: value };
  }
  return value;
}

function isValidScoreShape(value: Prisma.JsonValue): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.incomplete !== 'boolean') return false;
  if (typeof record.provenance !== 'string') return false;
  if (!Array.isArray(record.goals)) return false;
  if (record.regulation !== null && !isPlainObject(record.regulation)) return false;
  if (record.penalty !== null && !isPlainObject(record.penalty)) return false;
  return true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A tournament fixture's `regulation` score can be recorded while its
// enumerated goal rows are an incomplete subset (e.g. only 2 of 4 actual
// goals ever made it into the legacy goals table). Previously every import
// hardcoded `missingScorer: false`, certifying that incomplete goal history
// as a complete scorer breakdown. Reconciling the enumerated goal counts
// against the recorded regulation score makes that honest: a mismatch (or no
// regulation score at all, or the already-`incomplete` team-match-completion
// case) is flagged via `missingScorer: true` instead of silently dropped.
function computeMissingScorer(score: ScoreSnapshot): boolean {
  if (score.incomplete || score.regulation === null) return true;
  const homeGoals = score.goals.filter((goal) => goal.team === 'home').length;
  const awayGoals = score.goals.filter((goal) => goal.team === 'away').length;
  return homeGoals !== score.regulation.home || awayGoals !== score.regulation.away;
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
            state: true,
            version: true,
            sourceType: true,
            competitionConfigVersionId: true,
            createdAt: true,
            sides: {
              select: { sideKey: true, teamId: true, displayNameSnapshot: true, createdAt: true },
            },
            currentOfficialRevision: {
              select: {
                id: true,
                state: true,
                score: true,
                eventsHash: true,
                missingScorer: true,
                createdByActorType: true,
                createdByUserId: true,
                createdBySystemActor: true,
                submittedAt: true,
                officialAt: true,
                createdAt: true,
              },
            },
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
            state: true,
            version: true,
            sourceType: true,
            competitionConfigVersionId: true,
            createdAt: true,
            sides: {
              select: { sideKey: true, teamId: true, displayNameSnapshot: true, createdAt: true },
            },
            currentOfficialRevision: {
              select: {
                id: true,
                state: true,
                score: true,
                eventsHash: true,
                missingScorer: true,
                createdByActorType: true,
                createdByUserId: true,
                createdBySystemActor: true,
                submittedAt: true,
                officialAt: true,
                createdAt: true,
              },
            },
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
    if (hasIncompleteProjectedGame(fixture.game)) {
      classified.push({
        bucket: 'quarantined',
        quarantine: {
          sourceType: 'TOURNAMENT_FIXTURE',
          sourceId: fixture.id,
          reason: 'INCOMPLETE_PROJECTED_GAME',
        },
        hashInput,
      });
      continue;
    }
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
    classified.push(classifyImported(source, fixture.game));
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
    if (hasIncompleteProjectedGame(teamMatch.game)) {
      classified.push({
        bucket: 'quarantined',
        quarantine: {
          sourceType: 'TEAM_MATCH',
          sourceId: teamMatch.id,
          reason: 'INCOMPLETE_PROJECTED_GAME',
        },
        hashInput,
      });
      continue;
    }
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
    classified.push(classifyImported(source, teamMatch.game));
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

// A Game row that exists but has no currentOfficialRevision is a distinct,
// invalid state — not "no game" (which would make apply attempt to create a
// second Game row for the same source) and not "normally imported" (there is
// no revision to read a score from). It must be quarantined explicitly
// rather than falling through classifyImported()'s null-revision branch,
// which is reserved for "nothing has been imported for this source yet".
function hasIncompleteProjectedGame(
  game: { currentOfficialRevision: unknown } | null | undefined,
): boolean {
  return game != null && game.currentOfficialRevision == null;
}

function classifyImported(
  source: SourceSnapshot,
  game: PersistedGameFields | null | undefined,
): ClassifiedSource {
  // Callers only reach this function after hasIncompleteProjectedGame() has
  // already quarantined the "game exists but no current revision" case, so
  // `game` here is either absent entirely or carries a real revision.
  const revision = game?.currentOfficialRevision ?? null;
  const persistedGame: PersistedGame | null =
    game && revision ? { ...game, currentOfficialRevision: revision } : null;

  // Binds this revision to BOTH the exact source identity and its exact
  // content (score + sides) at the moment this migration computed it —
  // deliberately not just entity identity, which would only prove "some
  // GAME_BACKFILL revision exists for this source", not "this revision's
  // content still matches the CURRENT legacy source". If the legacy
  // score/goals/sides are later corrected upstream, classifyImported()
  // recomputes this hash against the NEW source content; it no longer
  // equals the OLD persisted eventsHash, so the entry falls through to the
  // 'alreadyImported' bucket instead of being silently treated as still up
  // to date — which in turn makes compareGameResultReads() compare the
  // (stale) persisted score against the (updated) legacy source and surface
  // the drift as a real mismatch, rather than papering over it.
  const selfAuthoredEventsHash = createImportedGameEventsHash(source);
  if (revision && revision.eventsHash !== selfAuthoredEventsHash) {
    return { bucket: 'alreadyImported', source, persistedGame: persistedGame as PersistedGame };
  }
  return {
    bucket: source.score.incomplete ? 'partial' : 'reconstructable',
    source,
    persistedGame,
  };
}

function createImportedGameEventsHash(source: SourceSnapshot): string {
  return hashCanonical({
    migration: 'GAME_BACKFILL_V1',
    source: source.entityType,
    id: source.entityId,
    score: source.score,
    sides: source.sides,
  });
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
      state: IMPORTED_GAME_STATE,
      version: IMPORTED_GAME_VERSION,
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
          state: IMPORTED_REVISION_STATE,
          score: source.score,
          eventsHash: createImportedGameEventsHash(source),
          missingScorer: computeMissingScorer(source.score),
          createdByActorType: IMPORTED_REVISION_ACTOR_TYPE,
          createdByUserId: null,
          createdBySystemActor: IMPORTED_REVISION_SYSTEM_ACTOR,
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

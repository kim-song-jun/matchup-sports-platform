import { AdminContextService } from '../../common/admin-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import { V1AuthUser } from '../../auth/v1-auth-user';
import {
  CompetitionConfig,
  competitionConfigContentHash,
  validateCompetitionConfig,
} from './competition-config';
import { canonicalize } from './competition-config.validator';
import {
  FOOTBALL_COMPETITION_CONFIG_ID,
  FUTSAL_COMPETITION_CONFIG_ID,
} from './competition-config-backfill';
import { CompetitionConfigRegistry } from './competition-config-registry';
import { TournamentCompetitionConfig } from './tournament-competition-config';
import { FOOTBALL_V1_CONFIG, FUTSAL_V1_CONFIG } from './competition-config.presets';

/**
 * Publishes a canonical-matching successor for a drifted well-known
 * competition-config seed row (see CompetitionConfigSeedDriftError in
 * ./competition-config-backfill.ts for how that drift is first detected) and
 * repoints every still-mutable tournament/team match/fixture off it — using
 * the EXISTING product mutation paths
 * (CompetitionConfigRegistry.createVersion / TournamentCompetitionConfig.change,
 * both reachable in production through TournamentBracketService), not a
 * reimplementation of them. This module is the orchestration/decision layer
 * on top: which of the two known seeds actually need this, whether the drift
 * is safe to resolve automatically, and driving the existing two-step
 * confirm-recalculation dance change() already requires for tournaments with
 * completed fixtures.
 *
 * Deliberately does NOT touch prisma/migrations/ — this is a one-time data
 * repair, not schema, and per
 * docs/ops/task9-competition-config-contract-phase.md the expand/contract
 * alpha rollback gate (scripts/qa/check-expand-contract-migrations.mjs)
 * rejects any DML in a migration file regardless of whether the target table
 * is new. Same split Task 9/10/D-21 already established: schema stays
 * additive-only, one-time data repairs run as a post-deploy CLI (see
 * competition-config-version-repoint.cli.ts).
 *
 * Safety boundary this module enforces and will not cross automatically:
 * `result`/`tieBreak` are the two CompetitionConfig sections that actually
 * determine how a game is scored (points, tie-break order, scorer/MVP
 * requirements). If the canonical preset's `result` or `tieBreak` no longer
 * matches what is stored, publishing a successor and repointing active
 * tournaments onto it would change how NOT-YET-completed games in those
 * tournaments get scored going forward, without a human ever having decided
 * that was intended — so that seed is left untouched and reported as
 * `blocked_scoring_drift` instead. Every other section (periods, events,
 * lineup, visibility) only affects UI/format concerns, not the score itself,
 * so drift limited to those is safe to resolve unattended.
 *
 * Because this module refuses to touch anything with `result`/`tieBreak`
 * drift, and because TournamentCompetitionConfig.change() already recomputes
 * standings from the tournament's OWN existing V1TournamentStanding table
 * (not from this module), a repoint this module actually performs is
 * provably scoring-neutral — recalculateStandings() is deliberately not
 * called here; there is nothing for it to change.
 */

export type ConfigSectionKey = keyof CompetitionConfig;

export const CONFIG_SECTION_KEYS: readonly ConfigSectionKey[] = [
  'periods',
  'events',
  'lineup',
  'result',
  'tieBreak',
  'visibility',
];

// The two sections that determine how a game is actually scored — see the
// module doc comment above for why these (and only these) block automatic
// resolution.
export const SCORING_SECTION_KEYS: readonly ConfigSectionKey[] = ['result', 'tieBreak'];

export type CompetitionConfigRepointSeed = {
  /** The well-known id this seed was originally created with (informational — lookups below key off sportCode+name, not this id). */
  id: string;
  sportCode: string;
  name: string;
  config: CompetitionConfig;
};

export const COMPETITION_CONFIG_VERSION_REPOINT_SEEDS: readonly CompetitionConfigRepointSeed[] = [
  { id: FOOTBALL_COMPETITION_CONFIG_ID, sportCode: 'football', name: 'football-v1', config: FOOTBALL_V1_CONFIG },
  { id: FUTSAL_COMPETITION_CONFIG_ID, sportCode: 'futsal', name: 'futsal-v1', config: FUTSAL_V1_CONFIG },
];

export type CompetitionConfigVersionRepointOutcome =
  | { seedName: string; sportCode: string; status: 'not_seeded' }
  | { seedName: string; sportCode: string; status: 'up_to_date'; currentVersionId: string; currentVersion: number }
  | {
      seedName: string;
      sportCode: string;
      status: 'blocked_scoring_drift';
      currentVersionId: string;
      changedSections: ConfigSectionKey[];
      scoringSectionsChanged: ConfigSectionKey[];
    }
  | {
      // content_hash is globally unique across v1_competition_config_versions
      // (not scoped per sportCode/name — see schema.prisma), so it is possible
      // for the canonical content this seed wants to publish to already be
      // byte-identical to some UNRELATED lineage's version (pure coincidence,
      // or that lineage happened to converge on the same rules). Reusing that
      // row would be wrong (different sportCode/name — TournamentCompetitionConfig
      // .change() would itself then reject it with COMPETITION_CONFIG_SPORT_MISMATCH
      // for a cross-sport case, but silently repointing within a matching
      // sportCode onto someone else's unrelated named lineage is still a
      // decision this module has no basis to make on its own), so this is
      // reported and nothing is touched instead.
      seedName: string;
      sportCode: string;
      status: 'blocked_content_hash_collision';
      currentVersionId: string;
      canonicalContentHash: string;
      collidingVersionId: string;
      collidingSportCode: string;
      collidingName: string;
    }
  | {
      seedName: string;
      sportCode: string;
      status: 'would_repoint' | 'repointed';
      previousVersionId: string;
      newVersionId: string | null;
      newVersion: number;
      // True only when this run actually created a new v1_competition_config_versions
      // row. False both when nothing needed publishing AND when the canonical
      // content turned out to already exist as an OLDER version in the SAME
      // (sportCode, name) lineage (a prior publish that was later superseded by
      // something else, and is now being reverted to) — that existing row is
      // reused as the repoint target instead of attempting a duplicate create,
      // which content_hash's uniqueness constraint would reject outright.
      published: boolean;
      tournamentsRepointed: number;
      teamMatchesRepointed: number;
      tournamentIds: string[];
    };

type LatestVersionRow = {
  id: string;
  version: number;
  contentHash: string;
  periods: unknown;
  events: unknown;
  lineup: unknown;
  result: unknown;
  tieBreak: unknown;
  visibility: unknown;
};

function changedSectionsOf(stored: CompetitionConfig, canonical: CompetitionConfig): ConfigSectionKey[] {
  return CONFIG_SECTION_KEYS.filter((key) => canonicalize(stored[key]) !== canonicalize(canonical[key]));
}

/**
 * Everything a stale version in this lineage could still be pinned to that
 * this module is willing to move: the tournament's own pointer (always —
 * TournamentCompetitionConfig.change() does not special-case a fully
 * completed tournament, matching the existing product behavior this module
 * only drives, never reimplements) and any NOT-YET-completed team match. A
 * completed team match is left exactly where fixtures are left in change()
 * itself, for the identical reason: it already happened under the old rules.
 */
async function findRepointTargets(
  prisma: PrismaService,
  sportCode: string,
  name: string,
  canonicalContentHash: string,
): Promise<{ staleVersionIds: string[]; tournamentIds: string[]; teamMatchCandidateCount: number }> {
  const staleRows = await prisma.v1CompetitionConfigVersion.findMany({
    where: { sportCode, name, contentHash: { not: canonicalContentHash } },
    select: { id: true },
  });
  const staleVersionIds = staleRows.map((row) => row.id);
  if (staleVersionIds.length === 0) {
    return { staleVersionIds, tournamentIds: [], teamMatchCandidateCount: 0 };
  }
  const [tournaments, teamMatchCandidateCount] = await Promise.all([
    prisma.v1Tournament.findMany({
      where: { competitionConfigVersionId: { in: staleVersionIds }, deletedAt: null },
      select: { id: true },
    }),
    prisma.v1TeamMatch.count({
      where: { competitionConfigVersionId: { in: staleVersionIds }, status: { not: 'completed' } },
    }),
  ]);
  return { staleVersionIds, tournamentIds: tournaments.map((t) => t.id), teamMatchCandidateCount };
}

async function processSeed(
  prisma: PrismaService,
  adminContext: AdminContextService,
  seed: CompetitionConfigRepointSeed,
  mode: 'dry-run' | 'apply',
  actor: V1AuthUser | undefined,
): Promise<CompetitionConfigVersionRepointOutcome> {
  const latest: LatestVersionRow | null = await prisma.v1CompetitionConfigVersion.findFirst({
    where: { sportCode: seed.sportCode, name: seed.name },
    orderBy: { version: 'desc' },
    select: {
      id: true,
      version: true,
      contentHash: true,
      periods: true,
      events: true,
      lineup: true,
      result: true,
      tieBreak: true,
      visibility: true,
    },
  });
  if (!latest) {
    // Nothing to repoint yet — seedCompetitionConfigVersions() owns creating
    // the first version of a lineage; this module only ever publishes a
    // SUCCESSOR to an existing one.
    return { seedName: seed.name, sportCode: seed.sportCode, status: 'not_seeded' };
  }

  const canonicalContentHash = competitionConfigContentHash(seed.config);
  const needsPublish = latest.contentHash !== canonicalContentHash;

  if (needsPublish) {
    const storedConfig = validateCompetitionConfig({
      periods: latest.periods,
      events: latest.events,
      lineup: latest.lineup,
      result: latest.result,
      tieBreak: latest.tieBreak,
      visibility: latest.visibility,
    });
    const changedSections = changedSectionsOf(storedConfig, seed.config);
    const scoringSectionsChanged = changedSections.filter((key) =>
      (SCORING_SECTION_KEYS as ConfigSectionKey[]).includes(key),
    );
    if (scoringSectionsChanged.length > 0) {
      return {
        seedName: seed.name,
        sportCode: seed.sportCode,
        status: 'blocked_scoring_drift',
        currentVersionId: latest.id,
        changedSections,
        scoringSectionsChanged,
      };
    }
  }

  // Resolve what publishing the canonical content would actually mean BEFORE
  // touching anything — shared by dry-run and apply so both report the exact
  // same decision (reuse and collision detection included, not just the
  // create-vs-noop choice the earlier `needsPublish` alone captures).
  let willPublish = needsPublish;
  let resolvedVersionId = latest.id;
  let resolvedVersion = latest.version;
  if (needsPublish) {
    // Same-lineage reuse: the canonical content already exists as an OLDER
    // version of THIS SAME (sportCode, name) lineage (not `latest`, or
    // `needsPublish` would be false) -- a prior publish later superseded by
    // something else, now being reverted to. Safe to reuse without a human:
    // it is still a version this exact lineage's admins already published.
    const sameLineageMatch = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { sportCode: seed.sportCode, name: seed.name, contentHash: canonicalContentHash },
      select: { id: true, version: true },
    });
    if (sameLineageMatch) {
      willPublish = false;
      resolvedVersionId = sameLineageMatch.id;
      resolvedVersion = sameLineageMatch.version;
    } else {
      const globalCollision = await prisma.v1CompetitionConfigVersion.findUnique({
        where: { contentHash: canonicalContentHash },
        select: { id: true, sportCode: true, name: true },
      });
      if (globalCollision) {
        return {
          seedName: seed.name,
          sportCode: seed.sportCode,
          status: 'blocked_content_hash_collision',
          currentVersionId: latest.id,
          canonicalContentHash,
          collidingVersionId: globalCollision.id,
          collidingSportCode: globalCollision.sportCode,
          collidingName: globalCollision.name,
        };
      }
    }
  }

  const { staleVersionIds, tournamentIds, teamMatchCandidateCount } = await findRepointTargets(
    prisma,
    seed.sportCode,
    seed.name,
    canonicalContentHash,
  );

  if (!willPublish && tournamentIds.length === 0 && teamMatchCandidateCount === 0) {
    return {
      seedName: seed.name,
      sportCode: seed.sportCode,
      status: 'up_to_date',
      currentVersionId: latest.id,
      currentVersion: latest.version,
    };
  }

  if (mode === 'dry-run') {
    return {
      seedName: seed.name,
      sportCode: seed.sportCode,
      status: 'would_repoint',
      previousVersionId: latest.id,
      newVersionId: willPublish ? null : resolvedVersionId,
      newVersion: willPublish ? latest.version + 1 : resolvedVersion,
      published: willPublish,
      tournamentsRepointed: tournamentIds.length,
      teamMatchesRepointed: teamMatchCandidateCount,
      tournamentIds,
    };
  }

  if (!actor) {
    throw new Error('An actor is required to apply a competition-config version repoint.');
  }
  const admin = await adminContext.getMutationAdmin(actor.id);

  let targetVersionId = resolvedVersionId;
  let targetVersion = resolvedVersion;
  const published = willPublish;
  if (willPublish) {
    const registry = new CompetitionConfigRegistry(prisma, adminContext);
    const created = await registry.createVersion(actor, latest.id, {
      config: seed.config as unknown as Record<string, unknown>,
    });
    targetVersionId = created.id;
    targetVersion = created.version;
  }

  const tournamentCompetitionConfig = new TournamentCompetitionConfig(prisma, adminContext);
  let tournamentsRepointed = 0;
  for (const tournamentId of tournamentIds) {
    // Re-fetch immediately before mutating to minimize the optimistic-lock
    // race window between the read above and this call — change() itself
    // still CAS-checks against `updatedAt`, this just avoids a spurious
    // conflict against a read that is now stale for an unrelated reason.
    const fresh = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: tournamentId } });
    if (fresh.competitionConfigVersionId === targetVersionId) continue;
    const request = {
      competitionConfigVersionId: targetVersionId,
      expectedVersion: fresh.updatedAt.toISOString(),
    };
    const preview = await tournamentCompetitionConfig.change(actor, tournamentId, request);
    if (preview.confirmationRequired) {
      await tournamentCompetitionConfig.change(actor, tournamentId, {
        ...request,
        confirmRecalculation: true,
        previewHash: preview.previewHash,
      });
    }
    tournamentsRepointed += 1;
  }

  const teamMatchesRepointed = await prisma.$transaction(async (tx) => {
    const updated = await tx.v1TeamMatch.updateMany({
      where: { competitionConfigVersionId: { in: staleVersionIds }, status: { not: 'completed' } },
      data: { competitionConfigVersionId: targetVersionId },
    });
    if (published || tournamentsRepointed > 0 || updated.count > 0) {
      await adminContext.logAdminAction(
        admin,
        {
          action: 'competition_config.version.repoint',
          targetType: 'competition_config',
          targetId: latest.id,
          beforeJson: { previousVersionId: latest.id, previousVersion: latest.version },
          afterJson: {
            newVersionId: targetVersionId,
            newVersion: targetVersion,
            published,
            tournamentsRepointed,
            teamMatchesRepointed: updated.count,
          },
        },
        tx,
      );
    }
    return updated.count;
  });

  return {
    seedName: seed.name,
    sportCode: seed.sportCode,
    status: 'repointed',
    previousVersionId: latest.id,
    newVersionId: targetVersionId,
    newVersion: targetVersion,
    published,
    tournamentsRepointed,
    teamMatchesRepointed,
    tournamentIds,
  };
}

/**
 * Entry point shared by dry-run and apply — see processSeed() above for the
 * single predicate both branches share (findRepointTargets()/needsPublish
 * are computed identically regardless of mode; only whether the writes
 * actually happen differs). `seeds` defaults to the two real well-known rows
 * and is only ever overridden by tests, to exercise this mechanism against a
 * synthetic lineage without mutating the shared football-v1/futsal-v1 rows
 * other integration tests in this repo also depend on.
 */
export async function runCompetitionConfigVersionRepoint(
  prisma: PrismaService,
  input: {
    mode: 'dry-run' | 'apply';
    actor?: V1AuthUser;
    seeds?: readonly CompetitionConfigRepointSeed[];
  },
): Promise<CompetitionConfigVersionRepointOutcome[]> {
  if (input.mode === 'apply' && !input.actor) {
    throw new Error('runCompetitionConfigVersionRepoint({ mode: "apply" }) requires an actor.');
  }
  const adminContext = new AdminContextService(prisma);
  const seeds = input.seeds ?? COMPETITION_CONFIG_VERSION_REPOINT_SEEDS;
  const outcomes: CompetitionConfigVersionRepointOutcome[] = [];
  for (const seed of seeds) {
    outcomes.push(await processSeed(prisma, adminContext, seed, input.mode, input.actor));
  }
  return outcomes;
}

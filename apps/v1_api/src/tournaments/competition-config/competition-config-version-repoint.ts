import { AdminContextService } from '../../common/admin-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { computePeriodCount } from '../../games/games.service';
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
import { mutableTeamMatchRepointWhere, TournamentCompetitionConfig } from './tournament-competition-config';
import { FOOTBALL_V1_CONFIG, FUTSAL_V1_CONFIG } from './competition-config.presets';
import { findTournamentOnSurface, ALL_COMPETITION_KINDS } from '../tournament-surface-lookup';

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
      // Soft-deleted between planning and applying, so no longer a target.
      // Surfaced so a run that repoints fewer rows than planned explains itself.
      skippedDeletedTournaments: number;
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
    prisma.v1TeamMatch.count({ where: mutableTeamMatchRepointWhere(staleVersionIds) }),
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
      // Dry-run plans against the current snapshot; nothing can be soft-deleted
      // mid-run because nothing is applied. Only the apply path can observe this.
      skippedDeletedTournaments: 0,
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
  // Tournaments that were soft-deleted between the collection query and the
  // re-fetch below. Counted rather than silently dropped so a run that repoints
  // fewer rows than it planned says why.
  let skippedDeletedTournaments = 0;
  let teamMatchesRepointedByTournamentChange = 0;
  for (const tournamentId of tournamentIds) {
    // Re-fetch immediately before mutating to minimize the optimistic-lock
    // race window between the read above and this call — change() itself
    // still CAS-checks against `updatedAt`, this just avoids a spurious
    // conflict against a read that is now stale for an unrelated reason.
    //
    // The `deletedAt: null` filter has to match the collection query above.
    // Without it a tournament soft-deleted inside that race window would still
    // be returned here, and change() — which does filter on deletedAt — would
    // then throw NOT_FOUND and abort the whole run over a row that is no
    // longer a repoint target at all. A row that disappeared from the target
    // set is not an error; skip it and account for it.
    // **설정 축은 리그도 허용한다**(`tournament-surface.ts` 의 '여기 걸지 않는 곳' 참조) —
    // 설정은 대회와 리그가 이미 공유하므로 여기서 종류를 가르면 리그만 옛 설정에 남는다.
    // 허용을 baseline 주석이 아니라 **코드에 명시**한다.
    const fresh = await findTournamentOnSurface(prisma, ALL_COMPETITION_KINDS, {
      where: { id: tournamentId, deletedAt: null },
    });
    if (fresh === null) {
      skippedDeletedTournaments += 1;
      continue;
    }
    if (fresh.competitionConfigVersionId === targetVersionId) continue;
    const request = {
      competitionConfigVersionId: targetVersionId,
      expectedVersion: fresh.updatedAt.toISOString(),
    };
    const preview = await tournamentCompetitionConfig.changeForInternalRepoint(actor, tournamentId, request);
    let appliedChange = preview;
    if (preview.confirmationRequired) {
      appliedChange = await tournamentCompetitionConfig.changeForInternalRepoint(actor, tournamentId, {
        ...request,
        confirmRecalculation: true,
        previewHash: preview.previewHash,
      });
    }
    teamMatchesRepointedByTournamentChange += appliedChange.teamMatchesRepointed;
    tournamentsRepointed += 1;
  }

  // Tournament and regular-league-owned matches were repointed through their
  // locked CAS calls above. This transaction is deliberately standalone-only;
  // it cannot become a broad stale-pin cleanup path.
  const teamMatchesRepointed = await prisma.$transaction(async (tx) => {
    const mutableWhere = mutableTeamMatchRepointWhere(staleVersionIds);
    const existingMutableConditions = Array.isArray(mutableWhere.AND)
      ? mutableWhere.AND
      : mutableWhere.AND
        ? [mutableWhere.AND]
        : [];
    const standaloneWhere: Prisma.V1TeamMatchWhereInput = {
      ...mutableWhere,
      AND: [
        ...existingMutableConditions,
        { tournamentId: null, leagueId: null, tournamentDetails: { is: null } },
      ],
    };
    // Standalone rows do not pass through TournamentCompetitionConfig.change.
    // Lock Game first and TeamMatch second, then re-read the same safe
    // predicate in this transaction before changing either pin.
    await tx.$queryRaw`SELECT g.id
      FROM v1_games g
      JOIN v1_team_matches tm ON tm.id = g.team_match_id
      WHERE tm.tournament_id IS NULL AND tm.league_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM v1_tournament_match_details d WHERE d.team_match_id = tm.id)
        AND g.source_type = 'TEAM_MATCH' AND g.state = 'SCHEDULED'
        AND NOT EXISTS (SELECT 1 FROM v1_game_lineups l WHERE l.game_id = g.id)
        AND NOT EXISTS (SELECT 1 FROM v1_game_events e WHERE e.game_id = g.id)
        AND NOT EXISTS (SELECT 1 FROM v1_game_result_revisions r WHERE r.game_id = g.id)
      ORDER BY g.id FOR UPDATE OF g`;
    await tx.$queryRaw`SELECT tm.id
      FROM v1_team_matches tm
      WHERE tm.tournament_id IS NULL AND tm.league_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM v1_tournament_match_details d WHERE d.team_match_id = tm.id)
      ORDER BY tm.id FOR UPDATE OF tm`;
    const standaloneRows = await tx.v1TeamMatch.findMany({
      where: standaloneWhere,
      select: {
        id: true,
        game: { select: { id: true, periods: { select: { id: true, number: true }, orderBy: { number: 'asc' } } } },
      },
    });
    const updated = await tx.v1TeamMatch.updateMany({
      where: { id: { in: standaloneRows.map((row) => row.id) } },
      data: { competitionConfigVersionId: targetVersionId },
    });
    const standaloneGameIds = standaloneRows.flatMap((row) => row.game ? [row.game.id] : []);
    if (standaloneGameIds.length > 0) {
      await tx.v1Game.updateMany({
        where: { id: { in: standaloneGameIds }, competitionConfigVersionId: { in: staleVersionIds } },
        data: { competitionConfigVersionId: targetVersionId },
      });
      const targetConfig = await tx.v1CompetitionConfigVersion.findUniqueOrThrow({
        where: { id: targetVersionId },
        select: { periods: true },
      });
      const desiredPeriodCount = computePeriodCount(targetConfig.periods);
      for (const row of standaloneRows) {
        if (!row.game) continue;
        const periods = row.game.periods;
        if (periods.length < desiredPeriodCount) {
          const existingNumbers = new Set(periods.map((period) => period.number));
          await tx.v1GamePeriod.createMany({
            data: Array.from({ length: desiredPeriodCount }, (_, index) => index + 1)
              .filter((number) => !existingNumbers.has(number))
              .map((number) => ({ gameId: row.game!.id, number })),
          });
        } else if (periods.length > desiredPeriodCount) {
          await tx.v1GamePeriod.deleteMany({ where: { gameId: row.game.id, number: { gt: desiredPeriodCount } } });
        }
      }
    }
    const totalTeamMatchesRepointed = teamMatchesRepointedByTournamentChange + updated.count;
    if (published || tournamentsRepointed > 0 || totalTeamMatchesRepointed > 0) {
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
            teamMatchesRepointed: totalTeamMatchesRepointed,
          },
        },
        tx,
      );
    }
    return totalTeamMatchesRepointed;
  });

  return {
    seedName: seed.name,
    sportCode: seed.sportCode,
    status: 'repointed',
    previousVersionId: latest.id,
    newVersionId: targetVersionId,
    newVersion: targetVersion,
    published,
    skippedDeletedTournaments,
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

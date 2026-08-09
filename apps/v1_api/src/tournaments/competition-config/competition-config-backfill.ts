import type { Prisma, PrismaClient } from '@prisma/client';
import {
  FOOTBALL_V1_CONFIG,
  FUTSAL_V1_CONFIG,
  competitionConfigContentHash,
} from './competition-config';

/**
 * Expand/contract backfill for the Task 9 competition-config feature.
 *
 * apps/v1_api/prisma/migrations/20260729000200_v1_competition_config used to
 * seed these two rows, guard-check every existing v1_tournaments/
 * v1_team_matches row's sport, and backfill competition_config_version_id on
 * v1_tournaments/v1_team_matches/v1_tournament_fixtures inline as part of the
 * migration itself. scripts/qa/check-expand-contract-migrations.mjs (the
 * alpha rollback compatibility gate) never treats DML as additive regardless
 * of whether the target table is new or pre-existing — the self-test
 * explicitly rejects `DELETE FROM "User"` as an unsafe fixture, which is the
 * gate author's deliberate "never trust arbitrary DML" design, not an
 * oversight — so this logic moved out of migration.sql entirely, following
 * the apps/v1_api/prisma/migrations/20260803000100_v1_task10_game_result_backfill
 * + apps/v1_api/src/games/migration/game-result-backfill.ts precedent.
 *
 * Every step here is idempotent (safe to re-run): the seed creates the two
 * canonical rows only when missing and otherwise verifies them by content
 * hash, the guard only reads, and every backfill UPDATE only touches
 * rows whose competition_config_version_id is still NULL. This must be
 * re-run once immediately before the deferred contract-phase migration
 * (SET NOT NULL/SET DEFAULT/FK on v1_tournaments/v1_pin_*_competition_config
 * triggers — see docs/ops/task9-competition-config-contract-phase.md) to
 * catch any tournament/team match created between the first run and that
 * follow-up deploy.
 */

export const FOOTBALL_COMPETITION_CONFIG_ID = '11111111-1111-4111-8111-111111111111';
export const FUTSAL_COMPETITION_CONFIG_ID = '22222222-2222-4222-8222-222222222222';

const SUPPORTED_SPORT_CODES = ['soccer', 'football', 'futsal'];

export type CompetitionConfigBackfillCounts = {
  seededConfigVersions: number;
  tournamentsBackfilled: number;
  teamMatchesBackfilled: number;
  tournamentFixturesBackfilled: number;
  operationAuditSourceIpsMasked: number;
};

export class CompetitionConfigSeedDriftError extends Error {
  constructor(
    public readonly drifted: Array<{
      id: string;
      name: string;
      expectedContentHash: string;
      actualContentHash: string;
    }>,
  ) {
    super(
      `COMPETITION_CONFIG_SEED_DRIFT: ${drifted.length} canonical competition config row(s) no longer match the registry constants: ${drifted
        .map((row) => `${row.name} (${row.id}) expected ${row.expectedContentHash} but found ${row.actualContentHash}`)
        .join(', ')}. Tournaments, team matches and fixtures already pin these ids, so silently rewriting the rows would change how already-played games are scored. Resolve it with competition-config-version-repoint.cli.ts, which publishes a canonical-matching successor version and repoints active tournaments/team matches away from the drifted row. Editing the drifted row in place is only possible while nothing references it — once anything does, the v1_block_used_config_mutation trigger rejects the UPDATE with COMPETITION_CONFIG_VERSION_IN_USE. Then re-run.`,
    );
    this.name = 'CompetitionConfigSeedDriftError';
  }
}

/**
 * Creates the two well-known ACTIVE competition config rows if they are
 * missing (v1_competition_config_for_sport() in the expand-phase migration
 * hardcodes these same two UUIDs, so the ids here are not incidental — they
 * must match exactly). Uses the canonical FOOTBALL_V1_CONFIG/FUTSAL_V1_CONFIG
 * + competitionConfigContentHash() from ./competition-config as the single
 * source of truth instead of re-transcribing the JSON, so what this writes
 * can never diverge from what CompetitionConfigRegistry itself would produce.
 *
 * Re-running is safe but not a blind no-op. A row that already exists is
 * compared against the canonical contentHash, and any mismatch throws
 * CompetitionConfigSeedDriftError rather than being skipped: this CLI is
 * meant to be re-run immediately before the contract-phase migration, and a
 * drifted row that passes silently would let that migration pin NOT NULL/FK
 * constraints onto a config nobody intended. It deliberately does not
 * overwrite — v1_tournaments/v1_team_matches/v1_tournament_fixtures already
 * reference these ids, so rewriting their content in place would
 * retroactively change the scoring rules of finished competitions.
 *
 * Returns the number of rows actually created, so a second run reports 0.
 *
 * A mismatch is not immediately fatal, though: see driftIsResolvedBySuccessor()
 * below for the one case it is allowed to wave through instead of throwing —
 * a prior competition-config-version-repoint.cli.ts run that already
 * published a canonical-matching successor and moved every still-mutable
 * referrer off the drifted row.
 */
export async function seedCompetitionConfigVersions(
  prisma: PrismaClient,
): Promise<number> {
  const rows: Array<{ id: string; sportCode: string; name: string; config: typeof FOOTBALL_V1_CONFIG }> = [
    { id: FOOTBALL_COMPETITION_CONFIG_ID, sportCode: 'football', name: 'football-v1', config: FOOTBALL_V1_CONFIG },
    { id: FUTSAL_COMPETITION_CONFIG_ID, sportCode: 'futsal', name: 'futsal-v1', config: FUTSAL_V1_CONFIG },
  ];
  const drifted: Array<{ id: string; name: string; expectedContentHash: string; actualContentHash: string }> = [];
  let seeded = 0;
  for (const row of rows) {
    const contentHash = competitionConfigContentHash(row.config);
    const existing = await prisma.v1CompetitionConfigVersion.findUnique({
      where: { id: row.id },
      select: { version: true, contentHash: true },
    });
    if (existing !== null) {
      if (
        existing.contentHash !== contentHash &&
        !(await driftIsResolvedBySuccessor(prisma, { ...row, version: existing.version }, contentHash))
      ) {
        drifted.push({
          id: row.id,
          name: row.name,
          expectedContentHash: contentHash,
          actualContentHash: existing.contentHash,
        });
      }
      continue;
    }
    await prisma.v1CompetitionConfigVersion.create({
      data: {
        id: row.id,
        sportCode: row.sportCode,
        name: row.name,
        version: 1,
        status: 'ACTIVE',
        periods: row.config.periods as unknown as Prisma.InputJsonValue,
        events: row.config.events as unknown as Prisma.InputJsonValue,
        lineup: row.config.lineup as unknown as Prisma.InputJsonValue,
        result: row.config.result as unknown as Prisma.InputJsonValue,
        tieBreak: row.config.tieBreak as unknown as Prisma.InputJsonValue,
        visibility: row.config.visibility as unknown as Prisma.InputJsonValue,
        contentHash,
      },
    });
    seeded += 1;
  }
  if (drifted.length > 0) {
    throw new CompetitionConfigSeedDriftError(drifted);
  }
  return seeded;
}

/**
 * A drifted seed row can never be rewritten in place once anything ever
 * references it — v1_block_used_config_mutation rejects the UPDATE, and
 * completed fixtures/team matches deliberately keep referencing it forever
 * (moving them would retroactively change how an already-played game was
 * scored — see tournament-competition-config.ts's `change()`). So "the drift
 * is resolved" can never mean "row.id's own content matches canonical" once
 * the row has been used for anything real; it has to mean "a newer version in
 * the SAME (sportCode, name) lineage already carries the canonical content,
 * AND nothing still-mutable is pinned to this specific drifted row anymore"
 * (only completed/historical fixtures and team matches, which stay on it by
 * design, plus possibly nothing at all).
 *
 * Requiring the successor to be a strictly NEWER version in the same lineage
 * (not just "any row anywhere already matches canonical") is deliberate: an
 * admin can freely publish other, deliberately different config versions for
 * one specific tournament through the ordinary product API
 * (CompetitionConfigRegistry.createVersion) — those must never be mistaken
 * for "the fix" just because they happen to exist. Only
 * competition-config-version-repoint.ts's own publish-then-repoint sequence
 * (or an equivalent manual fix that leaves the same trail: a newer
 * canonical-matching version, with every active referrer moved onto it)
 * satisfies this.
 *
 * Read-only — makes no writes, only decides whether to still raise
 * CompetitionConfigSeedDriftError for `row`.
 */
async function driftIsResolvedBySuccessor(
  prisma: PrismaClient,
  row: { id: string; sportCode: string; name: string; version: number },
  canonicalContentHash: string,
): Promise<boolean> {
  const successor = await prisma.v1CompetitionConfigVersion.findFirst({
    where: {
      sportCode: row.sportCode,
      name: row.name,
      contentHash: canonicalContentHash,
      version: { gt: row.version },
    },
    select: { id: true },
  });
  if (!successor) return false;

  const [activeTournaments, activeTeamMatches, activeFixtures] = await Promise.all([
    prisma.v1Tournament.count({ where: { competitionConfigVersionId: row.id, deletedAt: null } }),
    prisma.v1TeamMatch.count({ where: { competitionConfigVersionId: row.id, status: { not: 'completed' } } }),
    prisma.v1TournamentFixture.count({ where: { competitionConfigVersionId: row.id, status: { not: 'completed' } } }),
  ]);
  return activeTournaments === 0 && activeTeamMatches === 0 && activeFixtures === 0;
}

export class CompetitionConfigSourceUnsupportedError extends Error {
  constructor(public readonly sources: Array<{ sourceType: string; sourceId: string; sportCode: string | null }>) {
    super(
      `COMPETITION_CONFIG_SOURCE_UNSUPPORTED: ${sources.length} tournament/team-match row(s) have an unsupported or missing sport code: ${sources
        .slice(0, 5)
        .map((s) => `${s.sourceType}:${s.sourceId} (${s.sportCode ?? '<missing>'})`)
        .join(', ')}${sources.length > 5 ? ', ...' : ''}`,
    );
    this.name = 'CompetitionConfigSourceUnsupportedError';
  }
}

/**
 * Mirrors the DO $$ ... $$ guard block that used to live in
 * 20260729000200_v1_competition_config: refuses to backfill if any
 * v1_tournaments/v1_team_matches row's sport is not one this config
 * registry supports yet (soccer/football/futsal). Read-only.
 */
export async function assertAllSourcesHaveSupportedSport(prisma: PrismaClient): Promise<void> {
  const unsupported = await prisma.$queryRaw<
    Array<{ source_type: string; source_id: string; sport_code: string | null }>
  >`
    SELECT 'tournament' AS source_type, tournament.id AS source_id, sport.code AS sport_code
    FROM v1_tournaments tournament
    LEFT JOIN v1_sports sport ON sport.id = tournament.sport_id
    WHERE sport.code IS NULL OR lower(sport.code) NOT IN ('soccer', 'football', 'futsal')
    UNION ALL
    SELECT 'team_match', team_match.id, sport.code
    FROM v1_team_matches team_match
    LEFT JOIN v1_sports sport ON sport.id = team_match.sport_id
    WHERE sport.code IS NULL OR lower(sport.code) NOT IN ('soccer', 'football', 'futsal')
  `;
  if (unsupported.length > 0) {
    throw new CompetitionConfigSourceUnsupportedError(
      unsupported.map((row) => ({ sourceType: row.source_type, sourceId: row.source_id, sportCode: row.sport_code })),
    );
  }
}

/**
 * Backfills competition_config_version_id on v1_tournaments/v1_team_matches
 * (by the row's own sport) and v1_tournament_fixtures (copied from its
 * parent tournament), only touching rows that are still NULL — safe to
 * call repeatedly.
 */
export async function backfillCompetitionConfigVersionIds(
  prisma: PrismaClient,
): Promise<{ tournaments: number; teamMatches: number; tournamentFixtures: number }> {
  const tournaments = await prisma.$executeRaw`
    UPDATE v1_tournaments tournament
    SET competition_config_version_id = CASE
      WHEN lower(sport.code) IN ('soccer', 'football') THEN ${FOOTBALL_COMPETITION_CONFIG_ID}
      WHEN lower(sport.code) = 'futsal' THEN ${FUTSAL_COMPETITION_CONFIG_ID}
    END
    FROM v1_sports sport
    WHERE sport.id = tournament.sport_id
      AND tournament.competition_config_version_id IS NULL
  `;
  const teamMatches = await prisma.$executeRaw`
    UPDATE v1_team_matches team_match
    SET competition_config_version_id = CASE
      WHEN lower(sport.code) IN ('soccer', 'football') THEN ${FOOTBALL_COMPETITION_CONFIG_ID}
      WHEN lower(sport.code) = 'futsal' THEN ${FUTSAL_COMPETITION_CONFIG_ID}
    END
    FROM v1_sports sport
    WHERE sport.id = team_match.sport_id
      AND team_match.competition_config_version_id IS NULL
  `;
  const tournamentFixtures = await prisma.$executeRaw`
    UPDATE v1_tournament_fixtures fixture
    SET competition_config_version_id = tournament.competition_config_version_id
    FROM v1_tournaments tournament
    WHERE tournament.id = fixture.tournament_id
      AND fixture.competition_config_version_id IS NULL
      AND tournament.competition_config_version_id IS NOT NULL
  `;
  return { tournaments, teamMatches, tournamentFixtures };
}

/**
 * Masks any not-yet-masked v1_operation_audits.source_ip via the
 * v1_mask_audit_source_ip() DB function already defined by
 * 20260801040000_v1_task7_staff_audit_scope (that migration keeps the
 * function definition — defining a function is harmless — it just no
 * longer runs the one-time UPDATE inline). v1_operation_audits is a
 * brand-new table in this same migration batch, so on first run this
 * touches zero rows in every real deployment target; it exists so any
 * write path added by a later migration that bypasses masking gets swept up
 * before the contract-phase deploy.
 */
export async function maskOperationAuditSourceIps(prisma: PrismaClient): Promise<number> {
  return prisma.$executeRaw`
    UPDATE v1_operation_audits
    SET source_ip = v1_mask_audit_source_ip(source_ip)
    WHERE source_ip IS NOT NULL
      AND source_ip <> v1_mask_audit_source_ip(source_ip)
  `;
}

export async function runCompetitionConfigContractPhaseBackfill(
  prisma: PrismaClient,
): Promise<CompetitionConfigBackfillCounts> {
  const seededConfigVersions = await seedCompetitionConfigVersions(prisma);
  await assertAllSourcesHaveSupportedSport(prisma);
  const backfilled = await backfillCompetitionConfigVersionIds(prisma);
  const operationAuditSourceIpsMasked = await maskOperationAuditSourceIps(prisma);
  return {
    seededConfigVersions,
    tournamentsBackfilled: backfilled.tournaments,
    teamMatchesBackfilled: backfilled.teamMatches,
    tournamentFixturesBackfilled: backfilled.tournamentFixtures,
    operationAuditSourceIpsMasked,
  };
}

export const COMPETITION_CONFIG_BACKFILL_SUPPORTED_SPORT_CODES = SUPPORTED_SPORT_CODES;

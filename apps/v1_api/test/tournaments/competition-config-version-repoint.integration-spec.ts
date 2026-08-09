import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  FOOTBALL_V1_CONFIG,
  FUTSAL_V1_CONFIG,
  competitionConfigContentHash,
} from '../../src/tournaments/competition-config/competition-config';
import {
  FOOTBALL_COMPETITION_CONFIG_ID,
  FUTSAL_COMPETITION_CONFIG_ID,
  seedCompetitionConfigVersions,
} from '../../src/tournaments/competition-config/competition-config-backfill';
import { runCompetitionConfigVersionRepoint } from '../../src/tournaments/competition-config/competition-config-version-repoint';
import {
  competitionConfigFixture,
  seedCompetitionConfigFixture,
} from '../fixtures/competition-config.fixture';

const prisma = new PrismaService();

const authUser = {
  id: competitionConfigFixture.adminUserId,
  email: 'task-repoint-admin@example.test',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

// A synthetic, isolated (sportCode, name) lineage -- distinct from the shared
// football-v1/futsal-v1 rows every other competition-config integration spec
// also pins -- so this scenario can construct an already-pinned "drifted"
// row directly at CREATE time. v1_block_used_config_mutation only blocks
// UPDATE/DELETE of a version already in use; it never blocks inserting new
// rows that reference one, so building the fixture this way (rather than
// pinning something first and mutating after) is the only way to reproduce
// the real alpha scenario -- a row inserted with once-canonical content that
// pre-existing tournaments/team matches already pinned before the code's
// canonical definition later changed -- without fighting that trigger.
const REPOINT_SEED_ID = '99990000-0000-4000-8000-000000000001';
const REPOINT_SEED_SPORT_CODE = 'futsal';
const REPOINT_SEED_NAME = 'repoint-test-futsal-v1';
const REPOINT_TOURNAMENT_ID = '99990000-0000-4000-8000-000000000002';
const REPOINT_COMPLETED_FIXTURE_ID = '99990000-0000-4000-8000-000000000003';
const REPOINT_SCHEDULED_FIXTURE_ID = '99990000-0000-4000-8000-000000000004';
const REPOINT_RECRUITING_TEAM_MATCH_ID = '99990000-0000-4000-8000-000000000005';
const REPOINT_COMPLETED_TEAM_MATCH_ID = '99990000-0000-4000-8000-000000000006';

// Mirrors the real alpha drift this task exists to fix: futsal's `lineup`
// pre-dates T1-5 (no formation catalog) and `events` still uses the old
// "TEAM_FOUL" name instead of "FOUL" -- both non-scoring sections. Reserved
// for the "real futsal-v1" scenario below (it is written onto the real
// FUTSAL_COMPETITION_CONFIG_ID row there) -- content_hash is globally
// @unique on v1_competition_config_versions (not scoped per sportCode/name),
// so nothing else in this file may reuse this exact content.
const DRIFTED_FUTSAL_CONFIG = {
  ...FUTSAL_V1_CONFIG,
  lineup: { ...FUTSAL_V1_CONFIG.lineup, formations: [] as typeof FUTSAL_V1_CONFIG.lineup.formations },
  events: FUTSAL_V1_CONFIG.events.map((event) => (event === 'FOUL' ? 'TEAM_FOUL' : event)),
};

// The synthetic (REPOINT_SEED_*) scenario's own stored/canonical pair --
// deliberately distinct content from DRIFTED_FUTSAL_CONFIG/FUTSAL_V1_CONFIG
// above (a marker event appended to each) so their content_hash values never
// collide with the real futsal-v1 row this same shared clone DB already has,
// or with DRIFTED_FUTSAL_CONFIG once the "real futsal-v1" scenario writes it.
const SYNTHETIC_STORED_CONFIG = {
  ...FUTSAL_V1_CONFIG,
  lineup: { ...FUTSAL_V1_CONFIG.lineup, formations: [] as typeof FUTSAL_V1_CONFIG.lineup.formations },
  events: [...FUTSAL_V1_CONFIG.events.map((event) => (event === 'FOUL' ? 'TEAM_FOUL' : event)), 'REPOINT_TEST_STORED_MARKER'],
};
const SYNTHETIC_CANONICAL_CONFIG = {
  ...FUTSAL_V1_CONFIG,
  events: [...FUTSAL_V1_CONFIG.events, 'REPOINT_TEST_CANONICAL_MARKER'],
};

const SCORING_GUARD_SEED_ID = '99990000-0000-4000-8000-000000000011';
const SCORING_GUARD_SPORT_CODE = 'football';
const SCORING_GUARD_NAME = 'repoint-test-scoring-guard-v1';
const SCORING_GUARD_TOURNAMENT_ID = '99990000-0000-4000-8000-000000000012';
const SCORING_GUARD_FIXTURE_ID = '99990000-0000-4000-8000-000000000013';

// The row's STORED content, deliberately distinct from the real football-v1
// canonical row (content_hash is @unique on v1_competition_config_versions,
// so it must not collide with the row seedCompetitionConfigFixture already
// created) via a harmless periods tweak -- also lets changedSections below
// prove it reports every differing section, not just the scoring one.
const SCORING_GUARD_STORED_CONFIG = {
  ...FOOTBALL_V1_CONFIG,
  periods: [
    { ...FOOTBALL_V1_CONFIG.periods[0], durationMinutes: 40 },
    FOOTBALL_V1_CONFIG.periods[1],
  ],
};

// A scoring-relevant change (tie-break points) -- the one class of drift this
// module must never resolve automatically. Same technique
// competition-config.fixture.ts's exerciseCompetitionConfigChange() already
// uses to construct a validator-legal but scoring-different config.
const SCORING_DRIFTED_CANONICAL_CONFIG = {
  ...FOOTBALL_V1_CONFIG,
  tieBreak: { ...FOOTBALL_V1_CONFIG.tieBreak, points: { win: 5, draw: 2, loss: 0 } },
};

// content_hash is globally @unique on v1_competition_config_versions, not
// scoped per (sportCode, name) -- so the canonical content a seed wants to
// publish can turn out to already exist as an OLDER version of the SAME
// lineage (a prior publish, later superseded, now being reverted to: v1 =
// REUSE_CANONICAL_CONFIG, v2 = REUSE_LATEST_CONFIG, "latest" is v2 but v1's
// content matches what we want to publish again). This must reuse v1, not
// attempt a duplicate create() the unique constraint would reject.
const REUSE_SEED_SPORT_CODE = 'football';
const REUSE_SEED_NAME = 'repoint-test-reuse-v1';
const REUSE_V1_ID = '99990000-0000-4000-8000-000000000031';
const REUSE_V2_ID = '99990000-0000-4000-8000-000000000032';
const REUSE_TOURNAMENT_ID = '99990000-0000-4000-8000-000000000033';
const REUSE_CANONICAL_CONFIG = {
  ...FOOTBALL_V1_CONFIG,
  events: [...FOOTBALL_V1_CONFIG.events, 'REPOINT_TEST_REUSE_CANONICAL_MARKER'],
};
const REUSE_LATEST_CONFIG = {
  ...FOOTBALL_V1_CONFIG,
  events: [...FOOTBALL_V1_CONFIG.events, 'REPOINT_TEST_REUSE_LATEST_MARKER'],
};

// The OTHER half of the same content_hash-is-global fact: the canonical
// content a seed wants to publish can instead collide with an UNRELATED
// lineage's existing version (pure coincidence, or convergent rules) --
// reusing that row would silently associate this lineage's tournaments with
// someone else's named config, so this must block instead, the same way
// blocked_scoring_drift does.
const COLLISION_A_SPORT_CODE = 'football';
const COLLISION_A_NAME = 'repoint-test-collision-a-v1';
const COLLISION_A_ID = '99990000-0000-4000-8000-000000000041';
const COLLISION_A_TOURNAMENT_ID = '99990000-0000-4000-8000-000000000042';
const COLLISION_B_NAME = 'repoint-test-collision-b-v1';
const COLLISION_B_ID = '99990000-0000-4000-8000-000000000043';
const COLLISION_A_STORED_CONFIG = {
  ...FOOTBALL_V1_CONFIG,
  events: [...FOOTBALL_V1_CONFIG.events, 'REPOINT_TEST_COLLISION_A_MARKER'],
};
// This is what lineage A's seed will ask to publish -- and also exactly what
// lineage B (an unrelated name) already has stored.
const COLLISION_TARGET_CONFIG = {
  ...FOOTBALL_V1_CONFIG,
  events: [...FOOTBALL_V1_CONFIG.events, 'REPOINT_TEST_COLLISION_TARGET_MARKER'],
};

async function createConfigVersion(input: {
  id: string;
  sportCode: string;
  name: string;
  version: number;
  config: typeof FOOTBALL_V1_CONFIG;
}): Promise<void> {
  await prisma.v1CompetitionConfigVersion.create({
    data: {
      id: input.id,
      sportCode: input.sportCode,
      name: input.name,
      version: input.version,
      status: 'ACTIVE',
      periods: input.config.periods as unknown as Prisma.InputJsonValue,
      events: input.config.events as unknown as Prisma.InputJsonValue,
      lineup: input.config.lineup as unknown as Prisma.InputJsonValue,
      result: input.config.result as unknown as Prisma.InputJsonValue,
      tieBreak: input.config.tieBreak as unknown as Prisma.InputJsonValue,
      visibility: input.config.visibility as unknown as Prisma.InputJsonValue,
      contentHash: competitionConfigContentHash(input.config),
    },
  });
}

describe('competition-config-version-repoint', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for competition-config-version-repoint integration verification');
    }
    await prisma.$connect();
    await seedCompetitionConfigFixture(prisma, authUser);

    await prisma.v1CompetitionConfigVersion.create({
      data: {
        id: REPOINT_SEED_ID,
        sportCode: REPOINT_SEED_SPORT_CODE,
        name: REPOINT_SEED_NAME,
        version: 1,
        status: 'ACTIVE',
        periods: SYNTHETIC_STORED_CONFIG.periods as unknown as Prisma.InputJsonValue,
        events: SYNTHETIC_STORED_CONFIG.events as unknown as Prisma.InputJsonValue,
        lineup: SYNTHETIC_STORED_CONFIG.lineup as unknown as Prisma.InputJsonValue,
        result: SYNTHETIC_STORED_CONFIG.result as unknown as Prisma.InputJsonValue,
        tieBreak: SYNTHETIC_STORED_CONFIG.tieBreak as unknown as Prisma.InputJsonValue,
        visibility: SYNTHETIC_STORED_CONFIG.visibility as unknown as Prisma.InputJsonValue,
        contentHash: competitionConfigContentHash(SYNTHETIC_STORED_CONFIG),
      },
    });
    await prisma.v1Tournament.create({
      data: {
        id: REPOINT_TOURNAMENT_ID,
        sportId: competitionConfigFixture.futsalSportId,
        title: 'Repoint test futsal tournament',
        status: 'in_progress',
        competitionConfigVersionId: REPOINT_SEED_ID,
      },
    });
    await prisma.v1TournamentFixture.create({
      data: {
        id: REPOINT_COMPLETED_FIXTURE_ID,
        tournamentId: REPOINT_TOURNAMENT_ID,
        round: 'test',
        fixtureNumber: 1,
        status: 'completed',
        competitionConfigVersionId: REPOINT_SEED_ID,
      },
    });
    await prisma.v1TournamentFixture.create({
      data: {
        id: REPOINT_SCHEDULED_FIXTURE_ID,
        tournamentId: REPOINT_TOURNAMENT_ID,
        round: 'test',
        fixtureNumber: 2,
        status: 'scheduled',
        competitionConfigVersionId: REPOINT_SEED_ID,
      },
    });
    await prisma.v1TeamMatch.createMany({
      data: [
        {
          id: REPOINT_RECRUITING_TEAM_MATCH_ID,
          hostTeamId: competitionConfigFixture.teamIds[0],
          createdByUserId: competitionConfigFixture.adminUserId,
          sportId: competitionConfigFixture.futsalSportId,
          regionId: competitionConfigFixture.regionId,
          title: 'Repoint test recruiting match',
          placeName: 'Repoint test venue',
          startAt: competitionConfigFixture.now,
          status: 'recruiting',
          competitionConfigVersionId: REPOINT_SEED_ID,
        },
        {
          id: REPOINT_COMPLETED_TEAM_MATCH_ID,
          hostTeamId: competitionConfigFixture.teamIds[0],
          createdByUserId: competitionConfigFixture.adminUserId,
          sportId: competitionConfigFixture.futsalSportId,
          regionId: competitionConfigFixture.regionId,
          title: 'Repoint test completed match',
          placeName: 'Repoint test venue',
          startAt: competitionConfigFixture.now,
          status: 'completed',
          competitionConfigVersionId: REPOINT_SEED_ID,
        },
      ],
    });

    await prisma.v1CompetitionConfigVersion.create({
      data: {
        id: SCORING_GUARD_SEED_ID,
        sportCode: SCORING_GUARD_SPORT_CODE,
        name: SCORING_GUARD_NAME,
        version: 1,
        status: 'ACTIVE',
        periods: SCORING_GUARD_STORED_CONFIG.periods as unknown as Prisma.InputJsonValue,
        events: SCORING_GUARD_STORED_CONFIG.events as unknown as Prisma.InputJsonValue,
        lineup: SCORING_GUARD_STORED_CONFIG.lineup as unknown as Prisma.InputJsonValue,
        result: SCORING_GUARD_STORED_CONFIG.result as unknown as Prisma.InputJsonValue,
        tieBreak: SCORING_GUARD_STORED_CONFIG.tieBreak as unknown as Prisma.InputJsonValue,
        visibility: SCORING_GUARD_STORED_CONFIG.visibility as unknown as Prisma.InputJsonValue,
        contentHash: competitionConfigContentHash(SCORING_GUARD_STORED_CONFIG),
      },
    });
    await prisma.v1Tournament.create({
      data: {
        id: SCORING_GUARD_TOURNAMENT_ID,
        sportId: competitionConfigFixture.soccerSportId,
        title: 'Repoint test scoring-guard tournament',
        status: 'in_progress',
        competitionConfigVersionId: SCORING_GUARD_SEED_ID,
      },
    });
    await prisma.v1TournamentFixture.create({
      data: {
        id: SCORING_GUARD_FIXTURE_ID,
        tournamentId: SCORING_GUARD_TOURNAMENT_ID,
        round: 'test',
        fixtureNumber: 1,
        status: 'scheduled',
        competitionConfigVersionId: SCORING_GUARD_SEED_ID,
      },
    });

    await createConfigVersion({
      id: REUSE_V1_ID,
      sportCode: REUSE_SEED_SPORT_CODE,
      name: REUSE_SEED_NAME,
      version: 1,
      config: REUSE_CANONICAL_CONFIG,
    });
    await createConfigVersion({
      id: REUSE_V2_ID,
      sportCode: REUSE_SEED_SPORT_CODE,
      name: REUSE_SEED_NAME,
      version: 2,
      config: REUSE_LATEST_CONFIG,
    });
    await prisma.v1Tournament.create({
      data: {
        id: REUSE_TOURNAMENT_ID,
        sportId: competitionConfigFixture.soccerSportId,
        title: 'Repoint test reuse tournament',
        status: 'in_progress',
        competitionConfigVersionId: REUSE_V2_ID,
      },
    });

    await createConfigVersion({
      id: COLLISION_A_ID,
      sportCode: COLLISION_A_SPORT_CODE,
      name: COLLISION_A_NAME,
      version: 1,
      config: COLLISION_A_STORED_CONFIG,
    });
    await createConfigVersion({
      id: COLLISION_B_ID,
      sportCode: COLLISION_A_SPORT_CODE,
      name: COLLISION_B_NAME,
      version: 1,
      config: COLLISION_TARGET_CONFIG,
    });
    await prisma.v1Tournament.create({
      data: {
        id: COLLISION_A_TOURNAMENT_ID,
        sportId: competitionConfigFixture.soccerSportId,
        title: 'Repoint test collision tournament',
        status: 'in_progress',
        competitionConfigVersionId: COLLISION_A_ID,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('dry-run reports the repoint without writing, apply performs it exactly once, and a re-run is idempotent', async () => {
    const seeds = [
      { id: REPOINT_SEED_ID, sportCode: REPOINT_SEED_SPORT_CODE, name: REPOINT_SEED_NAME, config: SYNTHETIC_CANONICAL_CONFIG },
    ];

    const preview = await runCompetitionConfigVersionRepoint(prisma, { mode: 'dry-run', seeds });
    expect(preview).toEqual([
      {
        seedName: REPOINT_SEED_NAME,
        sportCode: REPOINT_SEED_SPORT_CODE,
        status: 'would_repoint',
        previousVersionId: REPOINT_SEED_ID,
        newVersionId: null,
        newVersion: 2,
        published: true,
        tournamentsRepointed: 1,
        teamMatchesRepointed: 1,
        tournamentIds: [REPOINT_TOURNAMENT_ID],
      },
    ]);

    // Dry-run made no writes.
    const untouchedTournament = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: REPOINT_TOURNAMENT_ID } });
    expect(untouchedTournament.competitionConfigVersionId).toBe(REPOINT_SEED_ID);
    const versionsBeforeApply = await prisma.v1CompetitionConfigVersion.count({
      where: { sportCode: REPOINT_SEED_SPORT_CODE, name: REPOINT_SEED_NAME },
    });
    expect(versionsBeforeApply).toBe(1);

    const applied = await runCompetitionConfigVersionRepoint(prisma, { mode: 'apply', actor: authUser, seeds });
    expect(applied).toHaveLength(1);
    const outcome = applied[0];
    if (outcome.status !== 'repointed') {
      throw new Error(`expected 'repointed', got ${outcome.status}`);
    }
    expect(outcome).toMatchObject({
      seedName: REPOINT_SEED_NAME,
      sportCode: REPOINT_SEED_SPORT_CODE,
      previousVersionId: REPOINT_SEED_ID,
      newVersion: 2,
      published: true,
      tournamentsRepointed: 1,
      teamMatchesRepointed: 1,
      tournamentIds: [REPOINT_TOURNAMENT_ID],
    });
    const newVersionId = outcome.newVersionId as string;
    expect(newVersionId).not.toBe(REPOINT_SEED_ID);

    const newVersionRow = await prisma.v1CompetitionConfigVersion.findUniqueOrThrow({ where: { id: newVersionId } });
    expect(newVersionRow.contentHash).toBe(competitionConfigContentHash(SYNTHETIC_CANONICAL_CONFIG));
    expect(newVersionRow.version).toBe(2);

    const repointedTournament = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: REPOINT_TOURNAMENT_ID } });
    expect(repointedTournament.competitionConfigVersionId).toBe(newVersionId);

    const completedFixture = await prisma.v1TournamentFixture.findUniqueOrThrow({
      where: { id: REPOINT_COMPLETED_FIXTURE_ID },
    });
    expect(completedFixture.competitionConfigVersionId).toBe(REPOINT_SEED_ID);

    const scheduledFixture = await prisma.v1TournamentFixture.findUniqueOrThrow({
      where: { id: REPOINT_SCHEDULED_FIXTURE_ID },
    });
    expect(scheduledFixture.competitionConfigVersionId).toBe(newVersionId);

    const recruitingTeamMatch = await prisma.v1TeamMatch.findUniqueOrThrow({
      where: { id: REPOINT_RECRUITING_TEAM_MATCH_ID },
    });
    expect(recruitingTeamMatch.competitionConfigVersionId).toBe(newVersionId);

    const completedTeamMatch = await prisma.v1TeamMatch.findUniqueOrThrow({
      where: { id: REPOINT_COMPLETED_TEAM_MATCH_ID },
    });
    expect(completedTeamMatch.competitionConfigVersionId).toBe(REPOINT_SEED_ID);

    const auditLog = await prisma.v1AdminActionLog.findFirst({
      where: { action: 'competition_config.version.repoint', targetId: REPOINT_SEED_ID },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditLog).not.toBeNull();
    expect(auditLog?.afterJson).toMatchObject({ newVersionId, tournamentsRepointed: 1, teamMatchesRepointed: 1 });

    const reapplied = await runCompetitionConfigVersionRepoint(prisma, { mode: 'apply', actor: authUser, seeds });
    expect(reapplied).toEqual([
      {
        seedName: REPOINT_SEED_NAME,
        sportCode: REPOINT_SEED_SPORT_CODE,
        status: 'up_to_date',
        currentVersionId: newVersionId,
        currentVersion: 2,
      },
    ]);
    const redryrun = await runCompetitionConfigVersionRepoint(prisma, { mode: 'dry-run', seeds });
    expect(redryrun).toEqual(reapplied);
  });

  it('refuses to repoint when the drift touches result/tieBreak (scoring rules), and makes no writes', async () => {
    const seeds = [
      {
        id: SCORING_GUARD_SEED_ID,
        sportCode: SCORING_GUARD_SPORT_CODE,
        name: SCORING_GUARD_NAME,
        config: SCORING_DRIFTED_CANONICAL_CONFIG,
      },
    ];

    const expectedBlocked = [
      {
        seedName: SCORING_GUARD_NAME,
        sportCode: SCORING_GUARD_SPORT_CODE,
        status: 'blocked_scoring_drift',
        currentVersionId: SCORING_GUARD_SEED_ID,
        changedSections: ['periods', 'tieBreak'],
        scoringSectionsChanged: ['tieBreak'],
      },
    ];

    const preview = await runCompetitionConfigVersionRepoint(prisma, { mode: 'dry-run', seeds });
    expect(preview).toEqual(expectedBlocked);

    const applied = await runCompetitionConfigVersionRepoint(prisma, { mode: 'apply', actor: authUser, seeds });
    expect(applied).toEqual(expectedBlocked);

    const versions = await prisma.v1CompetitionConfigVersion.findMany({
      where: { sportCode: SCORING_GUARD_SPORT_CODE, name: SCORING_GUARD_NAME },
    });
    expect(versions).toHaveLength(1);

    const tournament = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: SCORING_GUARD_TOURNAMENT_ID } });
    expect(tournament.competitionConfigVersionId).toBe(SCORING_GUARD_SEED_ID);
    const fixture = await prisma.v1TournamentFixture.findUniqueOrThrow({ where: { id: SCORING_GUARD_FIXTURE_ID } });
    expect(fixture.competitionConfigVersionId).toBe(SCORING_GUARD_SEED_ID);
  });

  // This is the exact real-world scenario this task exists to fix: the real
  // futsal-v1 seed row drifts from the registry constants (same shape as the
  // synthetic fixture above), gets pinned by a real tournament/team match
  // before anyone notices, and competition-config-backfill.cli.ts's
  // seedCompetitionConfigVersions() (unmodified, called through its real
  // public entrypoint here, not re-implemented) refuses to proceed until this
  // module resolves it.
  it('resolves real futsal-v1 drift so seedCompetitionConfigVersions no longer throws', async () => {
    await prisma.v1CompetitionConfigVersion.update({
      where: { id: FUTSAL_COMPETITION_CONFIG_ID },
      data: {
        lineup: DRIFTED_FUTSAL_CONFIG.lineup as unknown as Prisma.InputJsonValue,
        events: DRIFTED_FUTSAL_CONFIG.events as unknown as Prisma.InputJsonValue,
        contentHash: competitionConfigContentHash(DRIFTED_FUTSAL_CONFIG),
      },
    });

    const realFutsalTournamentId = '99990000-0000-4000-8000-000000000021';
    const realFutsalTeamMatchId = '99990000-0000-4000-8000-000000000022';
    await prisma.v1Tournament.create({
      data: {
        id: realFutsalTournamentId,
        sportId: competitionConfigFixture.futsalSportId,
        title: 'Real futsal-v1 drift tournament',
        status: 'in_progress',
        competitionConfigVersionId: FUTSAL_COMPETITION_CONFIG_ID,
      },
    });
    await prisma.v1TeamMatch.create({
      data: {
        id: realFutsalTeamMatchId,
        hostTeamId: competitionConfigFixture.teamIds[0],
        createdByUserId: competitionConfigFixture.adminUserId,
        sportId: competitionConfigFixture.futsalSportId,
        regionId: competitionConfigFixture.regionId,
        title: 'Real futsal-v1 drift match',
        placeName: 'Repoint test venue',
        startAt: competitionConfigFixture.now,
        status: 'recruiting',
        competitionConfigVersionId: FUTSAL_COMPETITION_CONFIG_ID,
      },
    });

    await expect(seedCompetitionConfigVersions(prisma)).rejects.toThrow('COMPETITION_CONFIG_SEED_DRIFT');

    const outcomes = await runCompetitionConfigVersionRepoint(prisma, { mode: 'apply', actor: authUser });
    const football = outcomes.find((outcome) => outcome.sportCode === 'football');
    const futsal = outcomes.find((outcome) => outcome.sportCode === 'futsal');
    expect(football?.status).toBe('up_to_date');
    expect(futsal?.status).toBe('repointed');

    const repointedTournament = await prisma.v1Tournament.findUniqueOrThrow({
      where: { id: realFutsalTournamentId },
    });
    expect(repointedTournament.competitionConfigVersionId).not.toBe(FUTSAL_COMPETITION_CONFIG_ID);
    const repointedTeamMatch = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: realFutsalTeamMatchId } });
    expect(repointedTeamMatch.competitionConfigVersionId).not.toBe(FUTSAL_COMPETITION_CONFIG_ID);

    await expect(seedCompetitionConfigVersions(prisma)).resolves.toBe(0);

    // The original football-v1 row is untouched by any of this.
    const footballRow = await prisma.v1CompetitionConfigVersion.findUniqueOrThrow({
      where: { id: FOOTBALL_COMPETITION_CONFIG_ID },
    });
    expect(footballRow.contentHash).toBe(competitionConfigContentHash(FOOTBALL_V1_CONFIG));
  });

  it('reuses an existing same-lineage version instead of publishing a duplicate when canonical content already exists at an older version', async () => {
    const seeds = [
      { id: REUSE_V1_ID, sportCode: REUSE_SEED_SPORT_CODE, name: REUSE_SEED_NAME, config: REUSE_CANONICAL_CONFIG },
    ];

    const expectedOutcome = {
      seedName: REUSE_SEED_NAME,
      sportCode: REUSE_SEED_SPORT_CODE,
      status: 'repointed',
      previousVersionId: REUSE_V2_ID,
      newVersionId: REUSE_V1_ID,
      newVersion: 1,
      published: false,
      tournamentsRepointed: 1,
      teamMatchesRepointed: 0,
      tournamentIds: [REUSE_TOURNAMENT_ID],
    };

    const preview = await runCompetitionConfigVersionRepoint(prisma, { mode: 'dry-run', seeds });
    expect(preview).toEqual([{ ...expectedOutcome, status: 'would_repoint' }]);

    const applied = await runCompetitionConfigVersionRepoint(prisma, { mode: 'apply', actor: authUser, seeds });
    expect(applied).toEqual([expectedOutcome]);

    // No duplicate version was created -- still exactly the 2 rows this
    // lineage started with (v1 reused, not a new v3).
    const versionCount = await prisma.v1CompetitionConfigVersion.count({
      where: { sportCode: REUSE_SEED_SPORT_CODE, name: REUSE_SEED_NAME },
    });
    expect(versionCount).toBe(2);

    const tournament = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: REUSE_TOURNAMENT_ID } });
    expect(tournament.competitionConfigVersionId).toBe(REUSE_V1_ID);

    // Idempotent: `latest` (v2) permanently mismatches canonical (it is never
    // rewritten), but nothing mutable still points at it, so a second run is
    // correctly a no-op instead of looping forever trying to "fix" v2.
    const reapplied = await runCompetitionConfigVersionRepoint(prisma, { mode: 'apply', actor: authUser, seeds });
    expect(reapplied).toEqual([
      {
        seedName: REUSE_SEED_NAME,
        sportCode: REUSE_SEED_SPORT_CODE,
        status: 'up_to_date',
        currentVersionId: REUSE_V2_ID,
        currentVersion: 2,
      },
    ]);
  });

  it('blocks (does not reuse) when the canonical content instead collides with an unrelated lineage, and makes no writes', async () => {
    const seeds = [
      { id: COLLISION_A_ID, sportCode: COLLISION_A_SPORT_CODE, name: COLLISION_A_NAME, config: COLLISION_TARGET_CONFIG },
    ];

    const expectedBlocked = [
      {
        seedName: COLLISION_A_NAME,
        sportCode: COLLISION_A_SPORT_CODE,
        status: 'blocked_content_hash_collision',
        currentVersionId: COLLISION_A_ID,
        canonicalContentHash: competitionConfigContentHash(COLLISION_TARGET_CONFIG),
        collidingVersionId: COLLISION_B_ID,
        collidingSportCode: COLLISION_A_SPORT_CODE,
        collidingName: COLLISION_B_NAME,
      },
    ];

    const preview = await runCompetitionConfigVersionRepoint(prisma, { mode: 'dry-run', seeds });
    expect(preview).toEqual(expectedBlocked);

    const applied = await runCompetitionConfigVersionRepoint(prisma, { mode: 'apply', actor: authUser, seeds });
    expect(applied).toEqual(expectedBlocked);

    const versionsInLineageA = await prisma.v1CompetitionConfigVersion.count({
      where: { sportCode: COLLISION_A_SPORT_CODE, name: COLLISION_A_NAME },
    });
    expect(versionsInLineageA).toBe(1);

    const tournament = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: COLLISION_A_TOURNAMENT_ID } });
    expect(tournament.competitionConfigVersionId).toBe(COLLISION_A_ID);
  });
});

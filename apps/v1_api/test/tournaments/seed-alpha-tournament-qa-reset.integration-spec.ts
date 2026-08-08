import { PrismaService } from '../../src/prisma/prisma.service';
import { resetAlphaTournamentScenarios } from '../../prisma/seed-alpha-tournament-qa';

/**
 * Alpha deploy incident (2026-08-06/07): every alpha deploy re-seeds
 * ALPHA_TOURNAMENT_SCENARIOS by deleting those fixed tournament IDs and
 * recreating them. Once the ops-run `fixture-game-backfill` CLI gave one of
 * those tournaments' fixtures a real V1Game row, the plain
 * `v1TournamentCampaign.deleteMany` + `v1Tournament.deleteMany` teardown
 * started failing with:
 *
 *   Foreign key constraint violated: v1_games_tournament_fixture_id_fkey
 *
 * because that FK is `onDelete: Restrict` by design (a Game is the record of
 * a played match — it must never vanish just because its tournament did).
 * This suite proves, against a real Postgres database:
 *   1. the failure reproduces exactly as reported (raw deleteMany calls),
 *   2. `resetAlphaTournamentScenarios` tears the whole Game graph down and
 *      the reseed succeeds for the actual shape `fixture-game-backfill`
 *      produces (a Game with no result at all) and for a Game whose result
 *      never left DRAFT,
 *   3. it refuses — loudly, and without deleting anything — the moment a
 *      Game's result has actually gone OFFICIAL, or carries an orphan
 *      V1TeamRecordFact row (append-only the instant it's written,
 *      regardless of revision state), because at that point Postgres
 *      triggers make those rows permanently undeletable by design (the same
 *      "never lose a played match" guarantee the FK itself encodes),
 *   4. it never touches a tournament outside the given ID list.
 */

const id = (suffix: string) => `69000000-0000-4000-8000-${suffix}`;

const ids = {
  user: id('000000000001'),
  sport: id('000000000002'),
  region: id('000000000003'),

  // Mirrors what fixture-game-backfill actually produced in production: a
  // bare SCHEDULED Game with a roster but no result revision at all.
  bareTournament: id('000000000010'),
  bareFixture: id('000000000011'),
  bareGame: id('000000000012'),

  // A Game whose result was drafted but never submitted.
  draftTournament: id('000000000030'),
  draftFixture: id('000000000031'),
  draftGame: id('000000000032'),
  draftRevision: id('000000000033'),
  draftParticipant: id('000000000034'),
  draftLineupId: id('000000000035'),
  draftSideId: id('000000000036'),

  // A Game whose result is still DRAFT but carries an orphan V1TeamRecordFact
  // (append-only from the moment it's written, regardless of revision state)
  // — must also block the reset entirely.
  orphanFactTournament: id('000000000050'),
  orphanFactFixture: id('000000000051'),
  orphanFactGame: id('000000000052'),
  orphanFactRevision: id('000000000053'),

  // A Game whose result has gone OFFICIAL — must block the reset entirely.
  officialTournament: id('000000000040'),
  officialFixture: id('000000000041'),
  officialGame: id('000000000042'),
  officialRevision: id('000000000043'),
  officialParticipant: id('000000000044'),
  officialLineupId: id('000000000045'),
  officialSideId: id('000000000046'),

  otherTournament: id('000000000020'),
  otherFixture: id('000000000021'),
  otherGame: id('000000000022'),
} as const;

const prisma = new PrismaService();

async function loadFootballConfigId(): Promise<string> {
  const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
    where: { name: 'football-v1', status: 'ACTIVE' },
  });
  return config.id;
}

/** A Game with a DRAFT-only result: revision + participant, never submitted. */
async function seedDraftResultGame(params: {
  readonly gameId: string;
  readonly fixtureId: string;
  readonly revisionId: string;
  readonly participantId: string;
  readonly sideId: string;
  readonly lineupId: string;
  readonly configId: string;
}) {
  const { gameId, fixtureId, revisionId, participantId, sideId, lineupId, configId } = params;
  await prisma.v1Game.create({
    data: {
      id: gameId,
      sourceType: 'TOURNAMENT_FIXTURE',
      tournamentFixtureId: fixtureId,
      competitionConfigVersionId: configId,
      state: 'LIVE',
    },
  });
  await prisma.v1GameParticipant.create({
    data: { id: participantId, gameId, sideId, lineupId, displayNameSnapshot: 'Draft Result Participant' },
  });
  await prisma.v1GameResultRevision.create({
    data: {
      id: revisionId,
      gameId,
      revision: 1,
      state: 'DRAFT',
      score: { home: 1, away: 0 },
      eventsHash: 'draft-events-hash',
      createdByActorType: 'SYSTEM',
      createdBySystemActor: 'seed-reset-test',
    },
  });
  await prisma.v1GameResultParticipant.create({
    data: { resultRevisionId: revisionId, participantId, sideId, cards: [] },
  });
  // v1_result_escalation_version_cas / decisions carry no revision-state gate
  // in the schema, so a DRAFT revision can legitimately carry both too.
  await prisma.v1ResultEscalation.create({
    data: { resultRevisionId: revisionId, kind: 'REMINDER', dueAt: new Date('2026-08-02T00:00:00.000Z') },
  });
  await prisma.v1GameResultDecision.create({
    data: { revisionId, decision: 'HOLD', actorType: 'SYSTEM', actorUserId: ids.user },
  });
}

/**
 * A DRAFT-revision Game carrying an orphan V1TeamRecordFact — a real,
 * trigger-permitted shape: unlike V1GameOfficialFact / V1GameOfficialResultCache,
 * nothing gates INSERT on v1_team_record_facts by revision state, but
 * `v1_block_team_record_fact_mutation` blocks its own UPDATE **and DELETE**
 * unconditionally. Once such a row exists, it can never be deleted by app
 * code — DRAFT or not.
 */
async function seedDraftResultGameWithOrphanTeamRecordFact(params: {
  readonly gameId: string;
  readonly fixtureId: string;
  readonly revisionId: string;
  readonly configId: string;
}) {
  const { gameId, fixtureId, revisionId, configId } = params;
  await prisma.v1Game.create({
    data: {
      id: gameId,
      sourceType: 'TOURNAMENT_FIXTURE',
      tournamentFixtureId: fixtureId,
      competitionConfigVersionId: configId,
      state: 'LIVE',
    },
  });
  await prisma.v1GameResultRevision.create({
    data: {
      id: revisionId,
      gameId,
      revision: 1,
      state: 'DRAFT',
      score: { home: 1, away: 0 },
      eventsHash: 'orphan-fact-events-hash',
      createdByActorType: 'SYSTEM',
      createdBySystemActor: 'seed-reset-test',
    },
  });
  await prisma.v1TeamRecordFact.create({
    data: {
      revisionId,
      gameId,
      teamId: ids.sport,
      result: 'DRAWN',
      goalsFor: 1,
      goalsAgainst: 1,
      sourceHash: 'draft-orphan-source-hash',
      officialAt: new Date('2026-08-01T09:00:00.000Z'),
    },
  });
}

/**
 * A Game whose result reached OFFICIAL — the fully-hydrated graph: every
 * Restrict edge onto V1Game / V1GameResultRevision gets a row (revision,
 * official fact, public cache, team record fact, result participant).
 *
 * v1_game_result_revisions can only reach OFFICIAL through DRAFT ->
 * SUBMITTED -> OFFICIAL (v1_block_terminal_revision_mutation only allows
 * state/submittedAt/officialAt to change once past DRAFT; every other
 * trigger-checked field must stay put). Result participants additionally
 * require the revision to still be DRAFT at insert time
 * (v1_guard_result_participant_mutation), so that row has to land before the
 * SUBMITTED transition.
 */
async function seedOfficialResultGame(params: {
  readonly gameId: string;
  readonly fixtureId: string;
  readonly tournamentId: string;
  readonly revisionId: string;
  readonly participantId: string;
  readonly sideId: string;
  readonly lineupId: string;
  readonly configId: string;
}) {
  const { gameId, fixtureId, tournamentId, revisionId, participantId, sideId, lineupId, configId } = params;
  await prisma.v1Game.create({
    data: {
      id: gameId,
      sourceType: 'TOURNAMENT_FIXTURE',
      tournamentFixtureId: fixtureId,
      competitionConfigVersionId: configId,
      state: 'ENDED',
    },
  });
  await prisma.v1GameParticipant.create({
    data: { id: participantId, gameId, sideId, lineupId, displayNameSnapshot: 'Official Result Participant' },
  });
  await prisma.v1GameResultRevision.create({
    data: {
      id: revisionId,
      gameId,
      revision: 1,
      state: 'DRAFT',
      score: { home: 1, away: 0 },
      eventsHash: 'official-events-hash',
      createdByActorType: 'SYSTEM',
      createdBySystemActor: 'seed-reset-test',
    },
  });
  await prisma.v1GameResultParticipant.create({
    data: { resultRevisionId: revisionId, participantId, sideId, cards: [] },
  });
  await prisma.v1GameResultRevision.update({
    where: { id: revisionId },
    data: { state: 'SUBMITTED', submittedAt: new Date('2026-08-01T11:00:00.000Z') },
  });
  await prisma.v1GameResultRevision.update({
    where: { id: revisionId },
    data: { state: 'OFFICIAL', officialAt: new Date('2026-08-01T12:00:00.000Z') },
  });
  await prisma.v1Game.update({ where: { id: gameId }, data: { currentOfficialRevisionId: revisionId } });
  await prisma.v1GameOfficialFact.create({
    data: {
      revisionId,
      gameId,
      revision: 1,
      sourceType: 'TOURNAMENT_FIXTURE',
      tournamentId,
      homeScore: 1,
      awayScore: 0,
      score: { home: 1, away: 0 },
      eventsHash: 'official-events-hash',
      officialAt: new Date('2026-08-01T12:00:00.000Z'),
    },
  });
  await prisma.v1GameOfficialResultCache.create({
    data: {
      revisionId,
      gameId,
      tournamentId,
      revision: 1,
      visibilityMode: 'OFFICIAL_ONLY',
      isCurrent: true,
      // Trigger v1_guard_game_official_result_cache requires source_hash to
      // exactly equal the revision's events_hash.
      sourceHash: 'official-events-hash',
      canonicalPayload: { home: 1, away: 0 },
      payloadHash: 'a'.repeat(64),
    },
  });
  await prisma.v1TeamRecordFact.create({
    data: {
      revisionId,
      gameId,
      teamId: ids.sport, // any existing-format UUID is fine — no FK on teamId
      result: 'WON',
      goalsFor: 1,
      goalsAgainst: 0,
      sourceHash: 'official-source-hash',
      officialAt: new Date('2026-08-01T12:00:00.000Z'),
    },
  });
}

describe('resetAlphaTournamentScenarios — tears down the Game graph before deleting alpha QA tournaments', () => {
  let footballConfigId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for this integration suite');
    }
    await prisma.$connect();

    await prisma.v1User.create({
      data: { id: ids.user, email: 'seed-reset@example.test', accountStatus: 'active', onboardingStatus: 'completed' },
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'seed-reset-sport', name: 'Seed Reset Sport' } });
    await prisma.v1Region.create({ data: { id: ids.region, code: 'SEED_RESET_REGION', name: 'Seed Reset Region', level: 1 } });
    footballConfigId = await loadFootballConfigId();

    await prisma.v1Tournament.create({
      data: { id: ids.bareTournament, sportId: ids.sport, title: 'Bare Backfilled Game Tournament' },
    });
    await prisma.v1TournamentFixture.create({
      data: { id: ids.bareFixture, tournamentId: ids.bareTournament, round: 'group', fixtureNumber: 1 },
    });
    await prisma.v1Game.create({
      data: {
        id: ids.bareGame,
        sourceType: 'TOURNAMENT_FIXTURE',
        tournamentFixtureId: ids.bareFixture,
        competitionConfigVersionId: footballConfigId,
        state: 'SCHEDULED',
      },
    });

    await prisma.v1Tournament.create({
      data: { id: ids.draftTournament, sportId: ids.sport, title: 'Draft Result Tournament' },
    });
    await prisma.v1TournamentFixture.create({
      data: { id: ids.draftFixture, tournamentId: ids.draftTournament, round: 'group', fixtureNumber: 1 },
    });
    await seedDraftResultGame({
      gameId: ids.draftGame,
      fixtureId: ids.draftFixture,
      revisionId: ids.draftRevision,
      participantId: ids.draftParticipant,
      sideId: ids.draftSideId,
      lineupId: ids.draftLineupId,
      configId: footballConfigId,
    });

    await prisma.v1Tournament.create({
      data: { id: ids.orphanFactTournament, sportId: ids.sport, title: 'Orphan Team Record Fact Tournament' },
    });
    await prisma.v1TournamentFixture.create({
      data: { id: ids.orphanFactFixture, tournamentId: ids.orphanFactTournament, round: 'group', fixtureNumber: 1 },
    });
    await seedDraftResultGameWithOrphanTeamRecordFact({
      gameId: ids.orphanFactGame,
      fixtureId: ids.orphanFactFixture,
      revisionId: ids.orphanFactRevision,
      configId: footballConfigId,
    });

    await prisma.v1Tournament.create({
      data: { id: ids.officialTournament, sportId: ids.sport, title: 'Official Result Tournament' },
    });
    await prisma.v1TournamentFixture.create({
      data: { id: ids.officialFixture, tournamentId: ids.officialTournament, round: 'group', fixtureNumber: 1 },
    });
    await seedOfficialResultGame({
      gameId: ids.officialGame,
      fixtureId: ids.officialFixture,
      tournamentId: ids.officialTournament,
      revisionId: ids.officialRevision,
      participantId: ids.officialParticipant,
      sideId: ids.officialSideId,
      lineupId: ids.officialLineupId,
      configId: footballConfigId,
    });

    // A tournament NOT in any reset's ID list — must survive every test untouched.
    await prisma.v1Tournament.create({
      data: { id: ids.otherTournament, sportId: ids.sport, title: 'Unrelated Real Tournament' },
    });
    await prisma.v1TournamentFixture.create({
      data: { id: ids.otherFixture, tournamentId: ids.otherTournament, round: 'group', fixtureNumber: 1 },
    });
    await prisma.v1Game.create({
      data: {
        id: ids.otherGame,
        sourceType: 'TOURNAMENT_FIXTURE',
        tournamentFixtureId: ids.otherFixture,
        competitionConfigVersionId: footballConfigId,
        state: 'SCHEDULED',
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('reproduces the reported production failure: a bare tournament delete is blocked by the Game FK (proves the Restrict edge is real, not accidentally cascaded)', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.v1TournamentCampaign.deleteMany({ where: { tournamentId: { in: [ids.bareTournament] } } });
        await tx.v1Tournament.deleteMany({ where: { id: { in: [ids.bareTournament] } } });
      }),
    ).rejects.toMatchObject({ code: 'P2003' });

    // Nothing was actually removed — the transaction rolled back.
    await expect(prisma.v1Tournament.findUniqueOrThrow({ where: { id: ids.bareTournament } })).resolves.toBeDefined();
  });

  it('resetAlphaTournamentScenarios succeeds where the bare delete failed: a Game with no result at all (the real fixture-game-backfill shape)', async () => {
    await prisma.$transaction((tx) => resetAlphaTournamentScenarios(tx, [ids.bareTournament]));

    await expect(prisma.v1Tournament.findUnique({ where: { id: ids.bareTournament } })).resolves.toBeNull();
    await expect(prisma.v1TournamentFixture.findUnique({ where: { id: ids.bareFixture } })).resolves.toBeNull();
    await expect(prisma.v1Game.findUnique({ where: { id: ids.bareGame } })).resolves.toBeNull();
  });

  it('also succeeds for a Game whose result was drafted but never submitted, clearing the revision, participant, escalation and decision', async () => {
    await prisma.$transaction((tx) => resetAlphaTournamentScenarios(tx, [ids.draftTournament]));

    await expect(prisma.v1Tournament.findUnique({ where: { id: ids.draftTournament } })).resolves.toBeNull();
    await expect(prisma.v1Game.findUnique({ where: { id: ids.draftGame } })).resolves.toBeNull();
    await expect(prisma.v1GameResultRevision.findUnique({ where: { id: ids.draftRevision } })).resolves.toBeNull();
    await expect(
      prisma.v1GameResultParticipant.findMany({ where: { resultRevisionId: ids.draftRevision } }),
    ).resolves.toHaveLength(0);
    await expect(
      prisma.v1ResultEscalation.findMany({ where: { resultRevisionId: ids.draftRevision } }),
    ).resolves.toHaveLength(0);
    await expect(
      prisma.v1GameResultDecision.findMany({ where: { revisionId: ids.draftRevision } }),
    ).resolves.toHaveLength(0);
  });

  it('refuses a DRAFT-revision Game carrying an orphan team record fact, deleting nothing, because that fact is append-only by design regardless of revision state', async () => {
    await expect(
      prisma.$transaction((tx) => resetAlphaTournamentScenarios(tx, [ids.orphanFactTournament])),
    ).rejects.toThrow(/team record fact/);

    // The whole transaction rolled back — every row this scenario owns is still there.
    await expect(prisma.v1Tournament.findUniqueOrThrow({ where: { id: ids.orphanFactTournament } })).resolves.toBeDefined();
    await expect(prisma.v1Game.findUniqueOrThrow({ where: { id: ids.orphanFactGame } })).resolves.toBeDefined();
    await expect(
      prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: ids.orphanFactRevision } }),
    ).resolves.toBeDefined();
    await expect(
      prisma.v1TeamRecordFact.findFirstOrThrow({ where: { revisionId: ids.orphanFactRevision } }),
    ).resolves.toBeDefined();
  });

  it('refuses a Game whose result went OFFICIAL, deleting nothing, because that result is permanently append-only by design', async () => {
    await expect(
      prisma.$transaction((tx) => resetAlphaTournamentScenarios(tx, [ids.officialTournament])),
    ).rejects.toThrow(/permanently append-only/);

    // The whole transaction rolled back — every row this scenario owns is still there.
    await expect(prisma.v1Tournament.findUniqueOrThrow({ where: { id: ids.officialTournament } })).resolves.toBeDefined();
    await expect(prisma.v1Game.findUniqueOrThrow({ where: { id: ids.officialGame } })).resolves.toBeDefined();
    await expect(
      prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: ids.officialRevision } }),
    ).resolves.toBeDefined();
    await expect(
      prisma.v1GameOfficialResultCache.findUniqueOrThrow({ where: { revisionId: ids.officialRevision } }),
    ).resolves.toBeDefined();
  });

  it('never touches a tournament outside the given ID list', async () => {
    await expect(prisma.v1Tournament.findUniqueOrThrow({ where: { id: ids.otherTournament } })).resolves.toBeDefined();
    await expect(prisma.v1TournamentFixture.findUniqueOrThrow({ where: { id: ids.otherFixture } })).resolves.toBeDefined();
    await expect(prisma.v1Game.findUniqueOrThrow({ where: { id: ids.otherGame } })).resolves.toBeDefined();
  });

  it('is idempotent — running it again on already-deleted scenarios is a no-op, not an error', async () => {
    await expect(
      prisma.$transaction((tx) => resetAlphaTournamentScenarios(tx, [ids.bareTournament, ids.draftTournament])),
    ).resolves.toBeUndefined();
  });
});

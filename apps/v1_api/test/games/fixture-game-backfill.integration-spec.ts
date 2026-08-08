import { PrismaService } from '../../src/prisma/prisma.service';
import { PublicTournamentRecordsService } from '../../src/games/public-records/public-tournament-records.service';
import {
  runFixtureGameBackfill,
  type FixtureGameBackfillResult,
} from '../../src/games/migration/fixture-game-backfill';
import { runCompetitionConfigContractPhaseBackfill } from '../../src/tournaments/competition-config/competition-config-backfill';
import { FOOTBALL_V1_CONFIG } from '../../src/tournaments/competition-config/competition-config';

/**
 * Alpha runtime bug: every tournament's public schedule renders "아직 확정된
 * 일정이 없어요" because `v1_tournament_fixtures` rows created before the
 * Game domain shipped have no `V1Game` row, so
 * `PublicTournamentRecordsService.presentScheduleEntry()`'s
 * `fixture.game?.visibilityPolicy?.mode ?? 'HIDDEN'` always resolves to
 * hidden and every fixture is filtered out. This suite exercises the
 * production backfill (`runFixtureGameBackfill`) against a real database and
 * proves it fixes exactly that: the backfilled fixture actually shows up
 * through the real public `getSchedule()` read path, not just "a Game row
 * exists in the DB".
 *
 * Fixtures created below deliberately span the ownership boundary this
 * module documents in its own header comment: `status: 'completed'`
 * fixtures are Task 10's (`game-result-backfill.ts`) job to give a Game at
 * all — this module only ever adds the period/policy rows Task 10 never
 * writes, for whichever Game already exists.
 */

const id = (suffix: string) => `68000000-0000-4000-8000-${suffix}`;

const ids = {
  user: id('000000000001'),
  sport: id('000000000002'),
  region: id('000000000003'),
  tournament: id('000000000004'),

  homeTeamScheduled: id('000000000010'),
  awayTeamScheduled: id('000000000011'),
  homeRegScheduled: id('000000000012'),
  awayRegScheduled: id('000000000013'),
  homePlayerScheduled: id('000000000014'),
  awayPlayerScheduled: id('000000000015'),
  fixtureScheduled: id('000000000016'),

  homeTeamLive: id('000000000020'),
  awayTeamLive: id('000000000021'),
  homeRegLive: id('000000000022'),
  awayRegLive: id('000000000023'),
  fixtureInProgress: id('000000000024'),

  statusOnlyConfig: id('000000000030'),
  homeTeamStatusOnly: id('000000000031'),
  awayTeamStatusOnly: id('000000000032'),
  homeRegStatusOnly: id('000000000033'),
  awayRegStatusOnly: id('000000000034'),
  fixtureStatusOnly: id('000000000035'),

  fixtureCompletedNoGame: id('000000000040'),

  fixtureCompletedWithBareGame: id('000000000050'),
  bareGame: id('000000000051'),

  fixtureConfigMissing: id('000000000060'),
} as const;

const prisma = new PrismaService();
const publicRecords = new PublicTournamentRecordsService(prisma);

describe('fixture-game-backfill — repairs the "public schedule always empty" bug', () => {
  let applyResult: FixtureGameBackfillResult;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the fixture-game-backfill integration suite');
    }
    await prisma.$connect();

    await prisma.v1User.create({
      data: {
        id: ids.user,
        email: 'fixture-game-backfill@example.test',
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    await prisma.v1Sport.create({
      data: { id: ids.sport, code: 'football', name: 'Fixture Backfill Football' },
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'FIXTURE_BACKFILL_REGION', name: 'Fixture Backfill Region', level: 1 },
    });

    // Seeds the canonical football-v1/futsal-v1 ACTIVE config rows, exactly
    // like the CI migration gate and an alpha deploy both do.
    await runCompetitionConfigContractPhaseBackfill(prisma);
    const footballConfig = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
      where: { name: 'football-v1', status: 'ACTIVE' },
    });
    const footballConfigId = footballConfig.id;

    await prisma.v1Tournament.create({
      data: {
        id: ids.tournament,
        sportId: ids.sport,
        title: 'Fixture Backfill Tournament',
        status: 'in_progress',
        competitionConfigVersionId: footballConfigId,
        // Bracket must be published for PublicTournamentRecordsService.getSchedule()
        // to return anything at all — this is the pre-condition the real
        // route enforces before it ever reaches presentScheduleEntry().
        bracketPublishedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });

    await prisma.v1CompetitionConfigVersion.create({
      data: {
        id: ids.statusOnlyConfig,
        sportCode: 'football',
        name: 'fixture-backfill-status-only',
        version: 1,
        status: 'ACTIVE',
        periods: FOOTBALL_V1_CONFIG.periods,
        events: FOOTBALL_V1_CONFIG.events,
        lineup: FOOTBALL_V1_CONFIG.lineup,
        result: FOOTBALL_V1_CONFIG.result,
        tieBreak: FOOTBALL_V1_CONFIG.tieBreak,
        // Deliberately NOT validateCompetitionConfig()-shaped: real configs
        // can never carry `mode: 'status_only'` (the validator hard-requires
        // `default: 'live'` + `allowed: ['live','official']`), so this is
        // written directly to the DB to exercise the derivation branch
        // games.service.ts's createFromSourceInTransaction() has always had
        // but nothing else in this codebase currently triggers.
        visibility: { mode: 'status_only', default: 'live', allowed: ['live', 'official'] },
        contentHash: 'fixture-backfill-status-only-hash',
      },
    });

    await prisma.v1Team.createMany({
      data: [
        { id: ids.homeTeamScheduled, ownerUserId: ids.user, sportId: ids.sport, regionId: ids.region, name: 'Scheduled Home' },
        { id: ids.awayTeamScheduled, ownerUserId: ids.user, sportId: ids.sport, regionId: ids.region, name: 'Scheduled Away' },
        { id: ids.homeTeamLive, ownerUserId: ids.user, sportId: ids.sport, regionId: ids.region, name: 'Live Home' },
        { id: ids.awayTeamLive, ownerUserId: ids.user, sportId: ids.sport, regionId: ids.region, name: 'Live Away' },
        { id: ids.homeTeamStatusOnly, ownerUserId: ids.user, sportId: ids.sport, regionId: ids.region, name: 'StatusOnly Home' },
        { id: ids.awayTeamStatusOnly, ownerUserId: ids.user, sportId: ids.sport, regionId: ids.region, name: 'StatusOnly Away' },
      ],
    });

    await prisma.v1TournamentRegistration.createMany({
      data: [
        { id: ids.homeRegScheduled, tournamentId: ids.tournament, teamId: ids.homeTeamScheduled, appliedByUserId: ids.user, status: 'confirmed' },
        { id: ids.awayRegScheduled, tournamentId: ids.tournament, teamId: ids.awayTeamScheduled, appliedByUserId: ids.user, status: 'confirmed' },
        { id: ids.homeRegLive, tournamentId: ids.tournament, teamId: ids.homeTeamLive, appliedByUserId: ids.user, status: 'confirmed' },
        { id: ids.awayRegLive, tournamentId: ids.tournament, teamId: ids.awayTeamLive, appliedByUserId: ids.user, status: 'confirmed' },
        { id: ids.homeRegStatusOnly, tournamentId: ids.tournament, teamId: ids.homeTeamStatusOnly, appliedByUserId: ids.user, status: 'confirmed' },
        { id: ids.awayRegStatusOnly, tournamentId: ids.tournament, teamId: ids.awayTeamStatusOnly, appliedByUserId: ids.user, status: 'confirmed' },
      ],
    });
    await prisma.v1TournamentPlayer.createMany({
      data: [
        { id: ids.homePlayerScheduled, registrationId: ids.homeRegScheduled, userId: ids.user, realName: 'Scheduled Home Player', eligibilityStatus: 'non_pro' },
        { id: ids.awayPlayerScheduled, registrationId: ids.awayRegScheduled, userId: ids.user, realName: 'Scheduled Away Player', eligibilityStatus: 'non_pro' },
      ],
    });

    await prisma.v1TournamentFixture.createMany({
      data: [
        {
          id: ids.fixtureScheduled,
          tournamentId: ids.tournament,
          round: 'group',
          fixtureNumber: 1,
          status: 'scheduled',
          scheduledAt: new Date('2026-08-10T09:00:00.000Z'),
          homeRegistrationId: ids.homeRegScheduled,
          awayRegistrationId: ids.awayRegScheduled,
          competitionConfigVersionId: footballConfigId,
        },
        {
          id: ids.fixtureInProgress,
          tournamentId: ids.tournament,
          round: 'group',
          fixtureNumber: 2,
          status: 'in_progress',
          scheduledAt: new Date('2026-08-10T10:00:00.000Z'),
          homeRegistrationId: ids.homeRegLive,
          awayRegistrationId: ids.awayRegLive,
          competitionConfigVersionId: footballConfigId,
        },
        {
          id: ids.fixtureStatusOnly,
          tournamentId: ids.tournament,
          round: 'group',
          fixtureNumber: 3,
          status: 'scheduled',
          scheduledAt: new Date('2026-08-10T11:00:00.000Z'),
          homeRegistrationId: ids.homeRegStatusOnly,
          awayRegistrationId: ids.awayRegStatusOnly,
          competitionConfigVersionId: ids.statusOnlyConfig,
        },
        {
          id: ids.fixtureCompletedNoGame,
          tournamentId: ids.tournament,
          round: 'group',
          fixtureNumber: 4,
          status: 'completed',
          scheduledAt: new Date('2026-08-05T09:00:00.000Z'),
          competitionConfigVersionId: footballConfigId,
        },
        {
          id: ids.fixtureCompletedWithBareGame,
          tournamentId: ids.tournament,
          round: 'group',
          fixtureNumber: 5,
          status: 'completed',
          scheduledAt: new Date('2026-08-05T10:00:00.000Z'),
          competitionConfigVersionId: footballConfigId,
        },
        {
          id: ids.fixtureConfigMissing,
          tournamentId: ids.tournament,
          round: 'group',
          fixtureNumber: 6,
          status: 'scheduled',
          scheduledAt: new Date('2026-08-10T12:00:00.000Z'),
          competitionConfigVersionId: null,
        },
      ],
    });

    // Simulates exactly what Task 10's createImportedGame() persists for a
    // completed fixture: a real Game (state ENDED, pinned config) with NO
    // V1GamePeriod rows and NO V1GameVisibilityPolicy row — confirmed by
    // reading game-result-backfill.ts, which never writes either.
    await prisma.v1Game.create({
      data: {
        id: ids.bareGame,
        sourceType: 'TOURNAMENT_FIXTURE',
        tournamentFixtureId: ids.fixtureCompletedWithBareGame,
        competitionConfigVersionId: footballConfigId,
        state: 'ENDED',
        version: 1,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('dry-run reports what apply will do without writing anything', async () => {
    const dryRun = await runFixtureGameBackfill(prisma, { mode: 'dry-run' });
    expect(dryRun.counts).toEqual({
      gamesCreated: 3, // scheduled, in_progress, status-only
      periodsBackfilled: 1, // the bare completed-fixture game
      visibilityPoliciesBackfilled: 1, // same bare game
      quarantined: 1, // config-missing fixture
    });
    expect(dryRun.quarantine).toEqual([{ fixtureId: ids.fixtureConfigMissing, reason: 'CONFIG_MISSING' }]);

    const gamesWritten = await prisma.v1Game.count({
      where: { tournamentFixtureId: { in: [ids.fixtureScheduled, ids.fixtureInProgress, ids.fixtureStatusOnly] } },
    });
    expect(gamesWritten).toBe(0);
    const bareGamePeriods = await prisma.v1GamePeriod.count({ where: { gameId: ids.bareGame } });
    expect(bareGamePeriods).toBe(0);
  });

  it('apply creates the 3 missing Games, backfills the 1 bare Game, and quarantines the 1 config-missing fixture', async () => {
    applyResult = await runFixtureGameBackfill(prisma, { mode: 'apply' });
    expect(applyResult.counts).toEqual({
      gamesCreated: 3,
      periodsBackfilled: 1,
      visibilityPoliciesBackfilled: 1,
      quarantined: 1,
    });
    expect(applyResult.quarantine).toEqual([{ fixtureId: ids.fixtureConfigMissing, reason: 'CONFIG_MISSING' }]);
  });

  it('the scheduled fixture gets a full Game (sides, one lineup per side, participants, 2 periods, LIVE policy) and is now visible in the public schedule', async () => {
    const fixture = await prisma.v1TournamentFixture.findUniqueOrThrow({
      where: { id: ids.fixtureScheduled },
      include: {
        game: {
          include: {
            sides: { orderBy: { sideKey: 'asc' } },
            lineups: true,
            participants: { orderBy: { displayNameSnapshot: 'asc' } },
            periods: { orderBy: { number: 'asc' } },
            visibilityPolicy: true,
          },
        },
      },
    });
    const game = fixture.game;
    if (game === null) throw new Error('Expected the backfill to have created a Game');
    expect(game.state).toBe('SCHEDULED');
    // Postgres native-enum ordering follows the enum's declared label order
    // (HOME before AWAY in schema.prisma), not lexicographic string order.
    expect(game.sides.map((side) => side.sideKey)).toEqual(['HOME', 'AWAY']);
    expect(game.sides.map((side) => side.displayNameSnapshot).sort()).toEqual(['Scheduled Away', 'Scheduled Home']);
    expect(game.lineups).toHaveLength(2);
    expect(game.participants.map((p) => p.displayNameSnapshot)).toEqual([
      'Scheduled Away Player',
      'Scheduled Home Player',
    ]);
    expect(game.periods).toHaveLength(2);
    expect(game.periods.every((period) => period.state === 'SCHEDULED')).toBe(true);
    expect(game.visibilityPolicy?.mode).toBe('LIVE');

    // The actual regression this backfill exists to fix: the fixture must
    // now come back through the real public route, not just have a Game row.
    const schedule = await publicRecords.getSchedule(ids.tournament, {});
    const entry = schedule.items.find((item) => item.fixtureId === ids.fixtureScheduled);
    expect(entry).toBeDefined();
    expect(entry?.visibilityMode).not.toBe('hidden');
  });

  it('the in_progress fixture also gets a Game, left at the schema-default SCHEDULED state (no fabricated LIVE transition), and is still publicly visible', async () => {
    const fixture = await prisma.v1TournamentFixture.findUniqueOrThrow({
      where: { id: ids.fixtureInProgress },
      include: { game: true },
    });
    if (fixture.game === null) throw new Error('Expected the backfill to have created a Game');
    expect(fixture.game.state).toBe('SCHEDULED');

    const schedule = await publicRecords.getSchedule(ids.tournament, {});
    const entry = schedule.items.find((item) => item.fixtureId === ids.fixtureInProgress);
    expect(entry).toBeDefined();
    expect(entry?.visibilityMode).not.toBe('hidden');
  });

  it('derives a STATUS_ONLY visibility policy from a config whose visibility.mode is status_only, instead of the LIVE default', async () => {
    const fixture = await prisma.v1TournamentFixture.findUniqueOrThrow({
      where: { id: ids.fixtureStatusOnly },
      include: { game: { include: { visibilityPolicy: true } } },
    });
    if (fixture.game === null) throw new Error('Expected the backfill to have created a Game');
    expect(fixture.game.visibilityPolicy?.mode).toBe('STATUS_ONLY');
  });

  it('does not create a Game for a completed fixture with no existing Game — that stays Task 10s job', async () => {
    const fixture = await prisma.v1TournamentFixture.findUniqueOrThrow({
      where: { id: ids.fixtureCompletedNoGame },
      include: { game: true },
    });
    expect(fixture.game).toBeNull();
  });

  it('backfills periods + a LIVE policy onto an existing bare completed-fixture Game, without creating a second Game or touching its state/version', async () => {
    const games = await prisma.v1Game.findMany({ where: { tournamentFixtureId: ids.fixtureCompletedWithBareGame } });
    expect(games).toHaveLength(1);
    expect(games[0].id).toBe(ids.bareGame);
    expect(games[0].state).toBe('ENDED');
    expect(games[0].version).toBe(1);

    const periods = await prisma.v1GamePeriod.findMany({ where: { gameId: ids.bareGame }, orderBy: { number: 'asc' } });
    expect(periods).toHaveLength(2);
    const policy = await prisma.v1GameVisibilityPolicy.findUniqueOrThrow({ where: { gameId: ids.bareGame } });
    expect(policy.mode).toBe('LIVE');
  });

  it('running apply again writes nothing new (idempotent) — the config-missing fixture is still reported as quarantined every run, which is a read-only classification, not a write', async () => {
    const second = await runFixtureGameBackfill(prisma, { mode: 'apply' });
    expect(second.counts).toEqual({
      gamesCreated: 0,
      periodsBackfilled: 0,
      visibilityPoliciesBackfilled: 0,
      quarantined: 1,
    });
    expect(second.quarantine).toEqual([{ fixtureId: ids.fixtureConfigMissing, reason: 'CONFIG_MISSING' }]);

    const totalGamesForBackfillFixtures = await prisma.v1Game.count({
      where: {
        tournamentFixtureId: {
          in: [ids.fixtureScheduled, ids.fixtureInProgress, ids.fixtureStatusOnly, ids.fixtureCompletedWithBareGame],
        },
      },
    });
    expect(totalGamesForBackfillFixtures).toBe(4);
  });
});

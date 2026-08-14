import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService } from '../../src/games/games.service';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Task 21 gap-closer: `GamesService.listLineups()` grew a second query
 * (`v1GameParticipant.findMany` by `lineupId IN (...)`) that appends a
 * `participants` array to every returned lineup row -- see the docstring on
 * `listLineups()` in `apps/v1_api/src/games/games.service.ts`. That production
 * behavior had zero coverage anywhere in the repo: `games.service.spec.ts`
 * only unit-tests the pure `groupParticipantsByLineupId()` helper against a
 * hand-built in-memory array, never the real Prisma round trip, and every
 * integration spec that calls `listLineups()` only asserts on
 * `id`/`state`/`sideId` via `expect.objectContaining`, which is blind to
 * whether `participants` exists at all.
 *
 * This spec seeds two REAL lineups (one per side) with real
 * `V1GameParticipant` rows via Prisma -- not a mocked client -- and asserts
 * the returned rows carry the right roster, correctly grouped per lineup. If
 * the second query or the appended `participants` field were reverted,
 * `row.participants` would be `undefined` and every assertion below would
 * fail.
 */
const ids = {
  hostUser: '64000000-0000-4000-8000-000000000001',
  sport: '64000000-0000-4000-8000-000000000010',
  region: '64000000-0000-4000-8000-000000000011',
  hostTeam: '64000000-0000-4000-8000-000000000020',
  teamMatch: '64000000-0000-4000-8000-000000000030',
} as const;

const prisma = new PrismaService();
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());

const authUser = (id: string) => ({
  id,
  email: `${id}@example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

describe('Task 21 GamesService.listLineups() participants roster', () => {
  let gameId: string;
  let homeSideId: string;
  let awaySideId: string;
  let homeLineupId: string;
  let awayLineupId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the Task 21 listLineups() participants spec');
    }
    await prisma.$connect();

    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('The migrated football-v1 competition preset is required');
    }

    await prisma.v1User.create({
      data: {
        id: ids.hostUser,
        email: 'task21-lineup-participants-host@example.test',
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    // Shared 'football' sport code with a per-suite NAME -- v1_default_competition_config_version()
    // only maps soccer/football/futsal codes and raises COMPETITION_CONFIG_SPORT_UNSUPPORTED
    // otherwise; reusing the code (not the row id) across suites avoids that trap.
    const sport = await prisma.v1Sport.upsert({
      where: { code: 'football' },
      update: {},
      create: { id: ids.sport, code: 'football', name: 'Task 21 lineup participants football' },
      select: { id: true },
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK21_LINEUP_PARTICIPANTS', name: 'Task 21 region', level: 1 },
    });
    await prisma.v1Team.create({
      data: {
        id: ids.hostTeam,
        ownerUserId: ids.hostUser,
        sportId: sport.id,
        regionId: ids.region,
        name: 'Task 21 lineup participants host',
      },
    });
    await prisma.v1TeamMembership.create({
      data: { teamId: ids.hostTeam, userId: ids.hostUser, role: 'owner', status: 'active' },
    });
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.teamMatch,
        hostTeamId: ids.hostTeam,
        createdByUserId: ids.hostUser,
        sportId: sport.id,
        regionId: ids.region,
        title: 'Task 21 lineup participants match',
        placeName: 'Task 21 ground',
        startAt: new Date('2026-08-01T00:00:00.000Z'),
        competitionConfigVersionId: config.id,
      },
    });

    const game = await prisma.v1Game.create({
      data: {
        sourceType: V1GameSourceType.TEAM_MATCH,
        teamMatchId: ids.teamMatch,
        state: 'SCHEDULED',
        competitionConfigVersionId: config.id,
      },
    });
    gameId = game.id;

    const homeSide = await prisma.v1GameSide.create({
      data: { gameId, sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Task 21 Home' },
    });
    homeSideId = homeSide.id;
    const awaySide = await prisma.v1GameSide.create({
      data: { gameId, sideKey: V1GameSideKey.AWAY, displayNameSnapshot: 'Task 21 Away' },
    });
    awaySideId = awaySide.id;

    const homeLineup = await prisma.v1GameLineup.create({
      data: { gameId, sideId: homeSideId, revision: 1 },
    });
    homeLineupId = homeLineup.id;
    const awayLineup = await prisma.v1GameLineup.create({
      data: { gameId, sideId: awaySideId, revision: 1 },
    });
    awayLineupId = awayLineup.id;

    // Insert Bob (jersey 10) before Alice (jersey 7) so a correct
    // `orderBy: [{ jerseyNumber: 'asc' }]` in the production query is the ONLY
    // thing that can put Alice ahead of Bob in the response -- insertion
    // order alone would return Bob first if the ordering clause were dropped.
    await prisma.v1GameParticipant.create({
      data: {
        gameId,
        sideId: homeSideId,
        lineupId: homeLineupId,
        displayNameSnapshot: 'Bob (home)',
        jerseyNumber: 10,
      },
    });
    await prisma.v1GameParticipant.create({
      data: {
        gameId,
        sideId: homeSideId,
        lineupId: homeLineupId,
        displayNameSnapshot: 'Alice (home)',
        jerseyNumber: 7,
      },
    });
    await prisma.v1GameParticipant.create({
      data: {
        gameId,
        sideId: awaySideId,
        lineupId: awayLineupId,
        displayNameSnapshot: 'Carol (away)',
        jerseyNumber: 9,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('attaches each lineup its own participants, correctly grouped by lineupId with no cross-lineup leakage', async () => {
    const rows = await service.listLineups(authUser(ids.hostUser), gameId);

    expect(rows).toHaveLength(2);
    const homeRow = rows.find((row) => row.id === homeLineupId);
    const awayRow = rows.find((row) => row.id === awayLineupId);
    if (homeRow === undefined || awayRow === undefined) {
      throw new Error('expected both seeded lineup rows to be present in listLineups() output');
    }

    // The home lineup's roster: exactly Alice + Bob, ordered by jerseyNumber
    // asc (7 before 10) as the production query's own orderBy requests --
    // reverting either the second query or its orderBy clause makes this
    // fail (participants undefined, wrong order, or wrong membership).
    expect(homeRow.participants.map((p) => p.displayNameSnapshot)).toEqual([
      'Alice (home)',
      'Bob (home)',
    ]);
    expect(homeRow.participants.every((p) => p.lineupId === homeLineupId)).toBe(true);

    // The away lineup must carry ONLY Carol -- proving participants are
    // bucketed per lineupId rather than merged into one shared list (the
    // literal leak scenario the task calls out).
    expect(awayRow.participants.map((p) => p.displayNameSnapshot)).toEqual(['Carol (away)']);
    expect(awayRow.participants.every((p) => p.lineupId === awayLineupId)).toBe(true);

    // Neither Alice nor Bob may appear on the away row, and Carol may not
    // appear on the home row.
    expect(awayRow.participants.some((p) => p.displayNameSnapshot.includes('home'))).toBe(false);
    expect(homeRow.participants.some((p) => p.displayNameSnapshot.includes('away'))).toBe(false);
  });
});

import { PrismaService } from '../../src/prisma/prisma.service';
import { runCompetitionConfigContractPhaseBackfill } from '../../src/tournaments/competition-config/competition-config-backfill';
import { runTournamentStandingsRecalculation } from '../../src/tournaments/tournament-standings-recalculation';

/**
 * Real-Postgres regression test for the deploy-pipeline batch recalculation
 * CLI's logic module. This is the test that actually pins the bug this PR
 * fixes: a mocked-prisma unit test can't catch a wrong discovery query or
 * `include` shape, but a real DB round-trip does.
 *
 * Seeds two tournaments in one DB:
 *  - `ids.tournamentA`: two teams, one completed fixture recorded via the
 *    legacy `V1TournamentFixtureResult` relation (the same fallback path
 *    `resolveTournamentFixtureOfficialScore()` uses when a fixture has no
 *    `V1Game` yet — exercised elsewhere against a mocked tx by
 *    `game-result-standings-projection.service.spec.ts`'s OFFICIAL-revision
 *    case; this test's job is the real-DB discovery/include wiring, not
 *    re-proving score resolution). 3:1 → team A should win 3 points.
 *  - `ids.tournamentB`: `competitionConfigVersionId: null` (no active
 *    config) — must land in `quarantine`, and any standings row that
 *    already existed for it must be left untouched.
 */
const ids = {
  adminUserId: '86000000-0000-4000-8000-000000000001',
  adminId: '86000000-0000-4000-8000-000000000002',
  soccerSportId: '86000000-0000-4000-8000-000000000010',
  regionId: '86000000-0000-4000-8000-000000000020',
  teamIds: [
    '86000000-0000-4000-8000-000000000031',
    '86000000-0000-4000-8000-000000000032',
  ],
  tournamentA: '86000000-0000-4000-8000-000000000040',
  groupA: '86000000-0000-4000-8000-000000000041',
  registrationIdsA: [
    '86000000-0000-4000-8000-000000000051',
    '86000000-0000-4000-8000-000000000052',
  ],
  fixtureA: '86000000-0000-4000-8000-000000000061',
  tournamentB: '86000000-0000-4000-8000-000000000070',
  groupB: '86000000-0000-4000-8000-000000000071',
  registrationIdsB: [
    '86000000-0000-4000-8000-000000000081',
    '86000000-0000-4000-8000-000000000082',
  ],
} as const;

const prisma = new PrismaService();

describe('tournament-standings-recalculation (real DB)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for this integration verification');
    }
    await prisma.$connect();

    await prisma.v1User.create({
      data: {
        id: ids.adminUserId,
        email: 'standings-recalc-admin@example.test',
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    await prisma.v1AdminUser.create({
      data: { id: ids.adminId, userId: ids.adminUserId, adminRole: 'owner', status: 'active' },
    });
    await prisma.v1Region.create({
      data: { id: ids.regionId, code: 'standings-recalc-region', name: 'Standings recalc region', level: 1 },
    });
    await prisma.v1Sport.create({
      data: { id: ids.soccerSportId, code: 'soccer', name: '축구', sortOrder: 1 },
    });
    await prisma.v1Team.createMany({
      data: ids.teamIds.map((id, index) => ({
        id,
        ownerUserId: ids.adminUserId,
        sportId: ids.soccerSportId,
        regionId: ids.regionId,
        name: `Standings recalc team ${index + 1}`,
      })),
    });

    // Tournament A — valid config, one completed fixture (3:1).
    await prisma.v1Tournament.create({
      data: { id: ids.tournamentA, sportId: ids.soccerSportId, title: 'Standings recalc A', status: 'in_progress' },
    });
    await prisma.v1TournamentGroup.create({
      data: { id: ids.groupA, tournamentId: ids.tournamentA, name: 'A조', phase: 'group' },
    });
    for (let index = 0; index < ids.registrationIdsA.length; index += 1) {
      await prisma.v1TournamentRegistration.create({
        data: {
          id: ids.registrationIdsA[index],
          tournamentId: ids.tournamentA,
          teamId: ids.teamIds[index],
          appliedByUserId: ids.adminUserId,
          status: 'confirmed',
        },
      });
      await prisma.v1TournamentGroupTeam.create({
        data: { groupId: ids.groupA, registrationId: ids.registrationIdsA[index], sortOrder: index },
      });
    }
    await prisma.v1TournamentFixture.create({
      data: {
        id: ids.fixtureA,
        tournamentId: ids.tournamentA,
        groupId: ids.groupA,
        round: 'group_a',
        fixtureNumber: 1,
        homeRegistrationId: ids.registrationIdsA[0],
        awayRegistrationId: ids.registrationIdsA[1],
        status: 'completed',
        result: { create: { homeScore: 3, awayScore: 1, recordedByAdminUserId: ids.adminId } },
      },
    });
    // Tournament A's tournament/fixture are created without an explicit
    // competitionConfigVersionId (the v1_pin_tournament_competition_config
    // trigger that used to fill it in belongs to the deferred
    // contract-phase migration) — run the same production backfill CLI the
    // shared Task 11 fixture uses so tournament A ends up pinned exactly
    // like it will be in production.
    await runCompetitionConfigContractPhaseBackfill(prisma);

    // Tournament B — no active competition config → must be quarantined.
    await prisma.v1Tournament.create({
      data: {
        id: ids.tournamentB,
        sportId: ids.soccerSportId,
        title: 'Standings recalc B (no config)',
        status: 'in_progress',
      },
    });
    await prisma.v1TournamentGroup.create({
      data: { id: ids.groupB, tournamentId: ids.tournamentB, name: 'A조', phase: 'group' },
    });
    for (let index = 0; index < ids.registrationIdsB.length; index += 1) {
      await prisma.v1TournamentRegistration.create({
        data: {
          id: ids.registrationIdsB[index],
          tournamentId: ids.tournamentB,
          teamId: ids.teamIds[index],
          appliedByUserId: ids.adminUserId,
          status: 'confirmed',
        },
      });
      await prisma.v1TournamentGroupTeam.create({
        data: { groupId: ids.groupB, registrationId: ids.registrationIdsB[index], sortOrder: index },
      });
    }
    // A pre-existing standings row that must be left untouched because
    // tournament B is quarantined (no config) — proves quarantine doesn't
    // silently wipe or overwrite what was already there.
    await prisma.v1TournamentStanding.create({
      data: {
        groupId: ids.groupB,
        registrationId: ids.registrationIdsB[0],
        points: 42,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        position: 1,
        recalculatedAt: new Date('2020-01-01T00:00:00.000Z'),
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('recalculates standings from real fixture results and quarantines tournaments without a config', async () => {
    const result = await runTournamentStandingsRecalculation(prisma);

    expect(result.counts.tournamentsScanned).toBeGreaterThanOrEqual(2);
    expect(result.counts.tournamentsRecalculated).toBeGreaterThanOrEqual(1);
    expect(result.quarantine).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tournamentId: ids.tournamentB, reason: 'CONFIG_INVALID' }),
      ]),
    );

    const standingsA = await prisma.v1TournamentStanding.findMany({
      where: { groupId: ids.groupA },
      orderBy: { position: 'asc' },
    });
    expect(
      standingsA.map((standing) => ({
        registrationIndex: ids.registrationIdsA.findIndex((id) => id === standing.registrationId),
        points: standing.points,
        wins: standing.wins,
        losses: standing.losses,
        goalsFor: standing.goalsFor,
        goalsAgainst: standing.goalsAgainst,
        position: standing.position,
      })),
    ).toEqual([
      { registrationIndex: 0, points: 3, wins: 1, losses: 0, goalsFor: 3, goalsAgainst: 1, position: 1 },
      { registrationIndex: 1, points: 0, wins: 0, losses: 1, goalsFor: 1, goalsAgainst: 3, position: 2 },
    ]);

    // Tournament B was quarantined — its pre-existing standing row must be
    // exactly as seeded, not touched by this run.
    const standingB = await prisma.v1TournamentStanding.findUniqueOrThrow({
      where: {
        groupId_registrationId: { groupId: ids.groupB, registrationId: ids.registrationIdsB[0] },
      },
    });
    expect(standingB).toMatchObject({ points: 42, recalculatedAt: new Date('2020-01-01T00:00:00.000Z') });
  });
});

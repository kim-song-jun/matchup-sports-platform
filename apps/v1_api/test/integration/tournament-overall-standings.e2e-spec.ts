import { PrismaService } from '../../src/prisma/prisma.service';
import { runCompetitionConfigContractPhaseBackfill } from '../../src/tournaments/competition-config/competition-config-backfill';
import { validateCompetitionConfig } from '../../src/tournaments/competition-config/competition-config';
import { recalculateAndUpsertGroupStandings } from '../../src/tournaments/tournament-group-standings';
import { recalculateAndUpsertOverallStandings } from '../../src/tournaments/tournament-overall-standings';

/**
 * `TournamentBracketService.recalculateStandings()`의 핵심 불변식을 실제
 * Postgres 트랜잭션으로 고정한다: `recalculateAndUpsertGroupStandings`가
 * 호출되는 모든 경로에서 `recalculateAndUpsertOverallStandings`도 같은
 * 트랜잭션으로 이어져야 하고(승점 합계 일치), 통합 쪽이 실패하면 조별도
 * 함께 롤백되어야 한다(둘 중 하나만 반영되는 상태는 절대 만들어지면 안 됨).
 *
 * 2개 조 × 각 2팀, 각 조 1경기(3:1, 2:2)로 시나리오를 구성한다.
 */
const ids = {
  adminUserId: '87000000-0000-4000-8000-000000000001',
  adminId: '87000000-0000-4000-8000-000000000002',
  soccerSportId: '87000000-0000-4000-8000-000000000010',
  regionId: '87000000-0000-4000-8000-000000000020',
  teamIds: [
    '87000000-0000-4000-8000-000000000031',
    '87000000-0000-4000-8000-000000000032',
    '87000000-0000-4000-8000-000000000033',
    '87000000-0000-4000-8000-000000000034',
  ],
  tournamentId: '87000000-0000-4000-8000-000000000040',
  groupA: '87000000-0000-4000-8000-000000000041',
  groupB: '87000000-0000-4000-8000-000000000042',
  registrationIdsA: [
    '87000000-0000-4000-8000-000000000051',
    '87000000-0000-4000-8000-000000000052',
  ],
  registrationIdsB: [
    '87000000-0000-4000-8000-000000000053',
    '87000000-0000-4000-8000-000000000054',
  ],
  fixtureA: '87000000-0000-4000-8000-000000000061',
  fixtureB: '87000000-0000-4000-8000-000000000062',
} as const;

const prisma = new PrismaService();

describe('recalculateAndUpsertOverallStandings + recalculateAndUpsertGroupStandings (real DB)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for this integration verification');
    }
    await prisma.$connect();

    await prisma.v1User.create({
      data: {
        id: ids.adminUserId,
        email: 'overall-standings-admin@example.test',
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    await prisma.v1AdminUser.create({
      data: { id: ids.adminId, userId: ids.adminUserId, adminRole: 'owner', status: 'active' },
    });
    await prisma.v1Region.create({
      data: { id: ids.regionId, code: 'overall-standings-region', name: 'Overall standings region', level: 1 },
    });
    await prisma.v1Sport.create({
      data: { id: ids.soccerSportId, code: 'soccer', name: '축구', sortOrder: 1 },
    });
    await runCompetitionConfigContractPhaseBackfill(prisma);
    const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
      where: { sportCode: 'football', name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    await prisma.v1Team.createMany({
      data: ids.teamIds.map((id, index) => ({
        id,
        ownerUserId: ids.adminUserId,
        sportId: ids.soccerSportId,
        regionId: ids.regionId,
        name: `Overall standings team ${index + 1}`,
      })),
    });

    await prisma.v1Tournament.create({
      data: {
        id: ids.tournamentId,
        sportId: ids.soccerSportId,
        title: 'Overall standings tournament',
        status: 'in_progress',
        competitionConfigVersionId: config.id,
      },
    });
    await prisma.v1TournamentGroup.create({
      data: { id: ids.groupA, tournamentId: ids.tournamentId, name: 'A조', phase: 'group' },
    });
    await prisma.v1TournamentGroup.create({
      data: { id: ids.groupB, tournamentId: ids.tournamentId, name: 'B조', phase: 'group' },
    });

    for (let index = 0; index < ids.registrationIdsA.length; index += 1) {
      await prisma.v1TournamentRegistration.create({
        data: {
          id: ids.registrationIdsA[index],
          tournamentId: ids.tournamentId,
          teamId: ids.teamIds[index],
          appliedByUserId: ids.adminUserId,
          status: 'confirmed',
        },
      });
      await prisma.v1TournamentGroupTeam.create({
        data: { groupId: ids.groupA, registrationId: ids.registrationIdsA[index], sortOrder: index },
      });
    }
    for (let index = 0; index < ids.registrationIdsB.length; index += 1) {
      await prisma.v1TournamentRegistration.create({
        data: {
          id: ids.registrationIdsB[index],
          tournamentId: ids.tournamentId,
          teamId: ids.teamIds[index + 2],
          appliedByUserId: ids.adminUserId,
          status: 'confirmed',
        },
      });
      await prisma.v1TournamentGroupTeam.create({
        data: { groupId: ids.groupB, registrationId: ids.registrationIdsB[index], sortOrder: index },
      });
    }

    for (const fixture of [
      { id: ids.fixtureA, groupId: ids.groupA, round: 'group_a', homeScore: 3, awayScore: 1, homeRegistrationId: ids.registrationIdsA[0], awayRegistrationId: ids.registrationIdsA[1] },
      { id: ids.fixtureB, groupId: ids.groupB, round: 'group_b', homeScore: 2, awayScore: 2, homeRegistrationId: ids.registrationIdsB[0], awayRegistrationId: ids.registrationIdsB[1] },
    ]) {
      const match = await prisma.v1TeamMatch.create({
        data: {
          id: fixture.id,
          tournamentId: ids.tournamentId,
          hostTeamId: ids.teamIds[fixture.homeRegistrationId === ids.registrationIdsA[0] ? 0 : 2],
          approvedApplicantTeamId: ids.teamIds[fixture.homeRegistrationId === ids.registrationIdsA[0] ? 1 : 3],
          createdByUserId: ids.adminUserId,
          sportId: ids.soccerSportId,
          regionId: ids.regionId,
          title: `Overall standings ${fixture.round}`,
          status: 'completed',
          completedAt: new Date(),
          competitionConfigVersionId: config.id,
        },
      });
      await prisma.v1TournamentMatchDetails.create({
        data: {
          teamMatchId: match.id,
          tournamentId: ids.tournamentId,
          groupId: fixture.groupId,
          round: fixture.round,
          fixtureNumber: 1,
          homeRegistrationId: fixture.homeRegistrationId,
          awayRegistrationId: fixture.awayRegistrationId,
        },
      });
      const game = await prisma.v1Game.create({
        data: { sourceType: 'TEAM_MATCH', teamMatchId: match.id, competitionConfigVersionId: config.id, state: 'ENDED' },
      });
      const revision = await prisma.v1GameResultRevision.create({
        data: {
          gameId: game.id,
          revision: 1,
          state: 'OFFICIAL',
          score: { home: fixture.homeScore, away: fixture.awayScore },
          eventsHash: `overall-standings-${fixture.id}`,
          createdByActorType: 'SYSTEM',
          createdBySystemActor: 'TEST_FIXTURE',
          officialAt: new Date(),
        },
      });
      await prisma.v1Game.update({ where: { id: game.id }, data: { currentOfficialRevisionId: revision.id } });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function loadGroupsForStandings() {
    const groups = await prisma.v1TournamentGroup.findMany({
      where: { tournamentId: ids.tournamentId, phase: 'group' },
      include: {
        groupTeams: { orderBy: { registrationId: 'asc' } },
        tournamentMatchDetails: {
          where: { teamMatch: { status: 'completed', deletedAt: null } },
          include: {
            teamMatch: {
              include: { game: { select: { currentOfficialRevision: { select: { state: true, score: true } } } } },
            },
          },
        },
      },
    });
    return groups.map((group) => ({
      ...group,
      fixtures: group.tournamentMatchDetails.map((details) => ({
        homeRegistrationId: details.homeRegistrationId,
        awayRegistrationId: details.awayRegistrationId,
        game: details.teamMatch.game,
      })),
    }));
  }

  it('조별 승점 합계와 통합 승점 합계가 같은 트랜잭션 갱신 후 일치한다', async () => {
    // competitionConfig 는 relation 이라 include 하지 않으면 타입에 없다
    // (프로덕션 경로 tournament-bracket.service.ts:810 과 같은 조회 모양을 쓴다).
    const tournament = await prisma.v1Tournament.findUniqueOrThrow({
      where: { id: ids.tournamentId },
      include: { competitionConfig: true },
    });
    const config = validateCompetitionConfig(tournament.competitionConfig);
    const configVersionId = tournament.competitionConfigVersionId!;
    const groups = await loadGroupsForStandings();
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      for (const group of groups) {
        await recalculateAndUpsertGroupStandings(
          tx,
          { tournamentId: ids.tournamentId, configVersionId, config, group },
          now,
        );
      }
      await recalculateAndUpsertOverallStandings(
        tx,
        { tournamentId: ids.tournamentId, configVersionId, config, groups },
        now,
      );
    });

    const groupStandings = await prisma.v1TournamentStanding.findMany({
      where: { groupId: { in: [ids.groupA, ids.groupB] } },
    });
    const overallStandings = await prisma.v1TournamentOverallStanding.findMany({
      where: { tournamentId: ids.tournamentId },
    });

    const groupPointsTotal = groupStandings.reduce((sum, row) => sum + row.points, 0);
    const overallPointsTotal = overallStandings.reduce((sum, row) => sum + row.points, 0);
    expect(groupStandings).toHaveLength(4);
    expect(overallStandings).toHaveLength(4);
    expect(overallPointsTotal).toBe(groupPointsTotal);

    // Cross-group tie-break sanity: A조 winner (3점) and B조's two draw teams
    // (1점 each) never played each other, so head-to-head must not corrupt
    // their relative order — goal difference decides it (A조 winner +2 vs
    // B조 draw teams 0).
    const overallByRegistration = new Map(overallStandings.map((row) => [row.registrationId, row]));
    expect(overallByRegistration.get(ids.registrationIdsA[0])?.points).toBe(3);
    expect(overallByRegistration.get(ids.registrationIdsB[0])?.points).toBe(1);
    expect(overallByRegistration.get(ids.registrationIdsB[1])?.points).toBe(1);
  });

  it('통합 upsert가 실패하면 같은 트랜잭션의 조별 upsert도 롤백된다', async () => {
    // competitionConfig 는 relation 이라 include 하지 않으면 타입에 없다
    // (프로덕션 경로 tournament-bracket.service.ts:810 과 같은 조회 모양을 쓴다).
    const tournament = await prisma.v1Tournament.findUniqueOrThrow({
      where: { id: ids.tournamentId },
      include: { competitionConfig: true },
    });
    const config = validateCompetitionConfig(tournament.competitionConfig);
    const configVersionId = tournament.competitionConfigVersionId!;
    const groups = await loadGroupsForStandings();
    const now = new Date();

    // Wipe whatever the previous test wrote so this test's assertions are
    // about this attempt's rollback, not leftovers.
    await prisma.v1TournamentStanding.deleteMany({ where: { groupId: { in: [ids.groupA, ids.groupB] } } });
    await prisma.v1TournamentOverallStanding.deleteMany({ where: { tournamentId: ids.tournamentId } });

    const nonExistentTournamentId = '87000000-0000-4000-8000-0000000000ff';

    await expect(
      prisma.$transaction(async (tx) => {
        for (const group of groups) {
          await recalculateAndUpsertGroupStandings(
            tx,
            { tournamentId: ids.tournamentId, configVersionId, config, group },
            now,
          );
        }
        // Forces the overall upsert to violate the tournamentId FK
        // (v1_tournament_overall_standings.tournament_id references a
        // tournament that doesn't exist), so this whole $transaction()
        // callback must throw and roll back the group upserts above too.
        await recalculateAndUpsertOverallStandings(
          tx,
          { tournamentId: nonExistentTournamentId, configVersionId, config, groups },
          now,
        );
      }),
    ).rejects.toThrow();

    const groupStandingsAfterRollback = await prisma.v1TournamentStanding.findMany({
      where: { groupId: { in: [ids.groupA, ids.groupB] } },
    });
    const overallStandingsAfterRollback = await prisma.v1TournamentOverallStanding.findMany({
      where: { tournamentId: ids.tournamentId },
    });
    expect(groupStandingsAfterRollback).toHaveLength(0);
    expect(overallStandingsAfterRollback).toHaveLength(0);
  });
});

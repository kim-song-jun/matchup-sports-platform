import { PrismaService } from '../../src/prisma/prisma.service';
import { TournamentBracketService } from '../../src/tournaments/tournament-bracket.service';
import {
  calculateCompetitionStandings,
  FOOTBALL_V1_CONFIG,
  validateCompetitionConfig,
} from '../../src/tournaments/competition-config/competition-config';
import { runCompetitionConfigContractPhaseBackfill } from '../../src/tournaments/competition-config/competition-config-backfill';

export const competitionConfigFixture = {
  now: new Date('2026-07-29T12:00:00.000Z'),
  adminUserId: '11000000-0000-4000-8000-000000000001',
  adminId: '11000000-0000-4000-8000-000000000002',
  soccerSportId: '11000000-0000-4000-8000-000000000010',
  futsalSportId: '11000000-0000-4000-8000-000000000011',
  regionId: '11000000-0000-4000-8000-000000000020',
  teamIds: [
    '11000000-0000-4000-8000-000000000031',
    '11000000-0000-4000-8000-000000000032',
    '11000000-0000-4000-8000-000000000033',
    '11000000-0000-4000-8000-000000000034',
  ],
  tournamentId: '11000000-0000-4000-8000-000000000040',
  groupId: '11000000-0000-4000-8000-000000000041',
  registrationIds: [
    '11000000-0000-4000-8000-000000000051',
    '11000000-0000-4000-8000-000000000052',
    '11000000-0000-4000-8000-000000000053',
    '11000000-0000-4000-8000-000000000054',
  ],
  fixtureIds: [
    '11000000-0000-4000-8000-000000000061',
    '11000000-0000-4000-8000-000000000062',
    '11000000-0000-4000-8000-000000000063',
  ],
  teamMatchId: '11000000-0000-4000-8000-000000000070',
} as const;

export const baselineStandingExpectation = [
  { registrationIndex: 1, points: 3, goalsFor: 3, goalsAgainst: 1, position: 1 },
  { registrationIndex: 0, points: 3, goalsFor: 2, goalsAgainst: 0, position: 2 },
  { registrationIndex: 2, points: 1, goalsFor: 0, goalsAgainst: 0, position: 3 },
  { registrationIndex: 3, points: 1, goalsFor: 1, goalsAgainst: 5, position: 4 },
] as const;

export async function seedCompetitionConfigFixture(
  prisma: PrismaService,
  authUser: { id: string; email: string },
) {
  await prisma.v1User.create({
    data: {
      id: competitionConfigFixture.adminUserId,
      email: authUser.email,
      accountStatus: 'active',
      onboardingStatus: 'completed',
    },
  });
  await prisma.v1AdminUser.create({
    data: {
      id: competitionConfigFixture.adminId,
      userId: competitionConfigFixture.adminUserId,
      adminRole: 'owner',
      status: 'active',
    },
  });
  await prisma.v1Region.create({
    data: {
      id: competitionConfigFixture.regionId,
      code: 'task11-region',
      name: 'Task 11 region',
      level: 1,
    },
  });
  await prisma.v1Sport.createMany({
    data: [
      {
        id: competitionConfigFixture.soccerSportId,
        code: 'soccer',
        name: '축구',
        sortOrder: 1,
      },
      {
        id: competitionConfigFixture.futsalSportId,
        code: 'futsal',
        name: '풋살',
        sortOrder: 2,
      },
    ],
  });
  await prisma.v1Team.createMany({
    data: competitionConfigFixture.teamIds.map((id, index) => ({
      id,
      ownerUserId: competitionConfigFixture.adminUserId,
      sportId: competitionConfigFixture.soccerSportId,
      regionId: competitionConfigFixture.regionId,
      name: `Task 11 team ${index + 1}`,
    })),
  });
  await prisma.v1Tournament.create({
    data: {
      id: competitionConfigFixture.tournamentId,
      sportId: competitionConfigFixture.soccerSportId,
      title: 'Task 11 baseline tournament',
      status: 'in_progress',
    },
  });
  await prisma.v1TournamentGroup.create({
    data: {
      id: competitionConfigFixture.groupId,
      tournamentId: competitionConfigFixture.tournamentId,
      name: 'A조',
      phase: 'group',
    },
  });
  for (let index = 0; index < competitionConfigFixture.registrationIds.length; index += 1) {
    const registrationId = competitionConfigFixture.registrationIds[index];
    await prisma.v1TournamentRegistration.create({
      data: {
        id: registrationId,
        tournamentId: competitionConfigFixture.tournamentId,
        teamId: competitionConfigFixture.teamIds[index],
        appliedByUserId: competitionConfigFixture.adminUserId,
        status: 'confirmed',
      },
    });
    await prisma.v1TournamentGroupTeam.create({
      data: {
        groupId: competitionConfigFixture.groupId,
        registrationId,
        sortOrder: index,
      },
    });
  }

  const fixtureScores = [
    { home: 0, away: 3, homeScore: 2, awayScore: 0 },
    { home: 1, away: 3, homeScore: 3, awayScore: 1 },
    { home: 2, away: 3, homeScore: 0, awayScore: 0 },
  ] as const;
  for (let index = 0; index < fixtureScores.length; index += 1) {
    const score = fixtureScores[index];
    await prisma.v1TournamentFixture.create({
      data: {
        id: competitionConfigFixture.fixtureIds[index],
        tournamentId: competitionConfigFixture.tournamentId,
        groupId: competitionConfigFixture.groupId,
        round: 'group_a',
        fixtureNumber: index + 1,
        homeRegistrationId: competitionConfigFixture.registrationIds[score.home],
        awayRegistrationId: competitionConfigFixture.registrationIds[score.away],
        status: 'completed',
        result: {
          create: {
            homeScore: score.homeScore,
            awayScore: score.awayScore,
            recordedByAdminUserId: competitionConfigFixture.adminId,
          },
        },
      },
    });
  }

  // The tournament above is created without an explicit
  // competitionConfigVersionId — the v1_pin_tournament_competition_config
  // trigger used to fill it in automatically, but that trigger is part of
  // the deferred contract-phase migration (see
  // docs/ops/task9-competition-config-contract-phase.md). Run the same
  // production backfill CLI here so this fixture's tournament/fixtures end
  // up pinned exactly the way they will be in production once the backfill
  // CLI has run — seeding is idempotent (upsert) so this is safe even if the
  // v1_competition_config_versions rows already exist from a prior seed.
  await runCompetitionConfigContractPhaseBackfill(prisma);
}

export function deterministicStandingOrder() {
  return calculateCompetitionStandings({
    tournamentId: competitionConfigFixture.tournamentId,
    configVersionId: '11111111-1111-4111-8111-111111111111',
    registrationIds: [
      competitionConfigFixture.registrationIds[2],
      competitionConfigFixture.registrationIds[0],
      competitionConfigFixture.registrationIds[1],
    ],
    fixtures: [
      { homeRegistrationId: competitionConfigFixture.registrationIds[0], awayRegistrationId: competitionConfigFixture.registrationIds[1], homeScore: 1, awayScore: 0 },
      { homeRegistrationId: competitionConfigFixture.registrationIds[1], awayRegistrationId: competitionConfigFixture.registrationIds[2], homeScore: 2, awayScore: 0 },
      { homeRegistrationId: competitionConfigFixture.registrationIds[2], awayRegistrationId: competitionConfigFixture.registrationIds[0], homeScore: 3, awayScore: 0 },
    ],
    config: FOOTBALL_V1_CONFIG,
  }).map((standing) => standing.registrationId);
}

export async function exerciseCompetitionConfigChange(
  prisma: PrismaService,
  bracketService: TournamentBracketService,
  authUser: { id: string; email: string; accountStatus: 'active'; onboardingStatus: 'completed' },
) {
  const config = validateCompetitionConfig({
    ...FOOTBALL_V1_CONFIG,
    tieBreak: {
      ...FOOTBALL_V1_CONFIG.tieBreak,
      points: { win: 5, draw: 2, loss: 0 },
    },
  });
  const created = await bracketService.createCompetitionConfigVersion(
    authUser,
    '11111111-1111-4111-8111-111111111111',
    { config },
  );
  const tournament = await prisma.v1Tournament.findUniqueOrThrow({
    where: { id: competitionConfigFixture.tournamentId },
  });
  const request = {
    competitionConfigVersionId: created.id,
    expectedVersion: tournament.updatedAt.toISOString(),
  };
  const preview = await bracketService.changeTournamentCompetitionConfig(
    authUser,
    competitionConfigFixture.tournamentId,
    request,
  );
  const pinnedBeforeConfirmation = (
    await prisma.v1Tournament.findUniqueOrThrow({
      where: { id: competitionConfigFixture.tournamentId },
    })
  ).competitionConfigVersionId;
  const changed = await bracketService.changeTournamentCompetitionConfig(
    authUser,
    competitionConfigFixture.tournamentId,
    { ...request, confirmRecalculation: true, previewHash: preview.previewHash },
  );
  await bracketService.recalculateStandings(authUser, competitionConfigFixture.tournamentId);
  const standings = await prisma.v1TournamentStanding.findMany({
    where: { groupId: competitionConfigFixture.groupId },
    orderBy: { position: 'asc' },
  });
  return {
    changed,
    createdVersion: created.version,
    pinnedBeforeConfirmation,
    preview,
    topPoints: standings.slice(0, 2).map((standing) => standing.points),
  };
}

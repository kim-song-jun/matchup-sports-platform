import { PrismaClient, TeamMatch, TeamMatchApplication, SportType, TeamMatchStatus } from '@prisma/client';

export interface TeamMatchWithApp {
  teamMatch: TeamMatch;
  application: TeamMatchApplication;
}

/**
 * Creates a TeamMatch hosted by hostTeamId.
 */
export async function createTeamMatch(
  prisma: PrismaClient,
  hostTeamId: string,
  overrides: Partial<{
    sportType: SportType;
    title: string;
    matchDate: Date;
    startTime: string;
    endTime: string;
    venueName: string;
    venueAddress: string;
    status: TeamMatchStatus;
  }> = {},
): Promise<TeamMatch> {
  return prisma.teamMatch.create({
    data: {
      hostTeamId,
      sportType: overrides.sportType ?? SportType.futsal,
      title: overrides.title ?? 'Test Team Match',
      matchDate: overrides.matchDate ?? new Date('2026-05-10'),
      startTime: overrides.startTime ?? '14:00',
      endTime: overrides.endTime ?? '16:00',
      venueName: overrides.venueName ?? 'Test Venue',
      venueAddress: overrides.venueAddress ?? '서울시 테스트구',
      status: overrides.status ?? TeamMatchStatus.recruiting,
    },
  });
}

/**
 * Creates a TeamMatch and a pending application from applicantTeamId.
 */
export async function createTeamMatchWithApplication(
  prisma: PrismaClient,
  hostTeamId: string,
  applicantTeamId: string,
): Promise<TeamMatchWithApp> {
  const teamMatch = await createTeamMatch(prisma, hostTeamId);

  const application = await prisma.teamMatchApplication.create({
    data: {
      teamMatchId: teamMatch.id,
      applicantTeamId,
      status: 'pending',
    },
  });

  return { teamMatch, application };
}

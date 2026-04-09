import { PrismaClient, TeamMatch, TeamMatchApplication, SportType, TeamMatchStatus } from '@prisma/client';

export interface TeamMatchWithApp {
  teamMatch: TeamMatch;
  application: TeamMatchApplication;
}

/**
 * Creates a TeamMatch hosted by hostTeamId.
 * Includes sample values for the 6 meta fields added in task 17 when not overridden.
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
    // task 17 meta fields
    skillGrade: string | null;
    gameFormat: string | null;
    matchType: string | null;
    proPlayerCount: number;
    uniformColor: string | null;
    isFreeInvitation: boolean;
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
      // task 17 meta fields — default sample values for integration test assertions
      skillGrade: overrides.skillGrade !== undefined ? overrides.skillGrade : 'B+',
      gameFormat: overrides.gameFormat !== undefined ? overrides.gameFormat : '6:6',
      matchType: overrides.matchType !== undefined ? overrides.matchType : 'invitation',
      proPlayerCount: overrides.proPlayerCount ?? 0,
      uniformColor: overrides.uniformColor !== undefined ? overrides.uniformColor : null,
      isFreeInvitation: overrides.isFreeInvitation ?? false,
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

/**
 * Creates multiple TeamMatches for teamId-filter integration tests.
 * Returns one match where targetTeamId is host and one where it is applicant.
 */
export async function createTeamMatchesForTeamFilter(
  prisma: PrismaClient,
  targetTeamId: string,
  otherTeamId: string,
): Promise<{ asHost: TeamMatch; asApplicant: TeamMatchWithApp }> {
  const asHost = await createTeamMatch(prisma, targetTeamId);

  const asApplicant = await createTeamMatchWithApplication(
    prisma,
    otherTeamId,
    targetTeamId,
  );

  return { asHost, asApplicant };
}

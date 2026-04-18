import { PrismaClient, SportTeam, TeamMembership, SportType, TeamMembershipStatus } from '@prisma/client';

export interface TeamWithOwnership {
  team: SportTeam;
  membership: TeamMembership;
}

export interface TeamWithMembers {
  team: SportTeam;
  memberships: TeamMembership[];
}

/**
 * Creates a SportTeam and the owner's TeamMembership atomically.
 */
export async function createTeamWithOwner(
  prisma: PrismaClient,
  ownerId: string,
  overrides: Partial<{
    name: string;
    sportTypes: SportType[];
    city: string;
    district: string;
    level: number;
    isRecruiting: boolean;
  }> = {},
): Promise<TeamWithOwnership> {
  const [team, membership] = await prisma.$transaction(async (tx) => {
    const t = await tx.sportTeam.create({
      data: {
        ownerId,
        name: overrides.name ?? `Test Team ${Date.now()}`,
        sportTypes: overrides.sportTypes ?? [SportType.futsal],
        city: overrides.city ?? '서울',
        district: overrides.district ?? '마포구',
        memberCount: 1,
        level: overrides.level ?? 3,
        isRecruiting: overrides.isRecruiting ?? true,
      },
    });

    const m = await tx.teamMembership.create({
      data: {
        teamId: t.id,
        userId: ownerId,
        role: 'owner',
        status: 'active',
      },
    });

    return [t, m];
  });

  return { team, membership };
}

/**
 * Creates a team with owner + optional manager and member lists.
 */
export async function createTeamWithMembers(
  prisma: PrismaClient,
  ownerId: string,
  managerIds: string[] = [],
  memberIds: string[] = [],
): Promise<TeamWithMembers> {
  const { team, membership: ownerMembership } = await createTeamWithOwner(
    prisma,
    ownerId,
  );

  const managerMemberships = await Promise.all(
    managerIds.map((uid) =>
      prisma.teamMembership.create({
        data: {
          teamId: team.id,
          userId: uid,
          role: 'manager',
          status: 'active',
        },
      }),
    ),
  );

  const memberMemberships = await Promise.all(
    memberIds.map((uid) =>
      prisma.teamMembership.create({
        data: {
          teamId: team.id,
          userId: uid,
          role: 'member',
          status: 'active',
        },
      }),
    ),
  );

  return {
    team,
    memberships: [ownerMembership, ...managerMemberships, ...memberMemberships],
  };
}

/**
 * Creates a pending TeamMembership for the given applicant, enabling team application
 * accept/reject tests without going through the full apply endpoint.
 */
export async function createPendingApplication(
  prisma: PrismaClient,
  teamId: string,
  applicantUserId: string,
): Promise<TeamMembership> {
  return prisma.teamMembership.upsert({
    where: { teamId_userId: { teamId, userId: applicantUserId } },
    create: {
      teamId,
      userId: applicantUserId,
      role: 'member',
      status: TeamMembershipStatus.pending,
    },
    update: {
      status: TeamMembershipStatus.pending,
    },
  });
}

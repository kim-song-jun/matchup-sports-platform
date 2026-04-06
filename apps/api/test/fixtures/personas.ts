import { PrismaClient, User, UserRole, OAuthProvider, SportType } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function createUser(
  prisma: PrismaClient,
  overrides: Partial<{
    email: string;
    nickname: string;
    role: UserRole;
    oauthProvider: OAuthProvider;
    oauthId: string;
    sportTypes: SportType[];
    locationCity: string;
    locationDistrict: string;
  }>,
): Promise<User> {
  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? null,
      nickname: overrides.nickname ?? `user_${Date.now()}`,
      role: overrides.role ?? UserRole.user,
      oauthProvider: overrides.oauthProvider ?? OAuthProvider.email,
      oauthId:
        overrides.oauthId ??
        `email_${overrides.email ?? Date.now()}`,
      sportTypes: overrides.sportTypes ?? [SportType.futsal],
      mannerScore: 3.5,
      locationCity: overrides.locationCity ?? '서울',
      locationDistrict: overrides.locationDistrict ?? '마포구',
    },
  });

  if ((user.sportTypes as SportType[]).length > 0) {
    await prisma.userSportProfile.createMany({
      data: (user.sportTypes as SportType[]).map((sport) => ({
        userId: user.id,
        sportType: sport,
        level: 3,
        eloRating: 1200,
        preferredPositions: [],
      })),
      skipDuplicates: true,
    });
  }

  return user;
}

// ---------------------------------------------------------------------------
// Persona factories — each uses a deterministic e-mail to stay idempotent
// when called multiple times in the same suite via upsert-style logic.
// ---------------------------------------------------------------------------

export async function createSinaro(prisma: PrismaClient): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+sinaro@test.local',
    nickname: 'sinaro',
    oauthId: 'email_e2e+sinaro@test.local',
    sportTypes: [SportType.futsal, SportType.basketball],
  });
}

export async function createTeamOwner(prisma: PrismaClient): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+team_owner@test.local',
    nickname: 'team_owner',
    oauthId: 'email_e2e+team_owner@test.local',
    sportTypes: [SportType.futsal],
  });
}

export async function createTeamManager(prisma: PrismaClient): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+team_manager@test.local',
    nickname: 'team_manager',
    oauthId: 'email_e2e+team_manager@test.local',
    sportTypes: [SportType.futsal],
  });
}

export async function createTeamMember(prisma: PrismaClient): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+team_member@test.local',
    nickname: 'team_member',
    oauthId: 'email_e2e+team_member@test.local',
    sportTypes: [SportType.futsal],
  });
}

export async function createMercenaryHost(
  prisma: PrismaClient,
): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+merc_host@test.local',
    nickname: 'merc_host',
    oauthId: 'email_e2e+merc_host@test.local',
    sportTypes: [SportType.futsal],
  });
}

export async function createAdmin(prisma: PrismaClient): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+admin@test.local',
    nickname: 'admin_user',
    role: UserRole.admin,
    oauthId: 'email_e2e+admin@test.local',
    sportTypes: [SportType.futsal],
  });
}

export async function createInstructor(prisma: PrismaClient): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+instructor@test.local',
    nickname: 'instructor',
    oauthId: 'email_e2e+instructor@test.local',
    sportTypes: [SportType.basketball],
    locationCity: '서울',
    locationDistrict: '강남구',
  });
}

export async function createMarketSeller(prisma: PrismaClient): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+seller@test.local',
    nickname: 'market_seller',
    oauthId: 'email_e2e+seller@test.local',
    sportTypes: [SportType.futsal],
  });
}

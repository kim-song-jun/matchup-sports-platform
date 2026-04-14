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

// ---------------------------------------------------------------------------
// Phase 2 catalog-aligned personas (14 additional users to match
// mock-data-catalog.ts MockUserKey entries not covered above)
// ---------------------------------------------------------------------------

export async function createFutsalLeader(prisma: PrismaClient): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+futsal_leader@test.local',
    nickname: 'futsal_leader',
    oauthId: 'email_e2e+futsal_leader@test.local',
    sportTypes: [SportType.futsal],
    locationCity: '서울',
    locationDistrict: '마포구',
  });
}

export async function createBasketballLeader(
  prisma: PrismaClient,
): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+bball_leader@test.local',
    nickname: 'basketball_leader',
    oauthId: 'email_e2e+bball_leader@test.local',
    sportTypes: [SportType.basketball],
    locationCity: '서울',
    locationDistrict: '강동구',
  });
}

export async function createBadmintonLeader(
  prisma: PrismaClient,
): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+badminton_leader@test.local',
    nickname: 'badminton_leader',
    oauthId: 'email_e2e+badminton_leader@test.local',
    sportTypes: [SportType.badminton],
    locationCity: '서울',
    locationDistrict: '서초구',
  });
}

export async function createIceLeader(prisma: PrismaClient): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+ice_leader@test.local',
    nickname: 'ice_leader',
    oauthId: 'email_e2e+ice_leader@test.local',
    sportTypes: [SportType.ice_hockey, SportType.figure_skating],
    locationCity: '서울',
    locationDistrict: '송파구',
  });
}

export async function createTennisLeader(prisma: PrismaClient): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+tennis_leader@test.local',
    nickname: 'tennis_leader',
    oauthId: 'email_e2e+tennis_leader@test.local',
    sportTypes: [SportType.tennis],
    locationCity: '서울',
    locationDistrict: '반포동',
  });
}

export async function createSoccerCaptain(
  prisma: PrismaClient,
): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+soccer_captain@test.local',
    nickname: 'soccer_captain',
    oauthId: 'email_e2e+soccer_captain@test.local',
    sportTypes: [SportType.soccer],
    locationCity: '서울',
    locationDistrict: '목동',
  });
}

export async function createBaseballCaptain(
  prisma: PrismaClient,
): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+baseball_captain@test.local',
    nickname: 'baseball_captain',
    oauthId: 'email_e2e+baseball_captain@test.local',
    sportTypes: [SportType.baseball],
    locationCity: '서울',
    locationDistrict: '고척동',
  });
}

export async function createVolleyballCaptain(
  prisma: PrismaClient,
): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+volleyball_captain@test.local',
    nickname: 'volleyball_captain',
    oauthId: 'email_e2e+volleyball_captain@test.local',
    sportTypes: [SportType.volleyball],
    locationCity: '서울',
    locationDistrict: '자양동',
  });
}

export async function createSwimmerCoach(prisma: PrismaClient): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+swimmer_coach@test.local',
    nickname: 'swimmer_coach',
    oauthId: 'email_e2e+swimmer_coach@test.local',
    sportTypes: [SportType.swimming],
    locationCity: '서울',
    locationDistrict: '강동구',
  });
}

export async function createFigureSkater(
  prisma: PrismaClient,
): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+figure_skater@test.local',
    nickname: 'figure_skater',
    oauthId: 'email_e2e+figure_skater@test.local',
    sportTypes: [SportType.figure_skating],
    locationCity: '서울',
    locationDistrict: '태릉',
  });
}

export async function createTrackCaptain(prisma: PrismaClient): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+track_captain@test.local',
    nickname: 'track_captain',
    oauthId: 'email_e2e+track_captain@test.local',
    sportTypes: [SportType.short_track],
    locationCity: '서울',
    locationDistrict: '태릉',
  });
}

export async function createNewbieA(prisma: PrismaClient): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+newbie_a@test.local',
    nickname: 'newbie_a',
    oauthId: 'email_e2e+newbie_a@test.local',
    sportTypes: [SportType.futsal],
    locationCity: '서울',
    locationDistrict: '은평구',
  });
}

export async function createNewbieB(prisma: PrismaClient): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+newbie_b@test.local',
    nickname: 'newbie_b',
    oauthId: 'email_e2e+newbie_b@test.local',
    sportTypes: [SportType.basketball],
    locationCity: '서울',
    locationDistrict: '노원구',
  });
}

export async function createExtraSeller(prisma: PrismaClient): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+extra_seller@test.local',
    nickname: 'extra_seller',
    oauthId: 'email_e2e+extra_seller@test.local',
    sportTypes: [SportType.tennis],
    locationCity: '서울',
    locationDistrict: '강남구',
  });
}

export async function createTennisPro(prisma: PrismaClient): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+tennis_pro@test.local',
    nickname: 'tennis_pro',
    oauthId: 'email_e2e+tennis_pro@test.local',
    sportTypes: [SportType.tennis],
    locationCity: '서울',
    locationDistrict: '반포동',
  });
}

export async function createSoccerMidfielder(
  prisma: PrismaClient,
): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+soccer_midfielder@test.local',
    nickname: 'soccer_midfielder',
    oauthId: 'email_e2e+soccer_midfielder@test.local',
    sportTypes: [SportType.soccer],
    locationCity: '서울',
    locationDistrict: '목동',
  });
}

export async function createBaseballPitcher(
  prisma: PrismaClient,
): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+baseball_pitcher@test.local',
    nickname: 'baseball_pitcher',
    oauthId: 'email_e2e+baseball_pitcher@test.local',
    sportTypes: [SportType.baseball],
    locationCity: '서울',
    locationDistrict: '고척동',
  });
}

export async function createVolleyballSetter(
  prisma: PrismaClient,
): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+volleyball_setter@test.local',
    nickname: 'volleyball_setter',
    oauthId: 'email_e2e+volleyball_setter@test.local',
    sportTypes: [SportType.volleyball],
    locationCity: '서울',
    locationDistrict: '자양동',
  });
}

export async function createSwimmingRookie(
  prisma: PrismaClient,
): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+swimming_rookie@test.local',
    nickname: 'swimming_rookie',
    oauthId: 'email_e2e+swimming_rookie@test.local',
    sportTypes: [SportType.swimming],
    locationCity: '서울',
    locationDistrict: '강동구',
  });
}

export async function createFillerUser1(prisma: PrismaClient): Promise<User> {
  return createUser(prisma, {
    email: 'e2e+filler_user1@test.local',
    nickname: 'filler_user1',
    oauthId: 'email_e2e+filler_user1@test.local',
    sportTypes: [SportType.futsal],
    locationCity: '서울',
    locationDistrict: '은평구',
  });
}

// ---------------------------------------------------------------------------
// Build helpers — pure in-memory objects for unit test mocks (no DB I/O)
// ---------------------------------------------------------------------------

export function buildUserMock(
  overrides: Partial<{
    id: string;
    email: string;
    nickname: string;
    role: UserRole;
    sportTypes: SportType[];
    locationCity: string;
    locationDistrict: string;
    mannerScore: number;
    totalMatches: number;
    createdAt: Date;
  }> = {},
) {
  return {
    id: overrides.id ?? 'user-test-id',
    email: overrides.email ?? 'test@test.local',
    passwordHash: null,
    nickname: overrides.nickname ?? 'test_user',
    role: overrides.role ?? UserRole.user,
    profileImageUrl: null,
    phone: null,
    gender: null,
    birthYear: null,
    bio: null,
    sportTypes: overrides.sportTypes ?? [SportType.futsal],
    locationLat: null,
    locationLng: null,
    locationCity: overrides.locationCity ?? '서울',
    locationDistrict: overrides.locationDistrict ?? '마포구',
    mannerScore: overrides.mannerScore ?? 3.5,
    totalMatches: overrides.totalMatches ?? 0,
    oauthProvider: 'email' as const,
    oauthId: `email_${overrides.email ?? 'test@test.local'}`,
    adminStatus: 'active' as const,
    adminSuspensionReason: null,
    createdAt: overrides.createdAt ?? new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
  };
}

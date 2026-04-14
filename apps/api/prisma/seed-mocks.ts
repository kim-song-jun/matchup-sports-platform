import { PrismaClient, type Prisma } from '@prisma/client';
import {
  buildDevMockCatalog,
  DEV_MOCK_CATALOG_VERSION,
  getDevMockCatalogChecksum,
  type MockLessonKey,
  type MockListingKey,
  type MockMatchKey,
  type MockMercenaryKey,
  type MockTeamKey,
  type MockTeamMatchKey,
  type MockUserKey,
  type MockVenueKey,
} from './mock-data-catalog';
import { syncImageData } from './sync-image-data';

const prisma = new PrismaClient();
const DEPLOY_MOCK_SEED_STATE_KEY = 'deploy-canonical-mock-data';

type SummaryBucket = {
  created: number;
  updated: number;
};

type Summary = Record<
  | 'users'
  | 'sportProfiles'
  | 'venues'
  | 'teams'
  | 'teamMemberships'
  | 'matches'
  | 'matchParticipants'
  | 'lessons'
  | 'lessonTicketPlans'
  | 'listings'
  | 'mercenaryPosts'
  | 'teamMatches'
  | 'teamMatchApplications'
  | 'teamBadges'
  | 'mercenaryApplications'
  | 'payments'
  | 'marketplaceOrders'
  | 'lessonSchedules'
  | 'lessonTickets'
  | 'lessonAttendances'
  | 'chatRooms'
  | 'chatMessages'
  | 'venueReviews'
  | 'matchReviews'
  | 'notifications'
  | 'tournaments'
  | 'settlements'
  | 'reports'
  | 'userBadges'
  | 'teamTrustScores',
  SummaryBucket
>;

function createSummary(): Summary {
  return {
    users: { created: 0, updated: 0 },
    sportProfiles: { created: 0, updated: 0 },
    venues: { created: 0, updated: 0 },
    teams: { created: 0, updated: 0 },
    teamMemberships: { created: 0, updated: 0 },
    matches: { created: 0, updated: 0 },
    matchParticipants: { created: 0, updated: 0 },
    lessons: { created: 0, updated: 0 },
    lessonTicketPlans: { created: 0, updated: 0 },
    listings: { created: 0, updated: 0 },
    mercenaryPosts: { created: 0, updated: 0 },
    teamMatches: { created: 0, updated: 0 },
    teamMatchApplications: { created: 0, updated: 0 },
    teamBadges: { created: 0, updated: 0 },
    mercenaryApplications: { created: 0, updated: 0 },
    payments: { created: 0, updated: 0 },
    marketplaceOrders: { created: 0, updated: 0 },
    lessonSchedules: { created: 0, updated: 0 },
    lessonTickets: { created: 0, updated: 0 },
    lessonAttendances: { created: 0, updated: 0 },
    chatRooms: { created: 0, updated: 0 },
    chatMessages: { created: 0, updated: 0 },
    venueReviews: { created: 0, updated: 0 },
    matchReviews: { created: 0, updated: 0 },
    notifications: { created: 0, updated: 0 },
    tournaments: { created: 0, updated: 0 },
    settlements: { created: 0, updated: 0 },
    reports: { created: 0, updated: 0 },
    userBadges: { created: 0, updated: 0 },
    teamTrustScores: { created: 0, updated: 0 },
  };
}

async function createOrUpdateRecord<T extends { id: string }>(options: {
  bucket: SummaryBucket;
  findExistingId: () => Promise<string | null>;
  create: () => Promise<T>;
  update: (id: string) => Promise<T>;
}) {
  const existingId = await options.findExistingId();
  if (existingId) {
    const record = await options.update(existingId);
    options.bucket.updated += 1;
    return record;
  }

  const record = await options.create();
  options.bucket.created += 1;
  return record;
}

function requireId<T extends string>(map: Map<T, string>, key: T, label: string) {
  const value = map.get(key);
  if (!value) {
    throw new Error(`Missing ${label} for key: ${key}`);
  }
  return value;
}

function formatSummary(summary: Summary) {
  return Object.entries(summary)
    .map(([name, bucket]) => `${name}: ${bucket.created} created / ${bucket.updated} updated`)
    .join('\n');
}

function hasArg(flag: string) {
  return process.argv.includes(flag);
}

function isFalseValue(value?: string) {
  return value?.trim().toLowerCase() === 'false';
}

async function main() {
  const summary = createSummary();
  const catalog = buildDevMockCatalog();
  const checksumGateEnabled = hasArg('--checksum-gate');
  const forceSync = hasArg('--force');
  const catalogChecksum = getDevMockCatalogChecksum(catalog.seedDateKey);

  const userIds = new Map<MockUserKey, string>();
  const venueIds = new Map<MockVenueKey, string>();
  const teamIds = new Map<MockTeamKey, string>();
  const matchIds = new Map<MockMatchKey, string>();
  const lessonIds = new Map<MockLessonKey, string>();
  const listingIds = new Map<MockListingKey, string>();
  const mercenaryIds = new Map<MockMercenaryKey, string>();
  const teamMatchIds = new Map<MockTeamMatchKey, string>();
  const lessonScheduleIds = new Map<string, string>();
  const chatRoomIds = new Map<string, string>();
  const mercenaryApplicationIds = new Map<string, string>();
  const participantIdByMatchAndUser = new Map<string, string>();

  if (checksumGateEnabled) {
    if (isFalseValue(process.env.DEPLOY_SYNC_MOCK_DATA)) {
      console.log('⏭️ Deploy mock sync skipped because DEPLOY_SYNC_MOCK_DATA=false');
      return;
    }

    const existingState = await prisma.seedSyncState.findUnique({
      where: { key: DEPLOY_MOCK_SEED_STATE_KEY },
      select: { checksum: true },
    });

    if (!forceSync && existingState?.checksum === catalogChecksum) {
      console.log(
        `⏭️ Deploy mock sync skipped (checksum unchanged for ${catalog.seedDateKey}): ${catalogChecksum.slice(0, 12)}`,
      );
      return;
    }

    console.log(
      `🔐 Deploy mock checksum ${catalogChecksum.slice(0, 12)} (${existingState ? 'changed' : 'new'})`,
    );
  }

  console.log('🧩 Syncing canonical dev mock dataset...');

  for (const user of catalog.users) {
    const record = await createOrUpdateRecord({
      bucket: summary.users,
      findExistingId: async () =>
        (
          await prisma.user.findUnique({
            where: { email: user.email },
            select: { id: true },
          })
        )?.id ?? null,
      create: () =>
        prisma.user.create({
          data: {
            email: user.email,
            nickname: user.nickname,
            oauthProvider: 'email',
            oauthId: user.email,
            gender: user.gender,
            birthYear: user.birthYear,
            bio: user.bio,
            sportTypes: user.sportTypes,
            locationCity: user.locationCity,
            locationDistrict: user.locationDistrict,
            locationLat: user.locationLat,
            locationLng: user.locationLng,
            mannerScore: user.mannerScore,
            totalMatches: user.totalMatches,
            profileImageUrl: user.profileImageUrl,
            role: user.role ?? 'user',
          },
        }),
      update: (id) =>
        prisma.user.update({
          where: { id },
          data: {
            nickname: user.nickname,
            oauthProvider: 'email',
            oauthId: user.email,
            gender: user.gender,
            birthYear: user.birthYear,
            bio: user.bio,
            sportTypes: user.sportTypes,
            locationCity: user.locationCity,
            locationDistrict: user.locationDistrict,
            locationLat: user.locationLat,
            locationLng: user.locationLng,
            mannerScore: user.mannerScore,
            totalMatches: user.totalMatches,
            profileImageUrl: user.profileImageUrl,
            role: user.role ?? 'user',
          },
        }),
    });

    userIds.set(user.key, record.id);
  }

  for (const profile of catalog.sportProfiles) {
    const userId = requireId(userIds, profile.userKey, 'user');
    await createOrUpdateRecord({
      bucket: summary.sportProfiles,
      findExistingId: async () =>
        (
          await prisma.userSportProfile.findUnique({
            where: {
              userId_sportType: {
                userId,
                sportType: profile.sportType,
              },
            },
            select: { id: true },
          })
        )?.id ?? null,
      create: () =>
        prisma.userSportProfile.create({
          data: {
            userId,
            sportType: profile.sportType,
            level: profile.level,
            eloRating: profile.eloRating,
            preferredPositions: profile.preferredPositions,
            matchCount: profile.matchCount,
            winCount: profile.winCount,
            mvpCount: profile.mvpCount,
          },
        }),
      update: (id) =>
        prisma.userSportProfile.update({
          where: { id },
          data: {
            level: profile.level,
            eloRating: profile.eloRating,
            preferredPositions: profile.preferredPositions,
            matchCount: profile.matchCount,
            winCount: profile.winCount,
            mvpCount: profile.mvpCount,
          },
        }),
    });
  }

  for (const venue of catalog.venues) {
    const record = await createOrUpdateRecord({
      bucket: summary.venues,
      findExistingId: async () =>
        (
          await prisma.venue.findFirst({
            where: { name: venue.name },
            select: { id: true },
          })
        )?.id ?? null,
      create: () =>
        prisma.venue.create({
          data: {
            name: venue.name,
            type: venue.type,
            sportTypes: venue.sportTypes,
            address: venue.address,
            lat: venue.lat,
            lng: venue.lng,
            city: venue.city,
            district: venue.district,
            phone: venue.phone,
            description: venue.description,
            imageUrls: [],
            facilities: venue.facilities,
            operatingHours: venue.operatingHours as Prisma.InputJsonValue,
            pricePerHour: venue.pricePerHour,
            rating: venue.rating,
            reviewCount: venue.reviewCount,
            iceQualityAvg: venue.iceQualityAvg,
            rinkSubType: venue.rinkSubType,
          },
        }),
      update: (id) =>
        prisma.venue.update({
          where: { id },
          data: {
            type: venue.type,
            sportTypes: venue.sportTypes,
            address: venue.address,
            lat: venue.lat,
            lng: venue.lng,
            city: venue.city,
            district: venue.district,
            phone: venue.phone,
            description: venue.description,
            facilities: venue.facilities,
            operatingHours: venue.operatingHours as Prisma.InputJsonValue,
            pricePerHour: venue.pricePerHour,
            rating: venue.rating,
            reviewCount: venue.reviewCount,
            iceQualityAvg: venue.iceQualityAvg,
            rinkSubType: venue.rinkSubType,
          },
        }),
    });

    venueIds.set(venue.key, record.id);
  }

  for (const team of catalog.teams) {
    const ownerId = requireId(userIds, team.ownerKey, 'owner');
    const record = await createOrUpdateRecord({
      bucket: summary.teams,
      findExistingId: async () =>
        (
          await prisma.sportTeam.findFirst({
            where: { name: team.name },
            select: { id: true },
          })
        )?.id ?? null,
      create: () =>
        prisma.sportTeam.create({
          data: {
            ownerId,
            name: team.name,
            sportTypes: Array.isArray(team.sportType) ? team.sportType : [team.sportType],
            description: team.description,
            coverImageUrl: null,
            photos: [],
            city: team.city,
            district: team.district,
            level: team.level,
            isRecruiting: team.isRecruiting,
            contactInfo: team.contactInfo,
            instagramUrl: team.instagramUrl,
            kakaoOpenChat: team.kakaoOpenChat,
          },
        }),
      update: (id) =>
        prisma.sportTeam.update({
          where: { id },
          data: {
            ownerId,
            sportTypes: Array.isArray(team.sportType) ? team.sportType : [team.sportType],
            description: team.description,
            city: team.city,
            district: team.district,
            level: team.level,
            isRecruiting: team.isRecruiting,
            contactInfo: team.contactInfo,
            instagramUrl: team.instagramUrl,
            kakaoOpenChat: team.kakaoOpenChat,
          },
        }),
    });

    teamIds.set(team.key, record.id);
  }

  const managedMockUserIds = Array.from(userIds.values());

  const desiredMembershipsByTeam = new Map<MockTeamKey, Array<{ userId: string; role: 'owner' | 'manager' | 'member' }>>();

  for (const team of catalog.teams) {
    const ownerId = requireId(userIds, team.ownerKey, 'owner');
    desiredMembershipsByTeam.set(team.key, [{ userId: ownerId, role: 'owner' }]);
  }

  for (const membership of catalog.memberships) {
    const bucket = desiredMembershipsByTeam.get(membership.teamKey) ?? [];
    bucket.push({
      userId: requireId(userIds, membership.userKey, 'member'),
      role: membership.role,
    });
    desiredMembershipsByTeam.set(membership.teamKey, bucket);
  }

  for (const [teamKey, memberships] of desiredMembershipsByTeam.entries()) {
    const teamId = requireId(teamIds, teamKey, 'team');
    const desiredIds = memberships.map((membership) => membership.userId);

    for (const membership of memberships) {
      await createOrUpdateRecord({
        bucket: summary.teamMemberships,
        findExistingId: async () =>
          (
            await prisma.teamMembership.findUnique({
              where: {
                teamId_userId: {
                  teamId,
                  userId: membership.userId,
                },
              },
              select: { id: true },
            })
          )?.id ?? null,
        create: () =>
          prisma.teamMembership.create({
            data: {
              teamId,
              userId: membership.userId,
              role: membership.role,
              status: 'active',
            },
          }),
        update: (id) =>
          prisma.teamMembership.update({
            where: { id },
            data: {
              role: membership.role,
              status: 'active',
              leftAt: null,
            },
          }),
      });
    }

    await prisma.teamMembership.deleteMany({
      where: {
        teamId,
        userId: { in: managedMockUserIds.filter((userId) => !desiredIds.includes(userId)) },
      },
    });

    const activeCount = await prisma.teamMembership.count({
      where: {
        teamId,
        status: 'active',
      },
    });

    await prisma.sportTeam.update({
      where: { id: teamId },
      data: { memberCount: activeCount },
    });
  }

  for (const match of catalog.matches) {
    const hostId = requireId(userIds, match.hostKey, 'match host');
    const venueId = requireId(venueIds, match.venueKey, 'match venue');
    const record = await createOrUpdateRecord({
      bucket: summary.matches,
      findExistingId: async () =>
        (
          await prisma.match.findFirst({
            where: {
              hostId,
              title: match.title,
            },
            select: { id: true },
          })
        )?.id ?? null,
      create: () =>
        prisma.match.create({
          data: {
            hostId,
            sportType: match.sportType,
            title: match.title,
            description: match.description,
            imageUrl: null,
            venueId,
            matchDate: match.matchDate,
            startTime: match.startTime,
            endTime: match.endTime,
            maxPlayers: match.maxPlayers,
            currentPlayers: match.participantKeys.length,
            fee: match.fee,
            levelMin: match.levelMin,
            levelMax: match.levelMax,
            gender: match.gender,
            status: match.status ?? 'recruiting',
          },
        }),
      update: (id) =>
        prisma.match.update({
          where: { id },
          data: {
            sportType: match.sportType,
            description: match.description,
            venueId,
            matchDate: match.matchDate,
            startTime: match.startTime,
            endTime: match.endTime,
            maxPlayers: match.maxPlayers,
            currentPlayers: match.participantKeys.length,
            fee: match.fee,
            levelMin: match.levelMin,
            levelMax: match.levelMax,
            gender: match.gender,
            status: match.status ?? 'recruiting',
          },
        }),
    });

    matchIds.set(match.key, record.id);

    const desiredParticipantIds = match.participantKeys.map((userKey) =>
      requireId(userIds, userKey, 'match participant'),
    );

    for (const participantId of desiredParticipantIds) {
      const participantRecord = await createOrUpdateRecord({
        bucket: summary.matchParticipants,
        findExistingId: async () =>
          (
            await prisma.matchParticipant.findUnique({
              where: {
                matchId_userId: {
                  matchId: record.id,
                  userId: participantId,
                },
              },
              select: { id: true },
            })
          )?.id ?? null,
        create: () =>
          prisma.matchParticipant.create({
            data: {
              matchId: record.id,
              userId: participantId,
              status: 'confirmed',
              paymentStatus: 'completed',
            },
          }),
        update: (id) =>
          prisma.matchParticipant.update({
            where: { id },
            data: {
              status: 'confirmed',
              paymentStatus: 'completed',
            },
          }),
      });
      participantIdByMatchAndUser.set(`${record.id}:${participantId}`, participantRecord.id);
    }

    await prisma.matchParticipant.deleteMany({
      where: {
        matchId: record.id,
        userId: {
          in: managedMockUserIds.filter((userId) => !desiredParticipantIds.includes(userId)),
        },
      },
    });

    await prisma.match.update({
      where: { id: record.id },
      data: { currentPlayers: desiredParticipantIds.length },
    });
  }

  for (const lesson of catalog.lessons) {
    const hostId = requireId(userIds, lesson.hostKey, 'lesson host');
    const venueId = requireId(venueIds, lesson.venueKey, 'lesson venue');
    const coachImageUrl = lesson.coachUserKey
      ? catalog.users.find((user) => user.key === lesson.coachUserKey)?.profileImageUrl ?? null
      : null;

    const record = await createOrUpdateRecord({
      bucket: summary.lessons,
      findExistingId: async () =>
        (
          await prisma.lesson.findFirst({
            where: {
              hostId,
              title: lesson.title,
            },
            select: { id: true },
          })
        )?.id ?? null,
      create: () =>
        prisma.lesson.create({
          data: {
            hostId,
            sportType: lesson.sportType,
            type: lesson.type,
            title: lesson.title,
            description: lesson.description,
            venueId,
            venueName: catalog.venues.find((venue) => venue.key === lesson.venueKey)?.name,
            lessonDate: lesson.lessonDate,
            startTime: lesson.startTime,
            endTime: lesson.endTime,
            maxParticipants: lesson.maxParticipants,
            currentParticipants: lesson.currentParticipants,
            fee: lesson.fee,
            levelMin: lesson.levelMin,
            levelMax: lesson.levelMax,
            coachName: lesson.coachName,
            coachBio: lesson.coachBio,
            coachImageUrl,
            imageUrls: [],
          },
        }),
      update: (id) =>
        prisma.lesson.update({
          where: { id },
          data: {
            sportType: lesson.sportType,
            type: lesson.type,
            description: lesson.description,
            venueId,
            venueName: catalog.venues.find((venue) => venue.key === lesson.venueKey)?.name,
            lessonDate: lesson.lessonDate,
            startTime: lesson.startTime,
            endTime: lesson.endTime,
            maxParticipants: lesson.maxParticipants,
            currentParticipants: lesson.currentParticipants,
            fee: lesson.fee,
            levelMin: lesson.levelMin,
            levelMax: lesson.levelMax,
            coachName: lesson.coachName,
            coachBio: lesson.coachBio,
            coachImageUrl,
          },
        }),
    });

    lessonIds.set(lesson.key, record.id);

    const desiredPlanNames = lesson.ticketPlans.map((plan) => plan.name);

    for (const plan of lesson.ticketPlans) {
      await createOrUpdateRecord({
        bucket: summary.lessonTicketPlans,
        findExistingId: async () =>
          (
            await prisma.lessonTicketPlan.findFirst({
              where: {
                lessonId: record.id,
                name: plan.name,
              },
              select: { id: true },
            })
          )?.id ?? null,
        create: () =>
          prisma.lessonTicketPlan.create({
            data: {
              lessonId: record.id,
              name: plan.name,
              type: plan.type,
              price: plan.price,
              originalPrice: plan.originalPrice,
              totalSessions: plan.totalSessions,
              validDays: plan.validDays,
              description: plan.description,
              isActive: true,
              sortOrder: plan.sortOrder,
            },
          }),
        update: (id) =>
          prisma.lessonTicketPlan.update({
            where: { id },
            data: {
              type: plan.type,
              price: plan.price,
              originalPrice: plan.originalPrice,
              totalSessions: plan.totalSessions,
              validDays: plan.validDays,
              description: plan.description,
              isActive: true,
              sortOrder: plan.sortOrder,
            },
          }),
      });
    }

    await prisma.lessonTicketPlan.deleteMany({
      where: {
        lessonId: record.id,
        AND: [
          { name: { startsWith: '목업 ' } },
          { name: { notIn: desiredPlanNames } },
        ],
      },
    });
  }

  for (const listing of catalog.listings) {
    const sellerId = requireId(userIds, listing.sellerKey, 'listing seller');
    const record = await createOrUpdateRecord({
      bucket: summary.listings,
      findExistingId: async () =>
        (
          await prisma.marketplaceListing.findFirst({
            where: {
              sellerId,
              title: listing.title,
            },
            select: { id: true },
          })
        )?.id ?? null,
      create: () =>
        prisma.marketplaceListing.create({
          data: {
            sellerId,
            title: listing.title,
            description: listing.description,
            sportType: listing.sportType,
            category: listing.category,
            condition: listing.condition,
            price: listing.price,
            listingType: listing.listingType,
            status: 'active',
            imageUrls: [],
            locationCity: listing.locationCity,
            locationDistrict: listing.locationDistrict,
            rentalPricePerDay: listing.rentalPricePerDay,
            rentalDeposit: listing.rentalDeposit,
            groupBuyTarget: listing.groupBuyTarget,
            groupBuyCurrent: listing.groupBuyCurrent,
            groupBuyDeadline: listing.groupBuyDeadline,
            viewCount: listing.viewCount,
            likeCount: listing.likeCount,
            expiresAt: listing.groupBuyDeadline ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          },
        }),
      update: (id) =>
        prisma.marketplaceListing.update({
          where: { id },
          data: {
            description: listing.description,
            sportType: listing.sportType,
            category: listing.category,
            condition: listing.condition,
            price: listing.price,
            listingType: listing.listingType,
            status: 'active',
            locationCity: listing.locationCity,
            locationDistrict: listing.locationDistrict,
            rentalPricePerDay: listing.rentalPricePerDay,
            rentalDeposit: listing.rentalDeposit,
            groupBuyTarget: listing.groupBuyTarget,
            groupBuyCurrent: listing.groupBuyCurrent,
            groupBuyDeadline: listing.groupBuyDeadline,
            viewCount: listing.viewCount,
            likeCount: listing.likeCount,
            expiresAt: listing.groupBuyDeadline ?? undefined,
          },
        }),
    });

    listingIds.set(listing.key, record.id);
  }

  for (const post of catalog.mercenaryPosts) {
    const teamId = requireId(teamIds, post.teamKey, 'mercenary team');
    const authorId = requireId(userIds, post.authorKey, 'mercenary author');
    const record = await createOrUpdateRecord({
      bucket: summary.mercenaryPosts,
      findExistingId: async () =>
        (
          await prisma.mercenaryPost.findFirst({
            where: {
              teamId,
              venue: post.venue,
              position: post.position,
            },
            select: { id: true },
          })
        )?.id ?? null,
      create: () =>
        prisma.mercenaryPost.create({
          data: {
            teamId,
            authorId,
            sportType: post.sportType,
            matchDate: post.matchDate,
            venue: post.venue,
            position: post.position,
            count: post.count,
            level: post.level,
            fee: post.fee,
            notes: post.notes,
            status: post.status ?? 'open',
          },
        }),
      update: (id) =>
        prisma.mercenaryPost.update({
          where: { id },
          data: {
            authorId,
            sportType: post.sportType,
            matchDate: post.matchDate,
            count: post.count,
            level: post.level,
            fee: post.fee,
            notes: post.notes,
            status: post.status ?? 'open',
          },
        }),
    });

    mercenaryIds.set(post.key, record.id);
  }

  for (const teamMatch of catalog.teamMatches) {
    const hostTeamId = requireId(teamIds, teamMatch.hostTeamKey, 'team match host');
    const record = await createOrUpdateRecord({
      bucket: summary.teamMatches,
      findExistingId: async () =>
        (
          await prisma.teamMatch.findFirst({
            where: {
              hostTeamId,
              title: teamMatch.title,
            },
            select: { id: true },
          })
        )?.id ?? null,
      create: () =>
        prisma.teamMatch.create({
          data: {
            hostTeamId,
            sportType: teamMatch.sportType,
            title: teamMatch.title,
            description: teamMatch.description,
            matchDate: teamMatch.matchDate,
            startTime: teamMatch.startTime,
            endTime: teamMatch.endTime,
            totalMinutes: teamMatch.totalMinutes,
            quarterCount: teamMatch.quarterCount,
            venueName: teamMatch.venueName,
            venueAddress: teamMatch.venueAddress,
            totalFee: teamMatch.totalFee,
            opponentFee: teamMatch.opponentFee,
            requiredLevel: teamMatch.requiredLevel,
            allowMercenary: teamMatch.allowMercenary,
            matchStyle: teamMatch.matchStyle,
            hasReferee: teamMatch.hasReferee,
            notes: teamMatch.notes,
            skillGrade: teamMatch.skillGrade,
            gameFormat: teamMatch.gameFormat,
            matchType: teamMatch.matchType,
            uniformColor: teamMatch.uniformColor,
            status: teamMatch.status ?? 'recruiting',
          },
        }),
      update: (id) =>
        prisma.teamMatch.update({
          where: { id },
          data: {
            sportType: teamMatch.sportType,
            description: teamMatch.description,
            matchDate: teamMatch.matchDate,
            startTime: teamMatch.startTime,
            endTime: teamMatch.endTime,
            totalMinutes: teamMatch.totalMinutes,
            quarterCount: teamMatch.quarterCount,
            venueName: teamMatch.venueName,
            venueAddress: teamMatch.venueAddress,
            totalFee: teamMatch.totalFee,
            opponentFee: teamMatch.opponentFee,
            requiredLevel: teamMatch.requiredLevel,
            allowMercenary: teamMatch.allowMercenary,
            matchStyle: teamMatch.matchStyle,
            hasReferee: teamMatch.hasReferee,
            notes: teamMatch.notes,
            skillGrade: teamMatch.skillGrade,
            gameFormat: teamMatch.gameFormat,
            matchType: teamMatch.matchType,
            uniformColor: teamMatch.uniformColor,
            status: teamMatch.status ?? 'recruiting',
            guestTeamId: null,
          },
        }),
    });

    teamMatchIds.set(teamMatch.key, record.id);

    const desiredApplicantTeamIds = teamMatch.applications.map((application) =>
      requireId(teamIds, application.applicantTeamKey, 'team match applicant'),
    );

    for (const application of teamMatch.applications) {
      const applicantTeamId = requireId(teamIds, application.applicantTeamKey, 'team match applicant');
      await createOrUpdateRecord({
        bucket: summary.teamMatchApplications,
        findExistingId: async () =>
          (
            await prisma.teamMatchApplication.findUnique({
              where: {
                teamMatchId_applicantTeamId: {
                  teamMatchId: record.id,
                  applicantTeamId,
                },
              },
              select: { id: true },
            })
          )?.id ?? null,
        create: () =>
          prisma.teamMatchApplication.create({
            data: {
              teamMatchId: record.id,
              applicantTeamId,
              status: application.status,
              message: application.message,
              participationType: application.participationType,
              confirmedInfo: application.confirmedInfo,
              confirmedLevel: application.confirmedLevel,
            },
          }),
        update: (id) =>
          prisma.teamMatchApplication.update({
            where: { id },
            data: {
              status: application.status,
              message: application.message,
              participationType: application.participationType,
              confirmedInfo: application.confirmedInfo,
              confirmedLevel: application.confirmedLevel,
            },
          }),
      });
    }

    await prisma.teamMatchApplication.deleteMany({
      where: {
        teamMatchId: record.id,
        applicantTeamId: {
          in: Array.from(teamIds.values()).filter((teamId) => !desiredApplicantTeamIds.includes(teamId)),
        },
      },
    });
  }

  for (const badge of catalog.teamBadges) {
    const teamId = requireId(teamIds, badge.teamKey, 'badge team');
    await createOrUpdateRecord({
      bucket: summary.teamBadges,
      findExistingId: async () =>
        (
          await prisma.badge.findFirst({
            where: {
              teamId,
              type: badge.type,
            },
            select: { id: true },
          })
        )?.id ?? null,
      create: () =>
        prisma.badge.create({
          data: {
            teamId,
            type: badge.type,
            name: badge.name,
            description: badge.description,
          },
        }),
      update: (id) =>
        prisma.badge.update({
          where: { id },
          data: {
            name: badge.name,
            description: badge.description,
          },
        }),
    });
  }

  // Seed mercenary applications
  for (const app of catalog.mercenaryApplications) {
    const postId = requireId(mercenaryIds, app.postKey, 'mercenary post');
    const applicantId = requireId(userIds, app.applicantKey, 'mercenary applicant');
    const appKey = `${app.postKey}:${app.applicantKey}`;
    const record = await createOrUpdateRecord({
      bucket: summary.mercenaryApplications,
      findExistingId: async () =>
        (
          await prisma.mercenaryApplication.findUnique({
            where: { postId_userId: { postId, userId: applicantId } },
            select: { id: true },
          })
        )?.id ?? null,
      create: () =>
        prisma.mercenaryApplication.create({
          data: { postId, userId: applicantId, status: app.status, message: app.message },
        }),
      update: (id) =>
        prisma.mercenaryApplication.update({
          where: { id },
          data: { status: app.status, message: app.message },
        }),
    });
    mercenaryApplicationIds.set(appKey, record.id);
  }

  // Seed payments (requires MatchParticipant to exist, uses participantIdByMatchAndUser)
  for (const payment of catalog.payments) {
    const matchId = requireId(matchIds, payment.matchKey, 'payment match');
    const payerId = requireId(userIds, payment.payerKey, 'payment payer');
    const participantId = participantIdByMatchAndUser.get(`${matchId}:${payerId}`);
    if (!participantId) {
      console.warn(`Skipping payment ${payment.id}: no participant for match ${payment.matchKey} user ${payment.payerKey}`);
      continue;
    }
    await createOrUpdateRecord({
      bucket: summary.payments,
      findExistingId: async () =>
        (
          await prisma.payment.findUnique({
            where: { id: payment.id },
            select: { id: true },
          })
        )?.id ?? null,
      create: () =>
        prisma.payment.create({
          data: {
            id: payment.id,
            orderId: payment.orderId,
            userId: payerId,
            amount: payment.amount,
            status: payment.status,
            participantId,
          },
        }),
      update: (id) =>
        prisma.payment.update({
          where: { id },
          data: { amount: payment.amount, status: payment.status },
        }),
    });
  }

  // Seed marketplace orders
  for (const order of catalog.marketplaceOrders) {
    const listingId = requireId(listingIds, order.listingKey, 'marketplace listing');
    const buyerId = requireId(userIds, order.buyerKey, 'marketplace buyer');
    const sellerId = requireId(userIds, order.sellerKey, 'marketplace seller');
    await createOrUpdateRecord({
      bucket: summary.marketplaceOrders,
      findExistingId: async () =>
        (
          await prisma.marketplaceOrder.findUnique({
            where: { orderId: order.orderId },
            select: { id: true },
          })
        )?.id ?? null,
      create: () =>
        prisma.marketplaceOrder.create({
          data: {
            orderId: order.orderId,
            listingId,
            buyerId,
            sellerId,
            amount: order.amount,
            status: order.status,
          },
        }),
      update: (id) =>
        prisma.marketplaceOrder.update({
          where: { id },
          data: { amount: order.amount, status: order.status },
        }),
    });
  }

  // Seed lesson schedules
  for (const schedule of catalog.lessonSchedules) {
    const lessonId = requireId(lessonIds, schedule.lessonKey, 'lesson');
    const scheduleKey = `${schedule.lessonKey}:${schedule.sessionDate.toISOString()}`;
    const record = await createOrUpdateRecord({
      bucket: summary.lessonSchedules,
      findExistingId: async () =>
        (
          await prisma.lessonSchedule.findFirst({
            where: { lessonId, sessionDate: schedule.sessionDate },
            select: { id: true },
          })
        )?.id ?? null,
      create: () =>
        prisma.lessonSchedule.create({
          data: {
            lessonId,
            sessionDate: schedule.sessionDate,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            maxParticipants: schedule.maxParticipants,
          },
        }),
      update: (id) =>
        prisma.lessonSchedule.update({
          where: { id },
          data: {
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            maxParticipants: schedule.maxParticipants,
          },
        }),
    });
    lessonScheduleIds.set(scheduleKey, record.id);
  }

  // Seed lesson tickets
  for (const ticket of catalog.lessonTickets) {
    const lessonId = requireId(lessonIds, ticket.lessonKey, 'lesson');
    const ownerId = requireId(userIds, ticket.ownerKey, 'lesson ticket owner');
    const plan = await prisma.lessonTicketPlan.findFirst({
      where: { lessonId, name: ticket.planName },
      select: { id: true },
    });
    if (!plan) {
      console.warn(`Skipping ticket ${ticket.id}: plan "${ticket.planName}" not found for lesson ${ticket.lessonKey}`);
      continue;
    }
    await createOrUpdateRecord({
      bucket: summary.lessonTickets,
      findExistingId: async () =>
        (
          await prisma.lessonTicket.findUnique({
            where: { id: ticket.id },
            select: { id: true },
          })
        )?.id ?? null,
      create: () =>
        prisma.lessonTicket.create({
          data: {
            id: ticket.id,
            lessonId,
            userId: ownerId,
            planId: plan.id,
            status: ticket.status,
            usedSessions: ticket.usedSessions ?? 0,
            paidAmount: ticket.paidAmount,
            expiresAt: ticket.expiresAt,
          },
        }),
      update: (id) =>
        prisma.lessonTicket.update({
          where: { id },
          data: {
            status: ticket.status,
            usedSessions: ticket.usedSessions ?? 0,
            paidAmount: ticket.paidAmount,
            expiresAt: ticket.expiresAt,
          },
        }),
    });
  }

  // Seed lesson attendances
  for (const attendance of catalog.lessonAttendances) {
    const scheduleKey = `${attendance.lessonKey}:${attendance.sessionDate.toISOString()}`;
    const scheduleId = lessonScheduleIds.get(scheduleKey);
    if (!scheduleId) {
      console.warn(`Skipping attendance: no schedule for ${scheduleKey}`);
      continue;
    }
    const userId = requireId(userIds, attendance.userKey, 'lesson attendance user');
    await createOrUpdateRecord({
      bucket: summary.lessonAttendances,
      findExistingId: async () =>
        (
          await prisma.lessonAttendance.findUnique({
            where: { scheduleId_userId: { scheduleId, userId } },
            select: { id: true },
          })
        )?.id ?? null,
      create: () =>
        prisma.lessonAttendance.create({
          data: { scheduleId, userId, ticketId: attendance.ticketId, status: attendance.status },
        }),
      update: (id) =>
        prisma.lessonAttendance.update({
          where: { id },
          data: { status: attendance.status },
        }),
    });
  }

  // Seed chat rooms and messages
  for (const room of catalog.chatRooms) {
    const participantIds = room.participantKeys.map((key) => requireId(userIds, key, 'chat participant'));
    const teamMatchId = room.teamMatchKey ? teamMatchIds.get(room.teamMatchKey) ?? null : null;
    const record = await createOrUpdateRecord({
      bucket: summary.chatRooms,
      findExistingId: async () =>
        (
          await prisma.chatRoom.findFirst({
            where: teamMatchId ? { teamMatchId } : { id: { contains: '' } },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true },
          })
        )?.id ?? null,
      create: async () => {
        const chatRoom = await prisma.chatRoom.create({
          data: {
            type: room.type,
            teamMatchId,
            participants: {
              create: participantIds.map((userId) => ({ userId })),
            },
          },
        });
        return chatRoom;
      },
      update: (id) => prisma.chatRoom.update({ where: { id }, data: { type: room.type } }),
    });
    chatRoomIds.set(room.key, record.id);
  }

  for (const msg of catalog.chatMessages) {
    const chatRoomId = chatRoomIds.get(msg.chatRoomKey);
    if (!chatRoomId) continue;
    const senderId = requireId(userIds, msg.senderKey, 'chat message sender');
    const createdAt = new Date(Date.now() + msg.offsetMinutes * 60 * 1000);
    await createOrUpdateRecord({
      bucket: summary.chatMessages,
      findExistingId: async () => null,
      create: () =>
        prisma.chatMessage.create({
          data: { roomId: chatRoomId, senderId, content: msg.content, type: msg.type, createdAt },
        }),
      update: (id) => prisma.chatMessage.update({ where: { id }, data: { content: msg.content } }),
    });
  }

  // Seed venue reviews
  for (const review of catalog.venueReviews) {
    const venueId = requireId(venueIds, review.venueKey, 'venue review venue');
    const authorId = requireId(userIds, review.authorKey, 'venue review author');
    await createOrUpdateRecord({
      bucket: summary.venueReviews,
      findExistingId: async () =>
        (
          await prisma.venueReview.findUnique({
            where: { venueId_userId: { venueId, userId: authorId } },
            select: { id: true },
          })
        )?.id ?? null,
      create: () =>
        prisma.venueReview.create({
          data: {
            venueId,
            userId: authorId,
            rating: review.rating,
            facilityRating: review.facilityRating,
            accessRating: review.accessRating,
            costRating: review.costRating,
            comment: review.comment,
          },
        }),
      update: (id) =>
        prisma.venueReview.update({
          where: { id },
          data: {
            rating: review.rating,
            facilityRating: review.facilityRating,
            accessRating: review.accessRating,
            costRating: review.costRating,
            comment: review.comment,
          },
        }),
    });
  }

  // Seed match reviews (only for completed matches)
  for (const review of catalog.matchReviews) {
    const matchId = requireId(matchIds, review.matchKey, 'match review match');
    const authorId = requireId(userIds, review.authorKey, 'match review author');
    const targetId = requireId(userIds, review.targetKey, 'match review target');
    await createOrUpdateRecord({
      bucket: summary.matchReviews,
      findExistingId: async () =>
        (
          await prisma.review.findUnique({
            where: { matchId_authorId_targetId: { matchId, authorId, targetId } },
            select: { id: true },
          })
        )?.id ?? null,
      create: () =>
        prisma.review.create({
          data: {
            matchId,
            authorId,
            targetId,
            mannerRating: review.mannerRating,
            skillRating: review.skillRating,
            comment: review.comment,
          },
        }),
      update: (id) =>
        prisma.review.update({
          where: { id },
          data: {
            mannerRating: review.mannerRating,
            skillRating: review.skillRating,
            comment: review.comment,
          },
        }),
    });
  }

  // Seed notifications
  for (const notification of catalog.notifications) {
    const recipientId = requireId(userIds, notification.recipientKey, 'notification recipient');
    await createOrUpdateRecord({
      bucket: summary.notifications,
      findExistingId: async () => null,
      create: () =>
        prisma.notification.create({
          data: {
            userId: recipientId,
            type: notification.type,
            title: notification.title,
            body: notification.body,
            isRead: notification.isRead,
          },
        }),
      update: (id) =>
        prisma.notification.update({
          where: { id },
          data: { isRead: notification.isRead },
        }),
    });
  }

  // Seed tournaments
  for (const tournament of catalog.tournaments) {
    const organizerId = requireId(userIds, tournament.organizerKey, 'tournament organizer');
    await createOrUpdateRecord({
      bucket: summary.tournaments,
      findExistingId: async () =>
        (
          await prisma.tournament.findFirst({
            where: { title: tournament.title },
            select: { id: true },
          })
        )?.id ?? null,
      create: () =>
        prisma.tournament.create({
          data: {
            organizerId,
            sportType: tournament.sportType,
            title: tournament.title,
            status: tournament.status,
            startDate: tournament.startDate,
            endDate: tournament.endDate,
            maxParticipants: tournament.maxParticipants,
            currentParticipants: tournament.currentParticipants,
            entryFee: tournament.entryFee,
            description: tournament.description,
          },
        }),
      update: (id) =>
        prisma.tournament.update({
          where: { id },
          data: {
            status: tournament.status,
            startDate: tournament.startDate,
            endDate: tournament.endDate,
            maxParticipants: tournament.maxParticipants,
            currentParticipants: tournament.currentParticipants,
            entryFee: tournament.entryFee,
            description: tournament.description,
          },
        }),
    });
  }

  // Seed settlements
  for (const settlement of catalog.settlements) {
    const recipientId = requireId(userIds, settlement.recipientKey, 'settlement recipient');
    await createOrUpdateRecord({
      bucket: summary.settlements,
      findExistingId: async () =>
        (
          await prisma.settlementRecord.findFirst({
            where: { sourceId: settlement.sourceId },
            select: { id: true },
          })
        )?.id ?? null,
      create: () =>
        prisma.settlementRecord.create({
          data: {
            sourceId: settlement.sourceId,
            type: settlement.type,
            amount: settlement.amount,
            commission: settlement.commission,
            netAmount: settlement.netAmount,
            status: settlement.status,
            recipientId,
          },
        }),
      update: (id) =>
        prisma.settlementRecord.update({
          where: { id },
          data: {
            amount: settlement.amount,
            commission: settlement.commission,
            netAmount: settlement.netAmount,
            status: settlement.status,
          },
        }),
    });
  }

  // Seed reports
  for (const report of catalog.reports) {
    const reporterId = requireId(userIds, report.reporterKey, 'report reporter');
    await createOrUpdateRecord({
      bucket: summary.reports,
      findExistingId: async () =>
        (
          await prisma.report.findFirst({
            where: { reporterId, targetId: report.targetId },
            select: { id: true },
          })
        )?.id ?? null,
      create: () =>
        prisma.report.create({
          data: {
            reporterId,
            targetType: report.targetType,
            targetId: report.targetId,
            reason: report.reason,
            status: report.status,
          },
        }),
      update: (id) =>
        prisma.report.update({
          where: { id },
          data: { status: report.status },
        }),
    });
  }

  // Seed user badges
  for (const badge of catalog.userBadges) {
    const userId = requireId(userIds, badge.userKey, 'user badge user');
    await createOrUpdateRecord({
      bucket: summary.userBadges,
      findExistingId: async () =>
        (
          await prisma.userBadge.findUnique({
            where: { userId_type: { userId, type: badge.type } },
            select: { id: true },
          })
        )?.id ?? null,
      create: () =>
        prisma.userBadge.create({
          data: { userId, type: badge.type, name: badge.name, description: badge.description },
        }),
      update: (id) =>
        prisma.userBadge.update({
          where: { id },
          data: { name: badge.name, description: badge.description },
        }),
    });
  }

  // Seed team trust scores
  for (const score of catalog.teamTrustScores) {
    const teamId = requireId(teamIds, score.teamKey, 'team trust score team');
    await createOrUpdateRecord({
      bucket: summary.teamTrustScores,
      findExistingId: async () =>
        (
          await prisma.teamTrustScore.findUnique({
            where: { teamId },
            select: { id: true },
          })
        )?.id ?? null,
      create: () =>
        prisma.teamTrustScore.create({
          data: {
            teamId,
            selfLevel: score.selfLevel,
            mannerScore: score.mannerScore,
            lateRate: score.lateRate,
            noShowRate: score.noShowRate,
            cancelRate: score.cancelRate,
            totalMatches: score.totalMatches,
            totalWins: score.totalWins,
          },
        }),
      update: (id) =>
        prisma.teamTrustScore.update({
          where: { id },
          data: {
            selfLevel: score.selfLevel,
            mannerScore: score.mannerScore,
            lateRate: score.lateRate,
            noShowRate: score.noShowRate,
            cancelRate: score.cancelRate,
            totalMatches: score.totalMatches,
            totalWins: score.totalWins,
          },
        }),
    });
  }

  await syncImageData(prisma);

  if (checksumGateEnabled) {
    const payload = {
      seedDateKey: catalog.seedDateKey,
      catalogVersion: DEV_MOCK_CATALOG_VERSION,
      catalogChecksum,
      summary,
    } satisfies Prisma.InputJsonObject;

    await prisma.seedSyncState.upsert({
      where: { key: DEPLOY_MOCK_SEED_STATE_KEY },
      update: {
        checksum: catalogChecksum,
        payload,
        appliedAt: new Date(),
      },
      create: {
        key: DEPLOY_MOCK_SEED_STATE_KEY,
        checksum: catalogChecksum,
        payload,
      },
    });
  }

  console.log('✅ Canonical dev mock dataset synced');
  if (checksumGateEnabled) {
    console.log(`🔐 Stored deploy mock checksum: ${catalogChecksum}`);
  }
  console.log(formatSummary(summary));
}

main()
  .catch((error) => {
    console.error('❌ Dev mock seed error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

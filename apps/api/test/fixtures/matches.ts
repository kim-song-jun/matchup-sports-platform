import { PrismaClient, Match, MatchParticipant, SportType, MatchStatus } from '@prisma/client';

export interface MatchWithParticipants {
  match: Match;
  participants: MatchParticipant[];
}

async function ensureVenue(prisma: PrismaClient): Promise<string> {
  const existing = await prisma.venue.findFirst();
  if (existing) return existing.id;

  const venue = await prisma.venue.create({
    data: {
      name: 'Test Venue',
      type: 'futsal_court',
      sportTypes: ['futsal'],
      address: '서울시 마포구 테스트로 1',
      lat: 37.5,
      lng: 126.9,
      city: '서울',
      district: '마포구',
      operatingHours: {},
      imageUrls: [],
      facilities: [],
    },
  });
  return venue.id;
}

/**
 * Creates a Match record with a real Venue FK resolved automatically.
 */
export async function createMatch(
  prisma: PrismaClient,
  hostId: string,
  overrides: Partial<{
    sportType: SportType;
    title: string;
    matchDate: Date;
    startTime: string;
    endTime: string;
    maxPlayers: number;
    fee: number;
    status: MatchStatus;
    venueId: string;
  }> = {},
): Promise<Match> {
  const venueId = overrides.venueId ?? (await ensureVenue(prisma));

  return prisma.match.create({
    data: {
      hostId,
      sportType: overrides.sportType ?? SportType.futsal,
      title: overrides.title ?? 'Test Match',
      venueId,
      matchDate: overrides.matchDate ?? new Date('2026-05-01'),
      startTime: overrides.startTime ?? '10:00',
      endTime: overrides.endTime ?? '12:00',
      maxPlayers: overrides.maxPlayers ?? 10,
      fee: overrides.fee ?? 0,
      status: overrides.status ?? MatchStatus.recruiting,
    },
  });
}

/**
 * Creates a Match and adds participants (host is NOT automatically added).
 */
export async function createMatchWithParticipants(
  prisma: PrismaClient,
  hostId: string,
  participantIds: string[],
): Promise<MatchWithParticipants> {
  const match = await createMatch(prisma, hostId);

  const participants = await Promise.all(
    participantIds.map((userId) =>
      prisma.matchParticipant.create({
        data: {
          matchId: match.id,
          userId,
          status: 'confirmed',
          paymentStatus: 'completed',
        },
      }),
    ),
  );

  return { match, participants };
}

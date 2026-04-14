import { PrismaClient, Review, SportType, MatchStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Build helpers — pure in-memory objects for unit test mocks (no DB I/O)
// ---------------------------------------------------------------------------

export function buildReview(
  overrides: Partial<{
    id: string;
    matchId: string;
    authorId: string;
    targetId: string;
    skillRating: number;
    mannerRating: number;
    comment: string | null;
    createdAt: Date;
  }> = {},
): Review {
  return {
    id: overrides.id ?? 'review-test-id',
    matchId: overrides.matchId ?? 'match-test-id',
    authorId: overrides.authorId ?? 'author-test-id',
    targetId: overrides.targetId ?? 'target-test-id',
    skillRating: overrides.skillRating ?? 4.0,
    mannerRating: overrides.mannerRating ?? 4.5,
    comment: overrides.comment ?? null,
    createdAt: overrides.createdAt ?? new Date('2026-02-01'),
  };
}

// ---------------------------------------------------------------------------
// DB builders
// ---------------------------------------------------------------------------

/**
 * Creates a Review in the database.
 * Requires an existing completed Match and both author/target as participants.
 */
export async function createReview(
  prisma: PrismaClient,
  authorId: string,
  targetId: string,
  matchId: string,
  overrides: Partial<{
    skillRating: number;
    mannerRating: number;
    comment: string;
  }> = {},
): Promise<Review> {
  return prisma.review.create({
    data: {
      matchId,
      authorId,
      targetId,
      skillRating: overrides.skillRating ?? 4.0,
      mannerRating: overrides.mannerRating ?? 4.5,
      comment: overrides.comment ?? null,
    },
  });
}

/**
 * Creates a completed Match with two participants and a review between them.
 * Useful for integration tests that need a full review setup.
 */
export async function createMatchWithReview(
  prisma: PrismaClient,
  authorId: string,
  targetId: string,
): Promise<{ matchId: string; review: Review }> {
  // Ensure a venue exists
  let venue = await prisma.venue.findFirst();
  if (!venue) {
    venue = await prisma.venue.create({
      data: {
        name: 'Review Test Venue',
        type: 'futsal_court',
        sportTypes: [SportType.futsal],
        address: '서울시 마포구 리뷰테스트로 1',
        lat: 37.5,
        lng: 126.9,
        city: '서울',
        district: '마포구',
        operatingHours: {},
        imageUrls: [],
        facilities: [],
      },
    });
  }

  const match = await prisma.match.create({
    data: {
      hostId: authorId,
      sportType: SportType.futsal,
      title: 'Review Test Match',
      venueId: venue.id,
      matchDate: new Date('2026-03-01'),
      startTime: '10:00',
      endTime: '12:00',
      maxPlayers: 10,
      fee: 0,
      status: MatchStatus.completed,
    },
  });

  await prisma.matchParticipant.createMany({
    data: [
      {
        matchId: match.id,
        userId: authorId,
        status: 'confirmed',
        paymentStatus: 'completed',
      },
      {
        matchId: match.id,
        userId: targetId,
        status: 'confirmed',
        paymentStatus: 'completed',
      },
    ],
    skipDuplicates: true,
  });

  const review = await createReview(prisma, authorId, targetId, match.id);

  return { matchId: match.id, review };
}

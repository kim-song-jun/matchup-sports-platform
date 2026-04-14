import { PrismaClient, Venue, VenueReview, SportType, VenueType } from '@prisma/client';

// ---------------------------------------------------------------------------
// Build helpers — pure in-memory objects for unit test mocks (no DB I/O)
// ---------------------------------------------------------------------------

export function buildVenue(
  overrides: Partial<{
    id: string;
    name: string;
    type: VenueType;
    sportTypes: SportType[];
    address: string;
    lat: number;
    lng: number;
    city: string;
    district: string;
    rating: number;
    reviewCount: number;
    pricePerHour: number;
  }> = {},
): Omit<Venue, 'ownerId' | 'phone' | 'description' | 'addressDetail' | 'iceQualityAvg' | 'rinkSubType' | 'updatedAt'> & {
  ownerId: string | null;
  phone: string | null;
  description: string | null;
  addressDetail: string | null;
  iceQualityAvg: number | null;
  rinkSubType: string | null;
  updatedAt: Date;
} {
  return {
    id: overrides.id ?? 'venue-test-id',
    ownerId: null,
    name: overrides.name ?? '테스트 구장',
    type: overrides.type ?? VenueType.futsal_court,
    sportTypes: overrides.sportTypes ?? [SportType.futsal],
    address: overrides.address ?? '서울시 마포구 테스트로 1',
    addressDetail: null,
    lat: overrides.lat ?? 37.5665,
    lng: overrides.lng ?? 126.9780,
    city: overrides.city ?? '서울',
    district: overrides.district ?? '마포구',
    phone: null,
    description: null,
    imageUrls: [],
    facilities: [],
    operatingHours: { mon: { open: '09:00', close: '22:00' } },
    pricePerHour: overrides.pricePerHour ?? 30000,
    rating: overrides.rating ?? 4.0,
    reviewCount: overrides.reviewCount ?? 0,
    iceQualityAvg: null,
    rinkSubType: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
}

export function buildVenueReview(
  overrides: Partial<{
    id: string;
    venueId: string;
    userId: string;
    rating: number;
    facilityRating: number;
    accessRating: number;
    costRating: number;
    iceQuality: number | null;
    comment: string | null;
  }> = {},
): VenueReview {
  return {
    id: overrides.id ?? 'vreview-test-id',
    venueId: overrides.venueId ?? 'venue-test-id',
    userId: overrides.userId ?? 'user-test-id',
    rating: overrides.rating ?? 4.0,
    facilityRating: overrides.facilityRating ?? 4.0,
    accessRating: overrides.accessRating ?? 4.0,
    costRating: overrides.costRating ?? 4.0,
    iceQuality: overrides.iceQuality ?? null,
    comment: overrides.comment ?? null,
    imageUrls: [],
    createdAt: new Date('2026-01-15'),
  };
}

// ---------------------------------------------------------------------------
// DB builders
// ---------------------------------------------------------------------------

/**
 * Creates a Venue in the database.
 */
export async function createVenue(
  prisma: PrismaClient,
  overrides: Partial<{
    name: string;
    type: VenueType;
    sportTypes: SportType[];
    address: string;
    city: string;
    district: string;
    pricePerHour: number;
    ownerId: string;
  }> = {},
): Promise<Venue> {
  return prisma.venue.create({
    data: {
      name: overrides.name ?? '테스트 구장',
      type: overrides.type ?? VenueType.futsal_court,
      sportTypes: overrides.sportTypes ?? [SportType.futsal],
      address: overrides.address ?? '서울시 마포구 테스트로 1',
      lat: 37.5665,
      lng: 126.9780,
      city: overrides.city ?? '서울',
      district: overrides.district ?? '마포구',
      operatingHours: { mon: { open: '09:00', close: '22:00' } },
      imageUrls: [],
      facilities: [],
      pricePerHour: overrides.pricePerHour ?? 30000,
      ...(overrides.ownerId ? { ownerId: overrides.ownerId } : {}),
    },
  });
}

/**
 * Creates a VenueReview for a venue by a user.
 */
export async function createVenueReview(
  prisma: PrismaClient,
  venueId: string,
  userId: string,
  overrides: Partial<{
    rating: number;
    facilityRating: number;
    accessRating: number;
    costRating: number;
    comment: string;
  }> = {},
): Promise<VenueReview> {
  const review = await prisma.venueReview.create({
    data: {
      venueId,
      userId,
      rating: overrides.rating ?? 4.0,
      facilityRating: overrides.facilityRating ?? 4.0,
      accessRating: overrides.accessRating ?? 4.0,
      costRating: overrides.costRating ?? 4.0,
      comment: overrides.comment ?? null,
      imageUrls: [],
    },
  });

  // Update aggregate rating on the venue
  const agg = await prisma.venueReview.aggregate({
    where: { venueId },
    _avg: { rating: true },
    _count: { id: true },
  });

  await prisma.venue.update({
    where: { id: venueId },
    data: {
      rating: agg._avg.rating ?? 0,
      reviewCount: agg._count.id,
    },
  });

  return review;
}

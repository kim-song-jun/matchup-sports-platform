import { PrismaClient, MarketplaceListing, SportType, ListingStatus, ItemCondition, ListingType } from '@prisma/client';

/**
 * Creates an active MarketplaceListing for the given seller.
 */
export async function createListing(
  prisma: PrismaClient,
  sellerId: string,
  overrides: Partial<{
    title: string;
    description: string;
    sportType: SportType;
    category: string;
    condition: ItemCondition;
    price: number;
    listingType: ListingType;
    status: ListingStatus;
  }> = {},
): Promise<MarketplaceListing> {
  return prisma.marketplaceListing.create({
    data: {
      sellerId,
      title: overrides.title ?? 'Test Listing',
      description: overrides.description ?? 'Test description',
      sportType: overrides.sportType ?? SportType.futsal,
      category: overrides.category ?? 'shoes',
      condition: overrides.condition ?? ItemCondition.good,
      price: overrides.price ?? 50000,
      listingType: overrides.listingType ?? ListingType.sell,
      status: overrides.status ?? ListingStatus.active,
      imageUrls: [],
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
  });
}

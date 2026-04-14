import type { MarketplaceListing } from '@/types/api';

export const mockListing: MarketplaceListing = {
  id: 'listing-1',
  sellerId: 'user-1',
  title: '축구화 판매',
  description: '사이즈 270, 거의 새것',
  sportType: 'soccer',
  category: '신발',
  condition: 'like_new',
  price: 50000,
  listingType: 'sell',
  status: 'active',
  imageUrls: [],
  locationCity: '서울',
  locationDistrict: '송파구',
  viewCount: 0,
  likeCount: 0,
};

export const mockOrder = {
  id: 'order-1',
  listingId: 'listing-1',
  buyerId: 'user-2',
  sellerId: 'user-1',
  amount: 50000,
  status: 'pending' as const,
  createdAt: '2024-01-05T10:00:00.000Z',
};

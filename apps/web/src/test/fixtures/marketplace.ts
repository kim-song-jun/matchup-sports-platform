import type { MarketplaceListing } from '@/types/api';
import type { MarketplaceOrder } from '@/types/marketplace';

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

export const mockOrder: MarketplaceOrder = {
  id: 'order-1',
  listingId: 'listing-1',
  buyerId: 'user-2',
  sellerId: 'user-1',
  amount: 50000,
  commission: 5000,
  orderId: 'MU-MKT-test-order-1',
  status: 'pending',
  paymentKey: null,
  paidAt: null,
  shippedAt: null,
  deliveredAt: null,
  completedAt: null,
  confirmedReceiptAt: null,
  autoReleaseAt: null,
  releasedAt: null,
  rentalStartDate: null,
  rentalEndDate: null,
  createdAt: '2024-01-05T10:00:00.000Z',
  updatedAt: '2024-01-05T10:00:00.000Z',
};

export const mockOrderShipped: MarketplaceOrder = {
  ...mockOrder,
  id: 'order-2',
  status: 'shipped',
  shippedAt: '2024-01-06T10:00:00.000Z',
};

export const mockOrderDelivered: MarketplaceOrder = {
  ...mockOrder,
  id: 'order-3',
  status: 'delivered',
  shippedAt: '2024-01-06T10:00:00.000Z',
  deliveredAt: '2024-01-07T10:00:00.000Z',
  autoReleaseAt: '2024-01-14T10:00:00.000Z',
};

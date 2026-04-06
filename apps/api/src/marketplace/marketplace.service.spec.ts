import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockListing = (overrides = {}) => ({
  id: 'listing-1',
  sellerId: 'user-1',
  title: 'Test Listing',
  description: 'Good item',
  sportType: 'futsal',
  category: 'shoes',
  condition: 'good',
  price: 50000,
  listingType: 'sell',
  status: 'active',
  imageUrls: [],
  viewCount: 0,
  likeCount: 0,
  seller: { id: 'user-1', nickname: 'seller', profileImageUrl: null, mannerScore: 4.0 },
  createdAt: new Date(),
  updatedAt: new Date(),
  expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  ...overrides,
});

const prismaMock = {
  marketplaceListing: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  marketplaceOrder: {
    create: jest.fn(),
  },
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('MarketplaceService', () => {
  let service: MarketplaceService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketplaceService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<MarketplaceService>(MarketplaceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── findListings ────────────────────────────────────────────────────────────

  describe('findListings', () => {
    it('returns paginated active listings', async () => {
      const listings = [mockListing({ id: 'l1' }), mockListing({ id: 'l2' })];
      prismaMock.marketplaceListing.findMany.mockResolvedValue(listings);

      const result = await service.findListings({});

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
    });

    it('returns nextCursor when there are more than 20 results', async () => {
      const manyListings = Array.from({ length: 21 }, (_, i) => mockListing({ id: `l${i}` }));
      prismaMock.marketplaceListing.findMany.mockResolvedValue(manyListings);

      const result = await service.findListings({});

      expect(result.items).toHaveLength(20);
      expect(result.nextCursor).toBe('l19');
    });

    it('passes sportType filter to Prisma', async () => {
      prismaMock.marketplaceListing.findMany.mockResolvedValue([]);

      await service.findListings({ sportType: 'futsal' });

      expect(prismaMock.marketplaceListing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sportType: 'futsal', status: 'active' }),
        }),
      );
    });
  });

  // ── createListing ───────────────────────────────────────────────────────────

  describe('createListing', () => {
    it('creates and returns a listing', async () => {
      const listing = mockListing();
      prismaMock.marketplaceListing.create.mockResolvedValue(listing);

      const result = await service.createListing('user-1', {
        title: 'Test Listing',
        description: 'Good item',
        sportType: 'futsal',
        category: 'shoes',
        condition: 'good',
        price: 50000,
        listingType: 'sell',
      });

      expect(result.id).toBe('listing-1');
      expect(result.sellerId).toBe('user-1');
    });
  });

  // ── findListing ─────────────────────────────────────────────────────────────

  describe('findListing', () => {
    it('returns listing and increments viewCount', async () => {
      const listing = mockListing();
      prismaMock.marketplaceListing.findUnique.mockResolvedValue(listing);
      prismaMock.marketplaceListing.update.mockResolvedValue({ ...listing, viewCount: 1 });

      const result = await service.findListing('listing-1');

      expect(result.id).toBe('listing-1');
      expect(prismaMock.marketplaceListing.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'listing-1' },
          data: { viewCount: { increment: 1 } },
        }),
      );
    });

    it('throws NotFoundException when listing does not exist', async () => {
      prismaMock.marketplaceListing.findUnique.mockResolvedValue(null);

      await expect(service.findListing('no-such-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── createOrder ─────────────────────────────────────────────────────────────

  describe('createOrder', () => {
    it('creates an order for an active listing', async () => {
      const listing = mockListing({ price: 50000, status: 'active' });
      const order = {
        id: 'order-1',
        listingId: listing.id,
        buyerId: 'user-2',
        sellerId: 'user-1',
        amount: 50000,
        commission: 7500,
        orderId: 'MK-123',
        status: 'pending',
      };
      prismaMock.marketplaceListing.findUnique.mockResolvedValue(listing);
      prismaMock.marketplaceOrder.create.mockResolvedValue(order);

      const result = await service.createOrder('listing-1', 'user-2');

      expect(result.listingId).toBe('listing-1');
      expect(result.buyerId).toBe('user-2');
      expect(prismaMock.marketplaceOrder.create).toHaveBeenCalled();
    });

    it('throws NotFoundException when listing does not exist', async () => {
      prismaMock.marketplaceListing.findUnique.mockResolvedValue(null);

      await expect(service.createOrder('no-such', 'user-2')).rejects.toThrow(NotFoundException);
    });
  });
});

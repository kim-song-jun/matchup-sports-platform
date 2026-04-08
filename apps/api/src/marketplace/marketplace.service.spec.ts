import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettlementsService } from '../settlements/settlements.service';

const settlementsServiceMock = {
  recordSettlement: jest.fn().mockResolvedValue(undefined),
};

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

const mockOrder = (overrides = {}) => ({
  id: 'order-1',
  listingId: 'listing-1',
  buyerId: 'user-2',
  sellerId: 'user-1',
  amount: 50000,
  commission: 5000,
  orderId: 'MU-MKT-abc123',
  status: 'pending',
  paymentKey: null,
  paidAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  listing: { title: 'Test Listing' },
  seller: { id: 'user-1', nickname: 'seller' },
  buyer: { id: 'user-2' },
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
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const notificationsServiceMock = {
  create: jest.fn(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('MarketplaceService', () => {
  let service: MarketplaceService;

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.TOSS_SECRET_KEY;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketplaceService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
        { provide: SettlementsService, useValue: settlementsServiceMock },
      ],
    }).compile();

    service = module.get<MarketplaceService>(MarketplaceService);
    notificationsServiceMock.create.mockResolvedValue(undefined);
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
    it('creates an order and returns order + payment prepare info', async () => {
      const listing = mockListing({ price: 50000, sellerId: 'user-1' });
      const order = mockOrder();
      prismaMock.marketplaceListing.findUnique.mockResolvedValue(listing);
      prismaMock.marketplaceOrder.create.mockResolvedValue(order);

      const result = await service.createOrder('listing-1', 'user-2');

      expect(result).toHaveProperty('order');
      expect(result).toHaveProperty('payment');
      expect(result.payment).toHaveProperty('orderId');
      expect(result.payment).toHaveProperty('amount');
      expect(prismaMock.marketplaceOrder.create).toHaveBeenCalled();
    });

    it('commission is calculated at 10% of listing price', async () => {
      const listing = mockListing({ price: 50000, sellerId: 'seller-1' });
      prismaMock.marketplaceListing.findUnique.mockResolvedValue(listing);
      prismaMock.marketplaceOrder.create.mockResolvedValue(mockOrder());

      await service.createOrder('listing-1', 'buyer-1');

      expect(prismaMock.marketplaceOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ commission: 5000 }),
        }),
      );
    });

    it('orderId uses MU-MKT- prefix', async () => {
      const listing = mockListing({ sellerId: 'seller-1' });
      prismaMock.marketplaceListing.findUnique.mockResolvedValue(listing);
      prismaMock.marketplaceOrder.create.mockResolvedValue(mockOrder());

      await service.createOrder('listing-1', 'buyer-1');

      expect(prismaMock.marketplaceOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: expect.stringMatching(/^MU-MKT-/),
          }),
        }),
      );
    });

    it('throws BadRequestException when buyer is the seller', async () => {
      const listing = mockListing({ sellerId: 'user-1' });
      prismaMock.marketplaceListing.findUnique.mockResolvedValue(listing);

      await expect(service.createOrder('listing-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when listing does not exist', async () => {
      prismaMock.marketplaceListing.findUnique.mockResolvedValue(null);

      await expect(service.createOrder('no-such', 'user-2')).rejects.toThrow(NotFoundException);
    });
  });

  // ── confirmOrderPayment ────────────────────────────────────────────────────

  describe('confirmOrderPayment (mock Toss mode)', () => {
    it('updates order to paid status and notifies seller', async () => {
      const order = mockOrder({ status: 'pending' });
      const updated = mockOrder({ status: 'paid', paymentKey: 'pk-mock', paidAt: new Date() });
      prismaMock.marketplaceOrder.findUnique.mockResolvedValue(order);
      prismaMock.marketplaceOrder.update.mockResolvedValue(updated);

      const result = await service.confirmOrderPayment('MU-MKT-abc123', 'pk-mock', 'user-2');

      expect(result.status).toBe('paid');
      expect(prismaMock.marketplaceOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'paid', paymentKey: 'pk-mock' }),
        }),
      );
      expect(notificationsServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: 'marketplace_order',
        }),
      );
    });

    it('throws NotFoundException when order does not exist', async () => {
      prismaMock.marketplaceOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.confirmOrderPayment('no-such', 'pk-mock', 'user-2'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user is not the buyer', async () => {
      prismaMock.marketplaceOrder.findUnique.mockResolvedValue(mockOrder({ buyerId: 'user-2' }));

      await expect(
        service.confirmOrderPayment('MU-MKT-abc123', 'pk-mock', 'wrong-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when order is already processed', async () => {
      prismaMock.marketplaceOrder.findUnique.mockResolvedValue(mockOrder({ status: 'paid' }));

      await expect(
        service.confirmOrderPayment('MU-MKT-abc123', 'pk-mock', 'user-2'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

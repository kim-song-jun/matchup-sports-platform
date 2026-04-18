import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettlementsService } from '../settlements/settlements.service';
import { TeamMembershipService } from '../teams/team-membership.service';
import { OrderStatus } from '@prisma/client';

const settlementsServiceMock = {
  recordSettlement: jest.fn().mockResolvedValue(undefined),
  recordMarketplaceSettlement: jest.fn().mockResolvedValue(undefined),
  releaseSettlement: jest.fn().mockResolvedValue(undefined),
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

const mockOrder = (overrides: Record<string, unknown> = {}) => ({
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
  shippedAt: null,
  deliveredAt: null,
  confirmedReceiptAt: null,
  releasedAt: null,
  autoReleaseAt: null,
  completedAt: null,
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
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  dispute: {
    findUnique: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
  },
  venue: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const notificationsServiceMock = {
  create: jest.fn(),
};

const teamMembershipServiceMock = {
  assertRole: jest.fn(),
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
        { provide: TeamMembershipService, useValue: teamMembershipServiceMock },
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

      const result = await service.createListing('user-1', 'user', {
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

    it('throws NotFoundException when listing was deleted', async () => {
      prismaMock.marketplaceListing.findUnique.mockResolvedValue(mockListing({ status: 'deleted' }));

      await expect(service.findListing('listing-1')).rejects.toThrow(NotFoundException);
      expect(prismaMock.marketplaceListing.update).not.toHaveBeenCalled();
    });
  });

  // ── updateListing ───────────────────────────────────────────────────────────

  describe('updateListing', () => {
    it('updates listing when seller owns it', async () => {
      const listing = mockListing({ sellerId: 'user-1' });
      const updated = mockListing({ id: 'listing-1', title: 'Updated', imageUrls: ['uploads/a.webp'] });
      prismaMock.marketplaceListing.findUnique.mockResolvedValue(listing);
      prismaMock.marketplaceListing.update.mockResolvedValue(updated);

      const result = await service.updateListing('listing-1', 'user-1', 'user', {
        title: 'Updated',
        imageUrls: ['uploads/a.webp'],
        status: 'reserved',
      });

      expect(result.title).toBe('Updated');
    });

    it('throws NotFoundException when listing does not exist', async () => {
      prismaMock.marketplaceListing.findUnique.mockResolvedValue(null);

      await expect(
        service.updateListing('missing', 'user-1', 'user', { title: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when non-owner updates listing', async () => {
      prismaMock.marketplaceListing.findUnique.mockResolvedValue(mockListing({ sellerId: 'owner-1' }));

      await expect(
        service.updateListing('listing-1', 'user-1', 'user', { title: 'Updated' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects deleted status via patch', async () => {
      prismaMock.marketplaceListing.findUnique.mockResolvedValue(mockListing({ sellerId: 'user-1' }));

      await expect(
        service.updateListing('listing-1', 'user-1', 'user', { status: 'deleted' }),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.marketplaceListing.update).not.toHaveBeenCalled();
    });
  });

  // ── deleteListing ───────────────────────────────────────────────────────────

  describe('deleteListing', () => {
    it('soft-deletes listing for owner', async () => {
      prismaMock.marketplaceListing.findUnique.mockResolvedValue(mockListing({ sellerId: 'user-1' }));
      prismaMock.marketplaceListing.update.mockResolvedValue(mockListing({ status: 'deleted' }));

      const result = await service.deleteListing('listing-1', 'user-1');

      expect(result).toEqual({ deleted: true });
      expect(prismaMock.marketplaceListing.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'listing-1' },
          data: expect.objectContaining({ status: 'deleted' }),
        }),
      );
    });

    it('throws ForbiddenException when non-owner deletes listing', async () => {
      prismaMock.marketplaceListing.findUnique.mockResolvedValue(mockListing({ sellerId: 'owner-1' }));

      await expect(
        service.deleteListing('listing-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
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

  // ── confirmOrderPayment ─────────────────────────────────────────────────────

  describe('confirmOrderPayment (mock Toss mode)', () => {
    it('transitions order to escrow_held and sets autoReleaseAt', async () => {
      const order = mockOrder({ status: 'pending' });
      const updated = mockOrder({
        status: OrderStatus.escrow_held,
        paymentKey: 'pk-mock',
        paidAt: new Date(),
      });
      prismaMock.marketplaceOrder.findUnique.mockResolvedValue(order);
      prismaMock.marketplaceOrder.update.mockResolvedValue(updated);

      const result = await service.confirmOrderPayment('MU-MKT-abc123', 'pk-mock', 'user-2');

      expect(result.status).toBe(OrderStatus.escrow_held);
      expect(prismaMock.marketplaceOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: OrderStatus.escrow_held,
            paymentKey: 'pk-mock',
            autoReleaseAt: expect.any(Date),
          }),
        }),
      );
    });

    it('fires marketplace settlement in held status (fire-and-forget)', async () => {
      const order = mockOrder({ status: 'pending' });
      prismaMock.marketplaceOrder.findUnique.mockResolvedValue(order);
      prismaMock.marketplaceOrder.update.mockResolvedValue(mockOrder({ status: OrderStatus.escrow_held }));

      await service.confirmOrderPayment('MU-MKT-abc123', 'pk-mock', 'user-2');

      // Give fire-and-forget a tick to execute
      await new Promise((r) => setImmediate(r));
      expect(settlementsServiceMock.recordMarketplaceSettlement).toHaveBeenCalledWith(
        order.id,
        order.orderId,
        order.sellerId,
        order.amount,
      );
    });

    it('notifies seller on payment confirmation', async () => {
      const order = mockOrder({ status: 'pending' });
      prismaMock.marketplaceOrder.findUnique.mockResolvedValue(order);
      prismaMock.marketplaceOrder.update.mockResolvedValue(mockOrder({ status: OrderStatus.escrow_held }));

      await service.confirmOrderPayment('MU-MKT-abc123', 'pk-mock', 'user-2');

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
      prismaMock.marketplaceOrder.findUnique.mockResolvedValue(
        mockOrder({ status: OrderStatus.escrow_held }),
      );

      await expect(
        service.confirmOrderPayment('MU-MKT-abc123', 'pk-mock', 'user-2'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── shipOrder ───────────────────────────────────────────────────────────────

  describe('shipOrder', () => {
    it('transitions order to shipped and notifies buyer', async () => {
      const order = mockOrder({ status: OrderStatus.escrow_held, sellerId: 'seller-1' });
      prismaMock.marketplaceOrder.findUnique.mockResolvedValue(order);
      prismaMock.marketplaceOrder.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.marketplaceOrder.findUniqueOrThrow.mockResolvedValue(
        mockOrder({ status: OrderStatus.shipped }),
      );

      const result = await service.shipOrder('order-1', 'seller-1');

      expect(result.status).toBe(OrderStatus.shipped);
      expect(prismaMock.marketplaceOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'order-1', status: OrderStatus.escrow_held }),
          data: expect.objectContaining({ status: OrderStatus.shipped }),
        }),
      );
      expect(notificationsServiceMock.create).toHaveBeenCalled();
    });

    it('throws ForbiddenException when non-seller ships order', async () => {
      prismaMock.marketplaceOrder.findUnique.mockResolvedValue(
        mockOrder({ status: OrderStatus.escrow_held, sellerId: 'seller-1' }),
      );

      await expect(service.shipOrder('order-1', 'other-user')).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when order is not in escrow_held state', async () => {
      prismaMock.marketplaceOrder.findUnique.mockResolvedValue(
        mockOrder({ status: OrderStatus.shipped, sellerId: 'seller-1' }),
      );
      prismaMock.marketplaceOrder.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.shipOrder('order-1', 'seller-1')).rejects.toThrow(ConflictException);
    });
  });

  // ── confirmReceipt ──────────────────────────────────────────────────────────

  describe('confirmReceipt', () => {
    it('transitions order to completed and releases settlement', async () => {
      const order = mockOrder({ status: OrderStatus.delivered, buyerId: 'buyer-1' });
      prismaMock.marketplaceOrder.findUnique.mockResolvedValue(order);
      prismaMock.marketplaceOrder.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.marketplaceOrder.findUniqueOrThrow.mockResolvedValue(
        mockOrder({ status: OrderStatus.completed }),
      );

      const result = await service.confirmReceipt('order-1', 'buyer-1');

      expect(result.status).toBe(OrderStatus.completed);
      expect(notificationsServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'marketplace_order_completed' }),
      );
    });

    it('throws ForbiddenException when non-buyer confirms receipt', async () => {
      prismaMock.marketplaceOrder.findUnique.mockResolvedValue(
        mockOrder({ status: OrderStatus.delivered, buyerId: 'buyer-1' }),
      );

      await expect(service.confirmReceipt('order-1', 'imposter')).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when order is not in shipped/delivered state', async () => {
      prismaMock.marketplaceOrder.findUnique.mockResolvedValue(
        mockOrder({ status: OrderStatus.escrow_held, buyerId: 'buyer-1' }),
      );
      prismaMock.marketplaceOrder.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.confirmReceipt('order-1', 'buyer-1')).rejects.toThrow(ConflictException);
    });
  });

  // ── autoRelease ─────────────────────────────────────────────────────────────

  describe('autoRelease', () => {
    it('transitions order to auto_released and releases settlement', async () => {
      const order = mockOrder({ status: OrderStatus.delivered });
      prismaMock.marketplaceOrder.findUnique.mockResolvedValue(order);
      prismaMock.marketplaceOrder.updateMany.mockResolvedValue({ count: 1 });

      await service.autoRelease('order-1');

      expect(prismaMock.marketplaceOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: OrderStatus.auto_released }),
        }),
      );
    });

    it('logs warning and returns when order is not in releasable state', async () => {
      const order = mockOrder({ status: OrderStatus.completed });
      prismaMock.marketplaceOrder.findUnique.mockResolvedValue(order);
      prismaMock.marketplaceOrder.updateMany.mockResolvedValue({ count: 0 });

      // Should not throw — just log warning
      await expect(service.autoRelease('order-1')).resolves.toBeUndefined();
    });

    it('throws NotFoundException when order does not exist', async () => {
      prismaMock.marketplaceOrder.findUnique.mockResolvedValue(null);

      await expect(service.autoRelease('no-order')).rejects.toThrow(NotFoundException);
    });
  });

  // ── fileDispute ─────────────────────────────────────────────────────────────

  describe('fileDispute', () => {
    it('creates dispute and freezes order in disputed state', async () => {
      const order = mockOrder({ status: OrderStatus.escrow_held, buyerId: 'buyer-1' });
      prismaMock.marketplaceOrder.findUnique.mockResolvedValue(order);
      prismaMock.dispute.count.mockResolvedValue(0);
      prismaMock.dispute.findUnique.mockResolvedValue(null);
      prismaMock.$transaction.mockImplementationOnce(async (cb: (tx: unknown) => unknown) => {
        return cb({
          marketplaceOrder: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          dispute: {
            create: jest.fn().mockResolvedValue({
              id: 'dispute-1',
              status: 'filed',
              buyerId: 'buyer-1',
              buyer: {},
              seller: {},
              messages: [],
            }),
          },
        });
      });

      const result = await service.fileDispute('order-1', 'buyer-1', {
        type: 'not_as_described',
        description: 'The item was completely different from the listing.',
      });

      expect(result.status).toBe('filed');
    });

    it('throws ForbiddenException when non-buyer files dispute', async () => {
      prismaMock.marketplaceOrder.findUnique.mockResolvedValue(
        mockOrder({ status: OrderStatus.escrow_held, buyerId: 'buyer-1' }),
      );

      await expect(
        service.fileDispute('order-1', 'imposter', { type: 'other', description: 'x'.repeat(10) }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws 429 HttpException when rate limit exceeded', async () => {
      prismaMock.marketplaceOrder.findUnique.mockResolvedValue(
        mockOrder({ status: OrderStatus.escrow_held, buyerId: 'buyer-1' }),
      );
      prismaMock.dispute.count.mockResolvedValue(3);

      await expect(
        service.fileDispute('order-1', 'buyer-1', { type: 'other', description: 'x'.repeat(10) }),
      ).rejects.toThrow(
        expect.objectContaining({ status: HttpStatus.TOO_MANY_REQUESTS }),
      );
    });

    it('throws ConflictException when dispute already exists for this order', async () => {
      prismaMock.marketplaceOrder.findUnique.mockResolvedValue(
        mockOrder({ status: OrderStatus.escrow_held, buyerId: 'buyer-1' }),
      );
      prismaMock.dispute.count.mockResolvedValue(0);
      prismaMock.dispute.findUnique.mockResolvedValue({ id: 'existing-dispute' });

      await expect(
        service.fileDispute('order-1', 'buyer-1', { type: 'other', description: 'x'.repeat(10) }),
      ).rejects.toThrow(ConflictException);
    });
  });
});

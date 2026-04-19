import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';
import { FileDisputeDto } from './dto/file-dispute.dto';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockService = {
  findListings: jest.fn(),
  createListing: jest.fn(),
  findListing: jest.fn(),
  updateListing: jest.fn(),
  deleteListing: jest.fn(),
  createOrder: jest.fn(),
  confirmOrderPayment: jest.fn(),
  // Wave 1 service methods (added by backend-data-dev)
  shipOrder: jest.fn(),
  deliverOrder: jest.fn(),
  confirmReceipt: jest.fn(),
  fileDispute: jest.fn(),
  // Wave B service methods (added by backend-api-dev)
  listMyOrders: jest.fn(),
  getOrderForUser: jest.fn(),
};

const userId = 'user-buyer-001';
const orderId = 'order-001';

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('MarketplaceController', () => {
  let controller: MarketplaceController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MarketplaceController],
      providers: [{ provide: MarketplaceService, useValue: mockService }],
    }).compile();

    controller = module.get<MarketplaceController>(MarketplaceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── ship ────────────────────────────────────────────────────────────────────

  describe('shipOrder', () => {
    it('delegates to service.shipOrder with orderId and sellerId', async () => {
      const sellerId = 'user-seller-001';
      const expected = { id: orderId, status: 'shipped' };
      mockService.shipOrder.mockResolvedValue(expected);

      const result = await (controller as any).shipOrder(orderId, sellerId);

      expect(mockService.shipOrder).toHaveBeenCalledWith(orderId, sellerId);
      expect(result).toEqual(expected);
    });
  });

  // ── deliver ──────────────────────────────────────────────────────────────────

  describe('deliverOrder', () => {
    it('delegates to service.deliverOrder with orderId and sellerId', async () => {
      const sellerId = 'user-seller-001';
      const expected = { id: orderId, status: 'delivered' };
      mockService.deliverOrder.mockResolvedValue(expected);

      const result = await (controller as any).deliverOrder(orderId, sellerId);

      expect(mockService.deliverOrder).toHaveBeenCalledWith(orderId, sellerId);
      expect(result).toEqual(expected);
    });
  });

  // ── confirm-receipt ─────────────────────────────────────────────────────────

  describe('confirmReceipt', () => {
    it('delegates to service.confirmReceipt with orderId and buyerId', async () => {
      const expected = { id: orderId, status: 'completed' };
      mockService.confirmReceipt.mockResolvedValue(expected);

      const result = await (controller as any).confirmReceipt(orderId, userId);

      expect(mockService.confirmReceipt).toHaveBeenCalledWith(orderId, userId);
      expect(result).toEqual(expected);
    });
  });

  // ── dispute ─────────────────────────────────────────────────────────────────

  describe('fileDispute', () => {
    it('delegates to service.fileDispute with orderId, buyerId, and body', async () => {
      const body: FileDisputeDto = {
        type: 'not_delivered',
        description: '물건이 배송되지 않았습니다. 일주일이 지났습니다.',
        attachmentUrls: ['https://example.com/receipt.jpg'],
      };
      const expected = { id: 'dispute-001', status: 'filed' };
      mockService.fileDispute.mockResolvedValue(expected);

      const result = await (controller as any).fileDispute(orderId, body, userId);

      expect(mockService.fileDispute).toHaveBeenCalledWith(orderId, userId, body);
      expect(result).toEqual(expected);
    });

    it('passes body without optional attachmentUrls', async () => {
      const body: FileDisputeDto = {
        type: 'damaged',
        description: '배송된 상품이 파손되어 있습니다. 박스 자체가 찌그러져 있었습니다.',
      };
      mockService.fileDispute.mockResolvedValue({ id: 'dispute-002', status: 'filed' });

      await (controller as any).fileDispute(orderId, body, userId);

      expect(mockService.fileDispute).toHaveBeenCalledWith(orderId, userId, body);
    });
  });

  // ── listMyOrders ─────────────────────────────────────────────────────────────

  describe('listMyOrders', () => {
    it('delegates to service.listMyOrders with default buyer role and no pagination', async () => {
      const expected = { items: [{ id: orderId, status: 'escrow_held' }], nextCursor: null };
      mockService.listMyOrders.mockResolvedValue(expected);

      const result = await (controller as any).listMyOrders(userId, undefined, undefined, undefined);

      expect(mockService.listMyOrders).toHaveBeenCalledWith(userId, 'buyer', undefined, undefined);
      expect(result).toEqual(expected);
    });

    it('passes role=seller when explicitly provided', async () => {
      const expected = { items: [], nextCursor: null };
      mockService.listMyOrders.mockResolvedValue(expected);

      await (controller as any).listMyOrders(userId, 'seller', undefined, undefined);

      expect(mockService.listMyOrders).toHaveBeenCalledWith(userId, 'seller', undefined, undefined);
    });

    it('coerces invalid role to buyer', async () => {
      mockService.listMyOrders.mockResolvedValue({ items: [], nextCursor: null });

      await (controller as any).listMyOrders(userId, 'admin', undefined, undefined);

      expect(mockService.listMyOrders).toHaveBeenCalledWith(userId, 'buyer', undefined, undefined);
    });

    it('parses and clamps limit', async () => {
      mockService.listMyOrders.mockResolvedValue({ items: [], nextCursor: null });

      await (controller as any).listMyOrders(userId, undefined, undefined, '999');

      expect(mockService.listMyOrders).toHaveBeenCalledWith(userId, 'buyer', undefined, 100);
    });

    it('passes cursor through when provided', async () => {
      const cursor = 'cursor-abc';
      const expected = { items: [], nextCursor: null };
      mockService.listMyOrders.mockResolvedValue(expected);

      await (controller as any).listMyOrders(userId, undefined, cursor, '20');

      expect(mockService.listMyOrders).toHaveBeenCalledWith(userId, 'buyer', cursor, 20);
    });
  });

  // ── getOrder ─────────────────────────────────────────────────────────────────

  describe('getOrder', () => {
    it('delegates to service.getOrderForUser with id and userId', async () => {
      const expected = { id: orderId, status: 'escrow_held', buyerId: userId };
      mockService.getOrderForUser.mockResolvedValue(expected);

      const result = await (controller as any).getOrder(orderId, userId);

      expect(mockService.getOrderForUser).toHaveBeenCalledWith(orderId, userId);
      expect(result).toEqual(expected);
    });

    it('propagates ForbiddenException when service throws 403', async () => {
      mockService.getOrderForUser.mockRejectedValue(
        new ForbiddenException('이 주문에 접근할 권한이 없습니다.'),
      );

      await expect((controller as any).getOrder(orderId, 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('propagates NotFoundException when service throws 404', async () => {
      mockService.getOrderForUser.mockRejectedValue(
        new NotFoundException('주문을 찾을 수 없습니다.'),
      );

      await expect((controller as any).getOrder('non-existent', userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

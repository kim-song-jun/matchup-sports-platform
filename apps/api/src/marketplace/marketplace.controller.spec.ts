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
});

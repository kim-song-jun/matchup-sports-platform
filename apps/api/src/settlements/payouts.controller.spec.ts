import { Test, TestingModule } from '@nestjs/testing';
import { PayoutsController } from './payouts.controller';
import { SettlementsService } from './settlements.service';
import { CreatePayoutBatchDto } from './dto/create-payout-batch.dto';
import { MarkPayoutPaidDto } from './dto/mark-payout-paid.dto';
import { MarkPayoutFailedDto } from './dto/mark-payout-failed.dto';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockService = {
  findAllPayouts: jest.fn(),
  listReleasedSettlements: jest.fn(),
  createPayoutBatch: jest.fn(),
  markPayoutPaid: jest.fn(),
  markPayoutFailed: jest.fn(),
};

const adminId = 'admin-001';
const payoutId = 'payout-001';

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('PayoutsController', () => {
  let controller: PayoutsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PayoutsController],
      providers: [{ provide: SettlementsService, useValue: mockService }],
    }).compile();

    controller = module.get<PayoutsController>(PayoutsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('delegates with parsed and clamped limit', () => {
      const expected = { items: [], nextCursor: null };
      mockService.findAllPayouts.mockReturnValue(expected);

      const result = controller.findAll('pending', undefined, '50');

      expect(mockService.findAllPayouts).toHaveBeenCalledWith({
        status: 'pending',
        cursor: undefined,
        limit: 50,
      });
      expect(result).toEqual(expected);
    });

    it('clamps limit to 100 maximum', () => {
      mockService.findAllPayouts.mockReturnValue({ items: [], nextCursor: null });

      controller.findAll(undefined, undefined, '999');

      expect(mockService.findAllPayouts).toHaveBeenCalledWith({
        status: undefined,
        cursor: undefined,
        limit: 100,
      });
    });
  });

  // ── findEligible ─────────────────────────────────────────────────────────────

  describe('findEligible', () => {
    it('delegates to service.listReleasedSettlements', () => {
      const expected = { items: [], total: 0, nextCursor: null };
      mockService.listReleasedSettlements.mockReturnValue(expected);

      const result = controller.findEligible(undefined, '20');

      expect(mockService.listReleasedSettlements).toHaveBeenCalledWith({
        cursor: undefined,
        limit: 20,
      });
      expect(result).toEqual(expected);
    });
  });

  // ── createBatch ──────────────────────────────────────────────────────────────

  describe('createBatch', () => {
    it('delegates explicit settlementIds to service.createPayoutBatch', () => {
      const ids = ['settlement-001', 'settlement-002'];
      const body: CreatePayoutBatchDto = { settlementIds: ids };
      const expected = [{ id: payoutId, amount: 50000, status: 'pending' }];
      mockService.createPayoutBatch.mockReturnValue(expected);

      const result = controller.createBatch(body, adminId);

      expect(mockService.createPayoutBatch).toHaveBeenCalledWith(ids);
      expect(result).toEqual(expected);
    });

    it('passes empty array when settlementIds is absent', () => {
      const body: CreatePayoutBatchDto = {};
      mockService.createPayoutBatch.mockReturnValue([]);

      controller.createBatch(body, adminId);

      expect(mockService.createPayoutBatch).toHaveBeenCalledWith([]);
    });
  });

  // ── markPaid ─────────────────────────────────────────────────────────────────

  describe('markPaid', () => {
    it('delegates to service.markPayoutPaid with id and note', () => {
      const body: MarkPayoutPaidDto = { note: 'KB ref#9912' };
      const expected = { id: payoutId, status: 'paid' };
      mockService.markPayoutPaid.mockReturnValue(expected);

      const result = controller.markPaid(payoutId, body, adminId);

      expect(mockService.markPayoutPaid).toHaveBeenCalledWith(payoutId, 'KB ref#9912');
      expect(result).toEqual(expected);
    });

    it('passes undefined note when body.note is absent', () => {
      const body: MarkPayoutPaidDto = {};
      mockService.markPayoutPaid.mockReturnValue({ id: payoutId, status: 'paid' });

      controller.markPaid(payoutId, body, adminId);

      expect(mockService.markPayoutPaid).toHaveBeenCalledWith(payoutId, undefined);
    });
  });

  // ── markFailed ────────────────────────────────────────────────────────────────

  describe('markFailed', () => {
    it('delegates to service.markPayoutFailed with id, reason and note', () => {
      const body: MarkPayoutFailedDto = { reason: '계좌번호 오류', note: '재시도 예정' };
      mockService.markPayoutFailed.mockReturnValue({ id: payoutId, status: 'failed' });

      controller.markFailed(payoutId, body, adminId);

      expect(mockService.markPayoutFailed).toHaveBeenCalledWith(payoutId, '계좌번호 오류', '재시도 예정');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { DisputesAdminController } from './disputes-admin.controller';
import { DisputesService } from './disputes.service';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockService = {
  findAllAdmin: jest.fn(),
  findOneAdmin: jest.fn(),
  startReview: jest.fn(),
  resolve: jest.fn(),
};

const adminId = 'admin-001';
const disputeId = 'dispute-001';

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('DisputesAdminController', () => {
  let controller: DisputesAdminController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DisputesAdminController],
      providers: [{ provide: DisputesService, useValue: mockService }],
    }).compile();

    controller = module.get<DisputesAdminController>(DisputesAdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('delegates with parsed and clamped limit', () => {
      const expected = { items: [], nextCursor: null };
      mockService.findAllAdmin.mockReturnValue(expected);

      const result = controller.findAll('filed', 'not_delivered', undefined, '200');

      expect(mockService.findAllAdmin).toHaveBeenCalledWith({
        status: 'filed',
        type: 'not_delivered',
        cursor: undefined,
        limit: 100,
      });
      expect(result).toEqual(expected);
    });

    it('passes undefined limit when limit query absent', () => {
      mockService.findAllAdmin.mockReturnValue({ items: [], nextCursor: null });

      controller.findAll();

      expect(mockService.findAllAdmin).toHaveBeenCalledWith({
        status: undefined,
        type: undefined,
        cursor: undefined,
        limit: undefined,
      });
    });
  });

  // ── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('delegates to service.findOneAdmin', () => {
      const expected = { id: disputeId };
      mockService.findOneAdmin.mockReturnValue(expected);

      const result = controller.findOne(disputeId);

      expect(mockService.findOneAdmin).toHaveBeenCalledWith(disputeId);
      expect(result).toEqual(expected);
    });
  });

  // ── startReview ──────────────────────────────────────────────────────────────

  describe('startReview', () => {
    it('delegates to service.startReview with id and adminId', () => {
      const expected = { id: disputeId, status: 'admin_reviewing' };
      mockService.startReview.mockReturnValue(expected);

      const result = controller.startReview(disputeId, adminId);

      expect(mockService.startReview).toHaveBeenCalledWith(disputeId, adminId);
      expect(result).toEqual(expected);
    });
  });

  // ── resolve ──────────────────────────────────────────────────────────────────

  describe('resolve', () => {
    it('delegates refund action to service.resolve', () => {
      const body: ResolveDisputeDto = { action: 'refund', note: '구매자 주장 인정' };
      const expected = { id: disputeId, status: 'resolved_refund' };
      mockService.resolve.mockReturnValue(expected);

      const result = controller.resolve(disputeId, body, adminId);

      expect(mockService.resolve).toHaveBeenCalledWith(disputeId, adminId, body);
      expect(result).toEqual(expected);
    });

    it('delegates release action to service.resolve', () => {
      const body: ResolveDisputeDto = { action: 'release', note: '판매자 귀책 없음' };
      const expected = { id: disputeId, status: 'resolved_release' };
      mockService.resolve.mockReturnValue(expected);

      const result = controller.resolve(disputeId, body, adminId);

      expect(mockService.resolve).toHaveBeenCalledWith(disputeId, adminId, body);
      expect(result).toEqual(expected);
    });

    it('delegates dismiss action to service.resolve', () => {
      const body: ResolveDisputeDto = { action: 'dismiss', note: '근거 불충분' };
      const expected = { id: disputeId, status: 'dismissed' };
      mockService.resolve.mockReturnValue(expected);

      const result = controller.resolve(disputeId, body, adminId);

      expect(mockService.resolve).toHaveBeenCalledWith(disputeId, adminId, body);
      expect(result).toEqual(expected);
    });
  });
});

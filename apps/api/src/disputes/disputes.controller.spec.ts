import { Test, TestingModule } from '@nestjs/testing';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';
import { RespondDisputeDto } from './dto/respond-dispute.dto';
import { DisputeMessageDto } from './dto/dispute-message.dto';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockService = {
  findMine: jest.fn(),
  findOneAsParticipant: jest.fn(),
  respond: jest.fn(),
  postMessage: jest.fn(),
  withdraw: jest.fn(),
};

const userId = 'user-001';
const disputeId = 'dispute-001';

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('DisputesController (user-facing)', () => {
  let controller: DisputesController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DisputesController],
      providers: [{ provide: DisputesService, useValue: mockService }],
    }).compile();

    controller = module.get<DisputesController>(DisputesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── findMine ────────────────────────────────────────────────────────────────

  describe('findMine', () => {
    it('delegates to service.findMine with userId and parsed limit', () => {
      const expected = { data: [], nextCursor: null };
      mockService.findMine.mockReturnValue(expected);

      const result = controller.findMine(userId, undefined, undefined, undefined, '10');

      expect(mockService.findMine).toHaveBeenCalledWith(userId, {
        role: undefined,
        status: undefined,
        cursor: undefined,
        limit: 10,
      });
      expect(result).toEqual(expected);
    });

    it('clamps limit to 50 maximum', () => {
      mockService.findMine.mockReturnValue({ data: [], nextCursor: null });

      controller.findMine(userId, undefined, undefined, undefined, '999');

      expect(mockService.findMine).toHaveBeenCalledWith(userId, {
        role: undefined,
        status: undefined,
        cursor: undefined,
        limit: 50,
      });
    });

    it('passes undefined limit when limit query is absent', () => {
      mockService.findMine.mockReturnValue({ data: [], nextCursor: null });

      controller.findMine(userId);

      expect(mockService.findMine).toHaveBeenCalledWith(userId, {
        role: undefined,
        status: undefined,
        cursor: undefined,
        limit: undefined,
      });
    });

    it('passes role=buyer to service when role query is buyer', () => {
      mockService.findMine.mockReturnValue({ data: [], nextCursor: null });

      controller.findMine(userId, 'buyer', undefined, undefined, undefined);

      expect(mockService.findMine).toHaveBeenCalledWith(userId, {
        role: 'buyer',
        status: undefined,
        cursor: undefined,
        limit: undefined,
      });
    });

    it('passes role=seller to service when role query is seller', () => {
      mockService.findMine.mockReturnValue({ data: [], nextCursor: null });

      controller.findMine(userId, 'seller', undefined, undefined, undefined);

      expect(mockService.findMine).toHaveBeenCalledWith(userId, {
        role: 'seller',
        status: undefined,
        cursor: undefined,
        limit: undefined,
      });
    });

    it('sanitizes invalid role values to undefined', () => {
      mockService.findMine.mockReturnValue({ data: [], nextCursor: null });

      controller.findMine(userId, 'admin', undefined, undefined, undefined);

      expect(mockService.findMine).toHaveBeenCalledWith(userId, {
        role: undefined,
        status: undefined,
        cursor: undefined,
        limit: undefined,
      });
    });
  });

  // ── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('delegates to service.findOneAsParticipant with id and userId', () => {
      const expected = { id: disputeId, status: 'filed' };
      mockService.findOneAsParticipant.mockReturnValue(expected);

      const result = controller.findOne(disputeId, userId);

      expect(mockService.findOneAsParticipant).toHaveBeenCalledWith(disputeId, userId);
      expect(result).toEqual(expected);
    });
  });

  // ── respond ─────────────────────────────────────────────────────────────────

  describe('respond', () => {
    it('delegates to service.respond with id, sellerId, and body', () => {
      const body: RespondDisputeDto = {
        response: '해당 상품은 정상 포장 후 발송하였으며 배송 사진을 첨부합니다.',
      };
      const expected = { id: disputeId, status: 'seller_responded' };
      mockService.respond.mockReturnValue(expected);

      const result = controller.respond(disputeId, body, userId);

      expect(mockService.respond).toHaveBeenCalledWith(disputeId, userId, body);
      expect(result).toEqual(expected);
    });
  });

  // ── postMessage ─────────────────────────────────────────────────────────────

  describe('postMessage', () => {
    it('delegates to service.postMessage with id, userId, and body', () => {
      const body: DisputeMessageDto = { body: '추가 증빙을 제출합니다.' };
      const expected = { id: 'msg-001', body: body.body };
      mockService.postMessage.mockReturnValue(expected);

      const result = controller.postMessage(disputeId, body, userId);

      expect(mockService.postMessage).toHaveBeenCalledWith(disputeId, userId, body);
      expect(result).toEqual(expected);
    });
  });

  // ── withdraw ─────────────────────────────────────────────────────────────────

  describe('withdraw', () => {
    it('delegates to service.withdraw with id and buyerId', () => {
      const expected = { id: disputeId, status: 'dismissed' };
      mockService.withdraw.mockReturnValue(expected);

      const result = controller.withdraw(disputeId, userId);

      expect(mockService.withdraw).toHaveBeenCalledWith(disputeId, userId);
      expect(result).toEqual(expected);
    });
  });
});

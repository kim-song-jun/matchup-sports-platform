import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DisputesService } from './disputes.service';
import { DisputeActorRole, DisputeStatus, OrderStatus } from '@prisma/client';
import { buildDispute, buildDisputeMessage } from '../../test/fixtures/marketplace';

const mockPrisma = {
  dispute: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  disputeMessage: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  marketplaceOrder: {
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  settlementRecord: {
    updateMany: jest.fn(),
    findFirst: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockNotificationsService = {
  create: jest.fn().mockResolvedValue(null),
};

const mockPaymentsService = {
  cancelByPaymentKey: jest.fn().mockResolvedValue(undefined),
};

describe('DisputesService', () => {
  let service: DisputesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisputesService,
        { provide: 'PrismaService', useValue: mockPrisma },
        { provide: 'NotificationsService', useValue: mockNotificationsService },
        { provide: 'PaymentsService', useValue: mockPaymentsService },
      ],
    })
      .overrideProvider(DisputesService)
      .useFactory({
        factory: () => {
          const svc = new DisputesService(
            mockPrisma as any,
            mockNotificationsService as any,
            mockPaymentsService as any,
          );
          return svc;
        },
      })
      .compile();

    service = module.get<DisputesService>(DisputesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── listMyDisputes ───────────────────────────────────────────────────────────

  describe('listMyDisputes', () => {
    it('returns paginated disputes for the requesting user', async () => {
      const disputes = [buildDispute({ buyerId: 'u1' })];
      mockPrisma.$transaction.mockResolvedValueOnce([disputes, 1]);

      const result = await service.listMyDisputes('u1', {});

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.nextCursor).toBeNull();
    });

    it('returns nextCursor when there are more results', async () => {
      const disputes = Array.from({ length: 21 }, (_, i) =>
        buildDispute({ buyerId: 'u1', id: `d-${i}` }),
      );
      mockPrisma.$transaction.mockResolvedValueOnce([disputes, 25]);

      const result = await service.listMyDisputes('u1', { limit: 20 });

      expect(result.items).toHaveLength(20);
      expect(result.nextCursor).toBe('d-19');
    });
  });

  // ── getDispute ───────────────────────────────────────────────────────────────

  describe('getDispute', () => {
    it('returns dispute when requester is buyer', async () => {
      const dispute = buildDispute({ buyerId: 'buyer1', sellerId: 'seller1' });
      mockPrisma.dispute.findUnique.mockResolvedValueOnce({
        ...dispute,
        buyer: { id: 'buyer1', nickname: 'Buyer' },
        seller: { id: 'seller1', nickname: 'Seller' },
        messages: [],
        order: null,
      });

      const result = await service.getDispute(dispute.id, 'buyer1', false);

      expect(result.id).toBe(dispute.id);
    });

    it('throws ForbiddenException when requester is not a party', async () => {
      const dispute = buildDispute({ buyerId: 'buyer1', sellerId: 'seller1' });
      mockPrisma.dispute.findUnique.mockResolvedValueOnce({
        ...dispute,
        buyer: {},
        seller: {},
        messages: [],
        order: null,
      });

      await expect(service.getDispute(dispute.id, 'stranger', false)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows admin access regardless of party', async () => {
      const dispute = buildDispute({ buyerId: 'buyer1', sellerId: 'seller1' });
      mockPrisma.dispute.findUnique.mockResolvedValueOnce({
        ...dispute,
        buyer: {},
        seller: {},
        messages: [],
        order: null,
      });

      const result = await service.getDispute(dispute.id, 'admin-id', true);

      expect(result.id).toBe(dispute.id);
    });

    it('throws NotFoundException for unknown dispute', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValueOnce(null);

      await expect(service.getDispute('no-such-id', 'user1', false)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── sellerRespond ────────────────────────────────────────────────────────────

  describe('sellerRespond', () => {
    it('transitions dispute to seller_responded and creates message', async () => {
      const dispute = buildDispute({
        sellerId: 'seller1',
        status: DisputeStatus.filed,
      });
      mockPrisma.dispute.findUnique.mockResolvedValueOnce(dispute);

      const updatedDispute = { ...dispute, status: DisputeStatus.seller_responded, messages: [] };
      const newMessage = buildDisputeMessage({ disputeId: dispute.id, authorId: 'seller1' });
      mockPrisma.$transaction.mockResolvedValueOnce([updatedDispute, newMessage]);

      const result = await service.sellerRespond(dispute.id, 'seller1', 'Item was as described.');

      expect(result.status).toBe(DisputeStatus.seller_responded);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('throws ForbiddenException when non-seller responds', async () => {
      const dispute = buildDispute({ sellerId: 'seller1', status: DisputeStatus.filed });
      mockPrisma.dispute.findUnique.mockResolvedValueOnce(dispute);

      await expect(service.sellerRespond(dispute.id, 'other-user', 'Response')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BadRequestException when dispute is not in filed status', async () => {
      const dispute = buildDispute({
        sellerId: 'seller1',
        status: DisputeStatus.under_review,
      });
      mockPrisma.dispute.findUnique.mockResolvedValueOnce(dispute);

      await expect(service.sellerRespond(dispute.id, 'seller1', 'Late response')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── addMessage ───────────────────────────────────────────────────────────────

  describe('addMessage', () => {
    it('allows buyer to add a message to an open dispute', async () => {
      const dispute = buildDispute({
        buyerId: 'buyer1',
        status: DisputeStatus.seller_responded,
      });
      mockPrisma.dispute.findUnique.mockResolvedValueOnce(dispute);

      const message = buildDisputeMessage({ disputeId: dispute.id, authorId: 'buyer1' });
      mockPrisma.disputeMessage.create.mockResolvedValueOnce(message);

      const result = await service.addMessage(dispute.id, 'buyer1', DisputeActorRole.buyer, 'Need more info');

      expect(result.authorId).toBe('buyer1');
    });

    it('throws BadRequestException when dispute is already resolved', async () => {
      const dispute = buildDispute({ status: DisputeStatus.resolved_refund });
      mockPrisma.dispute.findUnique.mockResolvedValueOnce(dispute);

      await expect(
        service.addMessage(dispute.id, 'buyer1', DisputeActorRole.buyer, 'Too late'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when buyer tries to post as seller', async () => {
      const dispute = buildDispute({ buyerId: 'buyer1', status: DisputeStatus.filed });
      mockPrisma.dispute.findUnique.mockResolvedValueOnce(dispute);

      await expect(
        service.addMessage(dispute.id, 'buyer1', DisputeActorRole.seller, 'Masquerading'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── resolveDispute ───────────────────────────────────────────────────────────

  describe('resolveDispute', () => {
    it('throws BadRequestException for partial action', async () => {
      await expect(service.resolveDispute('d1', 'partial', 'Partial')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException for unknown dispute', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValueOnce(null);

      await expect(service.resolveDispute('no-id', 'refund', 'Refund')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when dispute is already resolved', async () => {
      const dispute = buildDispute({ status: DisputeStatus.resolved_refund });
      mockPrisma.dispute.findUnique.mockResolvedValueOnce({
        ...dispute,
        buyer: {},
        seller: {},
        order: { id: 'ord1', paymentKey: 'pk1', amount: 50000, sellerId: 's1' },
      });

      await expect(service.resolveDispute(dispute.id, 'release', 'Re-resolve')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('calls cancelByPaymentKey on refund action', async () => {
      const dispute = buildDispute({ status: DisputeStatus.under_review });
      mockPrisma.dispute.findUnique.mockResolvedValueOnce({
        ...dispute,
        buyer: { id: 'b1', nickname: 'B' },
        seller: { id: 's1', nickname: 'S' },
        order: { id: 'ord1', paymentKey: 'pk-test', amount: 50000, sellerId: 's1' },
      });
      mockPrisma.$transaction.mockImplementationOnce(async (cb: (tx: unknown) => unknown) => cb(mockPrisma));
      mockPrisma.dispute.update.mockResolvedValueOnce({ ...dispute, status: DisputeStatus.resolved_refund });
      mockPrisma.marketplaceOrder.update.mockResolvedValueOnce({});
      mockPrisma.settlementRecord.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.dispute.findUniqueOrThrow.mockResolvedValueOnce({
        ...dispute,
        status: DisputeStatus.resolved_refund,
        messages: [],
      });

      await service.resolveDispute(dispute.id, 'refund', 'Refund issued');

      expect(mockPaymentsService.cancelByPaymentKey).toHaveBeenCalledWith('pk-test', '분쟁 해결: 환불 처리');
    });
  });

  // ── listForAdmin ─────────────────────────────────────────────────────────────

  describe('listForAdmin', () => {
    it('returns paginated disputes for admin', async () => {
      const disputes = [buildDispute(), buildDispute()];
      mockPrisma.$transaction.mockResolvedValueOnce([disputes, 2]);

      const result = await service.listForAdmin({});

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  // ── startReview ──────────────────────────────────────────────────────────────

  describe('startReview', () => {
    it('transitions dispute to under_review from filed', async () => {
      const dispute = buildDispute({ status: DisputeStatus.filed });
      mockPrisma.dispute.findUnique.mockResolvedValueOnce(dispute);
      mockPrisma.dispute.update.mockResolvedValueOnce({
        ...dispute,
        status: DisputeStatus.under_review,
        messages: [],
      });

      const result = await service.startReview(dispute.id, 'admin1');

      expect(result.status).toBe(DisputeStatus.under_review);
    });

    it('throws BadRequestException from a resolved state', async () => {
      const dispute = buildDispute({ status: DisputeStatus.resolved_release });
      mockPrisma.dispute.findUnique.mockResolvedValueOnce(dispute);

      await expect(service.startReview(dispute.id, 'admin1')).rejects.toThrow(BadRequestException);
    });
  });
});

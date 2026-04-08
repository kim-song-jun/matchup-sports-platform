import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockPayment = (overrides = {}) => ({
  id: 'pay-1',
  userId: 'user-1',
  participantId: 'participant-1',
  amount: 15000,
  orderId: 'MU-111',
  status: 'pending',
  paymentKey: null,
  paidAt: null,
  refundAmount: null,
  refundReason: null,
  refundedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const prismaMock = {
  payment: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  matchParticipant: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── prepare ─────────────────────────────────────────────────────────────────

  describe('prepare', () => {
    it('creates a pending payment and returns paymentId, orderId, amount', async () => {
      const payment = mockPayment();
      prismaMock.matchParticipant.findUnique.mockResolvedValue({
        id: 'participant-1',
        userId: 'user-1',
        paymentStatus: 'pending',
        match: { fee: 15000 },
      });
      prismaMock.payment.findUnique.mockResolvedValue(null);
      prismaMock.payment.create.mockResolvedValue(payment);

      const result = await service.prepare('user-1', {
        participantId: 'participant-1',
        amount: 15000,
        method: 'card',
      });

      expect(result).toHaveProperty('paymentId');
      expect(result).toHaveProperty('orderId');
      expect(result).toHaveProperty('amount');
      expect(prismaMock.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            status: 'pending',
            method: 'card',
          }),
        }),
      );
    });
  });

  // ── confirm ─────────────────────────────────────────────────────────────────

  describe('confirm', () => {
    it('marks payment as completed and updates participant status', async () => {
      const completed = mockPayment({ status: 'completed', paymentKey: 'pk-xxx', paidAt: new Date() });
      prismaMock.payment.update.mockResolvedValue(completed);
      prismaMock.matchParticipant.update.mockResolvedValue({});

      const result = await service.confirm({
        orderId: 'MU-111',
        paymentKey: 'pk-xxx',
      });

      expect(result.status).toBe('completed');
      expect(prismaMock.matchParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'confirmed',
            paymentStatus: 'completed',
          }),
        }),
      );
    });
  });

  // ── refund ──────────────────────────────────────────────────────────────────

  describe('refund', () => {
    it('marks payment as refunded and sets refundAmount', async () => {
      const payment = mockPayment({ status: 'completed', amount: 15000 });
      const refunded = mockPayment({
        status: 'refunded',
        refundAmount: 15000,
        refundReason: 'event cancelled',
        refundedAt: new Date(),
      });
      prismaMock.payment.findUnique.mockResolvedValue(payment);
      prismaMock.payment.update.mockResolvedValue(refunded);
      prismaMock.matchParticipant.update.mockResolvedValue({});

      const result = await service.refund('user-1', 'pay-1', { reason: 'event cancelled' });

      expect(result.status).toBe('refunded');
      expect(result.refundAmount).toBe(15000);
    });

    it('throws NotFoundException when payment does not exist', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(null);

      await expect(service.refund('user-1', 'no-such', {})).rejects.toThrow(NotFoundException);
    });
  });

  // ── getByUserId ─────────────────────────────────────────────────────────────

  describe('getByUserId', () => {
    it('returns payments for a user ordered by createdAt desc', async () => {
      const payments = [
        mockPayment({ id: 'pay-1', createdAt: new Date('2026-03-20') }),
        mockPayment({ id: 'pay-2', createdAt: new Date('2026-03-10') }),
      ];
      prismaMock.payment.findMany.mockResolvedValue(payments);

      const result = await service.getByUserId('user-1');

      expect(result).toHaveLength(2);
      expect(prismaMock.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          include: expect.any(Object),
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('returns empty array when user has no payments', async () => {
      prismaMock.payment.findMany.mockResolvedValue([]);

      const result = await service.getByUserId('user-no-payments');

      expect(result).toHaveLength(0);
    });
  });

  describe('getById', () => {
    it('returns a payment detail for the owner', async () => {
      const payment = mockPayment();
      prismaMock.payment.findUnique.mockResolvedValue(payment);

      const result = await service.getById('user-1', 'pay-1');

      expect(result.id).toBe('pay-1');
      expect(prismaMock.payment.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay-1' },
          include: expect.any(Object),
        }),
      );
    });

    it('throws NotFoundException when payment belongs to another user', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(mockPayment({ userId: 'other-user' }));

      await expect(service.getById('user-1', 'pay-1')).rejects.toThrow(NotFoundException);
    });
  });
});

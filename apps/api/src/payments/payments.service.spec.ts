import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettlementsService } from '../settlements/settlements.service';
import { createHmac } from 'crypto';

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
  pgProvider: null,
  pgTid: null,
  receiptUrl: null,
  cardNumber: null,
  method: 'card',
  paidAt: null,
  refundAmount: null,
  refundReason: null,
  refundedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  participant: {
    id: 'participant-1',
    status: 'pending',
    paymentStatus: 'pending',
    match: {
      id: 'match-1',
      title: '풋살 매치',
      sportType: 'futsal',
      matchDate: '2026-05-01',
      startTime: '19:00',
      endTime: '21:00',
      fee: 15000,
      venue: { id: 'venue-1', name: '잠실 풋살장', address: '서울시 송파구' },
    },
  },
  user: { id: 'user-1', nickname: 'tester', email: 'test@test.com', profileImageUrl: null },
  ...overrides,
});

const prismaMock = {
  match: {
    findUnique: jest.fn(),
  },
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

const notificationsServiceMock = {
  create: jest.fn(),
};

const settlementsServiceMock = {
  recordSettlement: jest.fn().mockResolvedValue({}),
};

// ---------------------------------------------------------------------------
// Suite helpers
// ---------------------------------------------------------------------------

/**
 * Creates a PaymentsService with TOSS_SECRET_KEY unset (mock mode).
 */
async function buildMockModeService(): Promise<PaymentsService> {
  delete process.env.TOSS_SECRET_KEY;
  delete process.env.TOSS_WEBHOOK_SECRET;

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PaymentsService,
      { provide: PrismaService, useValue: prismaMock },
      { provide: NotificationsService, useValue: notificationsServiceMock },
      { provide: SettlementsService, useValue: settlementsServiceMock },
    ],
  }).compile();

  return module.get<PaymentsService>(PaymentsService);
}

/**
 * Creates a PaymentsService with TOSS_SECRET_KEY set (real mode).
 */
async function buildRealModeService(): Promise<PaymentsService> {
  process.env.TOSS_SECRET_KEY = 'test_sk_xxx';
  process.env.TOSS_WEBHOOK_SECRET = 'webhook-secret';

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PaymentsService,
      { provide: PrismaService, useValue: prismaMock },
      { provide: NotificationsService, useValue: notificationsServiceMock },
      { provide: SettlementsService, useValue: settlementsServiceMock },
    ],
  }).compile();

  return module.get<PaymentsService>(PaymentsService);
}

// ---------------------------------------------------------------------------
// Production guard suite
// ---------------------------------------------------------------------------

describe('PaymentsService — onModuleInit production guard', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.TOSS_SECRET_KEY;
    delete process.env.TOSS_WEBHOOK_SECRET;
    jest.clearAllMocks();
  });

  async function buildService(): Promise<{ init: () => Promise<unknown> }> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
        { provide: SettlementsService, useValue: settlementsServiceMock },
      ],
    }).compile();
    return module;
  }

  it('does not throw in development when TOSS_SECRET_KEY is missing', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.TOSS_SECRET_KEY;

    const module = await buildService();
    await expect(module.init()).resolves.not.toThrow();
  });

  it('does not throw in test environment when TOSS_SECRET_KEY is missing', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.TOSS_SECRET_KEY;

    const module = await buildService();
    await expect(module.init()).resolves.not.toThrow();
  });

  it('throws on module init in production when TOSS_SECRET_KEY is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.TOSS_SECRET_KEY;

    const module = await buildService();
    await expect(module.init()).rejects.toThrow(
      /TOSS_SECRET_KEY is not set in production/,
    );
  });

  it('does not throw on module init in production when TOSS_SECRET_KEY is present', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TOSS_SECRET_KEY = 'live_sk_xxx';

    const module = await buildService();
    await expect(module.init()).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PaymentsService — mock mode (no TOSS_SECRET_KEY)', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await buildMockModeService();
    notificationsServiceMock.create.mockResolvedValue(undefined);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── prepare ───────────────────────────────────────────────────────────────

  describe('prepare', () => {
    it('creates a pending payment and returns paymentId, orderId, amount', async () => {
      const payment = mockPayment();
      prismaMock.matchParticipant.findUnique.mockResolvedValue({
        id: 'participant-1',
        matchId: 'match-1',
        userId: 'user-1',
        paymentStatus: 'pending',
      });
      prismaMock.match.findUnique.mockResolvedValue({ id: 'match-1', title: '풋살 매치', fee: 15000 });
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

    it('throws BadRequestException when amount does not match match fee', async () => {
      prismaMock.matchParticipant.findUnique.mockResolvedValue({
        id: 'participant-1',
        matchId: 'match-1',
        userId: 'user-1',
        paymentStatus: 'pending',
      });
      prismaMock.match.findUnique.mockResolvedValue({ id: 'match-1', title: '풋살 매치', fee: 15000 });
      prismaMock.payment.findUnique.mockResolvedValue(null);

      await expect(
        service.prepare('user-1', { participantId: 'participant-1', amount: 9999 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns existing pending payment when one already exists', async () => {
      prismaMock.matchParticipant.findUnique.mockResolvedValue({
        id: 'participant-1',
        matchId: 'match-1',
        userId: 'user-1',
        paymentStatus: 'pending',
      });
      prismaMock.match.findUnique.mockResolvedValue({ id: 'match-1', title: '풋살 매치', fee: 15000 });
      prismaMock.payment.findUnique.mockResolvedValue(mockPayment({ status: 'pending' }));

      const result = await service.prepare('user-1', { participantId: 'participant-1', amount: 15000 });

      expect(result.orderId).toBe('MU-111');
      expect(prismaMock.payment.create).not.toHaveBeenCalled();
    });
  });

  // ── confirm (mock mode) ───────────────────────────────────────────────────

  describe('confirm — mock mode', () => {
    it('marks payment as completed without calling Toss API', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(mockPayment({ status: 'pending', amount: 15000 }));
      const completed = mockPayment({ status: 'completed', paymentKey: 'pk-mock', paidAt: new Date(), pgProvider: 'mock' });
      prismaMock.payment.update.mockResolvedValue(completed);
      prismaMock.matchParticipant.update.mockResolvedValue({});

      const result = await service.confirm({
        orderId: 'MU-111',
        paymentKey: 'pk-mock',
        amount: 15000,
      });

      expect(result.status).toBe('completed');
      expect(prismaMock.matchParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'confirmed', paymentStatus: 'completed' }),
        }),
      );
      expect(notificationsServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: 'payment_confirmed',
          data: expect.objectContaining({ paymentId: 'pay-1', orderId: 'MU-111' }),
        }),
      );
    });

    it('throws BadRequestException when amount mismatches DB record', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(mockPayment({ status: 'pending', amount: 15000 }));

      await expect(
        service.confirm({ orderId: 'MU-111', paymentKey: 'pk-mock', amount: 5000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when orderId does not exist', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(null);

      await expect(
        service.confirm({ orderId: 'no-such', paymentKey: 'pk-mock' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── refund (mock mode) ────────────────────────────────────────────────────

  describe('refund — mock mode', () => {
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
      expect(notificationsServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', type: 'payment_refunded' }),
      );
    });

    it('throws NotFoundException when payment does not exist', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(null);
      await expect(service.refund('user-1', 'no-such', {})).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when payment is not completed', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(mockPayment({ status: 'pending' }));
      await expect(service.refund('user-1', 'pay-1', {})).rejects.toThrow(BadRequestException);
    });
  });

  // ── getByUserId ───────────────────────────────────────────────────────────

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

  // ── getById ───────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('returns a payment detail for the owner', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(mockPayment());
      const result = await service.getById('user-1', 'pay-1');
      expect(result.id).toBe('pay-1');
    });

    it('throws NotFoundException when payment belongs to another user', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(mockPayment({ userId: 'other-user' }));
      await expect(service.getById('user-1', 'pay-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── webhook (mock mode — no secret) ──────────────────────────────────────

  describe('handleWebhook — no secret', () => {
    it('accepts webhook without signature when TOSS_WEBHOOK_SECRET is unset', async () => {
      const result = await service.handleWebhook(
        Buffer.from('{}'),
        undefined,
        { eventType: 'UNKNOWN_EVENT' },
      );
      expect(result).toEqual({ received: true });
    });
  });
});

// ---------------------------------------------------------------------------
// Real mode suite
// ---------------------------------------------------------------------------

describe('PaymentsService — real mode (TOSS_SECRET_KEY set)', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await buildRealModeService();
    notificationsServiceMock.create.mockResolvedValue(undefined);
  });

  afterAll(() => {
    delete process.env.TOSS_SECRET_KEY;
    delete process.env.TOSS_WEBHOOK_SECRET;
  });

  // ── confirm — real mode (fetch mock) ─────────────────────────────────────

  describe('confirm — real mode', () => {
    it('calls Toss confirm API and updates DB on success', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(mockPayment({ status: 'pending', amount: 15000 }));

      const tossResponse = {
        paymentKey: 'pk-toss-real',
        orderId: 'MU-111',
        status: 'DONE',
        method: '카드',
        totalAmount: 15000,
        paidAt: '2026-04-09T12:00:00+09:00',
        receiptUrl: 'https://receipt.toss.im/xxx',
        card: { number: '1234-****-****-5678' },
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => tossResponse,
      }) as jest.Mock;

      const completed = mockPayment({
        status: 'completed',
        paymentKey: 'pk-toss-real',
        pgProvider: 'toss',
        paidAt: new Date(),
      });
      prismaMock.payment.update.mockResolvedValue(completed);
      prismaMock.matchParticipant.update.mockResolvedValue({});

      const result = await service.confirm({
        orderId: 'MU-111',
        paymentKey: 'pk-toss-real',
        amount: 15000,
      });

      expect(result.status).toBe('completed');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.tosspayments.com/v1/payments/confirm',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: expect.stringContaining('Basic ') }),
          body: JSON.stringify({ paymentKey: 'pk-toss-real', orderId: 'MU-111', amount: 15000 }),
        }),
      );
    });

    it('marks payment as failed and throws BadRequestException when Toss returns error', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(mockPayment({ status: 'pending', amount: 15000 }));

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ code: 'INVALID_STOPPED_CARD', message: '정지된 카드입니다.' }),
      }) as jest.Mock;

      prismaMock.payment.update.mockResolvedValue(mockPayment({ status: 'failed' }));

      await expect(
        service.confirm({ orderId: 'MU-111', paymentKey: 'pk-bad', amount: 15000 }),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
      );
    });
  });

  // ── refund — real mode ────────────────────────────────────────────────────

  describe('refund — real mode', () => {
    it('calls Toss cancel API then updates DB', async () => {
      const payment = mockPayment({ status: 'completed', amount: 15000, paymentKey: 'pk-toss-real' });
      prismaMock.payment.findUnique.mockResolvedValue(payment);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }) as jest.Mock;

      const refunded = mockPayment({
        status: 'refunded',
        refundAmount: 15000,
        refundReason: '경기 취소',
        refundedAt: new Date(),
      });
      prismaMock.payment.update.mockResolvedValue(refunded);
      prismaMock.matchParticipant.update.mockResolvedValue({});

      const result = await service.refund('user-1', 'pay-1', { reason: '경기 취소' });

      expect(result.status).toBe('refunded');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.tosspayments.com/v1/payments/pk-toss-real/cancel',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ cancelReason: '경기 취소' }),
        }),
      );
    });

    it('throws BadRequestException when paymentKey is null in real mode', async () => {
      const payment = mockPayment({ status: 'completed', paymentKey: null });
      prismaMock.payment.findUnique.mockResolvedValue(payment);

      await expect(service.refund('user-1', 'pay-1', { reason: '테스트' })).rejects.toThrow(BadRequestException);
    });
  });

  // ── webhook — signature verification ─────────────────────────────────────

  describe('handleWebhook — with secret', () => {
    it('accepts webhook with valid HMAC signature', async () => {
      const body = JSON.stringify({ eventType: 'UNKNOWN_EVENT' });
      const rawBody = Buffer.from(body);
      const signature = createHmac('sha256', 'webhook-secret').update(rawBody).digest('hex');

      const result = await service.handleWebhook(rawBody, signature, { eventType: 'UNKNOWN_EVENT' });
      expect(result).toEqual({ received: true });
    });

    it('throws UnauthorizedException when signature is invalid', async () => {
      const rawBody = Buffer.from('{"eventType":"PAYMENT_STATUS_CHANGED"}');

      await expect(
        service.handleWebhook(rawBody, 'invalid-signature', { eventType: 'PAYMENT_STATUS_CHANGED' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when signature header is absent', async () => {
      await expect(
        service.handleWebhook(Buffer.from('{}'), undefined, {}),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('syncs DONE status to completed via webhook', async () => {
      const body = { eventType: 'PAYMENT_STATUS_CHANGED', data: { paymentKey: 'pk-sync', status: 'DONE' } };
      const rawBody = Buffer.from(JSON.stringify(body));
      const signature = createHmac('sha256', 'webhook-secret').update(rawBody).digest('hex');

      prismaMock.payment.findUnique.mockResolvedValue(mockPayment({ status: 'pending', paymentKey: 'pk-sync' }));
      prismaMock.payment.update.mockResolvedValue(mockPayment({ status: 'completed' }));

      const result = await service.handleWebhook(rawBody, signature, body);
      expect(result).toEqual({ received: true });
      expect(prismaMock.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'completed' }) }),
      );
    });

    it('syncs CANCELED status to refunded via webhook', async () => {
      const body = { eventType: 'PAYMENT_STATUS_CHANGED', data: { paymentKey: 'pk-sync', status: 'CANCELED' } };
      const rawBody = Buffer.from(JSON.stringify(body));
      const signature = createHmac('sha256', 'webhook-secret').update(rawBody).digest('hex');

      prismaMock.payment.findUnique.mockResolvedValue(mockPayment({ status: 'completed', paymentKey: 'pk-sync' }));
      prismaMock.payment.update.mockResolvedValue(mockPayment({ status: 'refunded' }));

      const result = await service.handleWebhook(rawBody, signature, body);
      expect(result).toEqual({ received: true });
      expect(prismaMock.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'refunded' }) }),
      );
    });
  });
});

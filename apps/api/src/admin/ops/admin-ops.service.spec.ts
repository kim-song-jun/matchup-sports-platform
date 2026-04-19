import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DisputeStatus,
  MatchStatus,
  PaymentStatus,
  PayoutStatus,
  SettlementStatus,
} from '@prisma/client';
import { AdminOpsService } from './admin-ops.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PUSH_ALERT_WINDOW_MS } from '../../common/constants/ops';

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------

const prismaMock = {
  match: { count: jest.fn() },
  payment: { count: jest.fn() },
  dispute: { count: jest.fn() },
  settlementRecord: { count: jest.fn(), updateMany: jest.fn() },
  payout: { count: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  webPushFailureLog: {
    count: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AdminOpsService', () => {
  let service: AdminOpsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminOpsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AdminOpsService>(AdminOpsService);
  });

  // ── getSummary ─────────────────────────────────────────────────────────────

  describe('getSummary', () => {
    it('returns all 6 KPI counters', async () => {
      prismaMock.match.count.mockResolvedValue(3);
      prismaMock.payment.count.mockResolvedValue(2);
      prismaMock.dispute.count.mockResolvedValue(5);
      prismaMock.settlementRecord.count.mockResolvedValue(11);
      prismaMock.payout.count.mockResolvedValue(1);
      prismaMock.webPushFailureLog.count.mockResolvedValue(4);

      const result = await service.getSummary();

      expect(result).toEqual({
        matchesInProgress: 3,
        paymentsPending: 2,
        disputesOpen: 5,
        settlementsPending: 11,
        payoutsFailed: 1,
        pushFailures5m: 4,
      });
    });

    it('queries match with in_progress status', async () => {
      prismaMock.match.count.mockResolvedValue(0);
      prismaMock.payment.count.mockResolvedValue(0);
      prismaMock.dispute.count.mockResolvedValue(0);
      prismaMock.settlementRecord.count.mockResolvedValue(0);
      prismaMock.payout.count.mockResolvedValue(0);
      prismaMock.webPushFailureLog.count.mockResolvedValue(0);

      await service.getSummary();

      expect(prismaMock.match.count).toHaveBeenCalledWith({
        where: { status: MatchStatus.in_progress },
      });
    });

    it('queries dispute with filed/seller_responded/admin_reviewing statuses', async () => {
      prismaMock.match.count.mockResolvedValue(0);
      prismaMock.payment.count.mockResolvedValue(0);
      prismaMock.dispute.count.mockResolvedValue(0);
      prismaMock.settlementRecord.count.mockResolvedValue(0);
      prismaMock.payout.count.mockResolvedValue(0);
      prismaMock.webPushFailureLog.count.mockResolvedValue(0);

      await service.getSummary();

      expect(prismaMock.dispute.count).toHaveBeenCalledWith({
        where: {
          status: {
            in: [
              DisputeStatus.filed,
              DisputeStatus.seller_responded,
              DisputeStatus.admin_reviewing,
            ],
          },
        },
      });
    });

    it('queries settlementRecord with payoutId: null filter', async () => {
      prismaMock.match.count.mockResolvedValue(0);
      prismaMock.payment.count.mockResolvedValue(0);
      prismaMock.dispute.count.mockResolvedValue(0);
      prismaMock.settlementRecord.count.mockResolvedValue(0);
      prismaMock.payout.count.mockResolvedValue(0);
      prismaMock.webPushFailureLog.count.mockResolvedValue(0);

      await service.getSummary();

      expect(prismaMock.settlementRecord.count).toHaveBeenCalledWith({
        where: {
          status: { in: [SettlementStatus.pending, SettlementStatus.held] },
          payoutId: null,
        },
      });
    });

    it('queries webPushFailureLog within PUSH_ALERT_WINDOW_MS and acknowledgedAt null', async () => {
      prismaMock.match.count.mockResolvedValue(0);
      prismaMock.payment.count.mockResolvedValue(0);
      prismaMock.dispute.count.mockResolvedValue(0);
      prismaMock.settlementRecord.count.mockResolvedValue(0);
      prismaMock.payout.count.mockResolvedValue(0);
      prismaMock.webPushFailureLog.count.mockResolvedValue(0);

      const before = Date.now();
      await service.getSummary();
      const after = Date.now();

      const call = prismaMock.webPushFailureLog.count.mock.calls[0][0];
      expect(call.where.acknowledgedAt).toBeNull();
      const windowStart = call.where.occurredAt.gt as Date;
      const expectedMin = new Date(before - PUSH_ALERT_WINDOW_MS);
      const expectedMax = new Date(after - PUSH_ALERT_WINDOW_MS);
      expect(windowStart.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime());
      expect(windowStart.getTime()).toBeLessThanOrEqual(expectedMax.getTime());
    });
  });

  // ── getRecentPushFailures ──────────────────────────────────────────────────

  describe('getRecentPushFailures', () => {
    it('returns PII-safe records (no full userId, no full endpoint)', async () => {
      prismaMock.webPushFailureLog.findMany.mockResolvedValue([
        {
          id: 'log-001',
          userId: 'user-abcdef-1234',
          endpointSuffix: 'abc123',
          statusCode: 410,
          errorCode: 'GONE',
          occurredAt: new Date('2026-04-19T12:00:00Z'),
          acknowledgedAt: null,
        },
      ]);

      const results = await service.getRecentPushFailures(20);

      expect(results).toHaveLength(1);
      expect(results[0]).not.toHaveProperty('userId');
      expect(results[0].endpointSuffix).toBe('abc123');
      expect(results[0].endpointSuffix).toHaveLength(6);
      expect(results[0].userIdHash).toMatch(/^[0-9a-f]{8}$/);
      expect(results[0].statusCode).toBe(410);
    });

    it('produces consistent sha256 hash for the same userId', async () => {
      const userId = 'stable-user-id';
      prismaMock.webPushFailureLog.findMany.mockResolvedValue([
        {
          id: 'log-002',
          userId,
          endpointSuffix: 'xxxxxx',
          statusCode: 500,
          errorCode: null,
          occurredAt: new Date(),
          acknowledgedAt: null,
        },
      ]);

      const [r1] = await service.getRecentPushFailures(1);
      prismaMock.webPushFailureLog.findMany.mockResolvedValue([
        { id: 'log-003', userId, endpointSuffix: 'xxxxxx', statusCode: 500, errorCode: null, occurredAt: new Date(), acknowledgedAt: null },
      ]);
      const [r2] = await service.getRecentPushFailures(1);

      expect(r1.userIdHash).toBe(r2.userIdHash);
    });

    it('caps limit at 100', async () => {
      prismaMock.webPushFailureLog.findMany.mockResolvedValue([]);
      await service.getRecentPushFailures(500);
      expect(prismaMock.webPushFailureLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  // ── ackPushFailures ────────────────────────────────────────────────────────

  describe('ackPushFailures', () => {
    it('acknowledges specific ids when provided', async () => {
      prismaMock.webPushFailureLog.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.ackPushFailures('admin-1', ['id-1', 'id-2']);

      expect(result).toEqual({ acknowledged: 2 });
      expect(prismaMock.webPushFailureLog.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['id-1', 'id-2'] }, acknowledgedAt: null },
        }),
      );
    });

    it('acknowledges all within window when ids is absent', async () => {
      prismaMock.webPushFailureLog.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.ackPushFailures('admin-2');

      expect(result).toEqual({ acknowledged: 5 });
      const call = prismaMock.webPushFailureLog.updateMany.mock.calls[0][0];
      expect(call.where.acknowledgedAt).toBeNull();
      expect(call.where).toHaveProperty('occurredAt');
    });

    it('acknowledges all within window when ids is empty array', async () => {
      prismaMock.webPushFailureLog.updateMany.mockResolvedValue({ count: 3 });

      await service.ackPushFailures('admin-3', []);

      const call = prismaMock.webPushFailureLog.updateMany.mock.calls[0][0];
      expect(call.where).toHaveProperty('occurredAt');
    });

    it('sets acknowledgedBy to the adminId', async () => {
      prismaMock.webPushFailureLog.updateMany.mockResolvedValue({ count: 1 });

      await service.ackPushFailures('admin-xyz', ['id-5']);

      const call = prismaMock.webPushFailureLog.updateMany.mock.calls[0][0];
      expect(call.data.acknowledgedBy).toBe('admin-xyz');
    });
  });
});

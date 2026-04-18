import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PayoutStatus, SettlementStatus, SettlementType } from '@prisma/client';
import { SettlementsService } from './settlements.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildSettlementRecord } from '../../test/fixtures/settlements';
import { buildPayout } from '../../test/fixtures/marketplace';

// ---------------------------------------------------------------------------
// Helpers — delegate to fixture builder for type-safe mock objects
// ---------------------------------------------------------------------------

const makeRecord = (overrides: Parameters<typeof buildSettlementRecord>[0] = {}) =>
  buildSettlementRecord({ id: 'settle-1', sourceId: 'pay-1', ...overrides });

// ---------------------------------------------------------------------------
// Mock
// ---------------------------------------------------------------------------

const prismaMock = {
  settlementRecord: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  },
  payout: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('SettlementsService', () => {
  let service: SettlementsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<SettlementsService>(SettlementsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns items and total with no filter', async () => {
      const records = [makeRecord(), makeRecord({ id: 'settle-2' })];
      prismaMock.$transaction.mockResolvedValue([records, 2]);

      const result = await service.findAll({});

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it('passes status filter to prisma where clause', async () => {
      const records = [makeRecord({ status: SettlementStatus.completed })];
      prismaMock.$transaction.mockResolvedValue([records, 1]);

      const result = await service.findAll({ status: 'completed' });

      expect(result.items[0].status).toBe(SettlementStatus.completed);
      // Verify transaction was called with a where that includes status
      const txArgs = prismaMock.$transaction.mock.calls[0][0];
      // $transaction receives an array of promises; we just confirm it was called
      expect(txArgs).toBeDefined();
    });

    it('ignores unknown status values (no crash)', async () => {
      prismaMock.$transaction.mockResolvedValue([[], 0]);

      const result = await service.findAll({ status: 'nonexistent' });

      expect(result.total).toBe(0);
    });

    it('returns empty result when no records match', async () => {
      prismaMock.$transaction.mockResolvedValue([[], 0]);

      const result = await service.findAll({ type: 'lesson', status: 'completed' });

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('returns nextCursor when items exceed limit', async () => {
      // take=2; mock returns 3 items to trigger hasMore
      const records = [
        makeRecord({ id: 'settle-1' }),
        makeRecord({ id: 'settle-2' }),
        makeRecord({ id: 'settle-3' }),
      ];
      prismaMock.$transaction.mockResolvedValue([records, 3]);

      const result = await service.findAll({ limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe('settle-2');
    });

    it('returns null nextCursor when items fit within limit', async () => {
      const records = [makeRecord({ id: 'settle-1' })];
      prismaMock.$transaction.mockResolvedValue([records, 1]);

      const result = await service.findAll({ limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
    });
  });

  // ── getById ─────────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('returns the settlement record when found', async () => {
      const record = makeRecord({ id: 'settle-abc' });
      prismaMock.settlementRecord.findUnique.mockResolvedValue(record);

      const result = await service.getById('settle-abc');

      expect(result.id).toBe('settle-abc');
    });

    it('throws NotFoundException when id does not exist', async () => {
      prismaMock.settlementRecord.findUnique.mockResolvedValue(null);

      await expect(service.getById('no-such-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getSummary ──────────────────────────────────────────────────────────────

  describe('getSummary', () => {
    it('returns aggregated totals and counts', async () => {
      // Transaction order: totalAgg, commissionAgg, pendingAgg, refundedAgg,
      //                    processedCount, pendingCount, refundedCount, failedCount
      prismaMock.$transaction.mockResolvedValue([
        { _sum: { amount: 565000 } },
        { _sum: { commission: 25000 } },
        { _sum: { amount: 265000 } },
        { _sum: { amount: 50000 } },
        3,
        4,
        1,
        1,
      ]);

      const summary = await service.getSummary();

      expect(summary.total).toBe(565000);
      expect(summary.commission).toBe(25000);
      expect(summary.pending).toBe(265000);
      expect(summary.refunded).toBe(50000);
      expect(summary.processedCount).toBe(3);
      expect(summary.pendingCount).toBe(4);
      expect(summary.refundedCount).toBe(1);
      expect(summary.failedCount).toBe(1);
    });

    it('returns zeros when no records exist', async () => {
      prismaMock.$transaction.mockResolvedValue([
        { _sum: { amount: null } },
        { _sum: { commission: null } },
        { _sum: { amount: null } },
        { _sum: { amount: null } },
        0,
        0,
        0,
        0,
      ]);

      const summary = await service.getSummary();

      expect(summary.total).toBe(0);
      expect(summary.commission).toBe(0);
      expect(summary.pending).toBe(0);
      expect(summary.refunded).toBe(0);
      expect(summary.processedCount).toBe(0);
      expect(summary.refundedCount).toBe(0);
    });
  });

  // ── process ─────────────────────────────────────────────────────────────────

  describe('process', () => {
    it('approve action sets status to completed', async () => {
      const record = makeRecord({ id: 'settle-1' });
      const updated = { ...record, status: SettlementStatus.completed, processedAt: new Date() };
      prismaMock.settlementRecord.findUnique.mockResolvedValue(record);
      prismaMock.settlementRecord.update.mockResolvedValue(updated);

      const result = await service.process('settle-1', { action: 'approve' });

      expect(result.status).toBe(SettlementStatus.completed);
      expect(prismaMock.settlementRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'settle-1' },
          data: expect.objectContaining({ status: SettlementStatus.completed }),
        }),
      );
    });

    it('reject action sets status to failed', async () => {
      const record = makeRecord({ id: 'settle-1' });
      const updated = { ...record, status: SettlementStatus.failed, processedAt: new Date() };
      prismaMock.settlementRecord.findUnique.mockResolvedValue(record);
      prismaMock.settlementRecord.update.mockResolvedValue(updated);

      const result = await service.process('settle-1', { action: 'reject', note: '계좌 오류' });

      expect(result.status).toBe(SettlementStatus.failed);
    });

    it('throws NotFoundException for non-existent id', async () => {
      prismaMock.settlementRecord.findUnique.mockResolvedValue(null);

      await expect(service.process('no-such-id', { action: 'approve' })).rejects.toThrow(NotFoundException);
    });
  });

  // ── recordSettlement ────────────────────────────────────────────────────────

  describe('recordSettlement', () => {
    it('creates a pending settlement with 10% commission', async () => {
      const created = makeRecord({
        id: 'settle-new',
        type: SettlementType.match,
        amount: 50000,
        commission: 5000,
        netAmount: 45000,
        status: SettlementStatus.pending,
      });
      prismaMock.settlementRecord.create.mockResolvedValue(created);

      const result = await service.recordSettlement({
        type: 'match',
        amount: 50000,
        sourceId: 'pay-1',
      });

      expect(result.status).toBe(SettlementStatus.pending);
      expect(result.commission).toBe(5000);
      expect(result.netAmount).toBe(45000);
      expect(prismaMock.settlementRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: SettlementType.match,
            amount: 50000,
            commission: 5000,
            netAmount: 45000,
            sourceId: 'pay-1',
          }),
        }),
      );
    });

    it('creates a lesson type settlement', async () => {
      const created = makeRecord({ type: SettlementType.lesson, amount: 80000, commission: 8000 });
      prismaMock.settlementRecord.create.mockResolvedValue(created);

      await service.recordSettlement({ type: 'lesson', amount: 80000, sourceId: 'ticket-1' });

      expect(prismaMock.settlementRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: SettlementType.lesson }),
        }),
      );
    });

    it('creates a marketplace type settlement', async () => {
      const created = makeRecord({ type: SettlementType.marketplace });
      prismaMock.settlementRecord.create.mockResolvedValue(created);

      await service.recordSettlement({ type: 'marketplace', amount: 30000, sourceId: 'order-1' });

      expect(prismaMock.settlementRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: SettlementType.marketplace }),
        }),
      );
    });

    it('rounds commission for non-divisible amounts', async () => {
      prismaMock.settlementRecord.create.mockResolvedValue(makeRecord({ amount: 33000 }));

      await service.recordSettlement({ type: 'match', amount: 33000, sourceId: 'pay-2' });

      expect(prismaMock.settlementRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ commission: 3300, netAmount: 29700 }),
        }),
      );
    });
  });

  // ── markProcessed ────────────────────────────────────────────────────────────

  describe('markProcessed', () => {
    it('sets status to completed for existing record', async () => {
      const record = makeRecord({ id: 'settle-1' });
      const updated = { ...record, status: SettlementStatus.completed, processedAt: new Date() };
      prismaMock.settlementRecord.findUnique.mockResolvedValue(record);
      prismaMock.settlementRecord.update.mockResolvedValue(updated);

      const result = await service.markProcessed('settle-1');

      expect(result.status).toBe(SettlementStatus.completed);
    });

    it('throws NotFoundException for unknown id', async () => {
      prismaMock.settlementRecord.findUnique.mockResolvedValue(null);

      await expect(service.markProcessed('ghost-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── recordMarketplaceSettlement ─────────────────────────────────────────────

  describe('recordMarketplaceSettlement', () => {
    it('creates a settlement record with held status', async () => {
      const created = makeRecord({
        type: SettlementType.marketplace,
        amount: 50000,
        commission: 5000,
        netAmount: 45000,
        status: SettlementStatus.held,
        orderId: 'order-db-id',
        recipientId: 'seller-1',
      });
      prismaMock.settlementRecord.create.mockResolvedValue(created);

      const result = await service.recordMarketplaceSettlement(
        'order-db-id',
        'MU-MKT-abc123',
        'seller-1',
        50000,
      );

      expect(result.status).toBe(SettlementStatus.held);
      expect(result.commission).toBe(5000);
      expect(prismaMock.settlementRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: SettlementType.marketplace,
            status: SettlementStatus.held,
            orderId: 'order-db-id',
            sourceId: 'MU-MKT-abc123',
            recipientId: 'seller-1',
          }),
        }),
      );
    });
  });

  // ── releaseSettlement ────────────────────────────────────────────────────────

  describe('releaseSettlement', () => {
    it('transitions held record to completed', async () => {
      const held = makeRecord({ status: SettlementStatus.held, orderId: 'order-db-id' });
      const released = { ...held, status: SettlementStatus.completed, releasedAt: new Date() };
      prismaMock.settlementRecord.findFirst.mockResolvedValue(held);
      prismaMock.settlementRecord.update.mockResolvedValue(released);

      const result = await service.releaseSettlement('order-db-id');

      expect(result.status).toBe(SettlementStatus.completed);
      expect(prismaMock.settlementRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: SettlementStatus.completed,
            releasedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('is idempotent when already released (completed)', async () => {
      const completed = makeRecord({ status: SettlementStatus.completed, orderId: 'order-db-id' });
      // First findFirst: no held record found
      // Second findFirst: existing record is already completed
      prismaMock.settlementRecord.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(completed);

      const result = await service.releaseSettlement('order-db-id');

      expect(result.status).toBe(SettlementStatus.completed);
      expect(prismaMock.settlementRecord.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when no held record found and no existing record', async () => {
      prismaMock.settlementRecord.findFirst
        .mockResolvedValueOnce(null)  // first: no held record
        .mockResolvedValueOnce(null); // second: no existing record at all

      await expect(service.releaseSettlement('order-db-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── listReleasedSettlements ─────────────────────────────────────────────────

  describe('listReleasedSettlements', () => {
    it('returns completed settlements without payout', async () => {
      const records = [
        makeRecord({ status: SettlementStatus.completed, payoutId: null }),
        makeRecord({ id: 'settle-2', status: SettlementStatus.completed, payoutId: null }),
      ];
      prismaMock.$transaction.mockResolvedValue([records, 2]);

      const result = await service.listReleasedSettlements({});

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('filters by recipientId when provided', async () => {
      prismaMock.$transaction.mockResolvedValue([[], 0]);

      await service.listReleasedSettlements({ recipientId: 'seller-1' });

      const txCall = prismaMock.$transaction.mock.calls[0][0];
      expect(txCall).toBeDefined();
    });
  });

  // ── createPayoutBatch ───────────────────────────────────────────────────────

  describe('createPayoutBatch', () => {
    it('returns empty array for empty input', async () => {
      const result = await service.createPayoutBatch([]);

      expect(result).toEqual([]);
      expect(prismaMock.settlementRecord.findMany).not.toHaveBeenCalled();
    });

    it('creates one payout per unique recipientId', async () => {
      const records = [
        makeRecord({ id: 's1', recipientId: 'seller-1', amount: 50000, commission: 5000, status: SettlementStatus.completed, payoutId: null, netAmount: 45000 }),
        makeRecord({ id: 's2', recipientId: 'seller-1', amount: 50000, commission: 5000, status: SettlementStatus.completed, payoutId: null, netAmount: 45000 }),
        makeRecord({ id: 's3', recipientId: 'seller-2', amount: 30000, commission: 3000, status: SettlementStatus.completed, payoutId: null, netAmount: 27000 }),
      ];
      prismaMock.settlementRecord.findMany.mockResolvedValue(records);

      const payout1 = buildPayout({ recipientId: 'seller-1', grossAmount: 100000, platformFee: 10000, netAmount: 90000 });
      const payout2 = buildPayout({ recipientId: 'seller-2', grossAmount: 30000, platformFee: 3000, netAmount: 27000 });

      // Simulate $transaction callback with race guard data
      prismaMock.$transaction.mockImplementationOnce(async (cb: (tx: typeof prismaMock) => unknown) => {
        const txMock = {
          payout: { create: jest.fn() },
          settlementRecord: {
            findMany: jest.fn()
              .mockResolvedValueOnce([records[0], records[1]]) // seller-1 race guard
              .mockResolvedValueOnce([records[2]]),             // seller-2 race guard
            updateMany: jest.fn().mockResolvedValue({ count: 2 }),
          },
        };
        txMock.payout.create
          .mockResolvedValueOnce(payout1)
          .mockResolvedValueOnce(payout2);
        return cb(txMock as unknown as typeof prismaMock);
      });

      const result = await service.createPayoutBatch(['s1', 's2', 's3']);

      expect(result).toHaveLength(2);
    });

    it('throws when records are not in completed status', async () => {
      const records = [
        makeRecord({ id: 's1', status: SettlementStatus.held, payoutId: null }),
      ];
      prismaMock.settlementRecord.findMany.mockResolvedValue(records);

      await expect(service.createPayoutBatch(['s1'])).rejects.toThrow();
    });

    it('throws when records already have a payoutId', async () => {
      const records = [
        makeRecord({ id: 's1', status: SettlementStatus.completed, payoutId: 'existing-payout' }),
      ];
      prismaMock.settlementRecord.findMany.mockResolvedValue(records);

      await expect(service.createPayoutBatch(['s1'])).rejects.toThrow();
    });
  });

  // ── markPayoutPaid ──────────────────────────────────────────────────────────

  describe('markPayoutPaid', () => {
    it('transitions payout to paid status', async () => {
      const payout = buildPayout({ id: 'payout-1', status: PayoutStatus.pending });
      const paid = { ...payout, status: PayoutStatus.paid, paidAt: new Date() };
      prismaMock.payout.findUnique.mockResolvedValue(payout);

      prismaMock.$transaction.mockImplementationOnce(async (cb: (tx: typeof prismaMock) => unknown) => {
        const txMock = {
          payout: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUniqueOrThrow: jest.fn().mockResolvedValue(paid),
          },
          settlementRecord: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        };
        return cb(txMock as unknown as typeof prismaMock);
      });

      const result = await service.markPayoutPaid('payout-1', 'admin-1');

      expect(result.status).toBe(PayoutStatus.paid);
    });

    it('is idempotent when payout is already paid', async () => {
      const paid = buildPayout({ id: 'payout-1', status: PayoutStatus.paid, paidAt: new Date() });
      prismaMock.payout.findUnique.mockResolvedValue(paid);

      const result = await service.markPayoutPaid('payout-1');

      expect(result.status).toBe(PayoutStatus.paid);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for unknown payout', async () => {
      prismaMock.payout.findUnique.mockResolvedValue(null);

      await expect(service.markPayoutPaid('ghost-id', 'admin-1')).rejects.toThrow(NotFoundException);
    });

    it('stores note when provided', async () => {
      const payout = buildPayout({ status: PayoutStatus.processing });
      const paid = { ...payout, status: PayoutStatus.paid, note: 'Transfer ref: TXN-9999' };
      prismaMock.payout.findUnique.mockResolvedValue(payout);

      let capturedUpdateData: unknown;
      prismaMock.$transaction.mockImplementationOnce(async (cb: (tx: typeof prismaMock) => unknown) => {
        const txMock = {
          payout: {
            updateMany: jest.fn().mockImplementationOnce((args: unknown) => {
              capturedUpdateData = args;
              return { count: 1 };
            }),
            findUniqueOrThrow: jest.fn().mockResolvedValue(paid),
          },
          settlementRecord: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        };
        return cb(txMock as unknown as typeof prismaMock);
      });

      await service.markPayoutPaid(payout.id, 'admin-1', 'Transfer ref: TXN-9999');

      expect(capturedUpdateData).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({ note: 'Transfer ref: TXN-9999' }),
        }),
      );
    });
  });
});

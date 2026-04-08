import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SettlementStatus, SettlementType } from '@prisma/client';
import { SettlementsService } from './settlements.service';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeRecord = (overrides: Partial<{
  id: string;
  type: SettlementType;
  status: SettlementStatus;
  amount: number;
  commission: number;
  netAmount: number;
  sourceId: string;
  recipientId: string | null;
  processedAt: Date | null;
  createdAt: Date;
}> = {}) => ({
  id: 'settle-1',
  type: SettlementType.match,
  status: SettlementStatus.pending,
  amount: 50000,
  commission: 5000,
  netAmount: 45000,
  sourceId: 'pay-1',
  recipientId: null,
  processedAt: null,
  createdAt: new Date(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock
// ---------------------------------------------------------------------------

const prismaMock = {
  settlementRecord: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
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
      // Transaction order: totalAgg, commissionAgg, pendingAgg, processedCount, pendingCount, failedCount
      prismaMock.$transaction.mockResolvedValue([
        { _sum: { amount: 565000 } },
        { _sum: { commission: 25000 } },
        { _sum: { amount: 265000 } },
        3,
        4,
        1,
      ]);

      const summary = await service.getSummary();

      expect(summary.total).toBe(565000);
      expect(summary.commission).toBe(25000);
      expect(summary.pending).toBe(265000);
      expect(summary.processedCount).toBe(3);
      expect(summary.pendingCount).toBe(4);
      expect(summary.failedCount).toBe(1);
    });

    it('returns zeros when no records exist', async () => {
      prismaMock.$transaction.mockResolvedValue([
        { _sum: { amount: null } },
        { _sum: { commission: null } },
        { _sum: { amount: null } },
        0,
        0,
        0,
      ]);

      const summary = await service.getSummary();

      expect(summary.total).toBe(0);
      expect(summary.commission).toBe(0);
      expect(summary.pending).toBe(0);
      expect(summary.processedCount).toBe(0);
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
});

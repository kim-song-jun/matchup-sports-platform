import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SettlementsService, SettlementStatus, SettlementType } from './settlements.service';

// NOTE: SettlementsService uses an in-memory array (not Prisma).
// These tests validate the current in-memory implementation as-is.
// Prisma migration is tracked separately and is out of scope for this PR.

describe('SettlementsService', () => {
  let service: SettlementsService;

  beforeEach(async () => {
    // Fresh instance for each test to avoid state leakage
    const module: TestingModule = await Test.createTestingModule({
      providers: [SettlementsService],
    }).compile();

    service = module.get<SettlementsService>(SettlementsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all settlements when no filter provided', () => {
      const result = service.findAll({});

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.total).toBe(result.items.length);
    });

    it('filters by status', () => {
      const result = service.findAll({ status: 'processed' });

      expect(result.items.every((s) => s.status === 'processed')).toBe(true);
    });

    it('filters by type', () => {
      const result = service.findAll({ type: 'match_fee' });

      expect(result.items.every((s) => s.type === 'match_fee')).toBe(true);
    });

    it('returns empty items when filter matches nothing', () => {
      const result = service.findAll({ status: 'processed', type: 'mercenary_fee' });

      // mercenary_fee only has pending/failed in seed data
      expect(result.items.length).toBe(0);
    });
  });

  // ── getSummary ──────────────────────────────────────────────────────────────

  describe('getSummary', () => {
    it('returns correct total amount across all settlements', () => {
      const all = service.findAll({});
      const expectedTotal = all.items.reduce((sum, s) => sum + s.amount, 0);

      const summary = service.getSummary();

      expect(summary.total).toBe(expectedTotal);
    });

    it('returns commission from processed settlements only', () => {
      const processed = service.findAll({ status: 'processed' });
      const expectedCommission = processed.items.reduce((sum, s) => sum + s.commission, 0);

      const summary = service.getSummary();

      expect(summary.commission).toBe(expectedCommission);
    });

    it('returns accurate pending amount', () => {
      const pending = service.findAll({ status: 'pending' });
      const expectedPending = pending.items.reduce((sum, s) => sum + s.amount, 0);

      const summary = service.getSummary();

      expect(summary.pending).toBe(expectedPending);
    });

    it('returns accurate counts per status', () => {
      const summary = service.getSummary();

      expect(typeof summary.processedCount).toBe('number');
      expect(typeof summary.pendingCount).toBe('number');
      expect(typeof summary.refundedCount).toBe('number');
      expect(typeof summary.failedCount).toBe('number');
      expect(
        summary.processedCount +
          summary.pendingCount +
          summary.refundedCount +
          summary.failedCount,
      ).toBe(service.findAll({}).total);
    });
  });

  // ── process ─────────────────────────────────────────────────────────────────

  describe('process', () => {
    it('approve action marks status as processed with processedAt', () => {
      const pending = service.findAll({ status: 'pending' });
      const target = pending.items[0];

      const result = service.process(target.id, { action: 'approve' });

      expect(result.status).toBe('processed');
      expect(result.processedAt).not.toBeNull();
    });

    it('refund action marks status as refunded and zeroes commission/netAmount', () => {
      const pending = service.findAll({ status: 'pending' });
      const target = pending.items[0];

      const result = service.process(target.id, { action: 'refund' });

      expect(result.status).toBe('refunded');
      expect(result.commission).toBe(0);
      expect(result.netAmount).toBe(0);
    });

    it('reject action marks status as failed', () => {
      const pending = service.findAll({ status: 'pending' });
      const target = pending.items[0];

      const result = service.process(target.id, { action: 'reject' });

      expect(result.status).toBe('failed');
    });

    it('throws NotFoundException for non-existent settlement id', () => {
      expect(() => service.process('no-such-id', { action: 'approve' })).toThrow(
        NotFoundException,
      );
    });
  });

  // ── recordSettlement ────────────────────────────────────────────────────────

  describe('recordSettlement', () => {
    it('creates a pending settlement entry with 10% commission', () => {
      const before = service.findAll({});
      const beforeCount = before.total;

      const result = service.recordSettlement({
        type: 'marketplace',
        amount: 50000,
        payerName: '구매자',
        recipientName: '판매자',
        relatedId: 'order-1',
        description: '장터 주문 결제',
      });

      expect(result.status).toBe('pending');
      expect(result.commission).toBe(5000);
      expect(result.netAmount).toBe(45000);
      expect(result.amount).toBe(50000);

      const after = service.findAll({});
      expect(after.total).toBe(beforeCount + 1);
    });

    it('creates a lesson_fee settlement for lesson type', () => {
      const result = service.recordSettlement({
        type: 'lesson',
        amount: 80000,
        payerName: '수강생',
        recipientName: '강사',
        relatedId: 'ticket-1',
        description: '레슨 티켓 구매',
      });

      expect(result.type).toBe('lesson_fee');
      expect(result.commission).toBe(8000);
    });

    it('creates a match_fee settlement for match type', () => {
      const result = service.recordSettlement({
        type: 'match',
        amount: 30000,
        payerName: '참가자',
        recipientName: '주최자',
        relatedId: 'match-1',
        description: '매치 참가비',
      });

      expect(result.type).toBe('match_fee');
      expect(result.netAmount).toBe(27000);
    });

    it('assigns a unique id to each entry', () => {
      const r1 = service.recordSettlement({
        type: 'lesson',
        amount: 10000,
        payerName: 'A',
        recipientName: 'B',
        relatedId: 'rel-1',
        description: 'test',
      });
      const r2 = service.recordSettlement({
        type: 'lesson',
        amount: 10000,
        payerName: 'C',
        recipientName: 'D',
        relatedId: 'rel-2',
        description: 'test',
      });

      expect(r1.id).not.toBe(r2.id);
    });
  });
});

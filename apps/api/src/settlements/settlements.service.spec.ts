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
});

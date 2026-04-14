import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DisputesService, DisputeType, DisputeStatus } from './disputes.service';

// NOTE: DisputesService uses an in-memory array (not Prisma).
// These tests validate the current in-memory implementation as-is.
// Prisma migration is tracked separately and is out of scope for this PR.

describe('DisputesService', () => {
  let service: DisputesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DisputesService],
    }).compile();

    service = module.get<DisputesService>(DisputesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all disputes with total count when no filter provided', () => {
      const result = service.findAll({});

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.total).toBe(result.items.length);
    });

    it('filters by status', () => {
      const result = service.findAll({ status: 'pending' });

      expect(result.items.every((d) => d.status === 'pending')).toBe(true);
      expect(result.total).toBe(result.items.length);
    });

    it('filters by type', () => {
      const result = service.findAll({ type: 'no_show' });

      expect(result.items.every((d) => d.type === 'no_show')).toBe(true);
    });

    it('returns empty items when no disputes match the filter', () => {
      const result = service.findAll({ status: 'investigating', type: 'late' });

      expect(result.items.length).toBe(0);
    });
  });

  // ── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns a dispute by id', () => {
      const result = service.findOne('dispute-001');

      expect(result.id).toBe('dispute-001');
    });

    it('throws NotFoundException for non-existent id', () => {
      expect(() => service.findOne('non-existent')).toThrow(NotFoundException);
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a new dispute with pending status', () => {
      const before = service.findAll({}).total;

      const created = service.create({
        reporterTeamId: 'team-new-1',
        reportedTeamId: 'team-new-2',
        teamMatchId: 'tm-new',
        type: 'late' as DisputeType,
        description: '30분 지각',
      });

      expect(created.status).toBe('pending');
      expect(created.resolution).toBeNull();
      expect(created.id).toMatch(/^dispute-/);
      expect(service.findAll({}).total).toBe(before + 1);
    });
  });

  // ── updateStatus ────────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('updates status to resolved with resolution text', () => {
      // Create a fresh one to avoid polluting other tests
      const created = service.create({
        reporterTeamId: 'tA',
        reportedTeamId: 'tB',
        teamMatchId: 'tm-x',
        type: 'misconduct' as DisputeType,
        description: 'test',
      });

      const result = service.updateStatus(created.id, {
        status: 'resolved' as DisputeStatus,
        resolution: '양 팀 경고 조치',
      });

      expect(result.status).toBe('resolved');
      expect(result.resolution).toBe('양 팀 경고 조치');
    });

    it('throws NotFoundException for non-existent dispute', () => {
      expect(() =>
        service.updateStatus('no-such-id', { status: 'resolved' as DisputeStatus }),
      ).toThrow(NotFoundException);
    });

    it('records server-sourced actor in history (not client-supplied)', () => {
      const created = service.create({
        reporterTeamId: 'tX',
        reportedTeamId: 'tY',
        teamMatchId: 'tm-z',
        type: 'no_show' as DisputeType,
        description: 'actor test',
      });

      const result = service.updateStatus(created.id, {
        status: 'investigating' as DisputeStatus,
        actor: 'admin-user-uuid-from-jwt',
      });

      const lastEntry = result.history[result.history.length - 1];
      // actor must equal what was passed (sourced from @CurrentUser in controller)
      expect(lastEntry.actor).toBe('admin-user-uuid-from-jwt');
    });
  });
});

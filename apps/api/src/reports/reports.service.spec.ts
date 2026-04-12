import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ReportTargetType, ReportStatus } from '@prisma/client';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  report: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  user: { findUnique: jest.fn() },
  chatMessage: { findUnique: jest.fn() },
  marketplaceListing: { findUnique: jest.fn() },
  review: { findUnique: jest.fn() },
};

describe('ReportsService', () => {
  let service: ReportsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    jest.clearAllMocks();
  });

  describe('createReport', () => {
    it('creates a report after verifying the target exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-2' });
      const expected = {
        id: 'report-1',
        targetType: ReportTargetType.user,
        targetId: 'user-2',
        reason: 'spam',
        description: null,
        status: ReportStatus.pending,
        createdAt: new Date(),
      };
      mockPrisma.report.create.mockResolvedValue(expected);

      const result = await service.createReport('reporter-1', {
        targetType: ReportTargetType.user,
        targetId: 'user-2',
        reason: 'spam',
      });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-2' } }),
      );
      expect(mockPrisma.report.create).toHaveBeenCalled();
      expect(result).toEqual(expected);
    });

    it('throws NotFoundException when target does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.createReport('reporter-1', {
          targetType: ReportTargetType.user,
          targetId: 'ghost',
          reason: 'spam',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.report.create).not.toHaveBeenCalled();
    });

    it('creates a report for a chat message target', async () => {
      mockPrisma.chatMessage.findUnique.mockResolvedValue({ id: 'msg-1' });
      const expected = {
        id: 'report-2',
        targetType: ReportTargetType.message,
        targetId: 'msg-1',
        reason: 'abuse',
        description: null,
        status: ReportStatus.pending,
        createdAt: new Date(),
      };
      mockPrisma.report.create.mockResolvedValue(expected);

      const result = await service.createReport('reporter-1', {
        targetType: ReportTargetType.message,
        targetId: 'msg-1',
        reason: 'abuse',
      });

      expect(mockPrisma.chatMessage.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'msg-1' } }),
      );
      expect(result.targetType).toBe(ReportTargetType.message);
    });

    it('creates a report for a marketplace listing target', async () => {
      mockPrisma.marketplaceListing.findUnique.mockResolvedValue({ id: 'listing-1' });
      mockPrisma.report.create.mockResolvedValue({
        id: 'report-3',
        targetType: ReportTargetType.listing,
        targetId: 'listing-1',
        reason: 'fraud',
        description: '사기 판매',
        status: ReportStatus.pending,
        createdAt: new Date(),
      });

      const result = await service.createReport('reporter-1', {
        targetType: ReportTargetType.listing,
        targetId: 'listing-1',
        reason: 'fraud',
        description: '사기 판매',
      });

      expect(mockPrisma.marketplaceListing.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'listing-1' } }),
      );
      expect(result.reason).toBe('fraud');
    });

    it('creates a report for a review target', async () => {
      mockPrisma.review.findUnique.mockResolvedValue({ id: 'review-1' });
      mockPrisma.report.create.mockResolvedValue({
        id: 'report-4',
        targetType: ReportTargetType.review,
        targetId: 'review-1',
        reason: 'fake_review',
        description: null,
        status: ReportStatus.pending,
        createdAt: new Date(),
      });

      const result = await service.createReport('reporter-1', {
        targetType: ReportTargetType.review,
        targetId: 'review-1',
        reason: 'fake_review',
      });

      expect(mockPrisma.review.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'review-1' } }),
      );
      expect(result.targetType).toBe(ReportTargetType.review);
    });

    it('throws NotFoundException when chat message target does not exist', async () => {
      mockPrisma.chatMessage.findUnique.mockResolvedValue(null);

      await expect(
        service.createReport('reporter-1', {
          targetType: ReportTargetType.message,
          targetId: 'ghost-msg',
          reason: 'abuse',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMyReports', () => {
    it('returns reports filtered by reporterId', async () => {
      const reports = [
        {
          id: 'r1',
          targetType: ReportTargetType.message,
          targetId: 'msg-1',
          reason: 'abuse',
          description: null,
          status: ReportStatus.pending,
          createdAt: new Date(),
        },
      ];
      mockPrisma.report.findMany.mockResolvedValue(reports);

      const result = await service.getMyReports('user-1');

      expect(mockPrisma.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { reporterId: 'user-1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toEqual(reports);
    });
  });

  describe('adminListReports', () => {
    it('returns all reports when no filter provided', async () => {
      mockPrisma.report.findMany.mockResolvedValue([]);

      await service.adminListReports({});

      expect(mockPrisma.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('filters by status when provided', async () => {
      mockPrisma.report.findMany.mockResolvedValue([]);

      await service.adminListReports({ status: ReportStatus.pending });

      expect(mockPrisma.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: ReportStatus.pending },
        }),
      );
    });
  });

  describe('adminUpdateStatus', () => {
    it('throws NotFoundException when report does not exist', async () => {
      mockPrisma.report.findUnique.mockResolvedValue(null);

      await expect(
        service.adminUpdateStatus('nonexistent', { status: ReportStatus.resolved }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates status and returns updated report', async () => {
      const existing = { id: 'r1', status: ReportStatus.pending };
      const updated = { id: 'r1', status: ReportStatus.resolved, createdAt: new Date() };
      mockPrisma.report.findUnique.mockResolvedValue(existing);
      mockPrisma.report.update.mockResolvedValue(updated);

      const result = await service.adminUpdateStatus('r1', {
        status: ReportStatus.resolved,
      });

      expect(mockPrisma.report.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r1' },
          data: { status: ReportStatus.resolved },
        }),
      );
      expect(result).toEqual(updated);
    });
  });
});

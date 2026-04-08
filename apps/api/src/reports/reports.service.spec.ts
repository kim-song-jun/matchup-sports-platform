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
    it('creates a report and returns selected fields', async () => {
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

      expect(mockPrisma.report.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reporterId: 'reporter-1',
            targetType: ReportTargetType.user,
            targetId: 'user-2',
            reason: 'spam',
          }),
        }),
      );
      expect(result).toEqual(expected);
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

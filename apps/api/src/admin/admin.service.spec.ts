import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AdminUserAuditAction,
  AdminUserStatus,
  MercenaryPostStatus,
  PaymentStatus,
} from '@prisma/client';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';

const prismaMock = {
  user: {
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  match: {
    count: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  lesson: {
    count: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  sportTeam: {
    count: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },
  teamMembership: {
    create: jest.fn(),
  },
  venue: {
    count: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  marketplaceListing: {
    count: jest.fn(),
  },
  payment: {
    aggregate: jest.fn(),
    findMany: jest.fn(),
  },
  report: {
    count: jest.fn(),
  },
  settlementRecord: {
    count: jest.fn(),
  },
  review: {
    findMany: jest.fn(),
  },
  adminUserAuditLog: {
    create: jest.fn(),
    count: jest.fn(),
  },
  mercenaryPost: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  matchParticipant: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn().mockImplementation((callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock)),
};

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDashboardStats', () => {
    it('returns real aggregate counters for admin dashboard', async () => {
      prismaMock.user.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(5);
      prismaMock.match.count
        .mockResolvedValueOnce(200)
        .mockResolvedValueOnce(3);
      prismaMock.lesson.count.mockResolvedValue(50);
      prismaMock.sportTeam.count
        .mockResolvedValueOnce(30)
        .mockResolvedValueOnce(12);
      prismaMock.venue.count.mockResolvedValue(20);
      prismaMock.marketplaceListing.count.mockResolvedValue(15);
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 320000 } });
      prismaMock.report.count
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1);
      prismaMock.settlementRecord.count.mockResolvedValue(4);

      const result = await service.getDashboardStats();

      expect(result).toEqual(
        expect.objectContaining({
          totalUsers: 100,
          totalMatches: 200,
          totalLessons: 50,
          totalTeams: 30,
          totalVenues: 20,
          activeListings: 15,
          todayMatches: 3,
          todayNewUsers: 5,
          activeTeams: 12,
          totalRevenue: 320000,
          pendingReports: 2,
          pendingSettlements: 4,
          todayReports: 1,
        }),
      );
    });
  });

  describe('getStatisticsOverview', () => {
    it('filters completed revenue by paidAt first with createdAt fallback', async () => {
      prismaMock.match.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prismaMock.payment.findMany.mockResolvedValue([]);
      prismaMock.user.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(9)
        .mockResolvedValueOnce(7);
      prismaMock.sportTeam.count.mockResolvedValue(12);
      prismaMock.matchParticipant.findMany.mockResolvedValue([]);

      const result = await service.getStatisticsOverview();

      expect(result.periodLabel).toBe('최근 6개월');
      expect(prismaMock.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: PaymentStatus.completed,
            OR: expect.arrayContaining([
              expect.objectContaining({
                paidAt: expect.objectContaining({
                  gte: expect.any(Date),
                  lt: expect.any(Date),
                }),
              }),
              expect.objectContaining({
                paidAt: null,
                createdAt: expect.objectContaining({
                  gte: expect.any(Date),
                  lt: expect.any(Date),
                }),
              }),
            ]),
          }),
        }),
      );
    });
  });

  describe('getUserDetail', () => {
    it('returns persisted moderation and audit metadata', async () => {
      prismaMock.user.findFirst.mockResolvedValue({
        id: 'u1',
        nickname: 'alice',
        email: 'alice@test.com',
        profileImageUrl: null,
        gender: null,
        bio: null,
        mannerScore: 4.8,
        totalMatches: 12,
        locationCity: 'Seoul',
        locationDistrict: 'Mapo',
        createdAt: new Date('2026-04-11T00:00:00Z'),
        sportTypes: ['futsal'],
        sportProfiles: [],
        oauthProvider: 'kakao',
        adminStatus: AdminUserStatus.suspended,
        adminSuspensionReason: 'abusive language',
        receivedAdminAuditLogs: [
          {
            id: 'audit-1',
            action: AdminUserAuditAction.suspend,
            actorLabel: 'admin',
            note: 'abusive language',
            createdAt: new Date('2026-04-11T01:00:00Z'),
          },
          {
            id: 'audit-2',
            action: AdminUserAuditAction.warn,
            actorLabel: 'admin',
            note: 'prior warning',
            createdAt: new Date('2026-04-10T01:00:00Z'),
          },
        ],
      });

      const result = await service.getUserDetail('u1');

      expect(result.adminStatus).toBe(AdminUserStatus.suspended);
      expect(result.suspensionReason).toBe('abusive language');
      expect(result.warningCount).toBe(1);
      expect(result.adminAuditLog).toHaveLength(2);
    });

    it('throws when user is missing', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);

      await expect(service.getUserDetail('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('moderation actions', () => {
    beforeEach(() => {
      prismaMock.user.findFirst.mockResolvedValue({ id: 'u1' });
    });

    it('creates persisted warning audit entries', async () => {
      prismaMock.adminUserAuditLog.create.mockResolvedValue({
        id: 'audit-1',
        action: AdminUserAuditAction.warn,
        actorLabel: 'admin',
        note: 'repeat no-show',
        createdAt: new Date('2026-04-11T01:00:00Z'),
      });
      prismaMock.adminUserAuditLog.count.mockResolvedValue(2);

      const result = await service.warnUser('u1', {
        actorId: 'admin-1',
        actorLabel: 'admin',
        note: 'repeat no-show',
      });

      expect(prismaMock.adminUserAuditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          actorId: 'admin-1',
          actorLabel: 'admin',
          action: AdminUserAuditAction.warn,
          note: 'repeat no-show',
        },
      });
      expect(result.warningCount).toBe(2);
      expect(result.auditEntry.action).toBe(AdminUserAuditAction.warn);
    });

    it('updates persisted user status and audit trail', async () => {
      prismaMock.user.update.mockResolvedValue({
        id: 'u1',
      });
      prismaMock.adminUserAuditLog.create.mockResolvedValue({
        id: 'audit-3',
        action: AdminUserAuditAction.suspend,
        actorLabel: 'admin',
        note: 'abusive language',
        createdAt: new Date('2026-04-11T02:00:00Z'),
      });

      const result = await service.updateUserStatus('u1', {
        actorId: 'admin-1',
        actorLabel: 'admin',
        status: AdminUserStatus.suspended,
        note: 'abusive language',
      });

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: {
          adminStatus: AdminUserStatus.suspended,
          adminSuspensionReason: 'abusive language',
        },
      });
      expect(prismaMock.adminUserAuditLog.create).toHaveBeenCalled();
      expect(result.status).toBe(AdminUserStatus.suspended);
      expect(result.suspensionReason).toBe('abusive language');
    });

    it('requires a suspension reason for suspended status', async () => {
      await expect(service.updateUserStatus('u1', {
        actorId: 'admin-1',
        actorLabel: 'admin',
        status: AdminUserStatus.suspended,
        note: '   ',
      })).rejects.toThrow(BadRequestException);

      expect(prismaMock.user.update).not.toHaveBeenCalled();
      expect(prismaMock.adminUserAuditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('getReviews', () => {
    it('maps review entities to admin rows', async () => {
      prismaMock.review.findMany.mockResolvedValue([
        {
          id: 'r1',
          matchId: 'm1',
          authorId: 'u1',
          targetId: 'u2',
          mannerRating: 4,
          skillRating: 5,
          createdAt: new Date('2026-04-11T03:00:00Z'),
          match: { id: 'm1', title: '주말 풋살' },
          author: { id: 'u1', nickname: 'alice' },
          target: { id: 'u2', nickname: 'bob' },
        },
      ]);

      const result = await service.getReviews({});

      expect(result).toEqual([
        expect.objectContaining({
          matchTitle: '주말 풋살',
          reviewerName: 'alice',
          targetName: 'bob',
          mannerRating: 4,
          skillRating: 5,
        }),
      ]);
    });
  });

  describe('getMercenaryPosts', () => {
    it('returns application counts from real mercenary posts', async () => {
      prismaMock.mercenaryPost.findMany.mockResolvedValue([
        {
          id: 'post-1',
          teamId: 'team-1',
          sportType: 'futsal',
          matchDate: new Date('2026-04-12T00:00:00Z'),
          position: 'GK',
          status: MercenaryPostStatus.open,
          createdAt: new Date('2026-04-11T04:00:00Z'),
          team: { id: 'team-1', name: 'FC MatchUp', sportType: 'futsal' },
          author: { id: 'u1', nickname: 'owner' },
          _count: { applications: 3 },
        },
      ]);

      const result = await service.getMercenaryPosts({});

      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 'post-1',
          applicationCount: 3,
          team: expect.objectContaining({ name: 'FC MatchUp' }),
        }),
      );
    });
  });

  describe('deleteVenue', () => {
    it('blocks deletion when linked data exists', async () => {
      prismaMock.venue.findUnique.mockResolvedValue({ id: 'venue-1' });
      prismaMock.match.count.mockResolvedValue(1);
      prismaMock.lesson.count.mockResolvedValue(0);

      await expect(service.deleteVenue('venue-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getPayments', () => {
    it('requests completed payment context with user and match info intact', async () => {
      prismaMock.payment.findMany.mockResolvedValue([
        {
          id: 'pay-1',
          amount: 15000,
          status: PaymentStatus.completed,
          user: { id: 'u1', nickname: 'alice', email: 'alice@test.com', profileImageUrl: null },
        },
      ]);

      const result = await service.getPayments();

      expect(result).toHaveLength(1);
      expect(result[0].user?.nickname).toBe('alice');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { MercenaryPostStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAdminService = {
  getDashboardStats: jest.fn(),
  getStatisticsOverview: jest.fn(),
  getUsers: jest.fn(),
  getUserDetail: jest.fn(),
  warnUser: jest.fn(),
  updateUserStatus: jest.fn(),
  getMatches: jest.fn(),
  updateMatchStatus: jest.fn(),
  getReviews: jest.fn(),
  getMercenaryPosts: jest.fn(),
  deleteMercenaryPost: jest.fn(),
  getLessons: jest.fn(),
  createLesson: jest.fn(),
  updateLessonStatus: jest.fn(),
  getTeams: jest.fn(),
  getTeamDetail: jest.fn(),
  createTeam: jest.fn(),
  getVenues: jest.fn(),
  getVenueDetail: jest.fn(),
  createVenue: jest.fn(),
  updateVenue: jest.fn(),
  deleteVenue: jest.fn(),
  getPayments: jest.fn(),
  // Wave 1 service pending — forceReleaseOrder added by backend-data-dev
  forceReleaseOrder: jest.fn(),
};

const adminId = 'admin-user-001';

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AdminController', () => {
  let controller: AdminController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: mockAdminService }],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── getPayments ──────────────────────────────────────────────────────────────

  describe('getPayments', () => {
    it('delegates with parsed limit when provided', async () => {
      mockAdminService.getPayments.mockResolvedValue({ data: [], nextCursor: null });

      await (controller as any).getPayments('cursor-abc', '50');

      expect(mockAdminService.getPayments).toHaveBeenCalledWith('cursor-abc', 50);
    });

    it('delegates with undefined limit when omitted', async () => {
      mockAdminService.getPayments.mockResolvedValue({ data: [], nextCursor: null });

      await (controller as any).getPayments(undefined, undefined);

      expect(mockAdminService.getPayments).toHaveBeenCalledWith(undefined, undefined);
    });

    it('delegates with undefined limit when limit is not a number', async () => {
      mockAdminService.getPayments.mockResolvedValue({ data: [], nextCursor: null });

      await (controller as any).getPayments(undefined, 'notanumber');

      expect(mockAdminService.getPayments).toHaveBeenCalledWith(undefined, undefined);
    });
  });

  // ── forceReleaseOrder ────────────────────────────────────────────────────────

  describe('forceReleaseOrder', () => {
    it('delegates to adminService.forceReleaseOrder with orderId and adminId', async () => {
      const orderId = 'order-escrow-001';
      const expected = { id: orderId, status: 'released' };
      mockAdminService.forceReleaseOrder.mockResolvedValue(expected);

      const result = await (controller as any).forceReleaseOrder(orderId, adminId);

      expect(mockAdminService.forceReleaseOrder).toHaveBeenCalledWith(orderId, adminId);
      expect(result).toEqual(expected);
    });
  });
});

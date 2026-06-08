import { Test } from '@nestjs/testing';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AdminOpsService } from './admin-ops.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

const user = {
  id: 'admin-user-1',
  email: 'admin@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

describe('AdminController', () => {
  const adminService = {
    me: jest.fn(),
    overview: jest.fn(),
    changeUserStatus: jest.fn(),
    changeMatchStatus: jest.fn(),
    changeTeamStatus: jest.fn(),
    changeTeamMatchStatus: jest.fn(),
    actionLogs: jest.fn(),
    statusChangeLogs: jest.fn(),
  };
  const adminOpsService = {
    overview: jest.fn(),
    reports: jest.fn(),
    reportDetail: jest.fn(),
    reportAction: jest.fn(),
    disputes: jest.fn(),
    disputeDetail: jest.fn(),
    disputeAction: jest.fn(),
    payments: jest.fn(),
    createPaymentOrder: jest.fn(),
    confirmPayment: jest.fn(),
    refundPayment: jest.fn(),
    settlements: jest.fn(),
    settlementDetail: jest.fn(),
    settlementAction: jest.fn(),
    requestPayout: jest.fn(),
    audit: jest.fn(),
  };

  let controller: AdminController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: adminService },
        { provide: AdminOpsService, useValue: adminOpsService },
        { provide: PrismaService, useValue: {} },
        { provide: V1AuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();
    controller = moduleRef.get(AdminController);
  });

  it('returns admin me', async () => {
    adminService.me.mockResolvedValue({ userId: 'admin-user-1', adminRole: 'owner' });
    await expect(controller.me(user)).resolves.toEqual({ userId: 'admin-user-1', adminRole: 'owner' });
  });

  it('returns admin overview', async () => {
    const query = { from: '2026-05-01', to: '2026-05-18' };
    adminService.overview.mockResolvedValue({ users: { active: 10 } });
    await expect(controller.overview(user, query)).resolves.toEqual({ users: { active: 10 } });
    expect(adminService.overview).toHaveBeenCalledWith(user, query);
  });

  it('changes user status', async () => {
    const dto = { status: 'suspended' as const, reason: '운영 정책 위반' };
    adminService.changeUserStatus.mockResolvedValue({ userId: 'user-1', status: 'suspended' });
    await expect(controller.changeUserStatus(user, 'user-1', dto)).resolves.toEqual({
      userId: 'user-1',
      status: 'suspended',
    });
  });

  it('changes match status', async () => {
    const dto = { status: 'closed' as const, reason: '모집 마감' };
    adminService.changeMatchStatus.mockResolvedValue({ matchId: 'match-1', status: 'closed' });
    await expect(controller.changeMatchStatus(user, 'match-1', dto)).resolves.toEqual({
      matchId: 'match-1',
      status: 'closed',
    });
  });

  it('changes team status', async () => {
    const dto = { status: 'archived' as const, reason: '비활성 팀 정리' };
    adminService.changeTeamStatus.mockResolvedValue({ teamId: 'team-1', status: 'archived' });
    await expect(controller.changeTeamStatus(user, 'team-1', dto)).resolves.toEqual({
      teamId: 'team-1',
      status: 'archived',
    });
  });

  it('changes team match status', async () => {
    const dto = { status: 'cancelled' as const, reason: '운영 취소' };
    adminService.changeTeamMatchStatus.mockResolvedValue({
      teamMatchId: 'team-match-1',
      status: 'cancelled',
    });
    await expect(controller.changeTeamMatchStatus(user, 'team-match-1', dto)).resolves.toEqual({
      teamMatchId: 'team-match-1',
      status: 'cancelled',
    });
  });

  it('returns admin action logs', async () => {
    const query = { targetType: 'match', limit: 10 };
    adminService.actionLogs.mockResolvedValue({ items: [], nextCursor: null });
    await expect(controller.actionLogs(user, query)).resolves.toEqual({ items: [], nextCursor: null });
  });

  it('returns status change logs', async () => {
    const query = { targetType: 'user', targetId: 'user-1' };
    adminService.statusChangeLogs.mockResolvedValue({ items: [], nextCursor: null });
    await expect(controller.statusChangeLogs(user, query)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('returns ops overview', async () => {
    adminOpsService.overview.mockResolvedValue({ queues: { openReports: 1 } });
    await expect(controller.opsOverview(user)).resolves.toEqual({ queues: { openReports: 1 } });
    expect(adminOpsService.overview).toHaveBeenCalledWith(user);
  });

  it('dispatches report actions to ops service', async () => {
    const dto = { action: 'resolve' as const, reason: '처리 완료' };
    adminOpsService.reportAction.mockResolvedValue({ report: { reportId: 'report-1', status: 'resolved' } });
    await expect(controller.reportAction(user, 'report-1', dto)).resolves.toEqual({
      report: { reportId: 'report-1', status: 'resolved' },
    });
  });

  it('dispatches payment refund actions to ops service', async () => {
    const dto = { amount: 12000, reason: '부분 환불' };
    adminOpsService.refundPayment.mockResolvedValue({ refund: { refundId: 'refund-1', status: 'completed' } });
    await expect(controller.refundPayment(user, 'payment-order-1', dto)).resolves.toEqual({
      refund: { refundId: 'refund-1', status: 'completed' },
    });
  });
});

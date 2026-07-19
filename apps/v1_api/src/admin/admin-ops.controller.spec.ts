import { Test } from '@nestjs/testing';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService } from '../common/admin-context.service';
import { AdminOpsController } from './admin-ops.controller';
import { AdminOpsService } from './admin-ops.service';

const user = {
  id: 'user-1',
  email: 'admin@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const admin = { id: 'admin-row-1', userId: 'user-1', adminRole: 'ops' as const, status: 'active' as const };

describe('AdminOpsController', () => {
  const adminOpsService = { recentPushFailures: jest.fn(), acknowledgeFailures: jest.fn() };
  const adminContext = {
    getActiveAdmin: jest.fn().mockResolvedValue(admin),
    getMutationAdmin: jest.fn().mockResolvedValue(admin),
    logAdminAction: jest.fn().mockResolvedValue({ actionLogId: 'log-1', statusChangeLogId: null }),
  };

  let controller: AdminOpsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    adminContext.getActiveAdmin.mockResolvedValue(admin);
    adminContext.getMutationAdmin.mockResolvedValue(admin);
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminOpsController],
      providers: [
        { provide: AdminOpsService, useValue: adminOpsService },
        { provide: AdminContextService, useValue: adminContext },
        { provide: PrismaService, useValue: {} },
        { provide: V1AuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();
    controller = moduleRef.get(AdminOpsController);
  });

  it('recentPushFailures gates on getActiveAdmin (read-only) and delegates to the service', async () => {
    adminOpsService.recentPushFailures.mockResolvedValue([]);

    await controller.recentPushFailures(user, { limit: 10 });

    expect(adminContext.getActiveAdmin).toHaveBeenCalledWith('user-1');
    expect(adminContext.getMutationAdmin).not.toHaveBeenCalled();
    expect(adminOpsService.recentPushFailures).toHaveBeenCalledWith(10);
  });

  it('ackPushFailures gates on getMutationAdmin (support role blocked) and records an audit log per id', async () => {
    adminOpsService.acknowledgeFailures.mockResolvedValue(undefined);

    await controller.ackPushFailures(user, { ids: ['fail-1', 'fail-2'] });

    expect(adminContext.getMutationAdmin).toHaveBeenCalledWith('user-1');
    expect(adminOpsService.acknowledgeFailures).toHaveBeenCalledWith(['fail-1', 'fail-2'], 'user-1');
    expect(adminContext.logAdminAction).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ action: 'web_push_failure_log.ack', targetType: 'web_push_failure_log', targetId: 'fail-1' }),
    );
    expect(adminContext.logAdminAction).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ action: 'web_push_failure_log.ack', targetType: 'web_push_failure_log', targetId: 'fail-2' }),
    );
  });

  it('ackPushFailures rejects before any mutation when the caller is not a mutation-eligible admin', async () => {
    adminContext.getMutationAdmin.mockRejectedValue(new Error('Support admins cannot mutate'));

    await expect(controller.ackPushFailures(user, { ids: ['fail-1'] })).rejects.toThrow('Support admins cannot mutate');

    expect(adminOpsService.acknowledgeFailures).not.toHaveBeenCalled();
    expect(adminContext.logAdminAction).not.toHaveBeenCalled();
  });
});

import { Test } from '@nestjs/testing';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService } from '../common/admin-context.service';
import { AdminMonitoringController } from './admin-monitoring.controller';
import { AdminOpsService } from './admin-ops.service';

const user = {
  id: 'user-1',
  email: 'admin@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const admin = { id: 'admin-row-1', userId: 'user-1', adminRole: 'ops' as const, status: 'active' as const };

describe('AdminMonitoringController', () => {
  const adminOpsService = { monitoringSummary: jest.fn() };
  const adminContext = { getActiveAdmin: jest.fn() };

  let controller: AdminMonitoringController;

  beforeEach(async () => {
    jest.clearAllMocks();
    adminContext.getActiveAdmin.mockResolvedValue(admin);
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminMonitoringController],
      providers: [
        { provide: AdminOpsService, useValue: adminOpsService },
        { provide: AdminContextService, useValue: adminContext },
        { provide: PrismaService, useValue: {} },
        { provide: V1AuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();
    controller = moduleRef.get(AdminMonitoringController);
  });

  it('summary gates on getActiveAdmin (read-only) and delegates to the service', async () => {
    adminOpsService.monitoringSummary.mockResolvedValue({
      errorsLast24h: 1,
      pushUnacked: 2,
      smsUnacked: 3,
      auditToday: 4,
    });

    const result = await controller.summary(user);

    expect(adminContext.getActiveAdmin).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ errorsLast24h: 1, pushUnacked: 2, smsUnacked: 3, auditToday: 4 });
  });

  it('summary rejects before any aggregation when the caller is not an active admin', async () => {
    adminContext.getActiveAdmin.mockRejectedValue(new Error('Not an admin'));

    await expect(controller.summary(user)).rejects.toThrow('Not an admin');

    expect(adminOpsService.monitoringSummary).not.toHaveBeenCalled();
  });
});

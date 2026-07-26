import { Test } from '@nestjs/testing';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService } from '../common/admin-context.service';
import { AdminErrorLogController } from './admin-error-log.controller';
import { ErrorLogService } from './error-log.service';

const user = {
  id: 'user-1',
  email: 'admin@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const admin = { id: 'admin-row-1', userId: 'user-1', adminRole: 'ops' as const, status: 'active' as const };

describe('AdminErrorLogController', () => {
  const errorLogService = { list: jest.fn(), findById: jest.fn() };
  const adminContext = { getActiveAdmin: jest.fn().mockResolvedValue(admin) };

  let controller: AdminErrorLogController;

  beforeEach(async () => {
    jest.clearAllMocks();
    adminContext.getActiveAdmin.mockResolvedValue(admin);
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminErrorLogController],
      providers: [
        { provide: ErrorLogService, useValue: errorLogService },
        { provide: AdminContextService, useValue: adminContext },
        { provide: PrismaService, useValue: {} },
        { provide: V1AuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();
    controller = moduleRef.get(AdminErrorLogController);
  });

  it('list() gates on getActiveAdmin and forwards the filter query untouched to the service', async () => {
    const query = { source: 'server' as const, statusCode: 500, level: 'error' as const, q: 'boom', cursor: 'c1', limit: 10 };
    errorLogService.list.mockResolvedValue({ items: [], pageInfo: { nextCursor: null, hasNext: false } });

    const result = await controller.list(user, query);

    expect(adminContext.getActiveAdmin).toHaveBeenCalledWith('user-1');
    expect(errorLogService.list).toHaveBeenCalledWith(query);
    expect(result).toEqual({ items: [], pageInfo: { nextCursor: null, hasNext: false } });
  });

  it('list() rejects before hitting the service when the caller is not an active admin', async () => {
    adminContext.getActiveAdmin.mockRejectedValue(new Error('PERMISSION_DENIED'));

    await expect(controller.list(user, {})).rejects.toThrow('PERMISSION_DENIED');
    expect(errorLogService.list).not.toHaveBeenCalled();
  });

  it('detail() gates on getActiveAdmin and returns the full record including stack/request/response', async () => {
    const detail = {
      id: 'err-1',
      source: 'server',
      level: 'error',
      statusCode: 500,
      errorCode: null,
      method: 'GET',
      route: '/x',
      message: 'boom',
      occurrenceCount: 3,
      releaseSha: null,
      firstSeenAt: new Date('2026-01-01T00:00:00Z'),
      lastSeenAt: new Date('2026-01-01T01:00:00Z'),
      stack: 'Error: boom\n  at foo',
      requestBody: { a: 1 },
      requestHeaders: { authorization: '[REDACTED]' },
      responseBody: { code: 'INTERNAL_ERROR' },
      context: null,
      userId: null,
      userAgent: 'jest',
    };
    errorLogService.findById.mockResolvedValue(detail);

    const result = await controller.detail(user, 'err-1');

    expect(adminContext.getActiveAdmin).toHaveBeenCalledWith('user-1');
    expect(errorLogService.findById).toHaveBeenCalledWith('err-1');
    expect(result).toEqual(detail);
    expect(result.stack).toContain('boom');
  });
});

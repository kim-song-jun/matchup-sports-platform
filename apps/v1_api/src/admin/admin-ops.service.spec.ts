import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService } from '../common/admin-context.service';
import { AdminOpsService } from './admin-ops.service';
import { createHash } from 'node:crypto';

const admin = { id: 'admin-row-1', userId: 'admin-user-1', adminRole: 'ops' as const, status: 'active' as const };

describe('AdminOpsService', () => {
  let service: AdminOpsService;
  const prisma = {
    v1WebPushFailureLog: { findMany: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const adminContext = { logAdminAction: jest.fn().mockResolvedValue({ actionLogId: 'log-1', statusChangeLogId: null }) };

  beforeEach(async () => {
    jest.clearAllMocks();
    // $transaction executes the callback with a tx proxy delegating back to the
    // same mock model object so individual model-mock assertions still work.
    prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma));
    adminContext.logAdminAction.mockResolvedValue({ actionLogId: 'log-1', statusChangeLogId: null });
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminOpsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminContextService, useValue: adminContext },
      ],
    }).compile();
    service = moduleRef.get(AdminOpsService);
  });

  it('masks the userId as a sha256 8-char hash and keeps only the last 6 chars of the endpoint suffix', async () => {
    prisma.v1WebPushFailureLog.findMany.mockResolvedValue([
      {
        id: 'fail-1',
        userId: 'user-1',
        endpointSuffix: 'abcdefghijkl',
        statusCode: 500,
        occurredAt: new Date('2026-07-19T00:00:00Z'),
        acknowledgedAt: null,
      },
    ]);

    const result = await service.recentPushFailures(20);

    const expectedHash = createHash('sha256').update('user-1').digest('hex').slice(0, 8);
    expect(result[0].userIdHash).toBe(expectedHash);
    expect(result[0].endpointSuffix).toBe('ghijkl');
    expect(result[0]).not.toHaveProperty('userId');
  });

  it('ack records acknowledgedAt/acknowledgedBy in one bulk update and an audit log per id, inside one transaction', async () => {
    prisma.v1WebPushFailureLog.findMany.mockResolvedValue([{ id: 'fail-1' }, { id: 'fail-2' }]);

    await service.acknowledgeFailures(['fail-1', 'fail-2'], admin);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.v1WebPushFailureLog.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['fail-1', 'fail-2'] }, acknowledgedAt: null },
      select: { id: true },
    });
    expect(prisma.v1WebPushFailureLog.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['fail-1', 'fail-2'] } },
      data: expect.objectContaining({ acknowledgedBy: 'admin-user-1' }),
    });
    expect(adminContext.logAdminAction).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ action: 'web_push_failure_log.ack', targetType: 'web_push_failure_log', targetId: 'fail-1' }),
      prisma,
    );
    expect(adminContext.logAdminAction).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ action: 'web_push_failure_log.ack', targetType: 'web_push_failure_log', targetId: 'fail-2' }),
      prisma,
    );
  });

  it('only updates and logs the ids that were actually still unacknowledged, skipping the rest silently', async () => {
    // Caller asked to ack 3 ids, but only 'fail-2' is still unacknowledged
    // (fail-1 was already acked, fail-3 doesn't exist / belongs to someone else's batch).
    prisma.v1WebPushFailureLog.findMany.mockResolvedValue([{ id: 'fail-2' }]);

    await service.acknowledgeFailures(['fail-1', 'fail-2', 'fail-3'], admin);

    expect(prisma.v1WebPushFailureLog.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['fail-2'] } },
      data: expect.objectContaining({ acknowledgedBy: 'admin-user-1' }),
    });
    expect(adminContext.logAdminAction).toHaveBeenCalledTimes(1);
    expect(adminContext.logAdminAction).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ targetId: 'fail-2' }),
      prisma,
    );
  });

  it('does nothing (no update, no audit log) when every id is already acknowledged', async () => {
    prisma.v1WebPushFailureLog.findMany.mockResolvedValue([]);

    await service.acknowledgeFailures(['fail-1'], admin);

    expect(prisma.v1WebPushFailureLog.updateMany).not.toHaveBeenCalled();
    expect(adminContext.logAdminAction).not.toHaveBeenCalled();
  });

  it('rolls back the update when an audit log write fails, instead of leaving a partial commit', async () => {
    prisma.v1WebPushFailureLog.findMany.mockResolvedValue([{ id: 'fail-1' }]);
    adminContext.logAdminAction.mockRejectedValueOnce(new Error('audit log write failed'));
    prisma.$transaction.mockImplementation(async (cb: (tx: typeof prisma) => Promise<unknown>) => {
      try {
        return await cb(prisma);
      } catch (error) {
        // Mirrors real Prisma interactive-transaction behavior: a thrown error
        // inside the callback rejects $transaction itself (rollback).
        throw error;
      }
    });

    await expect(service.acknowledgeFailures(['fail-1'], admin)).rejects.toThrow('audit log write failed');
  });
});

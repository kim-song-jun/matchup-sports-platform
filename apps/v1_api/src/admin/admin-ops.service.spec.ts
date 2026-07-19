import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService } from '../common/admin-context.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WebPushService } from '../notifications/web-push.service';
import { AdminOpsService } from './admin-ops.service';
import { createHash } from 'node:crypto';

const admin = { id: 'admin-row-1', userId: 'admin-user-1', adminRole: 'ops' as const, status: 'active' as const };

describe('AdminOpsService', () => {
  let service: AdminOpsService;
  const prisma = {
    v1WebPushFailureLog: { findMany: jest.fn(), updateMany: jest.fn() },
    v1User: { findUnique: jest.fn() },
    v1PushSubscription: { findMany: jest.fn() },
    v1NotificationPreference: { findUnique: jest.fn() },
    v1Notification: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const adminContext = { logAdminAction: jest.fn().mockResolvedValue({ actionLogId: 'log-1', statusChangeLogId: null }) };
  const realtimeGateway = { emitToUser: jest.fn() };
  const webPushService = { sendToUser: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    // $transaction executes the callback with a tx proxy delegating back to the
    // same mock model object so individual model-mock assertions still work.
    prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma));
    adminContext.logAdminAction.mockResolvedValue({ actionLogId: 'log-1', statusChangeLogId: null });
    webPushService.sendToUser.mockResolvedValue(undefined);
    prisma.v1Notification.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'notif-1', ...data }),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminOpsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminContextService, useValue: adminContext },
        { provide: RealtimeGateway, useValue: realtimeGateway },
        { provide: WebPushService, useValue: webPushService },
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

  describe('sendManualPush', () => {
    it('sends to a single user: creates the notification, emits realtime, sends the push, and audit-logs the userId as targetId', async () => {
      prisma.v1User.findUnique.mockResolvedValue({ id: 'user-1' });
      prisma.v1NotificationPreference.findUnique.mockResolvedValue({ noticeEnabled: true });

      const result = await service.sendManualPush(
        { target: 'user', userId: 'user-1', title: '점검 안내', body: '내일 새벽 점검이 있어요.', url: '/notices/1' },
        admin,
      );

      expect(result).toEqual({ sent: 1, skipped: 0, failed: 0 });
      expect(prisma.v1Notification.create).toHaveBeenCalledWith({
        data: {
          recipientUserId: 'user-1',
          targetType: 'notice',
          targetId: null,
          title: '점검 안내',
          body: '내일 새벽 점검이 있어요.',
          deepLink: '/notices/1',
        },
      });
      expect(realtimeGateway.emitToUser).toHaveBeenCalledWith(
        'user-1',
        'notification:new',
        expect.objectContaining({ recipientUserId: 'user-1' }),
      );
      expect(webPushService.sendToUser).toHaveBeenCalledWith('user-1', {
        title: '점검 안내',
        body: '내일 새벽 점검이 있어요.',
        url: '/notices/1',
      });
      expect(adminContext.logAdminAction).toHaveBeenCalledWith(
        admin,
        expect.objectContaining({ action: 'push.manual_send', targetType: 'push', targetId: 'user-1' }),
      );
    });

    it('throws 404 for a non-existent userId target and never creates a notification', async () => {
      prisma.v1User.findUnique.mockResolvedValue(null);

      await expect(
        service.sendManualPush({ target: 'user', userId: 'missing-user', title: 'hi' }, admin),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.v1Notification.create).not.toHaveBeenCalled();
      expect(adminContext.logAdminAction).not.toHaveBeenCalled();
    });

    it('skips a single user whose noticeEnabled preference is off, without creating a notification', async () => {
      prisma.v1User.findUnique.mockResolvedValue({ id: 'user-1' });
      prisma.v1NotificationPreference.findUnique.mockResolvedValue({ noticeEnabled: false });

      const result = await service.sendManualPush({ target: 'user', userId: 'user-1', title: 'hi' }, admin);

      expect(result).toEqual({ sent: 0, skipped: 1, failed: 0 });
      expect(prisma.v1Notification.create).not.toHaveBeenCalled();
    });

    it('treats a missing preference row as enabled by default (matches notifications.service.ts convention)', async () => {
      prisma.v1User.findUnique.mockResolvedValue({ id: 'user-1' });
      prisma.v1NotificationPreference.findUnique.mockResolvedValue(null);

      const result = await service.sendManualPush({ target: 'user', userId: 'user-1', title: 'hi' }, admin);

      expect(result).toEqual({ sent: 1, skipped: 0, failed: 0 });
    });

    it('broadcasts to every distinct push subscriber via cursor pagination, skipping those with noticeEnabled off, and audit-logs targetId "broadcast"', async () => {
      // Page has only 3 rows (< BROADCAST_CHUNK_SIZE), so the loop makes exactly
      // one findMany call and stops — no second page mock needed.
      prisma.v1PushSubscription.findMany.mockResolvedValueOnce([
        { id: 'sub-1', userId: 'user-1' },
        { id: 'sub-2', userId: 'user-2' },
        { id: 'sub-3', userId: 'user-3' },
      ]);
      prisma.v1NotificationPreference.findUnique.mockImplementation(({ where }: { where: { userId: string } }) =>
        Promise.resolve(where.userId === 'user-2' ? { noticeEnabled: false } : { noticeEnabled: true }),
      );

      const result = await service.sendManualPush({ target: 'broadcast', title: '전체 공지' }, admin);

      expect(prisma.v1PushSubscription.findMany).toHaveBeenNthCalledWith(1, {
        take: 30,
        orderBy: { id: 'asc' },
        select: { id: true, userId: true },
      });
      expect(result).toEqual({ sent: 2, skipped: 1, failed: 0 });
      expect(prisma.v1Notification.create).toHaveBeenCalledTimes(2);
      expect(adminContext.logAdminAction).toHaveBeenCalledWith(
        admin,
        expect.objectContaining({ targetId: 'broadcast', afterJson: expect.objectContaining({ target: 'broadcast' }) }),
      );
    });

    it('pages through multiple chunks of subscribers using an id cursor instead of loading them all at once', async () => {
      const page1 = Array.from({ length: 30 }, (_, i) => ({ id: `sub-${i}`, userId: `user-${i}` }));
      const page2 = [{ id: 'sub-30', userId: 'user-30' }];
      prisma.v1PushSubscription.findMany.mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);
      prisma.v1NotificationPreference.findUnique.mockResolvedValue({ noticeEnabled: true });

      const result = await service.sendManualPush({ target: 'broadcast', title: '전체 공지' }, admin);

      expect(result).toEqual({ sent: 31, skipped: 0, failed: 0 });
      expect(prisma.v1PushSubscription.findMany).toHaveBeenNthCalledWith(2, {
        take: 30,
        skip: 1,
        cursor: { id: 'sub-29' },
        orderBy: { id: 'asc' },
        select: { id: true, userId: true },
      });
    });

    it('isolates a per-recipient failure during broadcast so the rest still send', async () => {
      // Page has only 2 rows (< BROADCAST_CHUNK_SIZE), so the loop makes exactly
      // one findMany call and stops — no second page mock needed.
      prisma.v1PushSubscription.findMany.mockResolvedValueOnce([
        { id: 'sub-1', userId: 'user-1' },
        { id: 'sub-2', userId: 'user-2' },
      ]);
      prisma.v1NotificationPreference.findUnique.mockResolvedValue({ noticeEnabled: true });
      prisma.v1Notification.create
        .mockRejectedValueOnce(new Error('db write failed'))
        .mockImplementationOnce(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'notif-2', ...data }),
        );

      const result = await service.sendManualPush({ target: 'broadcast', title: '전체 공지' }, admin);

      expect(result).toEqual({ sent: 1, skipped: 0, failed: 1 });
    });

    it('does not fail the whole request when the audit log write fails after a successful send', async () => {
      prisma.v1User.findUnique.mockResolvedValue({ id: 'user-1' });
      prisma.v1NotificationPreference.findUnique.mockResolvedValue({ noticeEnabled: true });
      adminContext.logAdminAction.mockRejectedValueOnce(new Error('audit log write failed'));

      const result = await service.sendManualPush({ target: 'user', userId: 'user-1', title: 'hi' }, admin);

      // The push was already sent — a failed audit log must not turn this into
      // an error response, or an operator could retry and duplicate-send.
      expect(result).toEqual({ sent: 1, skipped: 0, failed: 0 });
    });
  });
});

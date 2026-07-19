/**
 * admin.service.spec.ts
 *
 * Contract test for the realtime side-effect of AdminService.changeUserStatus():
 * transitioning a user to a disable-class accountStatus (suspended/blocked/deleted)
 * must force-disconnect any realtime socket that user already holds, so an
 * already-connected client can't keep receiving notifications/chat past the
 * status change. Reverting to `active` must not touch realtime at all.
 *
 * Each test validates observable behaviour (RealtimeGateway call args, or the
 * resolved changeUserStatus result). No mock is asserted for its own sake.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getLoggerToken } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AdminService } from './admin.service';

const actorAuthUser = {
  id: 'ops-user-id',
  email: 'ops@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const actorAdminRecord = {
  id: 'ops-admin-record-id',
  userId: 'ops-user-id',
  adminRole: 'ops' as const,
  status: 'active' as const,
  user: { accountStatus: 'active' as const },
};

const targetUserId = 'target-user-id';

describe('AdminService.changeUserStatus — realtime disconnect side effect', () => {
  let service: AdminService;
  let prisma: {
    v1AdminUser: { findUnique: jest.Mock };
    v1User: { findUnique: jest.Mock; update: jest.Mock };
    v1AdminActionLog: { create: jest.Mock };
    v1StatusChangeLog: { create: jest.Mock };
    v1AuthIdentity: { findMany: jest.Mock; update: jest.Mock };
    v1UserProfile: { updateMany: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let realtimeGateway: { forceDisconnectUser: jest.Mock };
  let logger: { warn: jest.Mock };

  function targetUser(accountStatus: string) {
    return { id: targetUserId, accountStatus, deletedAt: null };
  }

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1User: { findUnique: jest.fn(), update: jest.fn() },
      v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'action-log-1' }) },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'status-log-1' }) },
      v1AuthIdentity: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      v1UserProfile: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };

    const p = prisma;
    prisma.$transaction.mockImplementation(
      (
        cb: (
          tx: Pick<
            typeof p,
            'v1AdminUser' | 'v1User' | 'v1AdminActionLog' | 'v1StatusChangeLog' | 'v1AuthIdentity' | 'v1UserProfile' | '$queryRaw'
          >,
        ) => Promise<unknown>,
      ) =>
        cb({
          v1AdminUser: p.v1AdminUser,
          v1User: p.v1User,
          v1AdminActionLog: p.v1AdminActionLog,
          v1StatusChangeLog: p.v1StatusChangeLog,
          v1AuthIdentity: p.v1AuthIdentity,
          v1UserProfile: p.v1UserProfile,
          $queryRaw: p.$queryRaw,
        }),
    );

    realtimeGateway = { forceDisconnectUser: jest.fn() };
    logger = { warn: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: RealtimeGateway, useValue: realtimeGateway },
        { provide: getLoggerToken(AdminService.name), useValue: logger },
      ],
    }).compile();

    service = module.get(AdminService);
  });

  afterEach(() => jest.clearAllMocks());

  it('suspending a user force-disconnects that user’s realtime socket after the transaction commits', async () => {
    prisma.v1AdminUser.findUnique
      .mockResolvedValueOnce(actorAdminRecord) // getTransactionMutationAdmin
      .mockResolvedValueOnce(null); // targetAdminRecord — not an admin
    prisma.v1User.findUnique.mockResolvedValue(targetUser('active'));
    prisma.v1User.update.mockResolvedValue(targetUser('suspended'));

    const result = await service.changeUserStatus(actorAuthUser, targetUserId, {
      status: 'suspended',
      reason: '규정 위반',
    });

    expect(result).toMatchObject({ userId: targetUserId, status: 'suspended' });
    expect(realtimeGateway.forceDisconnectUser).toHaveBeenCalledTimes(1);
    expect(realtimeGateway.forceDisconnectUser).toHaveBeenCalledWith(targetUserId);
  });

  it('blocking a user also force-disconnects the realtime socket', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValueOnce(actorAdminRecord).mockResolvedValueOnce(null);
    prisma.v1User.findUnique.mockResolvedValue(targetUser('active'));
    prisma.v1User.update.mockResolvedValue(targetUser('blocked'));

    await service.changeUserStatus(actorAuthUser, targetUserId, { status: 'blocked', reason: '신고 누적' });

    expect(realtimeGateway.forceDisconnectUser).toHaveBeenCalledWith(targetUserId);
  });

  it('deleting a user (via status change) also force-disconnects the realtime socket', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValueOnce(actorAdminRecord).mockResolvedValueOnce(null);
    prisma.v1User.findUnique.mockResolvedValue(targetUser('active'));
    prisma.v1User.update.mockResolvedValue(targetUser('deleted'));

    await service.changeUserStatus(actorAuthUser, targetUserId, { status: 'deleted', reason: '탈퇴 처리' });

    expect(realtimeGateway.forceDisconnectUser).toHaveBeenCalledWith(targetUserId);
  });

  it('restoring a user to active does NOT force-disconnect any realtime socket', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValueOnce(actorAdminRecord).mockResolvedValueOnce(null);
    prisma.v1User.findUnique.mockResolvedValue(targetUser('suspended'));
    prisma.v1User.update.mockResolvedValue(targetUser('active'));

    const result = await service.changeUserStatus(actorAuthUser, targetUserId, {
      status: 'active',
      reason: '이의 제기 수용',
    });

    expect(result).toMatchObject({ userId: targetUserId, status: 'active' });
    expect(realtimeGateway.forceDisconnectUser).not.toHaveBeenCalled();
  });

  it('a realtime gateway failure is swallowed with a structured warn log and does not fail the status change', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValueOnce(actorAdminRecord).mockResolvedValueOnce(null);
    prisma.v1User.findUnique.mockResolvedValue(targetUser('active'));
    prisma.v1User.update.mockResolvedValue(targetUser('suspended'));
    const gatewayError = new Error('socket.io server unavailable');
    realtimeGateway.forceDisconnectUser.mockImplementation(() => {
      throw gatewayError;
    });

    await expect(
      service.changeUserStatus(actorAuthUser, targetUserId, { status: 'suspended', reason: '규정 위반' }),
    ).resolves.toMatchObject({ userId: targetUserId, status: 'suspended' });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: targetUserId, status: 'suspended', err: gatewayError }),
      expect.any(String),
    );
  });
});

describe('AdminService.deleteUser — realtime disconnect side effect', () => {
  // deleteUser() is a separate mutation path from changeUserStatus() (a distinct
  // controller endpoint) that also lands on the disable-class accountStatus
  // ('deleted') — a Copilot review on PR #98 caught that the force-disconnect
  // fix above was applied to changeUserStatus() but not here, so a deleted
  // account kept receiving realtime notifications/chat until it reconnected.
  let service: AdminService;
  let prisma: {
    v1AdminUser: { findUnique: jest.Mock };
    v1User: { findUnique: jest.Mock; update: jest.Mock };
    v1AdminActionLog: { create: jest.Mock };
    v1StatusChangeLog: { create: jest.Mock };
    v1AuthIdentity: { findMany: jest.Mock; update: jest.Mock };
    v1UserProfile: { updateMany: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let realtimeGateway: { forceDisconnectUser: jest.Mock };
  let logger: { warn: jest.Mock };

  function targetUser(accountStatus: string) {
    return { id: targetUserId, accountStatus, email: 'target@teameet.v1', phone: null, deletedAt: null };
  }

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1User: { findUnique: jest.fn(), update: jest.fn() },
      v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'action-log-1' }) },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'status-log-1' }) },
      v1AuthIdentity: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      v1UserProfile: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };

    const p = prisma;
    prisma.$transaction.mockImplementation(
      (
        cb: (
          tx: Pick<
            typeof p,
            'v1AdminUser' | 'v1User' | 'v1AdminActionLog' | 'v1StatusChangeLog' | 'v1AuthIdentity' | 'v1UserProfile' | '$queryRaw'
          >,
        ) => Promise<unknown>,
      ) =>
        cb({
          v1AdminUser: p.v1AdminUser,
          v1User: p.v1User,
          v1AdminActionLog: p.v1AdminActionLog,
          v1StatusChangeLog: p.v1StatusChangeLog,
          v1AuthIdentity: p.v1AuthIdentity,
          v1UserProfile: p.v1UserProfile,
          $queryRaw: p.$queryRaw,
        }),
    );

    realtimeGateway = { forceDisconnectUser: jest.fn() };
    logger = { warn: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: RealtimeGateway, useValue: realtimeGateway },
        { provide: getLoggerToken(AdminService.name), useValue: logger },
      ],
    }).compile();

    service = module.get(AdminService);
  });

  afterEach(() => jest.clearAllMocks());

  it('deleting a user via deleteUser() force-disconnects that user’s realtime socket after the transaction commits', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValueOnce(actorAdminRecord).mockResolvedValueOnce(null);
    prisma.v1User.findUnique.mockResolvedValue(targetUser('active'));
    prisma.v1User.update.mockResolvedValue(targetUser('deleted'));

    const result = await service.deleteUser(actorAuthUser, targetUserId, { reason: '이용약관 위반' });

    expect(result).toMatchObject({ userId: targetUserId, status: 'deleted' });
    expect(realtimeGateway.forceDisconnectUser).toHaveBeenCalledTimes(1);
    expect(realtimeGateway.forceDisconnectUser).toHaveBeenCalledWith(targetUserId);
  });

  it('a realtime gateway failure during deleteUser() is swallowed with a structured warn log and does not fail the deletion', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValueOnce(actorAdminRecord).mockResolvedValueOnce(null);
    prisma.v1User.findUnique.mockResolvedValue(targetUser('active'));
    prisma.v1User.update.mockResolvedValue(targetUser('deleted'));
    const gatewayError = new Error('socket.io server unavailable');
    realtimeGateway.forceDisconnectUser.mockImplementation(() => {
      throw gatewayError;
    });

    await expect(
      service.deleteUser(actorAuthUser, targetUserId, { reason: '이용약관 위반' }),
    ).resolves.toMatchObject({ userId: targetUserId, status: 'deleted' });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: targetUserId, err: gatewayError }),
      expect.any(String),
    );
  });
});

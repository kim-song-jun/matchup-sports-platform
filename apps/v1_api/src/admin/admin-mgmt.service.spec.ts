/**
 * admin-mgmt.service.spec.ts
 *
 * Contract tests for the three owner-only admin-management endpoints:
 *   listAdmins, grantAdmin, updateAdmin
 *
 * Each test validates observable behaviour (returned data shape or thrown error).
 * No mock is asserted for its own sake.
 */

import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const ownerAuthUser = {
  id: 'owner-user-id',
  email: 'admin@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const opsAuthUser = {
  id: 'ops-user-id',
  email: 'ops@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const supportAuthUser = {
  id: 'support-user-id',
  email: 'support@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const ownerAdminRecord = {
  id: 'owner-admin-record-id',
  userId: 'owner-user-id',
  adminRole: 'owner' as const,
  status: 'active' as const,
  grantedByAdminUserId: null,
  grantedAt: new Date('2026-01-01T00:00:00.000Z'),
  revokedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const opsAdminRecord = {
  id: 'ops-admin-record-id',
  userId: 'ops-user-id',
  adminRole: 'ops' as const,
  status: 'active' as const,
  grantedByAdminUserId: 'owner-user-id',
  grantedAt: new Date('2026-01-15T00:00:00.000Z'),
  revokedAt: null,
  createdAt: new Date('2026-01-15T00:00:00.000Z'),
  updatedAt: new Date('2026-01-15T00:00:00.000Z'),
};

const supportAdminRecord = {
  id: 'support-admin-record-id',
  userId: 'support-user-id',
  adminRole: 'support' as const,
  status: 'active' as const,
  grantedByAdminUserId: 'owner-user-id',
  grantedAt: new Date('2026-01-20T00:00:00.000Z'),
  revokedAt: null,
  createdAt: new Date('2026-01-20T00:00:00.000Z'),
  updatedAt: new Date('2026-01-20T00:00:00.000Z'),
};

function withUser(
  record: typeof opsAdminRecord | typeof ownerAdminRecord,
  email = 'ops@teameet.v1',
  nickname = '운영자',
) {
  return {
    ...record,
    user: {
      email,
      profile: { nickname, displayName: nickname },
    },
  };
}

// ─── Test setup ───────────────────────────────────────────────────────────────

describe('AdminService — admin-management (owner-only)', () => {
  let service: AdminService;
  let prisma: {
    v1AdminUser: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    v1User: { findUnique: jest.Mock };
    v1AdminActionLog: { create: jest.Mock };
    v1Match: { findMany: jest.Mock; findUnique: jest.Mock };
    v1Team: { findMany: jest.Mock; findUnique: jest.Mock };
    v1TeamMatch: { findMany: jest.Mock; findUnique: jest.Mock };
    v1StatusChangeLog: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      v1AdminUser: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      v1User: { findUnique: jest.fn() },
      v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
      v1Match: { findMany: jest.fn(), findUnique: jest.fn() },
      v1Team: { findMany: jest.fn(), findUnique: jest.fn() },
      v1TeamMatch: { findMany: jest.fn(), findUnique: jest.fn() },
      v1StatusChangeLog: { findMany: jest.fn() },
      $transaction: jest.fn(),
    };

    // $transaction executes the callback with a tx proxy that delegates back to
    // the same mock model objects so individual model mock assertions still work.
    const p = prisma;
    (prisma.$transaction as jest.Mock).mockImplementation(
      (cb: (tx: Pick<typeof p, 'v1AdminUser' | 'v1AdminActionLog'>) => Promise<unknown>) =>
        cb({ v1AdminUser: p.v1AdminUser, v1AdminActionLog: p.v1AdminActionLog }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AdminService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Owner guard (getOwnerAdmin) ─────────────────────────────────────────

  describe('owner guard rejects non-owner callers', () => {
    it('listAdmins: ops admin → 403 PERMISSION_DENIED', async () => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
      await expect(service.listAdmins(opsAuthUser, {})).rejects.toThrow(ForbiddenException);
      await expect(service.listAdmins(opsAuthUser, {})).rejects.toMatchObject({
        response: { code: 'PERMISSION_DENIED' },
      });
    });

    it('listAdmins: support admin → 403 PERMISSION_DENIED', async () => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);
      await expect(service.listAdmins(supportAuthUser, {})).rejects.toThrow(ForbiddenException);
    });

    it('listAdmins: non-admin → 403 PERMISSION_DENIED', async () => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(null);
      await expect(
        service.listAdmins(
          { id: 'random-id', email: 'x@y.com', accountStatus: 'active', onboardingStatus: 'completed' },
          {},
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('grantAdmin: ops admin → 403', async () => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
      await expect(
        service.grantAdmin(opsAuthUser, { userId: 'u-new', adminRole: 'support', reason: 'test' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('updateAdmin: support admin → 403', async () => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);
      await expect(
        service.updateAdmin(supportAuthUser, 'u-ops', { reason: 'test' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── listAdmins ──────────────────────────────────────────────────────────

  describe('listAdmins', () => {
    it('returns items with correct row shape', async () => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
      prisma.v1AdminUser.findMany.mockResolvedValue([withUser(opsAdminRecord)]);

      const result = await service.listAdmins(ownerAuthUser, {});

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        adminUserId: 'ops-admin-record-id',
        userId: 'ops-user-id',
        nickname: '운영자',
        displayName: '운영자',
        email: 'ops@teameet.v1',
        adminRole: 'ops',
        status: 'active',
        grantedByAdminUserId: 'owner-user-id',
        revokedAt: null,
      });
      expect(result.pageInfo).toEqual({ nextCursor: null, hasNext: false });
    });

    it('passes status filter to Prisma where', async () => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
      prisma.v1AdminUser.findMany.mockResolvedValue([]);
      await service.listAdmins(ownerAuthUser, { status: 'revoked' });

      const call = prisma.v1AdminUser.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where).toMatchObject({ status: 'revoked' });
    });

    it('returns hasNext=true and nextCursor when rows exceed limit', async () => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
      const rows = Array.from({ length: 6 }, (_, i) =>
        withUser({ ...opsAdminRecord, id: `au-${i + 1}` }),
      );
      prisma.v1AdminUser.findMany.mockResolvedValue(rows);

      const result = await service.listAdmins(ownerAuthUser, { limit: 5 });

      expect(result.pageInfo.hasNext).toBe(true);
      expect(result.pageInfo.nextCursor).toBe('au-5');
      expect(result.items).toHaveLength(5);
    });

    it('passes cursor to Prisma when provided', async () => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
      prisma.v1AdminUser.findMany.mockResolvedValue([]);
      await service.listAdmins(ownerAuthUser, { cursor: 'some-cursor-id' });

      const call = prisma.v1AdminUser.findMany.mock.calls[0][0] as Record<string, unknown>;
      expect(call).toMatchObject({ cursor: { id: 'some-cursor-id' }, skip: 1 });
    });
  });

  // ─── grantAdmin ──────────────────────────────────────────────────────────

  describe('grantAdmin', () => {
    it('creates a new admin row and returns correct shape', async () => {
      // owner auth check
      prisma.v1AdminUser.findUnique
        .mockResolvedValueOnce(ownerAdminRecord) // getOwnerAdmin
        .mockResolvedValueOnce(null); // existing admin check → no row
      prisma.v1User.findUnique.mockResolvedValue({ id: 'u-new', email: 'new@teameet.v1' });

      const created = { ...opsAdminRecord, id: 'au-new', userId: 'u-new' };
      prisma.v1AdminUser.create.mockResolvedValue(created);
      prisma.v1AdminUser.findUniqueOrThrow.mockResolvedValue(
        withUser({ ...created }, 'new@teameet.v1', '신규'),
      );

      const result = await service.grantAdmin(ownerAuthUser, {
        userId: 'u-new',
        adminRole: 'ops',
        reason: '운영팀 합류',
      });

      expect(result.adminUserId).toBe('au-new');
      expect(result.adminRole).toBe('ops');
      expect(result.status).toBe('active');
      expect(prisma.v1AdminUser.create).toHaveBeenCalledTimes(1);
      expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'admin.grant',
            targetType: 'admin',
            targetId: 'u-new',
          }),
        }),
      );
    });

    it('returns 404 NOT_FOUND when target user does not exist', async () => {
      // grantAdmin: findUnique(owner check) → ownerAdminRecord, then v1User.findUnique → null → throws
      // The existing admin findUnique is never reached when user is missing.
      prisma.v1AdminUser.findUnique
        .mockResolvedValueOnce(ownerAdminRecord) // getOwnerAdmin (1st call)
        .mockResolvedValueOnce(ownerAdminRecord); // getOwnerAdmin (2nd call)
      prisma.v1User.findUnique.mockResolvedValue(null); // target user missing

      await expect(
        service.grantAdmin(ownerAuthUser, { userId: 'u-ghost', adminRole: 'ops', reason: 'test' }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.grantAdmin(ownerAuthUser, { userId: 'u-ghost', adminRole: 'ops', reason: 'test' }),
      ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    });

    it('returns 409 ALREADY_ADMIN when target is already an active admin', async () => {
      prisma.v1AdminUser.findUnique
        .mockResolvedValueOnce(ownerAdminRecord) // getOwnerAdmin
        .mockResolvedValueOnce(opsAdminRecord) // existing → active!
        .mockResolvedValueOnce(ownerAdminRecord) // getOwnerAdmin (second call)
        .mockResolvedValueOnce(opsAdminRecord); // existing → active! (second call)
      prisma.v1User.findUnique.mockResolvedValue({ id: 'ops-user-id' });

      await expect(
        service.grantAdmin(ownerAuthUser, { userId: 'ops-user-id', adminRole: 'support', reason: 'test' }),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.grantAdmin(ownerAuthUser, { userId: 'ops-user-id', adminRole: 'support', reason: 'test' }),
      ).rejects.toMatchObject({ response: { code: 'ALREADY_ADMIN' } });
    });

    it('reactivates a revoked admin row instead of creating a new one', async () => {
      const revokedRow = { ...opsAdminRecord, status: 'revoked' as const, revokedAt: new Date() };
      prisma.v1AdminUser.findUnique
        .mockResolvedValueOnce(ownerAdminRecord) // getOwnerAdmin
        .mockResolvedValueOnce(revokedRow); // existing → revoked
      prisma.v1User.findUnique.mockResolvedValue({ id: 'ops-user-id' });

      const reactivated = { ...opsAdminRecord, status: 'active' as const, revokedAt: null };
      prisma.v1AdminUser.update.mockResolvedValue(reactivated);
      prisma.v1AdminUser.findUniqueOrThrow.mockResolvedValue(withUser(reactivated));

      await service.grantAdmin(ownerAuthUser, {
        userId: 'ops-user-id',
        adminRole: 'ops',
        reason: '재활성',
      });

      expect(prisma.v1AdminUser.update).toHaveBeenCalledTimes(1);
      expect(prisma.v1AdminUser.create).not.toHaveBeenCalled();
    });

    it('writes action log with action=admin.grant', async () => {
      prisma.v1AdminUser.findUnique
        .mockResolvedValueOnce(ownerAdminRecord)
        .mockResolvedValueOnce(null);
      prisma.v1User.findUnique.mockResolvedValue({ id: 'u-new' });
      prisma.v1AdminUser.create.mockResolvedValue({ ...opsAdminRecord, id: 'au-new', userId: 'u-new' });
      prisma.v1AdminUser.findUniqueOrThrow.mockResolvedValue(
        withUser({ ...opsAdminRecord, id: 'au-new', userId: 'u-new' }),
      );

      await service.grantAdmin(ownerAuthUser, { userId: 'u-new', adminRole: 'ops', reason: '합류' });

      expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'admin.grant' }),
        }),
      );
    });
  });

  // ─── updateAdmin ─────────────────────────────────────────────────────────

  describe('updateAdmin', () => {
    it('returns 404 NOT_FOUND when target admin does not exist', async () => {
      prisma.v1AdminUser.findUnique
        .mockResolvedValueOnce(ownerAdminRecord) // getOwnerAdmin
        .mockResolvedValueOnce(null) // target lookup → not found
        .mockResolvedValueOnce(ownerAdminRecord) // getOwnerAdmin (second call)
        .mockResolvedValueOnce(null); // target lookup → not found (second call)

      await expect(
        service.updateAdmin(ownerAuthUser, 'ghost-user-id', { reason: 'test' }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.updateAdmin(ownerAuthUser, 'ghost-user-id', { reason: 'test' }),
      ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    });

    it('returns 409 SELF_MODIFICATION when owner tries to modify their own record', async () => {
      prisma.v1AdminUser.findUnique
        .mockResolvedValueOnce(ownerAdminRecord) // getOwnerAdmin (actor)
        .mockResolvedValueOnce(ownerAdminRecord) // target lookup → same userId!
        .mockResolvedValueOnce(ownerAdminRecord)
        .mockResolvedValueOnce(ownerAdminRecord);

      await expect(
        service.updateAdmin(ownerAuthUser, 'owner-user-id', { adminRole: 'ops', reason: 'self' }),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.updateAdmin(ownerAuthUser, 'owner-user-id', { adminRole: 'ops', reason: 'self' }),
      ).rejects.toMatchObject({ response: { code: 'SELF_MODIFICATION' } });
    });

    it('returns 409 LAST_OWNER when attempting to demote the only active owner', async () => {
      const otherOwnerRecord = { ...ownerAdminRecord, id: 'other-owner-id', userId: 'other-owner-uid' };
      prisma.v1AdminUser.findUnique
        .mockResolvedValueOnce(ownerAdminRecord) // actor = owner
        .mockResolvedValueOnce(otherOwnerRecord) // target = also owner
        .mockResolvedValueOnce(ownerAdminRecord)
        .mockResolvedValueOnce(otherOwnerRecord);
      prisma.v1AdminUser.count.mockResolvedValue(1); // only 1 active owner

      await expect(
        service.updateAdmin(ownerAuthUser, 'other-owner-uid', { adminRole: 'ops', reason: 'demote' }),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.updateAdmin(ownerAuthUser, 'other-owner-uid', { adminRole: 'ops', reason: 'demote' }),
      ).rejects.toMatchObject({ response: { code: 'LAST_OWNER' } });
    });

    it('returns 409 LAST_OWNER when attempting to revoke the only active owner', async () => {
      const otherOwnerRecord = { ...ownerAdminRecord, id: 'other-owner-id', userId: 'other-owner-uid' };
      prisma.v1AdminUser.findUnique
        .mockResolvedValueOnce(ownerAdminRecord)
        .mockResolvedValueOnce(otherOwnerRecord)
        .mockResolvedValueOnce(ownerAdminRecord)
        .mockResolvedValueOnce(otherOwnerRecord);
      prisma.v1AdminUser.count.mockResolvedValue(1);

      await expect(
        service.updateAdmin(ownerAuthUser, 'other-owner-uid', { status: 'revoked', reason: 'revoke' }),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.updateAdmin(ownerAuthUser, 'other-owner-uid', { status: 'revoked', reason: 'revoke' }),
      ).rejects.toMatchObject({ response: { code: 'LAST_OWNER' } });
    });

    it('allows revoking a non-last owner when multiple owners exist', async () => {
      const otherOwnerRecord = { ...ownerAdminRecord, id: 'other-owner-id', userId: 'other-owner-uid' };
      prisma.v1AdminUser.findUnique
        .mockResolvedValueOnce(ownerAdminRecord)
        .mockResolvedValueOnce(otherOwnerRecord);
      prisma.v1AdminUser.count.mockResolvedValue(2); // 2 active owners

      const updated = {
        ...otherOwnerRecord,
        status: 'revoked' as const,
        revokedAt: new Date(),
        user: { email: 'other@teameet.v1', profile: { nickname: '기타운영자', displayName: '기타운영자' } },
      };
      prisma.v1AdminUser.update.mockResolvedValue(updated);

      const result = await service.updateAdmin(ownerAuthUser, 'other-owner-uid', {
        status: 'revoked',
        reason: '퇴직',
      });

      expect(result.status).toBe('revoked');
      expect(result.revokedAt).not.toBeNull();
    });

    it('changes role from ops to support and writes admin.update action log', async () => {
      prisma.v1AdminUser.findUnique
        .mockResolvedValueOnce(ownerAdminRecord)
        .mockResolvedValueOnce(opsAdminRecord);

      const updated = {
        ...opsAdminRecord,
        adminRole: 'support' as const,
        user: { email: 'ops@teameet.v1', profile: { nickname: '운영자', displayName: '운영자' } },
      };
      prisma.v1AdminUser.update.mockResolvedValue(updated);

      const result = await service.updateAdmin(ownerAuthUser, 'ops-user-id', {
        adminRole: 'support',
        reason: '역할 조정',
      });

      expect(result.adminRole).toBe('support');
      expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'admin.update' }),
        }),
      );
    });

    it('sets action to admin.revoke when status transitions to revoked', async () => {
      prisma.v1AdminUser.findUnique
        .mockResolvedValueOnce(ownerAdminRecord)
        .mockResolvedValueOnce(opsAdminRecord);

      const revokedRow = {
        ...opsAdminRecord,
        status: 'revoked' as const,
        revokedAt: new Date(),
        user: { email: 'ops@teameet.v1', profile: { nickname: '운영자', displayName: '운영자' } },
      };
      prisma.v1AdminUser.update.mockResolvedValue(revokedRow);

      const result = await service.updateAdmin(ownerAuthUser, 'ops-user-id', {
        status: 'revoked',
        reason: '계약 종료',
      });

      expect(result.status).toBe('revoked');
      expect(result.revokedAt).not.toBeNull();
      expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'admin.revoke' }),
        }),
      );
    });

    it('clears revokedAt when reactivating (status → active)', async () => {
      const revokedOps = { ...opsAdminRecord, status: 'revoked' as const, revokedAt: new Date() };
      prisma.v1AdminUser.findUnique
        .mockResolvedValueOnce(ownerAdminRecord)
        .mockResolvedValueOnce(revokedOps);

      const reactivated = {
        ...opsAdminRecord,
        status: 'active' as const,
        revokedAt: null,
        user: { email: 'ops@teameet.v1', profile: { nickname: '운영자', displayName: '운영자' } },
      };
      prisma.v1AdminUser.update.mockResolvedValue(reactivated);

      const result = await service.updateAdmin(ownerAuthUser, 'ops-user-id', {
        status: 'active',
        reason: '복직',
      });

      expect(result.status).toBe('active');
      expect(result.revokedAt).toBeNull();

      const updateCall = prisma.v1AdminUser.update.mock.calls[0][0] as {
        data: { revokedAt?: null };
      };
      expect(updateCall.data.revokedAt).toBeNull();
    });
  });
});

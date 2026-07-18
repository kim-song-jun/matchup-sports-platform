import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileService } from './profile.service';

const user = {
  id: 'user-1',
  email: 'old@teameet.test',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

describe('ProfileService identity binding', () => {
  it('clears stale verification assertions and synchronizes the password login key when email changes', async () => {
    const profile = {
      displayName: '테스트 사용자',
      nickname: '테스트닉',
      profileImageUrl: null,
      birthDate: null,
      gender: 'male',
      updatedAt: new Date(),
    };
    const prisma = {
      v1User: {
        findUnique: jest.fn().mockResolvedValue({
          email: user.email,
          phone: '01011112222',
          authIdentities: [{ provider: 'email', passwordHash: 'hash' }],
          profile,
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      v1AuthIdentity: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      v1UserProfile: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(profile),
      },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma));
    const service = new ProfileService(prisma as unknown as PrismaService);

    await service.updateMe(user, {
      displayName: profile.displayName,
      nickname: profile.nickname,
      email: 'new@teameet.test',
      phone: '01033334444',
      profileImageUrl: null,
      birthDate: null,
      gender: 'male',
    });

    expect(prisma.v1User.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: {
        email: 'new@teameet.test',
        phone: '01033334444',
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
      },
    });
    expect(prisma.v1AuthIdentity.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, provider: 'email', status: 'active' },
      data: { email: 'new@teameet.test', providerUserKey: 'new@teameet.test' },
    });
  });
});

describe('ProfileService public profile moderation', () => {
  it('queries only publicly available account states', async () => {
    const prisma = {
      v1User: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new ProfileService(prisma as unknown as PrismaService);

    await expect(service.publicProfile(null, 'blocked-user')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.v1User.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'blocked-user',
        deletedAt: null,
        accountStatus: 'active',
      },
      include: { profile: true, reputationSummary: true },
    });
  });
});

describe('ProfileService withdrawal admin lockout', () => {
  function createPrisma(activeAdmin: { id: string } | null) {
    const prisma = {
      v1User: {
        findUnique: jest.fn().mockResolvedValue({ accountStatus: 'active' }),
        update: jest.fn().mockResolvedValue({
          id: user.id,
          accountStatus: 'withdrawal_pending',
          updatedAt: new Date('2026-07-19T00:00:00.000Z'),
        }),
      },
      v1AdminUser: {
        findUnique: jest.fn().mockResolvedValue(activeAdmin ? { status: 'active' } : null),
      },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'status-log-1' }) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma));
    return prisma;
  }

  it('fails closed with a stable error before mutating an active admin account', async () => {
    const prisma = createPrisma({ id: 'admin-record-1' });
    const service = new ProfileService(prisma as unknown as PrismaService);
    const request = service.withdrawalRequest(user, { reason: 'leave' });

    await expect(request).rejects.toBeInstanceOf(ForbiddenException);
    await expect(request).rejects.toMatchObject({
      response: { code: 'ADMIN_WITHDRAWAL_FORBIDDEN' },
    });
    expect(prisma.v1AdminUser.findUnique).toHaveBeenCalledWith({
      where: { userId: user.id },
      select: { status: true },
    });
    expect(prisma.v1User.update).not.toHaveBeenCalled();
    expect(prisma.v1StatusChangeLog.create).not.toHaveBeenCalled();
  });

  it('allows a non-admin active user to request withdrawal after the locked-state check', async () => {
    const prisma = createPrisma(null);
    const service = new ProfileService(prisma as unknown as PrismaService);

    await expect(service.withdrawalRequest(user, { reason: 'leave' })).resolves.toMatchObject({
      userId: user.id,
      accountStatus: 'withdrawal_pending',
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.v1User.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { accountStatus: 'withdrawal_pending' },
    });
  });

  it('rejects when the transaction-time account status is no longer active', async () => {
    const prisma = createPrisma(null);
    prisma.v1User.findUnique.mockResolvedValue({ accountStatus: 'suspended' });
    const service = new ProfileService(prisma as unknown as PrismaService);

    await expect(service.withdrawalRequest(user, { reason: 'stale auth' })).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
    expect(prisma.v1AdminUser.findUnique).not.toHaveBeenCalled();
    expect(prisma.v1User.update).not.toHaveBeenCalled();
    expect(prisma.v1StatusChangeLog.create).not.toHaveBeenCalled();
  });
});

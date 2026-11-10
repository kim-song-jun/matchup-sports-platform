import { PrismaService } from '../prisma/prisma.service';
import { ProfileService } from './profile.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { RealtimeGateway } from '../realtime/realtime.gateway';

const user = {
  id: 'user-1',
  email: null,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

function buildPrisma(storedRealName: string | null) {
  const profileRow = {
    realName: storedRealName,
    nickname: '러너01',
    profileImageUrl: null,
    birthDate: null,
    gender: 'male',
    bio: null,
    updatedAt: new Date(),
  };
  const prisma = {
    v1User: {
      findUnique: jest.fn().mockResolvedValue({
        email: null,
        phone: null,
        phoneVerifiedAt: null,
        onboardingStatus: 'completed',
        emailVerifiedAt: null,
        authIdentities: [{ provider: 'kakao', passwordHash: null }],
        profile: profileRow,
      }),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    v1AuthIdentity: { updateMany: jest.fn() },
    v1UserProfile: {
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue(profileRow),
    },
    v1StatusChangeLog: { create: jest.fn().mockResolvedValue({}) },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma));
  return prisma;
}

function createService(prisma: unknown) {
  const gateway: Pick<RealtimeGateway, 'forceDisconnectUser'> = { forceDisconnectUser: jest.fn() };
  const notifications = { createInTransaction: jest.fn(), deliverCreated: jest.fn() };
  return new ProfileService(prisma as PrismaService, gateway, notifications as unknown as NotificationsService);
}

function payload(overrides: Record<string, unknown> = {}) {
  return { realName: '홍길동', nickname: '러너01', gender: 'male' as const, ...overrides };
}

describe('ProfileService.updateMe real name', () => {
  it.each([[null], [''], ['   ']])('refuses a save with an empty name (%j)', async (cleared) => {
    const prisma = buildPrisma('홍길동');

    await expect(createService(prisma).updateMe(user, payload({ realName: cleared }))).rejects.toMatchObject({
      status: 400,
      response: { code: 'VALIDATION_FAILED', details: { field: 'realName' } },
    });
    expect(prisma.v1UserProfile.upsert).not.toHaveBeenCalled();
  });

  it('lets a stored name be changed to another one', async () => {
    const prisma = buildPrisma('홍길동');

    await createService(prisma).updateMe(user, payload({ realName: '김철수' }));

    expect(prisma.v1UserProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ realName: '김철수' }) }),
    );
  });

  it('also refuses a save without a name from a legacy account that never had one', async () => {
    const prisma = buildPrisma(null);

    await expect(createService(prisma).updateMe(user, payload({ realName: null }))).rejects.toMatchObject({
      status: 400,
      response: { code: 'VALIDATION_FAILED', details: { field: 'realName' } },
    });
    expect(prisma.v1UserProfile.upsert).not.toHaveBeenCalled();
  });

  it('accepts the deprecated displayName as the name for a pre-realName client', async () => {
    const prisma = buildPrisma(null);

    await createService(prisma).updateMe(user, payload({ realName: undefined, displayName: '옛 클라이언트' }));

    expect(prisma.v1UserProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ realName: '옛 클라이언트' }) }),
    );
  });
});

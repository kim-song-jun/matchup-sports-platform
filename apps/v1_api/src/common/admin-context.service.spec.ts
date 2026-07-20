import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService } from './admin-context.service';

describe('AdminContextService', () => {
  const findUnique = jest.fn();
  const prisma = {
    v1AdminUser: { findUnique },
  } as unknown as PrismaService;
  const service = new AdminContextService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns an active admin only when the linked user account is active', async () => {
    findUnique.mockResolvedValue({
      id: 'admin-id',
      userId: 'user-id',
      adminRole: 'ops',
      status: 'active',
      user: { accountStatus: 'active' },
    });

    await expect(service.getActiveAdmin('user-id')).resolves.toEqual({
      id: 'admin-id',
      userId: 'user-id',
      adminRole: 'ops',
      status: 'active',
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-id' },
      select: {
        id: true,
        userId: true,
        adminRole: true,
        status: true,
        user: { select: { accountStatus: true } },
      },
    });
  });

  it.each(['suspended', 'blocked', 'withdrawal_pending', 'deleted'])(
    'rejects an active admin linked to a %s user account',
    async (accountStatus) => {
      findUnique.mockResolvedValue({
        id: 'admin-id',
        userId: 'user-id',
        adminRole: 'owner',
        status: 'active',
        user: { accountStatus },
      });

      await expect(service.getActiveAdmin('user-id')).rejects.toMatchObject({
        response: { code: 'PERMISSION_DENIED' },
      });
    },
  );

  it('keeps support admins read-only after the linked-account check', async () => {
    findUnique.mockResolvedValue({
      id: 'support-admin-id',
      userId: 'support-user-id',
      adminRole: 'support',
      status: 'active',
      user: { accountStatus: 'active' },
    });

    await expect(service.getMutationAdmin('support-user-id')).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
  });
});

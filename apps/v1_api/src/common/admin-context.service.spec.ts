import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService, writeAdminActionLog, type V1ActiveAdmin } from './admin-context.service';

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

describe('writeAdminActionLog', () => {
  const admin: V1ActiveAdmin = { id: 'admin-row-1', userId: 'user-1', adminRole: 'ops', status: 'active' };
  const makeClient = () => ({
    v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'action-log-1' }) },
    v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'status-log-1' }) },
  });

  it('감사 행에는 사용자 id 가 아니라 어드민 행 id 를 남기고, toStatus 가 없으면 상태 로그를 만들지 않는다', async () => {
    const client = makeClient();

    await expect(
      writeAdminActionLog(client as never, admin, { action: 'a.b', targetType: 't', targetId: 'x', afterJson: { n: 1 } }),
    ).resolves.toEqual({ actionLogId: 'action-log-1', statusChangeLogId: null });

    expect(client.v1AdminActionLog.create).toHaveBeenCalledWith({
      data: { adminUserId: 'admin-row-1', action: 'a.b', targetType: 't', targetId: 'x', reason: null, afterJson: { n: 1 } },
    });
    expect(client.v1StatusChangeLog.create).not.toHaveBeenCalled();
  });

  it('toStatus 가 있으면 같은 client 로 상태 변경 로그도 남긴다', async () => {
    const client = makeClient();

    await expect(
      writeAdminActionLog(client as never, admin, {
        action: 'a.b', targetType: 't', targetId: 'x', reason: '사유', fromStatus: 'open', toStatus: 'closed',
      }),
    ).resolves.toEqual({ actionLogId: 'action-log-1', statusChangeLogId: 'status-log-1' });

    expect(client.v1StatusChangeLog.create).toHaveBeenCalledWith({
      data: { targetType: 't', targetId: 'x', fromStatus: 'open', toStatus: 'closed', actorType: 'admin', adminUserId: 'admin-row-1', reason: '사유' },
    });
  });
});

describe('AdminContextService.logAdminAction 위임', () => {
  const admin: V1ActiveAdmin = { id: 'admin-row-1', userId: 'user-1', adminRole: 'owner', status: 'active' };
  const makeClient = () => ({
    v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'action-log-1' }) },
    v1StatusChangeLog: { create: jest.fn() },
  });

  it('tx 를 주면 서비스가 들고 있는 prisma 가 아니라 tx 에 쓴다 (호출자 트랜잭션과 함께 롤백돼야 한다)', async () => {
    const own = makeClient();
    const tx = makeClient();
    const service = new AdminContextService(own as unknown as PrismaService);

    await service.logAdminAction(admin, { action: 'a', targetType: 't', targetId: 'x' }, tx as never);

    expect(tx.v1AdminActionLog.create).toHaveBeenCalledTimes(1);
    expect(own.v1AdminActionLog.create).not.toHaveBeenCalled();
  });

  it('tx 가 없으면 서비스의 prisma 에 쓴다', async () => {
    const own = makeClient();
    const service = new AdminContextService(own as unknown as PrismaService);

    await service.logAdminAction(admin, { action: 'a', targetType: 't', targetId: 'x' });

    expect(own.v1AdminActionLog.create).toHaveBeenCalledTimes(1);
  });
});

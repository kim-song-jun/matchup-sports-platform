/**
 * AdminService.releaseUserPhone — an operator frees a phone number held by an account (carriers reassign numbers).
 * The fake database keeps the user row, so a test sees what the transaction actually wrote, not what a mock returned.
 */
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminService } from './admin.service';
import { ReleaseAdminUserPhoneDto } from './dto/admin.dto';

const PHONE = '01012345678';
const targetUserId = 'target-user-id';

type AdminRole = 'owner' | 'ops' | 'support';

function adminRecord(role: AdminRole, userId = 'actor-user-id') {
  return { id: `admin-${role}`, userId, adminRole: role, status: 'active', user: { accountStatus: 'active' } };
}

function setup(options: { role?: AdminRole; target?: Record<string, unknown> | null; targetIsActiveAdmin?: boolean } = {}) {
  const role = options.role ?? 'ops';
  const events: string[] = [];
  const row: Record<string, unknown> | null =
    options.target === null
      ? null
      : {
          accountStatus: 'active',
          deletedAt: null,
          phone: PHONE,
          phoneVerifiedAt: new Date('2026-09-01T00:00:00Z'),
          ...options.target,
        };

  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    v1AdminUser: {
      findUnique: jest.fn(async ({ where }: { where: { userId: string } }) => {
        if (where.userId === 'actor-user-id') return adminRecord(role);
        return options.targetIsActiveAdmin ? adminRecord('ops', targetUserId) : null;
      }),
    },
    v1User: {
      findUnique: jest.fn(async () => (row ? { ...row } : null)),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        events.push('user.update');
        Object.assign(row ?? {}, data);
        return { ...row };
      }),
    },
    v1AdminActionLog: { create: jest.fn(async () => ({ id: 'action-log-1' })) },
    v1StatusChangeLog: { create: jest.fn(async () => ({ id: 'status-log-1' })) },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
      const result = await callback(tx);
      events.push('commit');
      return result;
    }),
  };
  const created = { id: 'notification-1', targetType: 'system', targetId: null, title: 't', body: 'b', deepLink: '/my/phone-verify' };
  const notifications = {
    createInTransaction: jest.fn(async () => {
      events.push('notification.create');
      return created;
    }),
    deliverCreated: jest.fn(() => {
      events.push('notification.deliver');
    }),
  };
  const service = new AdminService(prisma as never, undefined, undefined, undefined, notifications as never);
  const actor = { id: 'actor-user-id', email: null, accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
  return { service, actor, tx, row, events, notifications, created };
}

const release = (s: ReturnType<typeof setup>, reason = '번호 재할당 확인') =>
  s.service.releaseUserPhone(s.actor, targetUserId, { reason });

describe('AdminService.releaseUserPhone', () => {
  it('clears the number and its verification and touches nothing else on the account', async () => {
    const s = setup();

    const result = await release(s);

    expect(s.tx.v1User.update).toHaveBeenCalledTimes(1);
    expect(s.tx.v1User.update).toHaveBeenCalledWith({ where: { id: targetUserId }, data: { phone: null, phoneVerifiedAt: null } });
    expect(s.row).toMatchObject({ accountStatus: 'active', phone: null, phoneVerifiedAt: null });
    expect(result).toEqual({
      userId: targetUserId,
      previousStatus: 'confirmed',
      status: 'released',
      actionLogId: 'action-log-1',
      statusChangeLogId: 'status-log-1',
    });
  });

  it('records an unverified number as unverified in the status change', async () => {
    const s = setup({ target: { phoneVerifiedAt: null } });

    await expect(release(s)).resolves.toMatchObject({ previousStatus: 'unverified', status: 'released' });
    expect(s.tx.v1StatusChangeLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ fromStatus: 'unverified', toStatus: 'released' }),
    });
  });

  it('logs the release with the reason and only the last four digits of the number', async () => {
    const s = setup();

    await release(s, '번호가 재할당됨');

    expect(s.tx.v1AdminActionLog.create).toHaveBeenCalledWith({
      data: {
        adminUserId: 'admin-ops',
        action: 'user.phone.release',
        targetType: 'user',
        targetId: targetUserId,
        reason: '번호가 재할당됨',
        beforeJson: { phoneLast4: '5678', phoneVerified: 'true' },
        afterJson: { phoneLast4: null, phoneVerified: 'false' },
      },
    });
    expect(s.tx.v1StatusChangeLog.create).toHaveBeenCalledWith({
      data: {
        targetType: 'user_contact',
        targetId: targetUserId,
        fromStatus: 'confirmed',
        toStatus: 'released',
        actorType: 'admin',
        adminUserId: 'admin-ops',
        reason: '번호가 재할당됨',
      },
    });
    const written = JSON.stringify([s.tx.v1AdminActionLog.create.mock.calls, s.tx.v1StatusChangeLog.create.mock.calls]);
    expect(written).not.toContain(PHONE);
    expect(written).not.toContain('1234567');
  });

  it('creates the notice inside the transaction and delivers it only after the commit', async () => {
    const s = setup();

    await release(s);

    expect(s.notifications.createInTransaction).toHaveBeenCalledWith(s.tx, targetUserId, 'phone_released_by_operator', {
      businessKey: 'phone-release:status-log-1',
    });
    expect(s.notifications.deliverCreated).toHaveBeenCalledWith(targetUserId, 'phone_released_by_operator', s.created);
    expect(s.events).toEqual(['user.update', 'notification.create', 'commit', 'notification.deliver']);
  });

  it('answers 409 PHONE_NOT_SET when the account has no number, and writes nothing', async () => {
    const s = setup({ target: { phone: null, phoneVerifiedAt: null } });

    await expect(release(s)).rejects.toMatchObject({ status: 409, response: { code: 'PHONE_NOT_SET' } });

    expect(s.tx.v1User.update).not.toHaveBeenCalled();
    expect(s.tx.v1AdminActionLog.create).not.toHaveBeenCalled();
    expect(s.tx.v1StatusChangeLog.create).not.toHaveBeenCalled();
    expect(s.notifications.createInTransaction).not.toHaveBeenCalled();
    expect(s.notifications.deliverCreated).not.toHaveBeenCalled();
  });

  it('a second release of the same account is refused because the first one cleared the number', async () => {
    const s = setup();

    await release(s);
    await expect(release(s)).rejects.toMatchObject({ response: { code: 'PHONE_NOT_SET' } });
    expect(s.tx.v1AdminActionLog.create).toHaveBeenCalledTimes(1);
  });

  it('refuses a deleted account the way the status change does', async () => {
    const s = setup({ target: { accountStatus: 'deleted', deletedAt: new Date('2026-10-01T00:00:00Z'), phone: 'deleted-target-user-id' } });

    await expect(release(s)).rejects.toMatchObject({ status: 409, response: { code: 'USER_DELETED_IRREVERSIBLE' } });

    expect(s.tx.v1User.update).not.toHaveBeenCalled();
    expect(s.notifications.deliverCreated).not.toHaveBeenCalled();
  });

  it('still frees the number of an account only marked deleted by a status change, which keeps its real number', async () => {
    const s = setup({ target: { accountStatus: 'deleted', deletedAt: null } });

    await expect(release(s)).resolves.toMatchObject({ status: 'released' });
    expect(s.row).toMatchObject({ phone: null });
  });

  it('answers 404 for an unknown user', async () => {
    const s = setup({ target: null });

    await expect(release(s)).rejects.toMatchObject({ status: 404, response: { code: 'NOT_FOUND' } });
    expect(s.tx.v1AdminActionLog.create).not.toHaveBeenCalled();
  });

  it('refuses a support admin before reading the target, and writes nothing', async () => {
    const s = setup({ role: 'support' });

    await expect(release(s)).rejects.toMatchObject({ status: 403, response: { code: 'PERMISSION_DENIED' } });

    expect(s.tx.v1User.findUnique).not.toHaveBeenCalled();
    expect(s.tx.v1User.update).not.toHaveBeenCalled();
    expect(s.notifications.createInTransaction).not.toHaveBeenCalled();
  });

  it('lets only an owner release the number of an active admin account', async () => {
    const ops = setup({ role: 'ops', targetIsActiveAdmin: true });
    await expect(release(ops)).rejects.toMatchObject({ status: 403, response: { code: 'PERMISSION_DENIED' } });
    expect(ops.tx.v1User.update).not.toHaveBeenCalled();

    const owner = setup({ role: 'owner', targetIsActiveAdmin: true });
    await expect(release(owner)).resolves.toMatchObject({ status: 'released' });
    expect(owner.row).toMatchObject({ phone: null });
  });
});

describe('ReleaseAdminUserPhoneDto', () => {
  const check = (body: unknown) => {
    const dto = plainToInstance(ReleaseAdminUserPhoneDto, body);
    return validate(dto, { whitelist: true, forbidNonWhitelisted: true }).then((errors) => ({ dto, errors }));
  };

  it('trims the reason', async () => {
    const { dto, errors } = await check({ reason: '  번호 재할당  ' });
    expect(errors).toHaveLength(0);
    expect(dto.reason).toBe('번호 재할당');
  });

  it.each([{ reason: '' }, { reason: '   ' }, {}, { reason: 7 }, { reason: 'x'.repeat(501) }])('rejects %j', async (body) => {
    const { errors } = await check(body);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts a reason of exactly 500 characters and rejects unknown fields', async () => {
    expect((await check({ reason: 'x'.repeat(500) })).errors).toHaveLength(0);
    expect((await check({ reason: '사유', phone: '01000000000' })).errors.length).toBeGreaterThan(0);
  });
});

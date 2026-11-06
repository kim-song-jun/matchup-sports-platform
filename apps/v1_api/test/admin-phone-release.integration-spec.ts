import { randomInt, randomUUID } from 'node:crypto';
import { AdminService } from '../src/admin/admin.service';
import type { V1AuthUser } from '../src/auth/v1-auth-user';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SmsEventLogService } from '../src/verification/sms-event-log.service';
import { VerificationService } from '../src/verification/verification.service';

// The integration runner clones the approved disposable database for this file.
describe('operator phone release against PostgreSQL', () => {
  const prisma = new PrismaService();
  const realtime = { emitToUser: jest.fn() };
  const webPush = { sendToUser: jest.fn().mockResolvedValue(undefined) };
  const logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn() };
  const notifications = new NotificationsService(prisma, realtime as never, webPush as never, logger as never);
  const admin = new AdminService(prisma, undefined, undefined, undefined, notifications);
  const sentCodes: string[] = [];
  const dispatcher = {
    emailDeliverable: false,
    mayEchoCode: jest.fn().mockResolvedValue(false),
    send: jest.fn(async (_channel: string, _target: string, code: string) => {
      sentCodes.push(code);
    }),
  };
  const verification = new VerificationService(prisma, dispatcher as never, new SmsEventLogService(prisma));

  const prefix = `phone-release-${randomUUID().slice(0, 8)}`;
  const ids: string[] = [];
  const asActor = (id: string): V1AuthUser => ({ id, email: null, accountStatus: 'active', onboardingStatus: 'completed' });
  let owner: V1AuthUser;
  let support: V1AuthUser;
  let seq = 0;

  const newPhone = () => `010${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;

  async function account(key: string, data: { phone?: string | null; verified?: boolean; accountStatus?: 'active' | 'deleted'; deletedAt?: Date } = {}) {
    seq += 1;
    const row = await prisma.v1User.create({
      data: {
        email: `${prefix}-${key}-${seq}@example.test`,
        phone: data.phone === undefined ? newPhone() : data.phone,
        phoneVerifiedAt: data.verified === false || data.phone === null ? null : new Date('2026-09-01T00:00:00Z'),
        onboardingStatus: 'completed',
        accountStatus: data.accountStatus ?? 'active',
        deletedAt: data.deletedAt ?? null,
        profile: { create: { nickname: `${prefix}-${key}-${seq}` } },
        authIdentities: { create: [{ provider: 'email', providerUserKey: `${prefix}-${key}-${seq}@example.test`, passwordHash: 'hash' }] },
      },
    });
    ids.push(row.id);
    return row;
  }

  beforeAll(async () => {
    const ownerRow = await prisma.v1User.create({ data: { adminUser: { create: { adminRole: 'owner' } } } });
    const supportRow = await prisma.v1User.create({ data: { adminUser: { create: { adminRole: 'support' } } } });
    ids.push(ownerRow.id, supportRow.id);
    owner = asActor(ownerRow.id);
    support = asActor(supportRow.id);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    sentCodes.length = 0;
  });

  afterAll(async () => {
    await prisma.v1AdminActionLog.deleteMany({ where: { adminUser: { userId: { in: ids } } } });
    await prisma.v1StatusChangeLog.deleteMany({ where: { targetId: { in: ids } } });
    await prisma.v1AdminUser.deleteMany({ where: { userId: { in: ids } } });
    await prisma.v1User.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('frees the number for another account to verify, and leaves the old account as it was', async () => {
    const holder = await account('holder');
    const claimant = await account('claimant', { phone: null });
    const number = holder.phone as string;

    await expect(verification.requestPhone(asActor(claimant.id), number)).rejects.toMatchObject({ response: { code: 'PHONE_CONFLICT' } });

    await expect(admin.releaseUserPhone(owner, holder.id, { reason: '번호 재할당 확인' })).resolves.toMatchObject({
      userId: holder.id,
      previousStatus: 'confirmed',
      status: 'released',
    });

    const after = await prisma.v1User.findUniqueOrThrow({ where: { id: holder.id }, include: { authIdentities: true } });
    expect(after).toMatchObject({
      phone: null,
      phoneVerifiedAt: null,
      accountStatus: 'active',
      email: holder.email,
      onboardingStatus: 'completed',
    });
    expect(after.authIdentities).toHaveLength(1);
    expect(after.authIdentities[0]).toMatchObject({ status: 'active', passwordHash: 'hash' });

    await expect(verification.requestPhone(asActor(claimant.id), number)).resolves.toMatchObject({ sent: true, channel: 'phone' });
    expect(sentCodes).toHaveLength(1);
    await expect(verification.confirm(asActor(claimant.id), 'phone', sentCodes[0])).resolves.toMatchObject({
      verified: true,
      verification: { phoneVerified: true },
    });
    await expect(prisma.v1User.findUniqueOrThrow({ where: { id: claimant.id } })).resolves.toMatchObject({ phone: number });

    // One number, one account: the previous holder cannot take it back.
    await expect(verification.requestPhone(asActor(holder.id), number)).rejects.toMatchObject({ response: { code: 'PHONE_CONFLICT' } });
  });

  it('writes the action log, the status change and the in-app notice, without the full number', async () => {
    const holder = await account('logged');
    const number = holder.phone as string;

    const result = await admin.releaseUserPhone(owner, holder.id, { reason: '번호 재할당 확인' });

    const actionLog = await prisma.v1AdminActionLog.findUniqueOrThrow({ where: { id: result.actionLogId } });
    expect(actionLog).toMatchObject({
      action: 'user.phone.release',
      targetType: 'user',
      targetId: holder.id,
      reason: '번호 재할당 확인',
      beforeJson: { phoneLast4: number.slice(-4), phoneVerified: 'true' },
      afterJson: { phoneLast4: null, phoneVerified: 'false' },
    });
    const statusLog = await prisma.v1StatusChangeLog.findUniqueOrThrow({ where: { id: result.statusChangeLogId } });
    expect(statusLog).toMatchObject({
      targetType: 'user_contact',
      targetId: holder.id,
      fromStatus: 'confirmed',
      toStatus: 'released',
      actorType: 'admin',
      reason: '번호 재할당 확인',
    });
    expect(JSON.stringify([actionLog, statusLog])).not.toContain(number);

    const stored = await prisma.v1Notification.findMany({ where: { recipientUserId: holder.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      targetType: 'system',
      targetId: null,
      title: '휴대폰 번호가 해제됐어요',
      deepLink: '/my/phone-verify',
      businessKey: `phone-release:${result.statusChangeLogId}:${holder.id}`,
      readAt: null,
    });
    expect(stored[0].body).not.toContain(number);

    await new Promise(setImmediate);
    expect(realtime.emitToUser).toHaveBeenCalledWith(holder.id, 'notification:new', expect.objectContaining({ id: stored[0].id }));
  });

  it('records an unverified number as unverified', async () => {
    const holder = await account('unverified', { verified: false });

    const result = await admin.releaseUserPhone(owner, holder.id, { reason: '미인증 번호 해제' });

    expect(result.previousStatus).toBe('unverified');
    await expect(prisma.v1StatusChangeLog.findUniqueOrThrow({ where: { id: result.statusChangeLogId } })).resolves.toMatchObject({
      fromStatus: 'unverified',
      toStatus: 'released',
    });
  });

  it('answers 409 PHONE_NOT_SET for an account without a number and leaves no log or notice', async () => {
    const empty = await account('empty', { phone: null });

    await expect(admin.releaseUserPhone(owner, empty.id, { reason: '확인' })).rejects.toMatchObject({
      status: 409,
      response: { code: 'PHONE_NOT_SET' },
    });

    await expect(prisma.v1AdminActionLog.count({ where: { targetId: empty.id } })).resolves.toBe(0);
    await expect(prisma.v1StatusChangeLog.count({ where: { targetId: empty.id } })).resolves.toBe(0);
    await expect(prisma.v1Notification.count({ where: { recipientUserId: empty.id } })).resolves.toBe(0);
  });

  it('lets exactly one of two simultaneous releases through', async () => {
    const holder = await account('race');

    const outcomes = await Promise.allSettled([
      admin.releaseUserPhone(owner, holder.id, { reason: '동시 요청 1' }),
      admin.releaseUserPhone(owner, holder.id, { reason: '동시 요청 2' }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ response: { code: 'PHONE_NOT_SET' } });
    await expect(prisma.v1AdminActionLog.count({ where: { targetId: holder.id, action: 'user.phone.release' } })).resolves.toBe(1);
    await expect(prisma.v1Notification.count({ where: { recipientUserId: holder.id } })).resolves.toBe(1);
  });

  it('refuses a support admin and keeps the number', async () => {
    const holder = await account('support-denied');

    await expect(admin.releaseUserPhone(support, holder.id, { reason: '권한 없음' })).rejects.toMatchObject({
      status: 403,
      response: { code: 'PERMISSION_DENIED' },
    });

    await expect(prisma.v1User.findUniqueOrThrow({ where: { id: holder.id } })).resolves.toMatchObject({ phone: holder.phone });
    await expect(prisma.v1AdminActionLog.count({ where: { targetId: holder.id } })).resolves.toBe(0);
    await expect(prisma.v1Notification.count({ where: { recipientUserId: holder.id } })).resolves.toBe(0);
  });

  it('refuses an account that was deleted for good', async () => {
    const deleted = await account('deleted', { phone: `deleted-${randomUUID()}`, accountStatus: 'deleted', deletedAt: new Date() });

    await expect(admin.releaseUserPhone(owner, deleted.id, { reason: '삭제된 계정' })).rejects.toMatchObject({
      status: 409,
      response: { code: 'USER_DELETED_IRREVERSIBLE' },
    });

    await expect(prisma.v1User.findUniqueOrThrow({ where: { id: deleted.id } })).resolves.toMatchObject({ phone: deleted.phone });
    await expect(prisma.v1AdminActionLog.count({ where: { targetId: deleted.id } })).resolves.toBe(0);
  });
});

import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { WithdrawalFinalizationService } from '../src/users/withdrawal-finalization.service';
import { WITHDRAWAL_FINALIZATION_REPORT_TYPE } from '../src/users/withdrawal-finalization-report';

const DAY_MS = 24 * 60 * 60 * 1000;

// The integration runner clones the approved disposable database for this file.
describe('withdrawal grace finalization against PostgreSQL', () => {
  const prisma = new PrismaService();
  const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
  const newService = () => new WithdrawalFinalizationService(prisma, logger as never);
  const prefix = `wgf-${randomUUID().slice(0, 8)}`;
  // Midday UTC keeps the hourly re-run below on the same report day whenever this file runs.
  const NOW = new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00.000Z`);
  const ids: Record<string, string> = {};
  let phoneSeq = 0;
  const uniquePhone = () => `0100${String(Date.now()).slice(-4)}${String(++phoneSeq).padStart(3, '0')}`.slice(0, 11);

  async function withdrawingUser(key: string, requestedAgoMs: number | null) {
    const user = await prisma.v1User.create({
      data: {
        email: `${prefix}-${key}@example.test`,
        phone: uniquePhone(),
        emailVerifiedAt: NOW,
        phoneVerifiedAt: NOW,
        accountStatus: 'withdrawal_pending',
        onboardingStatus: 'completed',
        profile: { create: { nickname: `${prefix}-${key}`, realName: '홍길동' } },
        authIdentities: { create: [{ provider: 'email', providerUserKey: `${prefix}-${key}@example.test`, passwordHash: 'hash' }] },
      },
    });
    ids[key] = user.id;
    if (requestedAgoMs !== null) {
      await prisma.v1StatusChangeLog.create({
        data: {
          targetType: 'user',
          targetId: user.id,
          fromStatus: 'active',
          toStatus: 'withdrawal_pending',
          actorType: 'user',
          actorUserId: user.id,
          createdAt: new Date(NOW.getTime() - requestedAgoMs),
        },
      });
    }
    return user;
  }

  afterAll(async () => {
    const userIds = Object.values(ids);
    await prisma.v1OutboxEvent.deleteMany({ where: { type: WITHDRAWAL_FINALIZATION_REPORT_TYPE } });
    await prisma.v1StatusChangeLog.deleteMany({ where: { targetId: { in: userIds } } });
    await prisma.v1AdminUser.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.v1User.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('keeps an account inside the 30 days, destroys one past them, and frees the phone number', async () => {
    const inside = await withdrawingUser('inside', 30 * DAY_MS - 60 * 60_000);
    const past = await withdrawingUser('past', 30 * DAY_MS + 60_000);

    const result = await newService().finalizeDue(NOW);

    expect(result.finalizedUserIds).toEqual([past.id]);
    expect(result.skipped).toEqual([]);

    const kept = await prisma.v1User.findUniqueOrThrow({ where: { id: inside.id }, include: { authIdentities: true, profile: true } });
    expect(kept).toMatchObject({ accountStatus: 'withdrawal_pending', email: inside.email, phone: inside.phone, deletedAt: null });
    expect(kept.authIdentities[0]).toMatchObject({ status: 'active', passwordHash: 'hash' });
    expect(kept.profile).toMatchObject({ realName: '홍길동', deletedAt: null });

    const gone = await prisma.v1User.findUniqueOrThrow({ where: { id: past.id }, include: { authIdentities: true, profile: true } });
    expect(gone).toMatchObject({
      accountStatus: 'deleted',
      email: `deleted+${past.id}@deleted.teameet.local`,
      phone: `deleted-${past.id}`,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
    });
    expect(gone.deletedAt).toEqual(NOW);
    expect(gone.authIdentities[0]).toMatchObject({ status: 'unlinked', passwordHash: null });
    expect(gone.profile).toMatchObject({ realName: null, displayName: '탈퇴 회원' });

    const log = await prisma.v1StatusChangeLog.findFirstOrThrow({ where: { targetId: past.id, toStatus: 'deleted' } });
    expect(log).toMatchObject({
      fromStatus: 'withdrawal_pending',
      actorType: 'system',
      actorUserId: null,
      adminUserId: null,
      reason: 'withdrawal_grace_elapsed',
    });

    // The number the destroyed account held can be registered again.
    const reused = await prisma.v1User.create({ data: { phone: past.phone, onboardingStatus: 'completed' } });
    ids.reuse = reused.id;
    expect(reused.phone).toBe(past.phone);
  });

  it('leaves accounts that need a person alone, says why, and reports them once a day', async () => {
    const adminUser = await withdrawingUser('admin', 40 * DAY_MS);
    await prisma.v1AdminUser.create({ data: { userId: adminUser.id, adminRole: 'ops' } });
    const noLog = await withdrawingUser('nolog', null);

    const first = await newService().finalizeDue(NOW);
    const second = await newService().finalizeDue(new Date(NOW.getTime() + 30 * 60_000));

    const expected = [
      { userId: adminUser.id, reason: 'active_admin' },
      { userId: noLog.id, reason: 'no_request_log' },
    ].sort((a, b) => a.userId.localeCompare(b.userId));
    expect([...first.skipped].sort((a, b) => a.userId.localeCompare(b.userId))).toEqual(expected);
    expect(second.skipped.length).toBe(2);
    for (const user of [adminUser, noLog]) {
      await expect(prisma.v1User.findUniqueOrThrow({ where: { id: user.id } })).resolves.toMatchObject({
        accountStatus: 'withdrawal_pending',
        email: user.email,
        deletedAt: null,
      });
    }

    const reports = await prisma.v1OutboxEvent.findMany({
      where: { type: WITHDRAWAL_FINALIZATION_REPORT_TYPE, businessKey: { startsWith: `withdrawal-finalization:${NOW.toISOString().slice(0, 10)}` } },
    });
    const skippedReports = reports.filter((row) => (row.payload as { finalizedCount: number }).finalizedCount === 0);
    expect(skippedReports).toHaveLength(1);
    expect(skippedReports[0].payload).toMatchObject({ finalizedCount: 0, skipped: expected });
    expect(JSON.stringify(skippedReports[0].payload)).not.toContain('example.test');
  });

  it('lets two instances race over the same accounts and deletes each one once', async () => {
    const racers = await Promise.all(['r1', 'r2', 'r3'].map((key) => withdrawingUser(key, 31 * DAY_MS)));

    const [one, two] = await Promise.all([newService().finalizeDue(NOW), newService().finalizeDue(NOW)]);

    expect([...one.finalizedUserIds, ...two.finalizedUserIds].sort()).toEqual(racers.map((row) => row.id).sort());
    for (const racer of racers) {
      await expect(prisma.v1StatusChangeLog.count({ where: { targetId: racer.id, toStatus: 'deleted' } })).resolves.toBe(1);
      await expect(prisma.v1User.findUniqueOrThrow({ where: { id: racer.id } })).resolves.toMatchObject({ accountStatus: 'deleted' });
    }
  });
});

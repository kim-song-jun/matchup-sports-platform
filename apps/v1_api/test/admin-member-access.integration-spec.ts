import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { AdminContextService } from '../src/common/admin-context.service';
import { MemberAccessService } from '../src/admin/member-access.service';
import { AdminEntityOperationsService } from '../src/admin/admin-entity-operations.service';
import { createV1SessionToken, V1_SESSION_COOKIE_NAME } from '../src/auth/v1-session';
import { MEMBER_ACCESS_COOKIE } from '../src/auth/member-access-token';

// The integration environment only accepts disposable databases and clones one per file.
describe('member access durable grants and entity history against PostgreSQL', () => {
  const prisma = new PrismaService();
  const admins = new AdminContextService(prisma);
  const access = new MemberAccessService(prisma, admins);
  const operations = new AdminEntityOperationsService(prisma, admins);
  const secret = 'member-access-postgresql-test-secret-0123456789';
  const previousSecret = process.env.V1_SESSION_SECRET;
  let operatorId: string;
  let targetId: string;
  let otherId: string;
  let adminId: string;

  const original = () => `${V1_SESSION_COOKIE_NAME}=${createV1SessionToken({ userId: operatorId, sessionEpoch: 0, secret })}`;
  async function start() {
    const cookie = original();
    const grant = await access.start({ headers: { cookie } }, targetId, '접속 문제를 확인해요');
    return { grant, request: { headers: { cookie: `${cookie}; ${MEMBER_ACCESS_COOKIE}=${grant.token}` } } };
  }
  beforeAll(async () => {
    process.env.V1_SESSION_SECRET = secret;
    const suffix = randomUUID();
    const operator = await prisma.v1User.create({ data: { onboardingStatus: 'completed',
      profile: { create: { nickname: `운영-${suffix}` } }, adminUser: { create: { adminRole: 'owner' } } }, include: { adminUser: true } });
    operatorId = operator.id; adminId = operator.adminUser!.id;
    targetId = (await prisma.v1User.create({ data: { onboardingStatus: 'completed', profile: { create: { nickname: `대상-${suffix}` } } } })).id;
    otherId = (await prisma.v1User.create({ data: { onboardingStatus: 'completed' } })).id;
  });
  beforeEach(async () => {
    await prisma.v1AdminUser.update({ where: { id: adminId }, data: { adminRole: 'owner' } });
    await prisma.v1User.update({ where: { id: targetId }, data: { sessionEpoch: 0 } });
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    if (adminId) await prisma.v1AdminActionLog.deleteMany({ where: { adminUserId: adminId } });
    await prisma.v1StatusChangeLog.deleteMany({ where: { targetId: { in: [targetId, otherId].filter(Boolean) } } });
    await prisma.v1User.deleteMany({ where: { id: { in: [operatorId, targetId, otherId].filter(Boolean) } } });
    await prisma.$disconnect();
    if (previousSecret === undefined) delete process.env.V1_SESSION_SECRET; else process.env.V1_SESSION_SECRET = previousSecret;
  });

  it('persists the locked grant and append-only termination, then denies replay', async () => {
    const { grant, request } = await start();
    expect(await access.authorize(request)).toMatchObject({ userId: targetId, sessionEpoch: 0 });
    await access.stop(request);
    await expect(access.authorize(request)).rejects.toMatchObject({ response: { code: 'MEMBER_ACCESS_ENDED' } });
    const rows = await prisma.v1AdminActionLog.findMany({ where: { adminUserId: adminId, targetId }, orderBy: { createdAt: 'asc' } });
    expect(rows.some((row) => row.action === 'user.member_access.start' && row.reason === '접속 문제를 확인해요')).toBe(true);
    expect(rows.some((row) => row.action === 'user.member_access.end' && (row.afterJson as { accessId: string }).accessId === grant.token.split('.')[1])).toBe(true);
  });

  it('revokes an existing durable grant when the member epoch changes', async () => {
    const { request } = await start();
    await prisma.v1User.update({ where: { id: targetId }, data: { sessionEpoch: { increment: 1 } } });
    await expect(access.authorize(request)).rejects.toMatchObject({ response: { code: 'MEMBER_ACCESS_REVOKED' } });
    expect(await access.status(request)).toMatchObject({ active: true, unavailable: true });
  });

  it('isolates target history from actions that the same member performed on someone else', async () => {
    const own = await prisma.v1StatusChangeLog.create({ data: { targetType: 'user', targetId, fromStatus: 'active', toStatus: 'suspended',
      actorType: 'admin', adminUserId: adminId, reason: '운영자가 상태 확인' } });
    await prisma.v1StatusChangeLog.create({ data: { targetType: 'user', targetId: otherId, fromStatus: 'active', toStatus: 'withdrawal_pending',
      actorType: 'user', actorUserId: targetId, reason: '다른 대상의 기록' } });
    const result = await operations.list(operatorId, 'users', targetId, 'history', 1);
    expect(result.pageInfo.total).toBe(1);
    expect(result.items.map((item) => item.id)).toEqual([own.id]);
    expect(result.items[0].reason).toBe('운영자가 상태 확인');
  });
});

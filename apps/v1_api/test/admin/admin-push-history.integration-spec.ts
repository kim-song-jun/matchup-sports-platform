import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminPushHistoryService } from '../../src/admin/admin-push-history.service';
import { createV1IntegrationApp } from '../integration/integration-app';

describe('Admin push history persisted-data contract', () => {
  let prisma: PrismaService;
  let service: AdminPushHistoryService;
  let cleanupApp: (() => Promise<void>) | undefined;
  const operatorId = randomUUID();
  const recipientId = randomUUID();
  const adminId = randomUUID();
  const auditIds: string[] = [];
  const title = `이력 확인 ${randomUUID()}`;
  beforeAll(async () => {
    const context = await createV1IntegrationApp();
    cleanupApp = context.cleanup;
    prisma = context.app.get(PrismaService);
    service = context.app.get(AdminPushHistoryService);
    await prisma.v1User.create({ data: { id: operatorId, accountStatus: 'active', profile: { create: { nickname: '이력 시험 운영자' } } } });
    await prisma.v1User.create({ data: { id: recipientId, accountStatus: 'active' } });
    await prisma.v1AdminUser.create({ data: { id: adminId, userId: operatorId, adminRole: 'ops' } });
  });
  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.v1AdminActionLog.deleteMany({ where: { id: { in: auditIds } } });
        await prisma.v1AdminUser.deleteMany({ where: { id: adminId } });
        await prisma.v1User.deleteMany({ where: { id: { in: [operatorId, recipientId] } } });
      }
    } finally { await cleanupApp?.(); }
  });
  async function audit(afterJson: Record<string, string | number | null>, at: Date) {
    const id = randomUUID(); auditIds.push(id);
    return prisma.v1AdminActionLog.create({ data: { id, adminUserId: adminId, action: 'push.manual_send', targetType: 'push', targetId: 'broadcast', afterJson, createdAt: at } });
  }

  it('uses the real profile relation and saved payload without borrowing an older body', async () => {
    const row = await audit({ historyVersion: 1, title, target: 'broadcast', body: '저장한 원본', url: '/tournaments', sent: 1, skipped: 0, failed: 0 }, new Date());
    const result = await service.detail(row.id);
    expect(result.sender.name).toBe('이력 시험 운영자');
    expect(result.content).toEqual({ source: 'snapshot', body: '저장한 원본', url: '/tournaments' });
    expect(result.delivery).toEqual({ native: null, web: null });
  });

  it('separates repeated legacy titles at the previous audit and recovers only the newer body', async () => {
    const oldAt = new Date(Date.now() - 120_000);
    const recentAt = new Date(Date.now() - 30_000);
    const repeatedTitle = `${title} 반복`;
    await audit({ title: repeatedTitle, target: 'broadcast', sent: 1 }, oldAt);
    const recent = await audit({ title: repeatedTitle, target: 'broadcast', sent: 1 }, recentAt);
    await prisma.v1Notification.createMany({ data: [
      { recipientUserId: recipientId, targetType: 'notice', title: repeatedTitle, body: '이전 내용', createdAt: new Date(oldAt.getTime() - 1000) },
      { recipientUserId: recipientId, targetType: 'notice', title: repeatedTitle, body: '최근 내용', deepLink: '/tournaments', createdAt: new Date(recentAt.getTime() - 1000) },
    ] });
    expect((await service.detail(recent.id)).content).toEqual({ source: 'notification', body: '최근 내용', url: '/tournaments' });
  });

  it('detects two distinct historical body/path combinations using the real DB query', async () => {
    const at = new Date(Date.now() - 5000);
    const ambiguousTitle = `${title} 여러 내용`;
    const row = await audit({ title: ambiguousTitle, target: 'broadcast', sent: 2 }, at);
    await prisma.v1Notification.createMany({ data: ['A', 'B'].map(body => ({ recipientUserId: recipientId, targetType: 'notice' as const, title: ambiguousTitle, body, createdAt: new Date(at.getTime() - 1000) })) });
    expect((await service.detail(row.id)).content).toEqual({ source: 'ambiguous', body: null, url: null });
  });
});

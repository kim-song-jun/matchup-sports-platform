import { AdminPushHistoryService } from './admin-push-history.service';
import { PrismaService } from '../prisma/prisma.service';

const id = '00000000-0000-4000-8000-000000000001';
const at = new Date('2026-11-20T00:45:28Z');
const log = (afterJson: Record<string, unknown>) => ({
  id, createdAt: at, targetId: 'broadcast', afterJson,
  adminUser: { adminRole: 'ops', user: { profile: { nickname: '운영자', displayName: null } } },
});
const old = { title: '대회 안내', target: 'broadcast', sent: 2, skipped: 1, failed: 0 };

describe('AdminPushHistoryService', () => {
  const prisma = {
    v1AdminActionLog: { findMany: jest.fn(), findFirst: jest.fn() },
    v1Notification: { findMany: jest.fn() },
  };
  const service = new AdminPushHistoryService(prisma as unknown as PrismaService);
  beforeEach(() => jest.resetAllMocks());

  it('pages in stable descending time/id order with no duplicate boundary row', async () => {
    prisma.v1AdminActionLog.findMany.mockResolvedValue([log(old), { ...log(old), id: '00000000-0000-4000-8000-000000000000' }]);
    const first = await service.list({ limit: 1, target: 'broadcast' });
    expect(first.pageInfo.hasNextPage).toBe(true);
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({ title: '대회 안내', sent: 2, sender: { name: '운영자', role: 'ops' } });
    prisma.v1AdminActionLog.findMany.mockResolvedValue([]);
    await service.list({ cursor: first.pageInfo.nextCursor!, target: 'broadcast', limit: 1 });
    expect(prisma.v1AdminActionLog.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { action: 'push.manual_send', targetType: 'push', targetId: 'broadcast', OR: [
        { createdAt: { lt: at } }, { createdAt: at, id: { lt: id } },
      ] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 2,
    }));
  });

  it('rejects malformed cursors without querying a different page', async () => {
    await expect(service.list({ cursor: 'invalid' })).rejects.toMatchObject({ status: 400 });
    expect(prisma.v1AdminActionLog.findMany).not.toHaveBeenCalled();
  });

  it('returns the saved payload and channel results, with no notification or token lookups', async () => {
    prisma.v1AdminActionLog.findFirst.mockResolvedValue(log({
      ...old, historyVersion: 1, body: '우승 혜택 안내', url: '/tournaments',
      push: { subscriptions: 2, delivered: 1, failed: 1, disabled: false,
        native: { devices: 3, delivered: 3, failed: 0, disabled: false } },
    }));
    const detail = await service.detail(id);
    expect(detail.content).toEqual({ source: 'snapshot', body: '우승 혜택 안내', url: '/tournaments' });
    expect(detail.delivery).toEqual({ web: { total: 2, delivered: 1, failed: 1, disabled: false }, native: { total: 3, delivered: 3, failed: 0, disabled: false } });
    expect(prisma.v1Notification.findMany).not.toHaveBeenCalled();
  });

  it('keeps an empty saved body distinct from an unavailable historical body', async () => {
    prisma.v1AdminActionLog.findFirst.mockResolvedValue(log({ ...old, historyVersion: 1, body: null, url: null }));
    expect((await service.detail(id)).content).toEqual({ source: 'snapshot', body: null, url: null });
  });

  it('recovers legacy content only within the previous send/time boundary and labels its source', async () => {
    const previous = new Date('2026-11-20T00:41:18Z');
    prisma.v1AdminActionLog.findFirst.mockResolvedValueOnce(log(old)).mockResolvedValueOnce({ createdAt: previous });
    prisma.v1Notification.findMany.mockResolvedValue([{ body: '보관된 내용', deepLink: '/tournaments' }]);
    const detail = await service.detail(id);
    expect(detail.content).toEqual({ source: 'notification', body: '보관된 내용', url: '/tournaments' });
    expect(detail.delivery).toEqual({ web: null, native: null });
    expect(prisma.v1Notification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { title: old.title, targetType: 'notice', targetId: null, createdAt: { gt: previous, lte: at } },
      distinct: ['body', 'deepLink'], take: 2,
    }));
  });

  it.each([
    [[], 'unavailable'],
    [[{ body: '내용 A', deepLink: '/a' }, { body: '내용 B', deepLink: '/b' }], 'ambiguous'],
  ])('does not invent content when legacy content cannot be determined (%s)', async (candidates, source) => {
    prisma.v1AdminActionLog.findFirst.mockResolvedValueOnce(log(old)).mockResolvedValueOnce(null);
    prisma.v1Notification.findMany.mockResolvedValue(candidates);
    expect((await service.detail(id)).content).toEqual({ source, body: null, url: null });
  });

  it('limits a historical single-user lookup to that actual recipient', async () => {
    prisma.v1AdminActionLog.findFirst.mockResolvedValueOnce({ ...log({ ...old, target: 'user' }), targetId: id }).mockResolvedValueOnce(null);
    prisma.v1Notification.findMany.mockResolvedValue([]);
    await service.detail(id);
    expect(prisma.v1Notification.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ recipientUserId: id }) }));
  });

  it('preserves unknown counts and refuses to borrow a notification for zero recipients', async () => {
    prisma.v1AdminActionLog.findFirst.mockResolvedValueOnce(log({ ...old, sent: 0, failed: 'unknown' }));
    const detail = await service.detail(id);
    expect(detail.failed).toBeNull();
    expect(detail.content.source).toBe('unavailable');
    expect(prisma.v1Notification.findMany).not.toHaveBeenCalled();
  });

  it('requires the requested ID to be a manual push audit, not any other admin action', async () => {
    prisma.v1AdminActionLog.findFirst.mockResolvedValue(null);
    await expect(service.detail(id)).rejects.toMatchObject({ status: 404 });
    expect(prisma.v1AdminActionLog.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id, action: 'push.manual_send', targetType: 'push' } }));
  });
});

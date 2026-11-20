import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminPushHistoryQueryDto } from './dto/admin-push-history.dto';

const ACTION = 'push.manual_send';
const select = {
  id: true, createdAt: true, targetId: true, afterJson: true,
  adminUser: { select: { adminRole: true, user: { select: { profile: { select: { nickname: true, displayName: true } } } } } },
} satisfies Prisma.V1AdminActionLogSelect;
type HistoryLog = Prisma.V1AdminActionLogGetPayload<{ select: typeof select }>;

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown): string | null { return typeof value === 'string' ? value : null; }
function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function channel(value: unknown, totalKey: 'subscriptions' | 'devices') {
  const row = object(value);
  const total = count(row[totalKey]);
  const delivered = count(row.delivered);
  const failed = count(row.failed);
  if (total === null || delivered === null || failed === null || typeof row.disabled !== 'boolean') return null;
  return { total, delivered, failed, disabled: row.disabled };
}

function summary(row: HistoryLog) {
  const data = object(row.afterJson);
  return {
    id: row.id,
    createdAt: row.createdAt,
    title: text(data.title),
    target: data.target === 'broadcast' || data.target === 'user' ? data.target : null,
    recipientUserId: data.target === 'user' ? row.targetId : null,
    sender: {
      name: row.adminUser.user.profile?.nickname ?? row.adminUser.user.profile?.displayName ?? null,
      role: row.adminUser.adminRole,
    },
    sent: count(data.sent), skipped: count(data.skipped), failed: count(data.failed),
  };
}

/** Reads existing audit records; it never sends, backfills, or edits a user's notification. */
@Injectable()
export class AdminPushHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminPushHistoryQueryDto) {
    const limit = query.limit ?? 20;
    const where: Prisma.V1AdminActionLogWhereInput = { action: ACTION, targetType: 'push' };
    if (query.target) where.targetId = query.target === 'broadcast' ? 'broadcast' : { not: 'broadcast' };
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      where.OR = [
        { createdAt: { lt: cursor.at } },
        { createdAt: cursor.at, id: { lt: cursor.id } },
      ];
    }
    const rows = await this.prisma.v1AdminActionLog.findMany({
      where, select, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
    });
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    const hasNextPage = rows.length > limit;
    return {
      items: items.map(summary),
      pageInfo: {
        hasNextPage,
        nextCursor: hasNextPage && last
          ? Buffer.from(JSON.stringify({ at: last.createdAt.toISOString(), id: last.id })).toString('base64url') : null,
      },
    };
  }

  async detail(id: string) {
    const row = await this.prisma.v1AdminActionLog.findFirst({ where: { id, action: ACTION, targetType: 'push' }, select });
    if (!row) throw new NotFoundException({ code: 'PUSH_HISTORY_NOT_FOUND', message: '발송 이력을 찾을 수 없어요.' });
    const data = object(row.afterJson);
    const push = object(data.push);
    const content = data.historyVersion === 1
      ? { source: 'snapshot' as const, body: text(data.body), url: text(data.url) }
      : await this.legacyContent(row);
    return {
      ...summary(row), content,
      delivery: { web: channel(push, 'subscriptions'), native: channel(push.native, 'devices') },
    };
  }

  private async legacyContent(row: HistoryLog): Promise<{
    source: 'notification' | 'unavailable' | 'ambiguous'; body: string | null; url: string | null;
  }> {
    const data = object(row.afterJson);
    const title = text(data.title);
    const missing = { source: 'unavailable' as const, body: null, url: null };
    if (title === null || count(data.sent) === null || data.sent === 0 || !['user', 'broadcast'].includes(String(data.target))) return missing;
    // Older audits saved no payload. Bound the lookup by the previous same-title send and
    // ten minutes, and label the result as a preserved notification, never as the request.
    const previous = await this.prisma.v1AdminActionLog.findFirst({
      where: { action: ACTION, targetType: 'push', createdAt: { lt: row.createdAt }, afterJson: { path: ['title'], equals: title } },
      select: { createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const start = new Date(Math.max(row.createdAt.getTime() - 10 * 60_000, previous?.createdAt.getTime() ?? 0));
    const candidates = await this.prisma.v1Notification.findMany({
      where: {
        title, targetType: 'notice', targetId: null, createdAt: { gt: start, lte: row.createdAt },
        ...(data.target === 'user' ? { recipientUserId: row.targetId } : {}),
      },
      select: { body: true, deepLink: true }, distinct: ['body', 'deepLink'], take: 2,
    });
    if (candidates.length === 0) return missing;
    if (candidates.length > 1) return { ...missing, source: 'ambiguous' };
    return { source: 'notification', body: candidates[0].body, url: candidates[0].deepLink };
  }
}

function decodeCursor(value: string): { at: Date; id: string } {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('encoding');
    const decoded = object(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    const at = typeof decoded.at === 'string' ? new Date(decoded.at) : new Date(NaN);
    if (!Number.isFinite(at.getTime()) || typeof decoded.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded.id)) throw new Error('cursor');
    return { at, id: decoded.id };
  } catch {
    throw new BadRequestException({ code: 'INVALID_CURSOR', message: '발송 이력의 페이지 정보가 올바르지 않아요.' });
  }
}

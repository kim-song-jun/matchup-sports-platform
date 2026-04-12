import { Injectable, NotFoundException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType } from '@prisma/client';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WebPushService } from './web-push.service';
import { presentNotification, notificationCategory } from './notification-presentation';
import { UpdateNotificationPreferenceDto } from './dto/notification-preference.dto';
import { UserBlocksService } from '../user-blocks/user-blocks.service';
import { RedisCacheService } from '../redis/redis-cache.service';

const UNREAD_COUNT_TTL = 30; // 30 seconds

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => RealtimeGateway))
    private readonly realtime: RealtimeGateway,
    private readonly webPushService: WebPushService,
    private readonly userBlocksService: UserBlocksService,
    private readonly cache: RedisCacheService,
  ) {}

  async create(data: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    /** Optional sender — if the recipient has blocked this user, the notification is suppressed. */
    fromUserId?: string;
  }) {
    // Block check: suppress notification when recipient has blocked the sender
    if (data.fromUserId && (await this.userBlocksService.isBlocked(data.userId, data.fromUserId))) {
      return null;
    }

    // Check user notification preferences; default to enabled when no preference row exists
    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId: data.userId },
    });

    if (preference) {
      const category = notificationCategory(data.type);
      const blocked =
        (category === 'match' && !preference.matchEnabled) ||
        (category === 'team' && !preference.teamEnabled) ||
        (category === 'chat' && !preference.chatEnabled) ||
        (category === 'payment' && !preference.paymentEnabled);

      if (blocked) {
        return null;
      }
    }

    const notification = await this.prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        data: data.data ? JSON.parse(JSON.stringify(data.data)) : undefined,
      },
    });

    await this.cache.del(`notifications:unread:${data.userId}`);

    const payload = presentNotification(notification);

    this.realtime.emitToUser(data.userId, 'notification:new', payload);

    // Fire-and-forget push notification
    void this.webPushService.sendToUser(data.userId, {
      title: data.title,
      body: data.body,
    });

    return payload;
  }

  async findMine(
    userId: string,
    opts: { isRead?: boolean; cursor?: string; limit?: number } = {},
  ) {
    const { isRead, cursor, limit = 20 } = opts;

    // Fetch one extra to determine hasMore
    const notifications = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(isRead !== undefined ? { isRead } : {}),
      },
      orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
      take: limit + 1,
      ...(cursor
        ? { skip: 1, cursor: { id: cursor } }
        : {}),
    });

    const hasMore = notifications.length > limit;
    const page = hasMore ? notifications.slice(0, limit) : notifications;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    return {
      items: page.map((notification) => presentNotification(notification)),
      nextCursor,
      hasMore,
    };
  }

  async markRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('알림을 찾을 수 없습니다.');
    }
    if (notification.userId !== userId) {
      throw new ForbiddenException('권한이 없습니다.');
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    await this.cache.del(`notifications:unread:${userId}`);

    const payload = presentNotification(updated);
    this.realtime.emitToUser(userId, 'notification:read', {
      notificationId,
    });

    return payload;
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    await this.cache.del(`notifications:unread:${userId}`);

    this.realtime.emitToUser(userId, 'notification:read-all', {
      count: result.count,
    });
    return { count: result.count };
  }

  async getUnreadCount(userId: string) {
    const cacheKey = `notifications:unread:${userId}`;
    const cached = await this.cache.get<{ count: number }>(cacheKey);
    if (cached) return cached;

    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    const result = { count };
    await this.cache.set(cacheKey, result, UNREAD_COUNT_TTL);
    return result;
  }

  async getPreferences(userId: string) {
    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!preference) {
      // Return default all-enabled when no row exists yet
      return {
        id: null,
        matchEnabled: true,
        teamEnabled: true,
        chatEnabled: true,
        paymentEnabled: true,
      };
    }

    return {
      id: preference.id,
      matchEnabled: preference.matchEnabled,
      teamEnabled: preference.teamEnabled,
      chatEnabled: preference.chatEnabled,
      paymentEnabled: preference.paymentEnabled,
    };
  }

  async updatePreferences(userId: string, dto: UpdateNotificationPreferenceDto) {
    const preference = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        matchEnabled: dto.matchEnabled ?? true,
        teamEnabled: dto.teamEnabled ?? true,
        chatEnabled: dto.chatEnabled ?? true,
        paymentEnabled: dto.paymentEnabled ?? true,
      },
      update: {
        ...(dto.matchEnabled !== undefined && { matchEnabled: dto.matchEnabled }),
        ...(dto.teamEnabled !== undefined && { teamEnabled: dto.teamEnabled }),
        ...(dto.chatEnabled !== undefined && { chatEnabled: dto.chatEnabled }),
        ...(dto.paymentEnabled !== undefined && { paymentEnabled: dto.paymentEnabled }),
      },
    });

    return {
      id: preference.id,
      matchEnabled: preference.matchEnabled,
      teamEnabled: preference.teamEnabled,
      chatEnabled: preference.chatEnabled,
      paymentEnabled: preference.paymentEnabled,
    };
  }

}

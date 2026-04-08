import { Injectable, NotFoundException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType } from '@prisma/client';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WebPushService } from './web-push.service';
import { presentNotification } from './notification-presentation';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => RealtimeGateway))
    private readonly realtime: RealtimeGateway,
    private readonly webPushService: WebPushService,
  ) {}

  async create(data: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        data: data.data ? JSON.parse(JSON.stringify(data.data)) : undefined,
      },
    });

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

    const notifications = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(isRead !== undefined ? { isRead } : {}),
      },
      orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
      take: limit,
      ...(cursor
        ? { skip: 1, cursor: { id: cursor } }
        : {}),
    });

    return notifications.map((notification) => presentNotification(notification));
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
    this.realtime.emitToUser(userId, 'notification:read-all', {
      count: result.count,
    });
    return { count: result.count };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

}

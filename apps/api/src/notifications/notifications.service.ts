import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async registerToken(userId: string, token: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { fcmToken: token },
    });
    return { message: 'FCM 토큰이 등록되었습니다.' };
  }

  async send(userId: string, type: NotificationType, title: string, body: string, data?: Record<string, unknown>) {
    const notification = await this.prisma.notification.create({
      data: { userId, type, title, body, data: data ? JSON.parse(JSON.stringify(data)) : undefined },
    });

    // TODO: FCM 푸시 발송
    // const user = await this.prisma.user.findUnique({ where: { id: userId } });
    // if (user?.fcmToken) { ... }

    return notification;
  }
}

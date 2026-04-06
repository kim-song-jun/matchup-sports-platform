import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as webpush from 'web-push';

interface PushNotification {
  title: string;
  body: string;
  url?: string;
}

@Injectable()
export class WebPushService implements OnModuleInit {
  private readonly logger = new Logger(WebPushService.name);
  isEnabled = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT');

    if (!publicKey || !privateKey || !subject) {
      this.logger.warn('VAPID keys missing — Web Push notifications disabled');
      return;
    }

    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.isEnabled = true;
      this.logger.log('Web Push (VAPID) initialized');
    } catch (err) {
      this.logger.warn(`Web Push init failed — disabled: ${err}`);
    }
  }

  /** Upsert a push subscription by endpoint. */
  async subscribe(
    userId: string,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: { userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, lastUsedAt: new Date() },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });
    return { message: '푸시 구독이 등록되었습니다.' };
  }

  /** Remove a push subscription by endpoint for a user. */
  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return { message: '푸시 구독이 삭제되었습니다.' };
  }

  /** Send a push notification to all subscriptions for a user (best-effort). */
  async sendToUser(userId: string, notification: PushNotification): Promise<void> {
    if (!this.isEnabled) return;

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    if (subscriptions.length === 0) return;

    const payload = JSON.stringify({ title: notification.title, body: notification.body, url: notification.url });
    const expiredIds: string[] = [];

    await Promise.all(
      subscriptions.map(async ({ id, endpoint, p256dh, auth }) => {
        try {
          await webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, payload);
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 410) {
            // 410 Gone — subscription is no longer valid
            expiredIds.push(id);
          } else {
            this.logger.warn(`Web Push send failed for subscription ${id}: ${statusCode ?? err}`);
          }
        }
      }),
    );

    if (expiredIds.length > 0) {
      await this.prisma.pushSubscription.deleteMany({ where: { id: { in: expiredIds } } });
      this.logger.log(`Removed ${expiredIds.length} expired push subscription(s) for userId=${userId}`);
    }
  }

  /** Return the configured VAPID public key (null if not configured). */
  getPublicKey(): string | null {
    return this.config.get<string>('VAPID_PUBLIC_KEY') ?? null;
  }

  /** Generate a new VAPID key pair (use once during initial setup). */
  static generateVapidKeys() {
    return webpush.generateVAPIDKeys();
  }
}

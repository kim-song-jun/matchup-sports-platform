import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ENDPOINT_SUFFIX_LENGTH } from '../common/constants/ops';
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
    const publicKey = this.config.get<string>('vapid.publicKey');
    const privateKey = this.config.get<string>('vapid.privateKey');
    const subject = this.config.get<string>('vapid.subject');

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
          if (statusCode === 410 || statusCode === 404) {
            // 410 Gone / 404 Not Found — subscription is expired; clean up silently
            expiredIds.push(id);
          } else {
            const errorCode = this.resolveErrorCode(statusCode);
            this.logger.warn(`Web Push send failed for subscription ${id}: ${statusCode ?? err}`);
            // Fire-and-forget: failure log write must never interrupt the push flow
            this.prisma.webPushFailureLog
              .create({
                data: {
                  userId,
                  subscriptionId: id,
                  statusCode: typeof statusCode === 'number' ? statusCode : null,
                  errorCode,
                  endpointSuffix: endpoint.slice(-ENDPOINT_SUFFIX_LENGTH),
                },
              })
              .catch(() => {
                // swallow — log persistence failure must not affect caller
              });
          }
        }
      }),
    );

    if (expiredIds.length > 0) {
      await this.prisma.pushSubscription.deleteMany({ where: { id: { in: expiredIds } } });
      this.logger.log(`Removed ${expiredIds.length} expired push subscription(s) for userId=${userId}`);
    }
  }

  /** Map a raw HTTP status code (or absence thereof) to a short error code string. */
  private resolveErrorCode(statusCode: number | undefined): string {
    if (statusCode === undefined || statusCode === null) return 'NETWORK';
    if (statusCode >= 500) return 'HTTP_5XX';
    if (statusCode === 429) return 'RATE_LIMITED';
    return `HTTP_${statusCode}`;
  }

  /** Return the configured VAPID public key (null if not configured). */
  getPublicKey(): string | null {
    return this.config.get<string>('vapid.publicKey') ?? null;
  }

  /** Generate a new VAPID key pair (use once during initial setup). */
  static generateVapidKeys() {
    return webpush.generateVAPIDKeys();
  }
}

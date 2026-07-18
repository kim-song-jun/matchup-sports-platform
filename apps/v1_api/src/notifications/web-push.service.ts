import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

interface PushPayload {
  title: string;
  body?: string;
  url?: string;
}

@Injectable()
export class WebPushService implements OnModuleInit {
  private readonly logger = new Logger(WebPushService.name);
  private enabled = false;
  private publicKey: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;

    if (!publicKey || !privateKey || !subject) {
      this.logger.warn('VAPID keys not configured — Web Push disabled');
      return;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.publicKey = publicKey;
    this.enabled = true;
  }

  getPublicKey(): string | null {
    return this.enabled ? this.publicKey : null;
  }

  async subscribe(userId: string, dto: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void> {
    await this.prisma.v1PushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: { userId, endpoint: dto.endpoint, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
      update: { p256dh: dto.keys.p256dh, auth: dto.keys.auth, userId },
    });
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.prisma.v1PushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.enabled) return;

    const subscriptions = await this.prisma.v1PushSubscription.findMany({ where: { userId } });
    await Promise.all(
      subscriptions.map((subscription) =>
        webpush
          .sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            JSON.stringify(payload),
          )
          .catch(async (error: { statusCode?: number }) => {
            if (error.statusCode === 410 || error.statusCode === 404) {
              try {
                await this.prisma.v1PushSubscription.delete({ where: { id: subscription.id } });
              } catch {
                // subscription already removed — safe to ignore
              }
              return;
            }
            try {
              await this.prisma.v1WebPushFailureLog.create({
                data: {
                  userId,
                  subscriptionId: subscription.id,
                  statusCode: error.statusCode ?? null,
                  endpointSuffix: subscription.endpoint.slice(-12),
                },
              });
            } catch {
              // failure logging must never break the send flow
            }
          }),
      ),
    );
  }
}

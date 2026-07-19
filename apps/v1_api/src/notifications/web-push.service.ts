import { ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    try {
      await this.prisma.v1PushSubscription.create({
        data: { userId, endpoint: dto.endpoint, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
      });
      return;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    }

    // endpoint unique 충돌 — DB가 보장하는 원자적 신호를 기준으로 소유권을 재확인한다
    // (create 이전의 findUnique는 그 자체로 TOCTOU race를 남기므로 쓰지 않는다).
    const existing = await this.prisma.v1PushSubscription.findUnique({ where: { endpoint: dto.endpoint } });
    if (!existing || existing.userId !== userId) {
      throw new ConflictException({
        code: 'PUSH_ENDPOINT_ALREADY_REGISTERED',
        message: '이미 다른 계정에 등록된 구독이에요.',
      });
    }

    await this.prisma.v1PushSubscription.update({
      where: { endpoint: dto.endpoint },
      data: { p256dh: dto.keys.p256dh, auth: dto.keys.auth },
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

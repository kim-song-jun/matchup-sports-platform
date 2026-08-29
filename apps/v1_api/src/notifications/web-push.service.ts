import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { FcmPushService } from './fcm-push.service';

interface PushPayload {
  notificationId?: string;
  title: string;
  body?: string;
  url?: string;
}

/** 한 사용자에 대한 푸시 발송 결과 요약. */
export interface PushDeliverySummary {
  /** 이 사용자에게 등록돼 있던 구독 수. 0이면 보낼 곳 자체가 없었다는 뜻이다. */
  subscriptions: number;
  /** 푸시 서비스가 접수한 수(기기 도착까지 보장하지는 않는다). */
  delivered: number;
  /** 전송 실패 수. 410/404(만료)로 구독을 정리한 경우도 포함한다. */
  failed: number;
  /** VAPID 미설정으로 웹 푸시 자체가 꺼져 있으면 true. */
  disabled: boolean;
}

@Injectable()
export class WebPushService implements OnModuleInit {
  private enabled = false;
  private publicKey: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @InjectPinoLogger(WebPushService.name) private readonly logger: PinoLogger,
    @Optional() private readonly fcmPushService?: FcmPushService,
  ) {}

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

  /**
   * 사용자의 모든 구독으로 푸시를 시도하고 그 결과를 요약해 돌려준다.
   *
   * 예외는 여전히 전부 삼킨다 — 푸시 실패가 호출부(알림 생성)를 되돌리면 안 된다.
   * 다만 아무 값도 돌려주지 않으면 호출부가 "성공"과 "구독이 하나도 없음"과
   * "전송 실패"를 구분할 수 없어, 운영 화면이 실제로는 아무에게도 안 간 발송을
   * 성공으로 표시하게 된다. 그래서 상태만 요약해 반환한다.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<PushDeliverySummary> {
    const nativeDelivery = this.fcmPushService
      ?.sendToUser(userId, {
        notificationId: payload.notificationId ?? randomUUID(),
        title: payload.title,
        body: payload.body,
        route: payload.url,
      })
      .catch((err: unknown) => {
        this.logger.warn({ userId, err }, 'Android FCM delivery failed');
      });

    const webDelivery = this.sendWebPushToUser(userId, payload);
    const [summary] = await Promise.all([webDelivery, nativeDelivery]);
    return summary;
  }

  private async sendWebPushToUser(userId: string, payload: PushPayload): Promise<PushDeliverySummary> {
    if (!this.enabled) return { subscriptions: 0, delivered: 0, failed: 0, disabled: true };

    const subscriptions = await this.prisma.v1PushSubscription.findMany({ where: { userId } });
    let delivered = 0;
    let failed = 0;

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
          .then(() => {
            delivered += 1;
          })
          .catch(async (error: { statusCode?: number; message?: string }) => {
            failed += 1;
            if (error.statusCode === 410 || error.statusCode === 404) {
              try {
                await this.prisma.v1PushSubscription.delete({ where: { id: subscription.id } });
              } catch (deleteError) {
                const alreadyRemoved =
                  deleteError instanceof Prisma.PrismaClientKnownRequestError && deleteError.code === 'P2025';
                if (!alreadyRemoved) {
                  this.logger.warn(
                    { userId, subscriptionId: subscription.id, err: deleteError },
                    '만료된 웹 푸시 구독 삭제 실패',
                  );
                }
              }
              return;
            }

            this.logger.warn(
              {
                userId,
                subscriptionId: subscription.id,
                statusCode: error.statusCode ?? null,
                message: error.message ?? null,
              },
              '웹 푸시 발송 실패',
            );

            try {
              await this.prisma.v1WebPushFailureLog.create({
                data: {
                  userId,
                  subscriptionId: subscription.id,
                  statusCode: error.statusCode ?? null,
                  endpointSuffix: subscription.endpoint.slice(-6),
                },
              });
            } catch (logError) {
              this.logger.error(
                { userId, subscriptionId: subscription.id, err: logError },
                '웹 푸시 실패 기록(V1WebPushFailureLog) 저장 실패',
              );
            }
          }),
      ),
    );

    return { subscriptions: subscriptions.length, delivered, failed, disabled: false };
  }
}

import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { V1PushEnvironment, V1PushPlatform } from '@prisma/client';
import { ApnsPushService } from './apns-push.service';
import { FcmPushService } from './fcm-push.service';
import { NativeDeliverySummary, NativePushPayload, PushTarget } from './native-push.types';
import { PushDeviceService } from './push-device.service';
import { resolvePushEnvironment } from './push-environment';

interface PushPayload {
  notificationId?: string;
  title: string;
  body?: string;
  url?: string;
}

/** 한 사용자에 대한 푸시 발송 결과 요약. */
/**
 * 웹 구독과 앱 기기의 결과를 **나란히** 담는다. 한쪽이 0이어도 다른 쪽은 갔을 수 있으므로
 * 합치지 않는다.
 *
 * `native` 가 없던 동안, 앱 기기만 가진 사용자에게 어드민이 수동 푸시를 보내면 실제로는
 * 발송됐는데 화면에는 0건으로 보였다(admin-ops.service.ts 가 이 요약을 그대로 응답에 싣는다).
 * 운영자가 안 갔다고 판단해 다시 보내거나 장애로 오인한다.
 */
export type PushDeliverySummary = WebDeliverySummary & {
  native: NativeDeliverySummary;
};

export interface WebDeliverySummary {
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
  /**
   * Resolved once at startup, like the adapters do, rather than per send. Reading it on
   * every notification would make a deployment with push switched off log a warning for
   * each one.
   */
  private pushEnvironment: V1PushEnvironment | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @InjectPinoLogger(WebPushService.name) private readonly logger: PinoLogger,
    // PushDeviceService depends only on PrismaService, so injecting it here keeps this
    // module free of domain imports — the property the module comment relies on.
    private readonly pushDevices: PushDeviceService,
    @Optional() private readonly fcmPushService?: FcmPushService,
    @Optional() private readonly apnsPushService?: ApnsPushService,
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
    // 한쪽 채널의 실패가 다른 쪽을 취소하거나 호출부를 되돌리면 안 된다 — 그래서 예외는
    // 여기서 삼키고, 그 사실을 0이 아니라 요약으로 돌려준다.
    const nativeDelivery = this.sendNativeToUser(userId, payload).catch(
      (err: unknown): NativeDeliverySummary => {
        this.logger.warn({ userId, err }, 'native push delivery failed');
        return { devices: 0, delivered: 0, failed: 0, disabled: false };
      },
    );

    const webDelivery = this.sendWebPushToUser(userId, payload);
    const [summary, native] = await Promise.all([webDelivery, nativeDelivery]);
    return { ...summary, native };
  }

  /**
   * Fans a notification out to the user's registered devices, one adapter per platform.
   *
   * Device selection lives here rather than inside each adapter so that an unrouted
   * platform is visible. A platform added to `V1PushPlatform` with no adapter behind it
   * would otherwise show up as "nobody was subscribed" — indistinguishable from success —
   * so it is logged as an error and counted as a failure instead.
   *
   * One platform failing must not cancel another: each adapter is awaited independently and
   * its rejection is caught here.
   */
  private async sendNativeToUser(
    userId: string,
    payload: PushPayload,
  ): Promise<NativeDeliverySummary> {
    // Configured adapters only. A deployment with push turned off has none, and asking for
    // the environment in that state would throw where the old per-adapter path simply did
    // nothing.
    const adapters = [this.fcmPushService, this.apnsPushService].filter(
      (adapter): adapter is FcmPushService | ApnsPushService =>
        adapter !== undefined && adapter.isConfigured,
    );
    // 앱 푸시가 꺼진 배포. 보낼 통로 자체가 없다는 것과 "보냈는데 0건"은 다르다.
    if (adapters.length === 0) return { devices: 0, delivered: 0, failed: 0, disabled: true };

    const environment = this.nativeEnvironment();
    if (environment === null) {
      // Something can deliver but nothing says where to. Unreachable through the adapters'
      // own startup guards, which refuse to boot in this state — but a silent return here
      // is how a deployment sends nothing for days, so it is said out loud.
      this.logger.error(
        { userId, platforms: adapters.map((adapter) => adapter.platform) },
        'push adapters are configured but V1_PUSH_ENVIRONMENT is unusable — devices were not notified',
      );
      return { devices: 0, delivered: 0, failed: 0, disabled: false };
    }

    const devices = await this.pushDevices.activeTokens(userId, environment);
    if (devices.length === 0) return { devices: 0, delivered: 0, failed: 0, disabled: false };

    const byPlatform = new Map<V1PushPlatform, PushTarget[]>();
    for (const device of devices) {
      const bucket = byPlatform.get(device.platform) ?? [];
      bucket.push(device);
      byPlatform.set(device.platform, bucket);
    }

    const native: NativePushPayload = {
      notificationId: payload.notificationId ?? randomUUID(),
      title: payload.title,
      body: payload.body,
      route: payload.url,
    };

    const perPlatform = await Promise.all(
      [...byPlatform].map(async ([platform, targets]): Promise<NativeDeliverySummary> => {
        const failed = { devices: targets.length, delivered: 0, failed: targets.length, disabled: false };
        const adapter = adapters.find((candidate) => candidate.platform === platform);
        if (!adapter) {
          this.logger.error(
            { userId, platform, deviceCount: targets.length },
            'no push adapter is registered for this platform — devices were not notified',
          );
          return failed;
        }
        try {
          return await adapter.send(targets, native);
        } catch (err) {
          this.logger.warn({ userId, platform, err }, 'native push adapter failed');
          return failed;
        }
      }),
    );

    return perPlatform.reduce<NativeDeliverySummary>(
      (total, one) => ({
        devices: total.devices + one.devices,
        delivered: total.delivered + one.delivered,
        failed: total.failed + one.failed,
        // 하나라도 실제로 보냈으면 통로가 꺼진 상태가 아니다.
        disabled: total.disabled && one.disabled,
      }),
      { devices: 0, delivered: 0, failed: 0, disabled: true },
    );
  }

  /**
   * Which environment's devices to deliver to, resolved on first use and cached.
   *
   * This used to be read in `onModuleInit` from the adapters' `isConfigured`, which each
   * adapter only sets inside its *own* `onModuleInit`. Nest promises no order between two
   * providers' init hooks, so whether push worked depended on which ran first: this service
   * going first saw two unconfigured adapters, kept a null environment, and returned from
   * every later send without a word.
   *
   * Deferring keeps the property that put it in `onModuleInit` to begin with — a deployment
   * with push turned off has no configured adapter, so the caller returns before reaching
   * here and no per-notification warning is produced.
   */
  private nativeEnvironment(): V1PushEnvironment | null {
    if (this.pushEnvironment !== null) return this.pushEnvironment;
    try {
      this.pushEnvironment = resolvePushEnvironment();
    } catch {
      return null;
    }
    return this.pushEnvironment;
  }

  /** 웹 구독만의 결과. 네이티브 결과는 `sendToUser` 가 별도 필드로 합친다. */
  private async sendWebPushToUser(
    userId: string,
    payload: PushPayload,
  ): Promise<WebDeliverySummary> {
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

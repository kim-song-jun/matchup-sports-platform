import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService, V1ActiveAdmin } from '../common/admin-context.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WebPushService } from '../notifications/web-push.service';
import { AdminPushSendDto } from './dto/admin-push-send.dto';

export interface PushFailureSummary {
  id: string;
  userIdHash: string;
  endpointSuffix: string;
  statusCode: number | null;
  occurredAt: Date;
  acknowledgedAt: Date | null;
}

export interface ManualPushSendResult {
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * 브로드캐스트 동시성 상한. 청크 "안"은 Promise.all로 최대 이 수만큼 동시 발송하고,
 * 청크와 청크 "사이"는 순차로 진행한다(한 청크가 끝나야 다음 청크를 시작) — 무제한
 * 동시성으로 인한 과부하를 이 상한으로 막으면서도, 완전 순차(1명씩)보다 훨씬 빠르게
 * 대량 발송을 끝낸다. 30은 웹 푸시 provider/DB에 순간적으로 걸어도 안전한 수준의
 * 통상적인 배치 크기다.
 */
const BROADCAST_CHUNK_SIZE = 30;

@Injectable()
export class AdminOpsService {
  private readonly logger = new Logger(AdminOpsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly webPushService: WebPushService,
  ) {}

  async recentPushFailures(limit: number): Promise<PushFailureSummary[]> {
    const failures = await this.prisma.v1WebPushFailureLog.findMany({
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });

    return failures.map((failure) => ({
      id: failure.id,
      userIdHash: createHash('sha256').update(failure.userId).digest('hex').slice(0, 8),
      endpointSuffix: failure.endpointSuffix.slice(-6),
      statusCode: failure.statusCode,
      occurredAt: failure.occurredAt,
      acknowledgedAt: failure.acknowledgedAt,
    }));
  }

  async acknowledgeFailures(ids: string[], admin: V1ActiveAdmin): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // updateMany는 몇 건이 바뀌었는지(count)만 알려주고 어떤 id가 실제로 바뀌었는지는
      // 알려주지 않는다 — 감사 로그가 실제 상태 변경과 어긋나지 않도록, 대상 id를 먼저
      // 조회해 그 id들에 대해서만 업데이트+로그를 남긴다.
      const toAck = await tx.v1WebPushFailureLog.findMany({
        where: { id: { in: ids }, acknowledgedAt: null },
        select: { id: true },
      });
      if (toAck.length === 0) return;

      await tx.v1WebPushFailureLog.updateMany({
        where: { id: { in: toAck.map((row) => row.id) } },
        data: { acknowledgedAt: new Date(), acknowledgedBy: admin.userId },
      });

      // 감사 로그를 같은 트랜잭션에 묶어, 로그 기록 실패로 ack 자체가 부분 커밋된
      // 채로 500이 나는 상황(updateMany는 이미 커밋됐는데 응답만 실패)을 막는다.
      for (const { id } of toAck) {
        await this.adminContext.logAdminAction(
          admin,
          { action: 'web_push_failure_log.ack', targetType: 'web_push_failure_log', targetId: id },
          tx,
        );
      }
    });
  }

  async pushFailuresLast5Minutes(): Promise<number> {
    return this.prisma.v1WebPushFailureLog.count({
      where: { occurredAt: { gte: new Date(Date.now() - 5 * 60_000) } },
    });
  }

  /**
   * 어드민 수동 웹 푸시 발송 — 특정 유저 1명 또는 현재 구독 중인 전체 유저에게
   * V1Notification 생성 + 실시간 소켓 알림 + 웹 푸시를 순서대로 처리한다.
   *
   * targetType은 'notice'를 쓴다: schema의 V1NotificationTargetType에는
   * 'admin_broadcast' 같은 값이 없고, 이미 존재하는 'notice' + 이에 대응하는
   * V1NotificationPreference.noticeEnabled(공지사항 알림 여부) 쌍이 "운영진이
   * 임의로 보내는 공지성 알림"이라는 이 기능의 의미와 정확히 일치한다 — 새
   * enum 값을 추가해 마이그레이션을 늘리기보다 기존 값을 재사용했다.
   */
  async sendManualPush(dto: AdminPushSendDto, admin: V1ActiveAdmin): Promise<ManualPushSendResult> {
    let result: ManualPushSendResult;
    let targetId: string;

    if (dto.target === 'user') {
      // dto.userId is guaranteed by AdminPushSendDto's ValidateIf(target === 'user').
      const userId = dto.userId as string;
      const user = await this.prisma.v1User.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) {
        throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User was not found' });
      }
      targetId = userId;
      const outcome = await this.sendToOneRecipient(userId, dto);
      result = { sent: outcome === 'sent' ? 1 : 0, skipped: outcome === 'skipped' ? 1 : 0, failed: outcome === 'failed' ? 1 : 0 };
    } else {
      targetId = 'broadcast';
      result = { sent: 0, skipped: 0, failed: 0 };
      // 구독자 전체를 findMany로 한 번에 메모리에 올리지 않고, id 커서로 DB에서
      // 청크 단위로 페이지네이션해 가져온다 — 구독자 수가 커져도 한 번에 들고
      // 있는 row 수는 BROADCAST_CHUNK_SIZE로 고정된다.
      const sentUserIds = new Set<string>();
      let cursor: string | undefined;
      for (;;) {
        const page = await this.prisma.v1PushSubscription.findMany({
          take: BROADCAST_CHUNK_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
          select: { id: true, userId: true },
        });
        if (page.length === 0) break;
        cursor = page[page.length - 1].id;

        const newUserIds = [...new Set(page.map((row) => row.userId))].filter(
          (userId) => !sentUserIds.has(userId),
        );
        newUserIds.forEach((userId) => sentUserIds.add(userId));
        const outcomes = await Promise.all(newUserIds.map((userId) => this.sendToOneRecipient(userId, dto)));
        for (const outcome of outcomes) {
          result[outcome === 'sent' ? 'sent' : outcome === 'skipped' ? 'skipped' : 'failed'] += 1;
        }

        if (page.length < BROADCAST_CHUNK_SIZE) break;
      }
    }

    // 감사 로그 기록 실패가 이미 완료된 발송 결과를 500으로 뒤엎지 않도록 별도로
    // 격리한다 — 그대로 두면 운영자가 "실패"로 오인해 재시도하면서 중복 발송할
    // 위험이 있다.
    try {
      await this.adminContext.logAdminAction(admin, {
        action: 'push.manual_send',
        targetType: 'push',
        targetId,
        afterJson: {
          title: dto.title,
          target: dto.target,
          sent: result.sent,
          skipped: result.skipped,
          failed: result.failed,
        },
      });
    } catch (err: unknown) {
      this.logger.warn(
        `수동 푸시 발송 감사 로그 기록 실패 [targetId=${targetId}]: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return result;
  }

  /**
   * 수신자 1명에 대한 알림 선호도 체크 + 생성 + 발송을 처리한다. 브로드캐스트 시
   * 한 유저의 실패가 나머지 유저 발송을 막지 않도록, 모든 예외는 이 함수 안에서
   * 흡수하고 결과 상태로만 알린다.
   */
  private async sendToOneRecipient(
    userId: string,
    dto: AdminPushSendDto,
  ): Promise<'sent' | 'skipped' | 'failed'> {
    try {
      const pref = await this.prisma.v1NotificationPreference.findUnique({
        where: { userId },
        select: { noticeEnabled: true },
      });
      // row 없으면 기존 notifications.service.ts와 동일하게 default enabled로 처리한다.
      const enabled = pref ? pref.noticeEnabled !== false : true;
      if (!enabled) return 'skipped';

      const notification = await this.prisma.v1Notification.create({
        data: {
          recipientUserId: userId,
          targetType: 'notice',
          targetId: null,
          title: dto.title,
          body: dto.body ?? null,
          deepLink: dto.url ?? null,
        },
      });

      this.realtimeGateway.emitToUser(userId, 'notification:new', notification);
      await this.webPushService.sendToUser(userId, { title: dto.title, body: dto.body, url: dto.url });

      return 'sent';
    } catch (err: unknown) {
      this.logger.warn(
        `수동 푸시 발송 실패 [userId=${userId}]: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 'failed';
    }
  }
}

import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService, V1ActiveAdmin } from '../common/admin-context.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WebPushService, type PushDeliverySummary } from '../notifications/web-push.service';
import { AdminPushSendDto } from './dto/admin-push-send.dto';

export interface PushFailureSummary {
  id: string;
  userIdHash: string;
  endpointSuffix: string;
  statusCode: number | null;
  occurredAt: Date;
  acknowledgedAt: Date | null;
}

/**
 * SMS/인증 실패 요약. 저장 시점에 이미 번호 끝 4자리(phoneMasked)로만 적재되므로
 * 푸시 실패(userIdHash 해싱)와 달리 조회 시점의 추가 마스킹이 필요 없다.
 */
export interface SmsFailureSummary {
  id: string;
  eventType: string;
  resultCode: string | null;
  phoneMasked: string;
  provider: string | null;
  detail: string | null;
  createdAt: Date;
  acknowledgedAt: Date | null;
}

/** 운영 대시보드 KPI — 최근 5분 실패 건수. */
export interface AdminOpsSummary {
  pushFailures5m: number;
  smsFailures5m: number;
}

/**
 * 모니터링 허브 상단 신호 스트립 — "지금 사람이 봐야 할 것"의 개수 4종.
 * 에러는 ack 개념이 없어 최근 24시간 활동(lastSeenAt 기준, 접힌 그룹 행 수)을,
 * 푸시·SMS 는 미확인(acknowledgedAt null) 누적을, 감사는 오늘 발생량을 센다.
 */
export interface AdminMonitoringSummary {
  errorsLast24h: number;
  pushUnacked: number;
  smsUnacked: number;
  auditToday: number;
}

/**
 * 같은 내용의 전체 발송을 다시 보내지 않는 창. 더블 클릭·네트워크 재시도를 흡수할 만큼
 * 길고, 운영자가 오타를 고쳐 다시 보내는 것을 막지 않을 만큼 짧아야 한다.
 */
const BROADCAST_DEDUPE_WINDOW_MS = 10 * 60_000;
const BROADCAST_IDEMPOTENCY_ACTION = 'admin.push.broadcast';

export interface ManualPushSendResult {
  /** 인앱 알림(V1Notification)을 만든 수신자 수. 웹 푸시 도달과는 별개다. */
  sent: number;
  skipped: number;
  failed: number;
  /**
   * 웹 푸시 쪽 결과. sent 만 보면 "인앱 알림은 만들었지만 푸시는 아무에게도 못 갔다"를
   * 구분할 수 없어 운영자가 발송을 성공으로 오인한다(구독 0건이 대표적).
   */
  push: {
    /** 수신자들에게 등록돼 있던 구독 수 합계. 0이면 푸시로는 아무 데도 가지 않았다. */
    subscriptions: number;
    /** 푸시 서비스가 접수한 수. */
    delivered: number;
    /** 전송 실패 수. */
    failed: number;
    /** VAPID 미설정으로 웹 푸시가 꺼져 있으면 true. */
    disabled: boolean;
    /**
     * 앱 기기(APNs / FCM) 쪽 결과. 웹과 **합치지 않고 나란히** 둔다 — 합치면 폰이 받았다는
     * 사실이 깨진 브라우저 구독을 가린다.
     *
     * 이 필드가 없던 동안 `sendToUser` 가 돌려주던 native 요약은 여기서 버려졌고, 앱 기기만
     * 가진 사용자에게 보낸 발송이 운영 화면에 "구독 0건 · 나가지 않음" 으로 찍혔다
     * (2026-09-02 alpha 실측: 시뮬레이터에 배너가 도착했는데 응답은 delivered 0).
     *
     * Optional 인 이유: 브로드캐스트 재생(`claimBroadcast`)은 그때 저장된 응답을 그대로
     * 돌려주는데, 이 필드가 없던 시점의 기록에는 앱 쪽 결과가 없다. 그 응답에 0 을 채우면
     * "알 수 없음" 이 "안 나감" 으로 둔갑한다. 새 발송의 집계에는 항상 들어 있다.
     */
    native?: {
      /** 수신자들에게 등록돼 있던 활성 기기 수 합계. */
      devices: number;
      /** APNs / FCM 이 접수한 수. */
      delivered: number;
      /** 전송 실패 수(영구·일시 모두). */
      failed: number;
      /** 앱 푸시 어댑터가 하나도 설정돼 있지 않으면 true. */
      disabled: boolean;
    };
  };
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

  async recentSmsFailures(limit: number): Promise<SmsFailureSummary[]> {
    const failures = await this.prisma.v1SmsEventLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return failures.map((failure) => ({
      id: failure.id,
      eventType: failure.eventType,
      resultCode: failure.resultCode,
      phoneMasked: failure.phoneMasked,
      provider: failure.provider,
      detail: failure.detail,
      createdAt: failure.createdAt,
      acknowledgedAt: failure.acknowledgedAt,
    }));
  }

  async smsFailuresLast5Minutes(): Promise<number> {
    return this.prisma.v1SmsEventLog.count({
      where: { createdAt: { gte: new Date(Date.now() - 5 * 60_000) } },
    });
  }

  /** 대시보드 KPI 두 건을 한 번의 왕복으로 모아 준다. */
  async opsSummary(): Promise<AdminOpsSummary> {
    const [pushFailures5m, smsFailures5m] = await Promise.all([
      this.pushFailuresLast5Minutes(),
      this.smsFailuresLast5Minutes(),
    ]);
    return { pushFailures5m, smsFailures5m };
  }

  /** 모니터링 허브 신호 스트립 4종을 한 번의 왕복으로 모아 준다. */
  async monitoringSummary(): Promise<AdminMonitoringSummary> {
    // "오늘"은 운영자가 실제로 쓰는 한국 시간(KST) 자정부터다 — 서버 TZ(UTC) 자정을
    // 쓰면 KST 오전 9시까지 어제 활동이 "오늘"로 집계된다. KST 는 DST 가 없어
    // 고정 오프셋 계산이 안전하다.
    const KST_OFFSET_MS = 9 * 60 * 60_000;
    const now = Date.now();
    const kstMidnight = new Date(
      Math.floor((now + KST_OFFSET_MS) / 86_400_000) * 86_400_000 - KST_OFFSET_MS,
    );

    const [errorsLast24h, pushUnacked, smsUnacked, auditToday] = await Promise.all([
      // 에러 로그는 (fingerprint, windowBucket) 으로 접힌 행이므로 이 수는
      // "최근 24시간에 활동한 에러 그룹 수"다 — 발생 총량(occurrenceCount 합)이 아니다.
      this.prisma.v1ErrorLog.count({
        where: { lastSeenAt: { gte: new Date(now - 24 * 60 * 60_000) } },
      }),
      this.prisma.v1WebPushFailureLog.count({ where: { acknowledgedAt: null } }),
      this.prisma.v1SmsEventLog.count({ where: { acknowledgedAt: null } }),
      this.prisma.v1AdminActionLog.count({ where: { createdAt: { gte: kstMidnight } } }),
    ]);

    return { errorsLast24h, pushUnacked, smsUnacked, auditToday };
  }

  /** acknowledgeFailures(웹 푸시)와 동일 계약 — 실제로 미확인인 id만 갱신하고 건별 감사 로그를 남긴다. */
  async ackSmsFailures(ids: string[], admin: V1ActiveAdmin): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const toAck = await tx.v1SmsEventLog.findMany({
        where: { id: { in: ids }, acknowledgedAt: null },
        select: { id: true },
      });
      if (toAck.length === 0) return;

      await tx.v1SmsEventLog.updateMany({
        where: { id: { in: toAck.map((row) => row.id) } },
        data: { acknowledgedAt: new Date() },
      });

      // V1SmsEventLog 에는 acknowledgedBy 컬럼이 없다 — "누가 확인했는지"는 이 감사 로그가
      // 소유하며, 같은 트랜잭션에 묶어 ack 와 감사 기록이 어긋나지 않게 한다.
      for (const { id } of toAck) {
        await this.adminContext.logAdminAction(
          admin,
          { action: 'sms_event_log.ack', targetType: 'sms_event_log', targetId: id },
          tx,
        );
      }
    });
  }

  /**
   * 어드민 수동 발송 — 특정 유저 1명 또는 전체 유저에게 V1Notification 생성 +
   * 실시간 소켓 알림 + 웹 푸시를 순서대로 처리한다.
   *
   * 브로드캐스트 대상은 **활성 계정 전체**다. 예전에는 V1PushSubscription 을
   * 훑어 "푸시를 구독한 사람"만 대상으로 삼았는데, 그러면 푸시를 켜지 않은
   * 사용자는 인앱 알림함에서조차 공지를 볼 수 없었다(구독 0명이면 발송 결과가
   * sent:0 으로 나오고 아무 일도 일어나지 않는다). 인앱 알림은 전원에게 남기고,
   * 웹 푸시는 sendToUser 가 구독이 있는 사람에게만 실제로 나가므로 이 순서가
   * "전체 공지"의 의미와 맞다.
   *
   * targetType은 'notice'를 쓴다: schema의 V1NotificationTargetType에는
   * 'admin_broadcast' 같은 값이 없고, 이미 존재하는 'notice' + 이에 대응하는
   * V1NotificationPreference.noticeEnabled(공지사항 알림 여부) 쌍이 "운영진이
   * 임의로 보내는 공지성 알림"이라는 이 기능의 의미와 정확히 일치한다 — 새
   * enum 값을 추가해 마이그레이션을 늘리기보다 기존 값을 재사용했다.
   */
  async sendManualPush(dto: AdminPushSendDto, admin: V1ActiveAdmin): Promise<ManualPushSendResult> {
    // 전체 발송은 되돌릴 수 없고 대상이 전 사용자다 — 두 번 눌리면 모두가 같은 공지를
    // 두 번 받는다. 확인 절차도 멱등 키도 없어서 더블 클릭·재시도 한 번이 그대로 사고가
    // 됐다. 클라이언트가 키를 보내 주기를 기다리는 대신 **내용 자체를 키로 삼는다**:
    // 같은 운영자가 같은 내용을 짧은 시간 안에 다시 보내면 새로 보내지 않고 첫 결과를
    // 그대로 돌려준다(저장소의 v1IdempotencyRecord 규약을 그대로 쓴다).
    //
    // 개인 발송은 대상이 한 명이라 이 보호를 걸지 않는다 — 운영자가 같은 사람에게
    // 같은 안내를 다시 보내는 것은 정상적인 조작이다.
    if (dto.target === 'broadcast') {
      const claim = await this.claimBroadcast(dto, admin);
      if (claim.status === 'replay') return claim.body;
      if (claim.status === 'in_progress') {
        // 조회와 기록 사이에 원자성이 없으면 진짜 동시 요청(더블 클릭)에서는 둘 다
        // "기록 없음"을 보고 통과해 버린다 — 그래서 조회+클레임을 advisory lock을
        // 잡은 트랜잭션 하나로 묶는다(team-matches.service.ts의 idempotent 생성
        // 경로와 동일 패턴). 클레임에 실패하면 발송 자체를 하지 않고 여기서 막는다.
        throw new ConflictException({
          code: 'BROADCAST_IN_PROGRESS',
          message: '같은 공지가 이미 발송 중이에요. 잠시 후 다시 확인해 주세요.',
        });
      }
    }

    let result: ManualPushSendResult;
    let targetId: string;

    try {
      if (dto.target === 'user') {
        // dto.userId is guaranteed by AdminPushSendDto's ValidateIf(target === 'user').
        const userId = dto.userId as string;
        const user = await this.prisma.v1User.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) {
          throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User was not found' });
        }
        targetId = userId;
        const { outcome, push } = await this.sendToOneRecipient(userId, dto);
        result = {
          sent: outcome === 'sent' ? 1 : 0,
          skipped: outcome === 'skipped' ? 1 : 0,
          failed: outcome === 'failed' ? 1 : 0,
          push: emptyPushTally(),
        };
        addPushTally(result.push, push);
      } else {
        targetId = 'broadcast';
        result = { sent: 0, skipped: 0, failed: 0, push: emptyPushTally() };
        // 대상 전체를 findMany로 한 번에 메모리에 올리지 않고, id 커서로 DB에서
        // 청크 단위로 페이지네이션해 가져온다 — 사용자 수가 커져도 한 번에 들고
        // 있는 row 수는 BROADCAST_CHUNK_SIZE로 고정된다.
        let cursor: string | undefined;
        for (;;) {
          const page = await this.prisma.v1User.findMany({
            where: { accountStatus: 'active' },
            take: BROADCAST_CHUNK_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { id: 'asc' },
            select: { id: true },
          });
          if (page.length === 0) break;
          cursor = page[page.length - 1].id;

          const outcomes = await Promise.all(page.map((row) => this.sendToOneRecipient(row.id, dto)));
          for (const { outcome, push } of outcomes) {
            result[outcome === 'sent' ? 'sent' : outcome === 'skipped' ? 'skipped' : 'failed'] += 1;
            addPushTally(result.push, push);
          }

          if (page.length < BROADCAST_CHUNK_SIZE) break;
        }
      }
    } catch (err) {
      // 발송 도중 실패했다면 클레임을 되돌려 다음 진짜 재시도가 막히지 않게 한다 —
      // claimBroadcast가 이미 202로 선점해 둔 상태라, 여기서 풀지 않으면 10분 창
      // 동안 "발송 중"으로 오인돼 정상적인 재시도까지 ConflictException으로 막힌다.
      if (dto.target === 'broadcast') {
        await this.releaseBroadcastClaim(dto, admin);
      }
      throw err;
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

    if (dto.target === 'broadcast') {
      await this.finalizeBroadcastClaim(dto, admin, result);
    }

    return result;
  }

  /**
   * 조회(findUnique)와 기록(upsert) 사이에 원자성이 없으면, 진짜 동시 요청(더블 클릭·
   * 네트워크 재시도)이 둘 다 "기록 없음"을 보고 통과해 버려 중복 발송이 그대로 일어난다.
   * team-matches.service.ts의 idempotent 생성 경로와 동일하게, advisory lock을 잡은
   * 트랜잭션 안에서 조회와 "발송 중" 클레임(responseStatus=202)을 원자적으로 처리한다.
   *
   * - 이미 완료(200)된 유효한 기록이 있으면 그 결과를 그대로 돌려준다(replay).
   * - 발송 중(202)인 기록이 아직 유효하면 in_progress — 호출자는 막아야 한다.
   * - 유효한 기록이 없으면 202로 새로 선점하고 claimed를 돌려준다.
   */
  private async claimBroadcast(
    dto: AdminPushSendDto,
    admin: V1ActiveAdmin,
  ): Promise<
    | { status: 'replay'; body: ManualPushSendResult }
    | { status: 'in_progress' }
    | { status: 'claimed' }
  > {
    const scope = this.broadcastScope(dto, admin);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`broadcast-idempotency:${scope.actorUserId}:${scope.idempotencyKey}`}, 0))`;
      const existing = await tx.v1IdempotencyRecord.findUnique({
        where: { actorUserId_action_resourceType_resourceId_idempotencyKey: scope },
        select: { responseStatus: true, responseBody: true, expiresAt: true },
      });
      if (existing && existing.expiresAt > new Date()) {
        if (existing.responseStatus === 200) {
          this.logger.warn(
            `같은 내용의 전체 발송이 최근에 이미 나갔습니다 — 다시 보내지 않고 첫 결과를 돌려줍니다 [admin=${admin.userId}]`,
          );
          return { status: 'replay' as const, body: existing.responseBody as unknown as ManualPushSendResult };
        }
        return { status: 'in_progress' as const };
      }
      await tx.v1IdempotencyRecord.upsert({
        where: { actorUserId_action_resourceType_resourceId_idempotencyKey: scope },
        create: {
          ...scope,
          payloadHash: scope.idempotencyKey,
          responseStatus: 202,
          responseBody: {},
          expiresAt: new Date(Date.now() + BROADCAST_DEDUPE_WINDOW_MS),
        },
        update: {
          responseStatus: 202,
          responseBody: {},
          expiresAt: new Date(Date.now() + BROADCAST_DEDUPE_WINDOW_MS),
        },
      });
      return { status: 'claimed' as const };
    });
  }

  /**
   * 방금 나간 전체 발송을 완료(200)로 확정한다. 기록 실패가 발송 자체를 실패로 만들면
   * 안 된다 -- 이미 나간 것을 되돌릴 수 없으므로, 여기서 던지면 호출자는 실패로 알고
   * 다시 누른다(그게 바로 이 보호가 막으려던 상황이다).
   */
  private async finalizeBroadcastClaim(
    dto: AdminPushSendDto,
    admin: V1ActiveAdmin,
    result: ManualPushSendResult,
  ): Promise<void> {
    const scope = this.broadcastScope(dto, admin);
    try {
      await this.prisma.v1IdempotencyRecord.update({
        where: { actorUserId_action_resourceType_resourceId_idempotencyKey: scope },
        data: {
          responseStatus: 200,
          responseBody: result as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + BROADCAST_DEDUPE_WINDOW_MS),
        },
      });
    } catch (err: unknown) {
      this.logger.warn(
        `전체 발송 완료 기록 실패: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * 발송 도중 실패한 클레임을 되돌린다 — 202로 선점된 채 만료 전에 놔두면 10분 동안
   * 정상적인 재시도까지 "발송 중"으로 막힌다. 즉시 만료시켜 다음 시도가 새로 클레임을
   * 잡을 수 있게 한다.
   */
  private async releaseBroadcastClaim(dto: AdminPushSendDto, admin: V1ActiveAdmin): Promise<void> {
    try {
      await this.prisma.v1IdempotencyRecord.updateMany({
        where: { ...this.broadcastScope(dto, admin), responseStatus: 202 },
        data: { expiresAt: new Date(0) },
      });
    } catch (err: unknown) {
      this.logger.warn(
        `전체 발송 클레임 해제 실패: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** 내용 자체가 키다 — 클라이언트가 멱등 키를 보내 주지 않아도 중복을 잡는다. */
  private broadcastScope(dto: AdminPushSendDto, admin: V1ActiveAdmin) {
    const contentHash = createHash('sha256')
      .update(JSON.stringify({ title: dto.title, body: dto.body ?? null, url: dto.url ?? null }))
      .digest('hex');
    return {
      actorUserId: admin.userId,
      action: BROADCAST_IDEMPOTENCY_ACTION,
      resourceType: 'push',
      resourceId: 'broadcast',
      idempotencyKey: contentHash,
    };
  }

  /**
   * 수신자 1명에 대한 알림 선호도 체크 + 생성 + 발송을 처리한다. 브로드캐스트 시
   * 한 유저의 실패가 나머지 유저 발송을 막지 않도록, 모든 예외는 이 함수 안에서
   * 흡수하고 결과 상태로만 알린다.
   */
  private async sendToOneRecipient(
    userId: string,
    dto: AdminPushSendDto,
  ): Promise<{ outcome: 'sent' | 'skipped' | 'failed'; push: PushDeliverySummary | null }> {
    try {
      const pref = await this.prisma.v1NotificationPreference.findUnique({
        where: { userId },
        select: { noticeEnabled: true },
      });
      // row 없으면 기존 notifications.service.ts와 동일하게 default enabled로 처리한다.
      const enabled = pref ? pref.noticeEnabled !== false : true;
      if (!enabled) return { outcome: 'skipped', push: null };

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
      const push = await this.webPushService.sendToUser(userId, {
        title: dto.title,
        body: dto.body,
        url: dto.url,
      });

      return { outcome: 'sent', push };
    } catch (err: unknown) {
      this.logger.warn(
        `수동 푸시 발송 실패 [userId=${userId}]: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { outcome: 'failed', push: null };
    }
  }
}

function emptyPushTally(): ManualPushSendResult['push'] {
  return {
    subscriptions: 0,
    delivered: 0,
    failed: 0,
    disabled: false,
    native: { devices: 0, delivered: 0, failed: 0, disabled: false },
  };
}

/**
 * 수신자별 푸시 결과를 누적한다. disabled는 한 번이라도 꺼져 있었다면 true로 남긴다.
 * 웹과 앱은 각자의 칸에 더한다 — 어느 한쪽이 0이어도 다른 쪽은 갔을 수 있다.
 */
function addPushTally(tally: ManualPushSendResult['push'], summary: PushDeliverySummary | null): void {
  if (!summary) return;
  tally.subscriptions += summary.subscriptions;
  tally.delivered += summary.delivered;
  tally.failed += summary.failed;
  if (summary.disabled) tally.disabled = true;
  const native = (tally.native ??= { devices: 0, delivered: 0, failed: 0, disabled: false });
  native.devices += summary.native.devices;
  native.delivered += summary.native.delivered;
  native.failed += summary.native.failed;
  if (summary.native.disabled) native.disabled = true;
}

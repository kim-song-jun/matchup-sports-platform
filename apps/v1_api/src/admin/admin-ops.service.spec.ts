import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService } from '../common/admin-context.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WebPushService } from '../notifications/web-push.service';
import { AdminOpsService } from './admin-ops.service';
import { createHash } from 'node:crypto';

const admin = { id: 'admin-row-1', userId: 'admin-user-1', adminRole: 'ops' as const, status: 'active' as const };

describe('AdminOpsService', () => {
  let service: AdminOpsService;
  const prisma = {
    v1WebPushFailureLog: { findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    // 전체 발송은 같은 내용의 중복 발송을 막기 위해 멱등 기록을 본다.
    v1IdempotencyRecord: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    v1SmsEventLog: { findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    v1ErrorLog: { count: jest.fn() },
    v1AdminActionLog: { count: jest.fn() },
    v1User: { findUnique: jest.fn(), findMany: jest.fn() },
    v1PushSubscription: { findMany: jest.fn() },
    v1NotificationPreference: { findUnique: jest.fn() },
    v1Notification: { create: jest.fn() },
    $transaction: jest.fn(),
    // claimBroadcast는 advisory lock을 잡기 위해 트랜잭션 안에서 태그된 템플릿으로
    // $executeRaw를 호출한다 — 실제 락 동작은 검증하지 않고 호출만 흡수한다.
    $executeRaw: jest.fn().mockResolvedValue(0),
  };
  const adminContext = { logAdminAction: jest.fn().mockResolvedValue({ actionLogId: 'log-1', statusChangeLogId: null }) };
  const realtimeGateway = { emitToUser: jest.fn() };
  const webPushService = { sendToUser: jest.fn().mockResolvedValue({ subscriptions: 1, delivered: 1, failed: 0, disabled: false, native: { devices: 0, delivered: 0, failed: 0, disabled: false } }) };

  beforeEach(async () => {
    jest.clearAllMocks();
    // $transaction executes the callback with a tx proxy delegating back to the
    // same mock model object so individual model-mock assertions still work.
    prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma));
    adminContext.logAdminAction.mockResolvedValue({ actionLogId: 'log-1', statusChangeLogId: null });
    webPushService.sendToUser.mockResolvedValue({ subscriptions: 1, delivered: 1, failed: 0, disabled: false, native: { devices: 0, delivered: 0, failed: 0, disabled: false } });
    prisma.v1Notification.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'notif-1', ...data }),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminOpsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminContextService, useValue: adminContext },
        { provide: RealtimeGateway, useValue: realtimeGateway },
        { provide: WebPushService, useValue: webPushService },
      ],
    }).compile();
    service = moduleRef.get(AdminOpsService);
  });

  it('masks the userId as a sha256 8-char hash and keeps only the last 6 chars of the endpoint suffix', async () => {
    prisma.v1WebPushFailureLog.findMany.mockResolvedValue([
      {
        id: 'fail-1',
        userId: 'user-1',
        endpointSuffix: 'abcdefghijkl',
        statusCode: 500,
        occurredAt: new Date('2026-07-19T00:00:00Z'),
        acknowledgedAt: null,
      },
    ]);

    const result = await service.recentPushFailures(20);

    const expectedHash = createHash('sha256').update('user-1').digest('hex').slice(0, 8);
    expect(result[0].userIdHash).toBe(expectedHash);
    expect(result[0].endpointSuffix).toBe('ghijkl');
    expect(result[0]).not.toHaveProperty('userId');
  });

  // ── SMS / 인증 실패 로그 ───────────────────────────────────────────────
  it('recentSmsFailures returns the stored masked tail as-is and never exposes a raw phone number', async () => {
    prisma.v1SmsEventLog.findMany.mockResolvedValue([
      {
        id: 'sms-1',
        eventType: 'SMS_SEND_FAILED',
        resultCode: '400',
        phoneMasked: '5678',
        provider: 'solapi',
        detail: 'Bad Request',
        createdAt: new Date('2026-07-25T00:00:00Z'),
        acknowledgedAt: null,
      },
    ]);

    const result = await service.recentSmsFailures(20);

    expect(prisma.v1SmsEventLog.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    // 마스킹은 기록 시점(SmsEventLogService)에 끝나므로 조회는 저장값을 그대로 통과시킨다.
    expect(result[0].phoneMasked).toBe('5678');
    expect(result[0].eventType).toBe('SMS_SEND_FAILED');
    expect(result[0].provider).toBe('solapi');
  });

  it('opsSummary counts push and sms failures in the last 5 minutes', async () => {
    prisma.v1WebPushFailureLog.count.mockResolvedValue(3);
    prisma.v1SmsEventLog.count.mockResolvedValue(7);

    const result = await service.opsSummary();

    expect(result).toEqual({ pushFailures5m: 3, smsFailures5m: 7 });
    // 집계 기준은 발생 시각이며 5분 창을 넘어서는 안 된다.
    const smsWhere = prisma.v1SmsEventLog.count.mock.calls[0][0].where;
    const cutoff = smsWhere.createdAt.gte as Date;
    expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(5 * 60_000 - 1_000);
    expect(Date.now() - cutoff.getTime()).toBeLessThanOrEqual(5 * 60_000 + 1_000);
  });

  it('monitoringSummary counts 24h error groups, unacked push/sms, and audit entries since KST midnight', async () => {
    prisma.v1ErrorLog.count.mockResolvedValue(4);
    prisma.v1WebPushFailureLog.count.mockResolvedValue(2);
    prisma.v1SmsEventLog.count.mockResolvedValue(5);
    prisma.v1AdminActionLog.count.mockResolvedValue(11);

    const result = await service.monitoringSummary();

    expect(result).toEqual({ errorsLast24h: 4, pushUnacked: 2, smsUnacked: 5, auditToday: 11 });

    // 에러는 lastSeenAt 24시간 창 — occurredAt/createdAt 이 아니라 "마지막 활동" 기준이다.
    const errorWhere = prisma.v1ErrorLog.count.mock.calls[0][0].where;
    const errorCutoff = errorWhere.lastSeenAt.gte as Date;
    expect(Date.now() - errorCutoff.getTime()).toBeGreaterThanOrEqual(24 * 60 * 60_000 - 1_000);
    expect(Date.now() - errorCutoff.getTime()).toBeLessThanOrEqual(24 * 60 * 60_000 + 1_000);

    // 푸시·SMS 는 시간 창이 아니라 미확인 누적이다.
    expect(prisma.v1WebPushFailureLog.count).toHaveBeenCalledWith({ where: { acknowledgedAt: null } });
    expect(prisma.v1SmsEventLog.count).toHaveBeenCalledWith({ where: { acknowledgedAt: null } });

    // 감사 "오늘"은 KST 자정 — UTC 자정도, 최근 24시간도 아니다.
    const auditWhere = prisma.v1AdminActionLog.count.mock.calls[0][0].where;
    const auditCutoff = auditWhere.createdAt.gte as Date;
    const KST_OFFSET_MS = 9 * 60 * 60_000;
    expect((auditCutoff.getTime() + KST_OFFSET_MS) % 86_400_000).toBe(0);
    expect(auditCutoff.getTime()).toBeLessThanOrEqual(Date.now());
    expect(Date.now() - auditCutoff.getTime()).toBeLessThan(86_400_000);
  });

  it('ackSmsFailures updates only the still-unacknowledged ids and logs one audit entry each, in one transaction', async () => {
    prisma.v1SmsEventLog.findMany.mockResolvedValue([{ id: 'sms-2' }]);

    await service.ackSmsFailures(['sms-1', 'sms-2'], admin);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.v1SmsEventLog.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['sms-1', 'sms-2'] }, acknowledgedAt: null },
      select: { id: true },
    });
    expect(prisma.v1SmsEventLog.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['sms-2'] } },
      data: { acknowledgedAt: expect.any(Date) },
    });
    expect(adminContext.logAdminAction).toHaveBeenCalledTimes(1);
    expect(adminContext.logAdminAction).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ action: 'sms_event_log.ack', targetType: 'sms_event_log', targetId: 'sms-2' }),
      prisma,
    );
  });

  it('ackSmsFailures does nothing when every id is already acknowledged', async () => {
    prisma.v1SmsEventLog.findMany.mockResolvedValue([]);

    await service.ackSmsFailures(['sms-1'], admin);

    expect(prisma.v1SmsEventLog.updateMany).not.toHaveBeenCalled();
    expect(adminContext.logAdminAction).not.toHaveBeenCalled();
  });

  it('ack records acknowledgedAt/acknowledgedBy in one bulk update and an audit log per id, inside one transaction', async () => {
    prisma.v1WebPushFailureLog.findMany.mockResolvedValue([{ id: 'fail-1' }, { id: 'fail-2' }]);

    await service.acknowledgeFailures(['fail-1', 'fail-2'], admin);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.v1WebPushFailureLog.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['fail-1', 'fail-2'] }, acknowledgedAt: null },
      select: { id: true },
    });
    expect(prisma.v1WebPushFailureLog.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['fail-1', 'fail-2'] } },
      data: expect.objectContaining({ acknowledgedBy: 'admin-user-1' }),
    });
    expect(adminContext.logAdminAction).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ action: 'web_push_failure_log.ack', targetType: 'web_push_failure_log', targetId: 'fail-1' }),
      prisma,
    );
    expect(adminContext.logAdminAction).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ action: 'web_push_failure_log.ack', targetType: 'web_push_failure_log', targetId: 'fail-2' }),
      prisma,
    );
  });

  it('only updates and logs the ids that were actually still unacknowledged, skipping the rest silently', async () => {
    // Caller asked to ack 3 ids, but only 'fail-2' is still unacknowledged
    // (fail-1 was already acked, fail-3 doesn't exist / belongs to someone else's batch).
    prisma.v1WebPushFailureLog.findMany.mockResolvedValue([{ id: 'fail-2' }]);

    await service.acknowledgeFailures(['fail-1', 'fail-2', 'fail-3'], admin);

    expect(prisma.v1WebPushFailureLog.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['fail-2'] } },
      data: expect.objectContaining({ acknowledgedBy: 'admin-user-1' }),
    });
    expect(adminContext.logAdminAction).toHaveBeenCalledTimes(1);
    expect(adminContext.logAdminAction).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ targetId: 'fail-2' }),
      prisma,
    );
  });

  it('does nothing (no update, no audit log) when every id is already acknowledged', async () => {
    prisma.v1WebPushFailureLog.findMany.mockResolvedValue([]);

    await service.acknowledgeFailures(['fail-1'], admin);

    expect(prisma.v1WebPushFailureLog.updateMany).not.toHaveBeenCalled();
    expect(adminContext.logAdminAction).not.toHaveBeenCalled();
  });

  it('propagates the error instead of swallowing it when an audit log write fails inside the transaction', async () => {
    // NOTE: this test only proves the service does not catch-and-swallow the error — the
    // $transaction mock below just re-throws whatever the callback throws, it does not
    // exercise real Prisma rollback/atomicity. Actual rollback behavior is Prisma's
    // responsibility and is covered by the real interactive-transaction contract, not
    // by this mock.
    prisma.v1WebPushFailureLog.findMany.mockResolvedValue([{ id: 'fail-1' }]);
    adminContext.logAdminAction.mockRejectedValueOnce(new Error('audit log write failed'));
    prisma.$transaction.mockImplementation(async (cb: (tx: typeof prisma) => Promise<unknown>) => {
      // Mirrors the shape of a real Prisma interactive transaction (a thrown error inside
      // the callback rejects the $transaction call), but this is still a mock: it does not
      // verify that any writes made before the throw were actually rolled back in a DB.
      return cb(prisma);
    });

    await expect(service.acknowledgeFailures(['fail-1'], admin)).rejects.toThrow('audit log write failed');
  });

  describe('sendManualPush', () => {
    it('sends to a single user: creates the notification, emits realtime, sends the push, and audit-logs the userId as targetId', async () => {
      prisma.v1User.findUnique.mockResolvedValue({ id: 'user-1' });
      prisma.v1NotificationPreference.findUnique.mockResolvedValue({ noticeEnabled: true });

      const result = await service.sendManualPush(
        { target: 'user', userId: 'user-1', title: '점검 안내', body: '내일 새벽 점검이 있어요.', url: '/notices/1' },
        admin,
      );

      expect(result).toEqual({ sent: 1, skipped: 0, failed: 0, push: { subscriptions: 1, delivered: 1, failed: 0, disabled: false, native: { devices: 0, delivered: 0, failed: 0, disabled: false } } });
      expect(prisma.v1Notification.create).toHaveBeenCalledWith({
        data: {
          recipientUserId: 'user-1',
          targetType: 'notice',
          targetId: null,
          title: '점검 안내',
          body: '내일 새벽 점검이 있어요.',
          deepLink: '/notices/1',
        },
      });
      expect(realtimeGateway.emitToUser).toHaveBeenCalledWith(
        'user-1',
        'notification:new',
        expect.objectContaining({ recipientUserId: 'user-1' }),
      );
      expect(webPushService.sendToUser).toHaveBeenCalledWith('user-1', {
        title: '점검 안내',
        body: '내일 새벽 점검이 있어요.',
        url: '/notices/1',
      });
      expect(adminContext.logAdminAction).toHaveBeenCalledWith(
        admin,
        expect.objectContaining({ action: 'push.manual_send', targetType: 'push', targetId: 'user-1' }),
      );
    });

    it('throws 404 for a non-existent userId target and never creates a notification', async () => {
      prisma.v1User.findUnique.mockResolvedValue(null);

      await expect(
        service.sendManualPush({ target: 'user', userId: 'missing-user', title: 'hi' }, admin),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.v1Notification.create).not.toHaveBeenCalled();
      expect(adminContext.logAdminAction).not.toHaveBeenCalled();
    });

    it('skips a single user whose noticeEnabled preference is off, without creating a notification', async () => {
      prisma.v1User.findUnique.mockResolvedValue({ id: 'user-1' });
      prisma.v1NotificationPreference.findUnique.mockResolvedValue({ noticeEnabled: false });

      const result = await service.sendManualPush({ target: 'user', userId: 'user-1', title: 'hi' }, admin);

      // 아무에게도 보내지 않았으면 앱 기기 집계는 아예 없다 — 0 으로 적으면 집계한 것처럼 읽힌다.
      expect(result).toEqual({ sent: 0, skipped: 1, failed: 0, push: { subscriptions: 0, delivered: 0, failed: 0, disabled: false } });
      expect(result.push.native).toBeUndefined();
      expect(prisma.v1Notification.create).not.toHaveBeenCalled();
    });

    it('treats a missing preference row as enabled by default (matches notifications.service.ts convention)', async () => {
      prisma.v1User.findUnique.mockResolvedValue({ id: 'user-1' });
      prisma.v1NotificationPreference.findUnique.mockResolvedValue(null);

      const result = await service.sendManualPush({ target: 'user', userId: 'user-1', title: 'hi' }, admin);

      expect(result).toEqual({ sent: 1, skipped: 0, failed: 0, push: { subscriptions: 1, delivered: 1, failed: 0, disabled: false, native: { devices: 0, delivered: 0, failed: 0, disabled: false } } });
    });

    it('같은 내용의 전체 발송이 최근에 이미 나갔으면 다시 보내지 않고 그 결과를 돌려준다', async () => {
      // 전체 발송은 되돌릴 수 없고 대상이 전 사용자다 — 더블 클릭 한 번이면 모두가 같은
      // 공지를 두 번 받는다. 확인 절차도 멱등 키도 없어서 그 사고가 그대로 가능했다.
      const first = { sent: 2, skipped: 0, failed: 0, push: { subscriptions: 2, delivered: 2, failed: 0, disabled: false, native: { devices: 0, delivered: 0, failed: 0, disabled: false } } };
      prisma.v1IdempotencyRecord.findUnique.mockResolvedValueOnce({
        responseStatus: 200,
        responseBody: first,
        expiresAt: new Date(Date.now() + 60_000),
      });

      const result = await service.sendManualPush({ target: 'broadcast', title: '전체 공지' }, admin);

      expect(result).toEqual(first);
      // 아무에게도 다시 보내지 않았다는 것이 이 테스트의 핵심이다.
      expect(prisma.v1User.findMany).not.toHaveBeenCalled();
      expect(prisma.v1Notification.create).not.toHaveBeenCalled();
    });

    it('기록이 만료됐으면 다시 보낸다', async () => {
      // 창이 지나면 같은 문구를 다시 보내는 것은 정상 조작이다 — 영구 차단이 아니다.
      prisma.v1IdempotencyRecord.findUnique.mockResolvedValueOnce({
        responseBody: { sent: 1, skipped: 0, failed: 0, push: { subscriptions: 0, delivered: 0, failed: 0, disabled: false, native: { devices: 0, delivered: 0, failed: 0, disabled: false } } },
        expiresAt: new Date(Date.now() - 1),
      });
      prisma.v1User.findMany.mockResolvedValueOnce([{ id: 'user-1' }]);

      await service.sendManualPush({ target: 'broadcast', title: '전체 공지' }, admin);

      expect(prisma.v1User.findMany).toHaveBeenCalled();
    });

    it('개인 발송에는 중복 방지를 걸지 않는다', async () => {
      // 대상이 한 명이라, 같은 사람에게 같은 안내를 다시 보내는 것은 정상 조작이다.
      prisma.v1User.findUnique.mockResolvedValueOnce({ id: 'user-1' });

      await service.sendManualPush({ target: 'user', userId: 'user-1', title: '안내' }, admin);

      expect(prisma.v1IdempotencyRecord.findUnique).not.toHaveBeenCalled();
    });

    it('두 요청이 진짜 동시에 들어오면(발송 중 클레임이 아직 유효) 두 번째는 즉시 거부되고 아무에게도 다시 보내지 않는다', async () => {
      // 조회와 기록 사이에 원자성이 없던 예전 구현은, 첫 요청이 아직 발송을 끝내기
      // 전(기록이 아직 없는 순간)에 두 번째 요청이 들어오면 findUnique가 null을 보고
      // 그대로 통과시켰다 — 진짜 중복 발송. claimBroadcast는 발송 시작 시점에 이미
      // 202(발송 중)로 선점해 두므로, 아직 만료 전인 202 레코드를 보면 즉시 막는다.
      prisma.v1IdempotencyRecord.findUnique.mockResolvedValueOnce({
        responseStatus: 202,
        responseBody: {},
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(
        service.sendManualPush({ target: 'broadcast', title: '전체 공지' }, admin),
      ).rejects.toMatchObject({ status: 409 });

      expect(prisma.v1User.findMany).not.toHaveBeenCalled();
      expect(prisma.v1Notification.create).not.toHaveBeenCalled();
    });

    it('발송 도중 실패하면 클레임을 되돌려 다음 재시도가 발송 중 오인으로 막히지 않게 한다', async () => {
      prisma.v1User.findMany.mockRejectedValueOnce(new Error('db unavailable'));

      await expect(
        service.sendManualPush({ target: 'broadcast', title: '전체 공지' }, admin),
      ).rejects.toThrow('db unavailable');

      expect(prisma.v1IdempotencyRecord.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ responseStatus: 202 }) }),
      );
    });

    it('broadcasts to every active user via cursor pagination, skipping those with noticeEnabled off, and audit-logs targetId "broadcast"', async () => {
      // Page has only 3 rows (< BROADCAST_CHUNK_SIZE), so the loop makes exactly
      // one findMany call and stops — no second page mock needed.
      prisma.v1User.findMany.mockResolvedValueOnce([
        { id: 'user-1' },
        { id: 'user-2' },
        { id: 'user-3' },
      ]);
      prisma.v1NotificationPreference.findUnique.mockImplementation(({ where }: { where: { userId: string } }) =>
        Promise.resolve(where.userId === 'user-2' ? { noticeEnabled: false } : { noticeEnabled: true }),
      );

      const result = await service.sendManualPush({ target: 'broadcast', title: '전체 공지' }, admin);

      expect(prisma.v1User.findMany).toHaveBeenNthCalledWith(1, {
        where: { accountStatus: 'active' },
        take: 30,
        orderBy: { id: 'asc' },
        select: { id: true },
      });
      expect(result).toEqual({ sent: 2, skipped: 1, failed: 0, push: { subscriptions: 2, delivered: 2, failed: 0, disabled: false, native: { devices: 0, delivered: 0, failed: 0, disabled: false } } });
      expect(prisma.v1Notification.create).toHaveBeenCalledTimes(2);
      expect(adminContext.logAdminAction).toHaveBeenCalledWith(
        admin,
        expect.objectContaining({ targetId: 'broadcast', afterJson: expect.objectContaining({ target: 'broadcast' }) }),
      );
    });

    /**
     * 회귀 방지: 예전 구현은 V1PushSubscription 을 훑어 "푸시 구독자"만 대상으로
     * 삼아서, 구독이 하나도 없으면 sent:0 으로 끝나고 인앱 알림함에도 아무것도
     * 남지 않았다(실제 alpha 에서 재현된 증상). 전체 공지는 푸시 구독 여부와
     * 무관하게 인앱 알림이 전원에게 생성돼야 한다.
     */
    /**
     * 회귀 방지. `sendToUser` 는 웹과 앱 결과를 나란히 돌려주는데 집계가 웹 칸만 옮겨 담아서,
     * 앱 기기만 가진 사용자에게 보낸 발송이 운영 화면에 "구독 0건 · 나가지 않음" 으로 찍혔다
     * (2026-09-02 alpha 실측: 시뮬레이터에 배너가 도착했는데 응답은 delivered 0).
     */
    it('reports an app-device delivery in its own tally instead of dropping it behind zero web subscriptions', async () => {
      prisma.v1User.findUnique.mockResolvedValue({ id: 'user-1' });
      prisma.v1NotificationPreference.findUnique.mockResolvedValue({ noticeEnabled: true });
      webPushService.sendToUser.mockResolvedValueOnce({
        subscriptions: 0, delivered: 0, failed: 0, disabled: false,
        native: { devices: 1, delivered: 1, failed: 0, disabled: false },
      });

      const result = await service.sendManualPush({ target: 'user', userId: 'user-1', title: '앱 전용' }, admin);

      expect(result.push).toEqual({
        subscriptions: 0, delivered: 0, failed: 0, disabled: false,
        native: { devices: 1, delivered: 1, failed: 0, disabled: false },
      });
    });

    it('keeps the two channels apart across a broadcast and remembers a disabled app adapter', async () => {
      prisma.v1User.findMany.mockResolvedValueOnce([{ id: 'user-1' }, { id: 'user-2' }]);
      prisma.v1NotificationPreference.findUnique.mockResolvedValue({ noticeEnabled: true });
      webPushService.sendToUser
        .mockResolvedValueOnce({ subscriptions: 1, delivered: 1, failed: 0, disabled: false, native: { devices: 2, delivered: 1, failed: 1, disabled: false } })
        .mockResolvedValueOnce({ subscriptions: 0, delivered: 0, failed: 0, disabled: false, native: { devices: 0, delivered: 0, failed: 0, disabled: true } });

      const result = await service.sendManualPush({ target: 'broadcast', title: '전체 공지' }, admin);

      expect(result.push).toEqual({
        subscriptions: 1, delivered: 1, failed: 0, disabled: false,
        native: { devices: 2, delivered: 1, failed: 1, disabled: true },
      });
    });

    it('still delivers in-app notifications to users who have no push subscription at all', async () => {
      prisma.v1User.findMany.mockResolvedValueOnce([{ id: 'user-1' }, { id: 'user-2' }]);
      prisma.v1NotificationPreference.findUnique.mockResolvedValue({ noticeEnabled: true });
      // 구독 테이블은 비어 있다 — 그래도 결과가 sent:2 여야 한다.
      prisma.v1PushSubscription.findMany.mockResolvedValue([]);

      const result = await service.sendManualPush({ target: 'broadcast', title: '전체 공지' }, admin);

      expect(result).toEqual({ sent: 2, skipped: 0, failed: 0, push: { subscriptions: 2, delivered: 2, failed: 0, disabled: false, native: { devices: 0, delivered: 0, failed: 0, disabled: false } } });
      expect(prisma.v1Notification.create).toHaveBeenCalledTimes(2);
      // 대상 선정에 구독 테이블을 쓰지 않는다.
      expect(prisma.v1PushSubscription.findMany).not.toHaveBeenCalled();
    });

    it('pages through multiple chunks of users using an id cursor instead of loading them all at once', async () => {
      const page1 = Array.from({ length: 30 }, (_, i) => ({ id: `user-${i}` }));
      const page2 = [{ id: 'user-30' }];
      prisma.v1User.findMany.mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);
      prisma.v1NotificationPreference.findUnique.mockResolvedValue({ noticeEnabled: true });

      const result = await service.sendManualPush({ target: 'broadcast', title: '전체 공지' }, admin);

      expect(result).toEqual({ sent: 31, skipped: 0, failed: 0, push: { subscriptions: 31, delivered: 31, failed: 0, disabled: false, native: { devices: 0, delivered: 0, failed: 0, disabled: false } } });
      expect(prisma.v1User.findMany).toHaveBeenNthCalledWith(2, {
        where: { accountStatus: 'active' },
        take: 30,
        skip: 1,
        cursor: { id: 'user-29' },
        orderBy: { id: 'asc' },
        select: { id: true },
      });
    });

    it('isolates a per-recipient failure during broadcast so the rest still send', async () => {
      // Page has only 2 rows (< BROADCAST_CHUNK_SIZE), so the loop makes exactly
      // one findMany call and stops — no second page mock needed.
      prisma.v1User.findMany.mockResolvedValueOnce([{ id: 'user-1' }, { id: 'user-2' }]);
      prisma.v1NotificationPreference.findUnique.mockResolvedValue({ noticeEnabled: true });
      prisma.v1Notification.create
        .mockRejectedValueOnce(new Error('db write failed'))
        .mockImplementationOnce(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'notif-2', ...data }),
        );

      const result = await service.sendManualPush({ target: 'broadcast', title: '전체 공지' }, admin);

      expect(result).toEqual({ sent: 1, skipped: 0, failed: 1, push: { subscriptions: 1, delivered: 1, failed: 0, disabled: false, native: { devices: 0, delivered: 0, failed: 0, disabled: false } } });
    });

    it('does not fail the whole request when the audit log write fails after a successful send', async () => {
      prisma.v1User.findUnique.mockResolvedValue({ id: 'user-1' });
      prisma.v1NotificationPreference.findUnique.mockResolvedValue({ noticeEnabled: true });
      adminContext.logAdminAction.mockRejectedValueOnce(new Error('audit log write failed'));

      const result = await service.sendManualPush({ target: 'user', userId: 'user-1', title: 'hi' }, admin);

      // The push was already sent — a failed audit log must not turn this into
      // an error response, or an operator could retry and duplicate-send.
      expect(result).toEqual({ sent: 1, skipped: 0, failed: 0, push: { subscriptions: 1, delivered: 1, failed: 0, disabled: false, native: { devices: 0, delivered: 0, failed: 0, disabled: false } } });
    });
  });
});

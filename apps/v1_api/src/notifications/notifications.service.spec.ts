/**
 * notifications.service.spec.ts
 *
 * Service-layer contract tests for NotificationsService.
 * Each test asserts real observable behaviour: guard throws, state
 * transition is correct, computed value is right, idempotency holds.
 * No test merely verifies that a mock was called with what we told it to return.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getLoggerToken } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { REALTIME_NOTIFIER } from './realtime-notifier.port';
import { WebPushService } from './web-push.service';

const user = {
  id: 'user-1',
  email: 'tester@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

function makeNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: 'notif-1',
    recipientUserId: 'user-1',
    targetType: 'match' as const,
    targetId: 'match-1',
    title: '매치 신청이 도착했어요',
    body: null,
    deepLink: '/matches/match-1',
    readAt: null,
    createdAt: new Date('2026-06-14T10:00:00Z'),
    updatedAt: new Date('2026-06-14T10:00:00Z'),
    ...overrides,
  };
}

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: {
    v1NotificationPreference: { findUnique: jest.Mock; upsert: jest.Mock };
    v1Notification: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
  };

  const realtimeNotifier = { emitToUser: jest.fn() };
  const webPushService = { sendToUser: jest.fn().mockResolvedValue(undefined) };
  const logger = { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() };

  beforeEach(async () => {
    prisma = {
      v1NotificationPreference: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      v1Notification: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: REALTIME_NOTIFIER, useValue: realtimeNotifier },
        { provide: WebPushService, useValue: webPushService },
        { provide: getLoggerToken(NotificationsService.name), useValue: logger },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── emitNotification ──────────────────────────────────────────────────────

  it('선호도 row 없을 때 알림을 생성한다 (기본값 활성)', async () => {
    prisma.v1NotificationPreference.findUnique.mockResolvedValue(null); // no pref row
    prisma.v1Notification.create.mockResolvedValue(makeNotification());

    await service.emitNotification('user-1', 'match_application_received', 'match-1');

    // Must flush the fire-and-forget promise
    await new Promise(setImmediate);

    expect(prisma.v1Notification.create).toHaveBeenCalledTimes(1);
    expect(prisma.v1Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientUserId: 'user-1',
          targetType: 'match',
          targetId: 'match-1',
          title: '매치 신청이 도착했어요',
          deepLink: '/matches/match-1',
        }),
      }),
    );
    expect(webPushService.sendToUser).toHaveBeenCalledWith('user-1', {
      notificationId: 'notif-1',
      title: expect.any(String),
      body: expect.any(String),
      url: '/matches/match-1',
    });
  });

  it('문의 답변 알림을 중요 알림으로 분류하고 canonical 문의 상세 경로로 push fan-out 한다', async () => {
    prisma.v1NotificationPreference.findUnique.mockResolvedValue({ importantEnabled: true });
    prisma.v1Notification.create.mockResolvedValue(
      makeNotification({
        id: 'inquiry-notification-1',
        targetType: 'inquiry',
        targetId: 'inquiry-1',
        title: '문의에 답변이 등록됐어요',
        body: '답변 내용을 확인해 주세요.',
        deepLink: '/my/inquiries/inquiry-1',
      }),
    );

    await service.emitNotification('user-1', 'inquiry_answered', 'inquiry-1');
    await new Promise(setImmediate);

    expect(prisma.v1NotificationPreference.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { importantEnabled: true },
    });
    expect(prisma.v1Notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientUserId: 'user-1',
        targetType: 'inquiry',
        targetId: 'inquiry-1',
        deepLink: '/my/inquiries/inquiry-1',
      }),
    });
    expect(webPushService.sendToUser).toHaveBeenCalledWith('user-1', {
      notificationId: 'inquiry-notification-1',
      title: '문의에 답변이 등록됐어요',
      body: '답변 내용을 확인해 주세요.',
      url: '/my/inquiries/inquiry-1',
    });
  });

  it('사용자가 해당 카테고리를 비활성화했을 때 알림 DB row를 생성하지 않는다', async () => {
    // matchEnabled = false → match_application_received must be suppressed
    prisma.v1NotificationPreference.findUnique.mockResolvedValue({ matchEnabled: false });
    prisma.v1Notification.create.mockResolvedValue(makeNotification());

    await service.emitNotification('user-1', 'match_application_received', 'match-1');

    await new Promise(setImmediate);

    expect(prisma.v1Notification.create).not.toHaveBeenCalled();
  });

  it('알림 DB 쓰기 실패가 호출자에게 에러를 전파하지 않는다 (fire-and-forget)', async () => {
    // Even when create throws, emitNotification itself must resolve cleanly
    prisma.v1NotificationPreference.findUnique.mockResolvedValue(null);
    prisma.v1Notification.create.mockRejectedValue(new Error('DB connection lost'));

    // Should not throw
    await expect(
      service.emitNotification('user-1', 'match_application_received', 'match-1'),
    ).resolves.toBeUndefined();

    // Let the fire-and-forget promise settle
    await new Promise(setImmediate);

    // create was attempted (the failure was swallowed)
    expect(prisma.v1Notification.create).toHaveBeenCalledTimes(1);
  });

  it('tournament 이벤트는 activityEnabled 선호도 필드를 사용한다', async () => {
    // activityEnabled=false → tournament_registration_confirmed should be suppressed
    prisma.v1NotificationPreference.findUnique.mockResolvedValue({ activityEnabled: false });

    await service.emitNotification('user-1', 'tournament_registration_confirmed', 'tournament-1');
    await new Promise(setImmediate);

    expect(prisma.v1Notification.create).not.toHaveBeenCalled();
  });

  it('body를 넘기지 않으면 이벤트 기본 body(EVENT_BODIES)로 채워진다', async () => {
    prisma.v1NotificationPreference.findUnique.mockResolvedValue(null);
    prisma.v1Notification.create.mockResolvedValue(makeNotification());

    await service.emitNotification('user-1', 'match_application_received', 'match-1');
    await new Promise(setImmediate);

    expect(prisma.v1Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          body: '매치 신청을 확인해 주세요.',
        }),
      }),
    );
  });

  it('호출부가 body를 명시하면 기본값 대신 그 값이 저장된다', async () => {
    prisma.v1NotificationPreference.findUnique.mockResolvedValue(null);
    prisma.v1Notification.create.mockResolvedValue(makeNotification());

    await service.emitNotification(
      'user-1',
      'match_application_received',
      'match-1',
      '"주말 풋살 모임" 매치 신청을 확인해 주세요.',
    );
    await new Promise(setImmediate);

    expect(prisma.v1Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          body: '"주말 풋살 모임" 매치 신청을 확인해 주세요.',
        }),
      }),
    );
  });

  it('emits notification:new to the recipient after creating the row', async () => {
    prisma.v1NotificationPreference.findUnique.mockResolvedValue(null);
    prisma.v1Notification.create.mockResolvedValue(makeNotification({ id: 'notif-2' }));

    await service.emitNotification('user-1', 'match_application_received', 'match-1');

    // Must flush the fire-and-forget promise
    await new Promise(setImmediate);

    expect(realtimeNotifier.emitToUser).toHaveBeenCalledWith(
      'user-1',
      'notification:new',
      expect.objectContaining({ id: 'notif-2' }),
    );
  });

  it('calls WebPushService.sendToUser alongside the socket emit', async () => {
    // Note: the plan's original test used the nonexistent event type 'match_join'
    // and asserted a title ('알림 제목') the service can never produce — title is
    // always looked up from the fixed EVENT_TITLES map (keyed by the real
    // NotificationEventType), never read back off the mocked created row. Using
    // a real event type here and asserting its real EVENT_TITLES value.
    prisma.v1NotificationPreference.findUnique.mockResolvedValue(null);
    prisma.v1Notification.create.mockResolvedValue(makeNotification({ id: 'notif-3' }));

    await service.emitNotification('user-1', 'match_application_received', 'match-1');
    await new Promise(setImmediate);

    expect(webPushService.sendToUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ title: '매치 신청이 도착했어요' }),
    );
  });

  it('logs a structured warning (without throwing) when WebPushService.sendToUser rejects', async () => {
    prisma.v1NotificationPreference.findUnique.mockResolvedValue(null);
    prisma.v1Notification.create.mockResolvedValue(makeNotification({ id: 'notif-4' }));
    const pushError = new Error('vapid send failed');
    webPushService.sendToUser.mockRejectedValueOnce(pushError);

    await service.emitNotification('user-1', 'match_application_received', 'match-1');
    await new Promise(setImmediate);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', err: pushError }),
      '푸시 알림 발송 실패',
    );
  });

  it('still attempts WebPushService.sendToUser when the realtime notifier throws synchronously', async () => {
    // Isolation contract mirrored from ChatService.sendMessage: a realtime-emit failure
    // must not prevent the independent web-push attempt from being made.
    prisma.v1NotificationPreference.findUnique.mockResolvedValue(null);
    prisma.v1Notification.create.mockResolvedValue(makeNotification({ id: 'notif-5' }));
    const emitError = new Error('socket not connected');
    realtimeNotifier.emitToUser.mockImplementationOnce(() => {
      throw emitError;
    });

    await service.emitNotification('user-1', 'match_application_received', 'match-1');
    await new Promise(setImmediate);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', err: emitError }),
      '실시간 알림 전송 실패',
    );
    // The web-push attempt must still have gone through despite the emit failure.
    expect(webPushService.sendToUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ title: '매치 신청이 도착했어요' }),
    );
  });

  it('team join application received notifications deep-link to team member management', async () => {
    prisma.v1NotificationPreference.findUnique.mockResolvedValue(null);
    prisma.v1Notification.create.mockResolvedValue(makeNotification());

    await service.emitNotification('manager-1', 'team_join_application_received', 'team-1');
    await new Promise(setImmediate);

    expect(prisma.v1Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientUserId: 'manager-1',
          targetType: 'team',
          targetId: 'team-1',
          deepLink: '/teams/team-1/members',
        }),
      }),
    );
  });

  // 완료 알림의 본문은 "리뷰를 남겨보세요!"인데 링크는 매치 상세(/matches/:id, /team-matches/:id)로
  // 가고 있었다 — 그 화면엔 후기 작성 CTA가 없어 알림을 눌러도 후기를 쓸 수 없었다(막다른 길).
  // 세 완료/종료 알림이 각각 실제로 후기를 쓸 수 있는 화면으로 가는지 고정한다.
  it.each([
    ['match_completed' as const, 'match-1', '/my/reviews/match/match-1'],
    ['team_match_completed' as const, 'tm-1', '/my/reviews/team_match/tm-1'],
    ['tournament_completed_review_request' as const, 'tour-1', '/tournaments/tour-1/awards'],
  ])('%s 알림은 실제 후기 작성 화면으로 딥링크한다', async (type, targetId, expectedDeepLink) => {
    prisma.v1NotificationPreference.findUnique.mockResolvedValue(null);
    prisma.v1Notification.create.mockResolvedValue(makeNotification());

    await service.emitNotification('user-1', type, targetId);
    await new Promise(setImmediate);

    expect(prisma.v1Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deepLink: expectedDeepLink }),
      }),
    );
  });

  // 리그 알림 문구 전용화(2026-08-25): 결과 확정/이의 접수/이의 처리 4종은 전부 결과
  // 영수증 화면(경기 상세가 아니라 확정 결과 + 이의 제기 CTA가 있는 화면)으로 딥링크한다.
  it.each([
    ['league_team_match_completed' as const, 'tm-1', '/team-matches/tm-1/result'],
    ['league_match_dispute_received' as const, 'tm-1', '/team-matches/tm-1/result'],
    ['league_match_dispute_corrected' as const, 'tm-1', '/team-matches/tm-1/result'],
    ['league_match_dispute_voided' as const, 'tm-1', '/team-matches/tm-1/result'],
    ['league_match_dispute_rejected' as const, 'tm-1', '/team-matches/tm-1/result'],
  ])('%s 알림은 결과 영수증 화면으로 딥링크한다', async (type, targetId, expectedDeepLink) => {
    prisma.v1NotificationPreference.findUnique.mockResolvedValue(null);
    prisma.v1Notification.create.mockResolvedValue(makeNotification());

    await service.emitNotification('user-1', type, targetId);
    await new Promise(setImmediate);

    expect(prisma.v1Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deepLink: expectedDeepLink, targetType: 'team_match' }),
      }),
    );
  });

  // team_match_completed(일반 팀매치) 문구·링크는 이 태스크로 인해 한 글자도 바뀌면 안 된다
  // -- 리그 전용 형제 타입을 새로 추가했을 뿐 기존 타입은 그대로다(회귀 고정).
  it('team_match_completed(일반) 문구·링크는 리그 전용 타입 추가 이후에도 그대로다', async () => {
    prisma.v1NotificationPreference.findUnique.mockResolvedValue(null);
    prisma.v1Notification.create.mockResolvedValue(makeNotification());

    await service.emitNotification('user-1', 'team_match_completed', 'tm-1');
    await new Promise(setImmediate);

    expect(prisma.v1Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: '팀매치가 완료됐어요. 리뷰를 남겨보세요!',
          body: '팀매치 리뷰를 남겨보세요.',
          deepLink: '/my/reviews/team_match/tm-1',
        }),
      }),
    );
  });

  // ─── tournament_record_consent_invite 딥링크 (Task 154 P0-4·P0-6) ──────────
  //
  // 이 알림은 "동의를 켜 달라"고 요청한다. 그러니 눌렀을 때 **켤 수 있는 화면**에
  // 떨어져야 한다 -- 폴백(ROUTE_BASE_BY_TARGET_TYPE['tournament'])으로 새면
  // /tournaments/{id} 로 가는데 그 화면엔 동의를 켤 방법이 없어 막다른 길이 된다.
  // 대회 id 는 착지 화면이 "어느 대회 때문에 왔는지" 를 설명하는 데 쓴다.

  it('tournament_record_consent_invite: 동의를 켤 수 있는 화면으로 가고 대회 맥락을 함께 싣는다', async () => {
    prisma.v1NotificationPreference.findUnique.mockResolvedValue(null);
    prisma.v1Notification.create.mockResolvedValue(makeNotification());

    await service.emitNotification('user-1', 'tournament_record_consent_invite', 'tour-1');
    await new Promise(setImmediate);

    expect(prisma.v1Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetType: 'tournament',
          deepLink: '/my/settings/record-consent?from=tournament&tournamentId=tour-1',
        }),
      }),
    );
  });

  it('tournament_record_consent_invite: targetId 가 없으면 파라미터 없이 기본 화면으로 간다', async () => {
    prisma.v1NotificationPreference.findUnique.mockResolvedValue(null);
    prisma.v1Notification.create.mockResolvedValue(makeNotification());

    await service.emitNotification('user-1', 'tournament_record_consent_invite', null);
    await new Promise(setImmediate);

    expect(prisma.v1Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deepLink: '/my/settings/record-consent' }),
      }),
    );
  });

  // ─── read ──────────────────────────────────────────────────────────────────

  it('read: 존재하지 않는 알림 → 404', async () => {
    prisma.v1Notification.findUnique.mockResolvedValue(null);

    await expect(service.read(user, 'ghost-id')).rejects.toThrow(NotFoundException);
  });

  it('read: 다른 사용자의 알림 → 403', async () => {
    prisma.v1Notification.findUnique.mockResolvedValue(
      makeNotification({ recipientUserId: 'other-user' }),
    );

    await expect(service.read(user, 'notif-1')).rejects.toThrow(ForbiddenException);
  });

  it('read: 이미 읽은 알림은 update를 다시 호출하지 않는다 (멱등)', async () => {
    const alreadyReadAt = new Date('2026-06-14T11:00:00Z');
    prisma.v1Notification.findUnique.mockResolvedValue(
      makeNotification({ readAt: alreadyReadAt }),
    );

    const result = await service.read(user, 'notif-1');

    expect(result.status).toBe('read');
    expect(result.readAt).toEqual(alreadyReadAt);
    // Must NOT call update for an already-read notification
    expect(prisma.v1Notification.update).not.toHaveBeenCalled();
  });

  it('read: 미읽음 → readAt 기록 후 read 상태 반환', async () => {
    const updatedNotif = makeNotification({ readAt: new Date('2026-06-14T12:00:00Z') });
    prisma.v1Notification.findUnique.mockResolvedValue(makeNotification()); // readAt: null
    prisma.v1Notification.update.mockResolvedValue(updatedNotif);

    const result = await service.read(user, 'notif-1');

    expect(result.status).toBe('read');
    expect(result.readAt).toEqual(updatedNotif.readAt);
    expect(prisma.v1Notification.update).toHaveBeenCalledTimes(1);
  });

  // ─── list ──────────────────────────────────────────────────────────────────

  it('list: limit+1 cursor 패턴 — hasNext=true이면 nextCursor 반환', async () => {
    const limit = 2;
    // Return limit+1 items to signal there is a next page
    const items = [
      makeNotification({ id: 'n1' }),
      makeNotification({ id: 'n2' }),
      makeNotification({ id: 'n3' }), // extra
    ];
    prisma.v1Notification.findMany.mockResolvedValue(items);
    prisma.v1Notification.count.mockResolvedValue(5);

    const result = await service.list(user, { limit });

    expect(result.items).toHaveLength(limit); // only limit items exposed
    expect(result.pageInfo.hasNext).toBe(true);
    expect(result.pageInfo.nextCursor).toBe('n2'); // last item of the page
  });

  it('list: items이 limit 이하면 hasNext=false', async () => {
    prisma.v1Notification.findMany.mockResolvedValue([makeNotification({ id: 'n1' })]);
    prisma.v1Notification.count.mockResolvedValue(0);

    const result = await service.list(user, { limit: 20 });

    expect(result.pageInfo.hasNext).toBe(false);
    expect(result.pageInfo.nextCursor).toBeNull();
  });

  // ─── updatePreferences ─────────────────────────────────────────────────────

  it('updatePreferences: 부분 업데이트 — 전달하지 않은 필드는 update payload에 포함되지 않는다', async () => {
    const existingPref = {
      userId: 'user-1',
      importantEnabled: true,
      activityEnabled: true,
      marketingEnabled: false,
      updatedAt: new Date(),
    };
    prisma.v1NotificationPreference.upsert.mockResolvedValue(existingPref);

    await service.updatePreferences(user, { marketingEnabled: true });

    const upsertCall = prisma.v1NotificationPreference.upsert.mock.calls[0][0];
    // Only marketingEnabled should be in update (importantEnabled/activityEnabled not passed)
    expect(upsertCall.update).toEqual({ marketingEnabled: true });
    expect(upsertCall.update).not.toHaveProperty('importantEnabled');
    expect(upsertCall.update).not.toHaveProperty('activityEnabled');
  });

  // ─── team_contact_* mapping (Task 6) ──────────────────────────────────────
  // preferenceFieldForEvent / targetTypeForEvent 는 말미에 폴백 return이 있어 분기를
  // 빠뜨려도 tsc가 안 잡는다(조용히 activityEnabled/team_match로 샌다). deepLinkForEvent도
  // 특례 없이 두면 ROUTE_BASE_BY_TARGET_TYPE['team']='/teams' 로 떨어져 /teams/{id} 라는
  // 404 링크가 만들어진다. 세 함수 모두 파일 로컬이라 직접 import할 수 없으므로,
  // emitNotification이 실제로 prisma.v1Notification.create에 저장하는 데이터로 관측한다.
  describe.each([
    ['team_contact_received' as const, '새 팀 컨택이 도착했어요', '상대 팀이 보낸 컨택을 확인해 주세요.'],
    ['team_contact_accepted' as const, '팀 컨택이 수락됐어요', '이제 상대 팀과 대화할 수 있어요.'],
    ['team_contact_declined' as const, '팀 컨택이 거절됐어요', '아쉽지만 이번에는 성사되지 않았어요.'],
  ])('%s 알림 매핑', (eventType, expectedTitle, expectedBody) => {
    it("targetType 이 'chat' 이고 딥링크가 /chat/{roomId} 로 간다", async () => {
      prisma.v1NotificationPreference.findUnique.mockResolvedValue(null);
      prisma.v1Notification.create.mockResolvedValue(makeNotification());

      await service.emitNotification('user-1', eventType, 'contact-1');
      await new Promise(setImmediate);

      expect(prisma.v1Notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            targetType: 'chat',
            deepLink: '/chat/contact-1',
            title: expectedTitle,
            body: expectedBody,
          }),
        }),
      );
    });

    it('teamEnabled 를 끈 사용자에게는 발송되지 않는다', async () => {
      prisma.v1NotificationPreference.findUnique.mockResolvedValue({
        matchEnabled: true,
        teamEnabled: false,
        teamMatchEnabled: true,
        activityEnabled: true,
        importantEnabled: true,
      });

      await service.emitNotification('user-1', eventType, 'contact-1');
      await new Promise(setImmediate);

      expect(prisma.v1Notification.create).not.toHaveBeenCalled();
    });

    it('activityEnabled 만 꺼도 발송된다 — activityEnabled 폴백으로 새지 않았다는 증거', async () => {
      prisma.v1NotificationPreference.findUnique.mockResolvedValue({
        matchEnabled: true,
        teamEnabled: true,
        teamMatchEnabled: true,
        activityEnabled: false,
        importantEnabled: true,
      });
      prisma.v1Notification.create.mockResolvedValue(makeNotification());

      await service.emitNotification('user-1', eventType, 'contact-1');
      await new Promise(setImmediate);

      expect(prisma.v1Notification.create).toHaveBeenCalled();
    });
  });
});

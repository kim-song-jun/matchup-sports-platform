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
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from './notifications.service';
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

  const realtimeGateway = { emitToUser: jest.fn() };
  const webPushService = { sendToUser: jest.fn().mockResolvedValue(undefined) };

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
        { provide: RealtimeGateway, useValue: realtimeGateway },
        { provide: WebPushService, useValue: webPushService },
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

    expect(realtimeGateway.emitToUser).toHaveBeenCalledWith(
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
});

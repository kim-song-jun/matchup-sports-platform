import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WebPushService } from './web-push.service';
import { UserBlocksService } from '../user-blocks/user-blocks.service';
import { RedisCacheService } from '../redis/redis-cache.service';
import { NotificationType } from '@prisma/client';
import { buildNotification } from '../../test/fixtures/notifications';

const mockUserBlocksService = {
  isBlocked: jest.fn().mockResolvedValue(false),
};

const mockPrisma = {
  notification: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  notificationPreference: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
};

const mockRealtime = {
  emitToUser: jest.fn(),
};

const mockWebPushService = {
  sendToUser: jest.fn().mockResolvedValue(undefined),
  isEnabled: true,
};

const mockCacheService = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  delPattern: jest.fn().mockResolvedValue(undefined),
};

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RealtimeGateway, useValue: mockRealtime },
        { provide: WebPushService, useValue: mockWebPushService },
        { provide: UserBlocksService, useValue: mockUserBlocksService },
        { provide: RedisCacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    jest.clearAllMocks();
    mockCacheService.get.mockResolvedValue(null);
  });

  describe('findMine', () => {
    it('returns paginated notifications for the user', async () => {
      const items = [
        buildNotification({ id: 'n1', userId: 'u1', title: 'Match!', body: 'Ready' }),
        buildNotification({ id: 'n2', userId: 'u1', title: 'Match2!', body: 'Ready2' }),
      ];
      mockPrisma.notification.findMany.mockResolvedValue(items);

      const result = await service.findMine('u1');

      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1' } }),
      );
    });

    it('returns hasMore=true and nextCursor when there are more items', async () => {
      const items = Array.from({ length: 21 }, (_, i) =>
        buildNotification({ id: `n${i}`, userId: 'u1', title: `N${i}`, body: 'Body' }),
      );
      mockPrisma.notification.findMany.mockResolvedValue(items);

      const result = await service.findMine('u1', { limit: 20 });

      expect(result.items).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('n19');
    });

    it('filters by isRead=true when specified', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await service.findMine('u1', { isRead: true });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1', isRead: true },
        }),
      );
    });

    it('uses cursor-based pagination when cursor is provided', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await service.findMine('u1', { cursor: 'n5' });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 1,
          cursor: { id: 'n5' },
        }),
      );
    });
  });

  describe('getUnreadCount', () => {
    it('returns cached value without hitting DB when cache is warm', async () => {
      mockCacheService.get.mockResolvedValue({ count: 3 });

      const result = await service.getUnreadCount('u1');

      expect(result).toEqual({ count: 3 });
      expect(mockPrisma.notification.count).not.toHaveBeenCalled();
    });

    it('queries DB and caches result when cache is cold', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockPrisma.notification.count.mockResolvedValue(5);

      const result = await service.getUnreadCount('u1');

      expect(result).toEqual({ count: 5 });
      expect(mockPrisma.notification.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1', isRead: false } }),
      );
      expect(mockCacheService.set).toHaveBeenCalledWith(
        'notifications:unread:u1',
        { count: 5 },
        expect.any(Number),
      );
    });
  });

  describe('create', () => {
    it('suppresses notification when recipient has blocked the sender', async () => {
      mockUserBlocksService.isBlocked.mockResolvedValue(true);

      const result = await service.create({
        userId: 'u1',
        type: NotificationType.match_created,
        title: 'Test',
        body: 'Body',
        fromUserId: 'blocked-user',
      });

      expect(result).toBeNull();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
      expect(mockRealtime.emitToUser).not.toHaveBeenCalled();
    });

    it('persists notification, emits realtime event, and calls webPushService.sendToUser', async () => {
      const notification = buildNotification({
        id: 'n1',
        userId: 'u1',
        title: 'Match!',
        body: 'Your match is ready',
        data: { matchId: 'match-1' },
      });
      mockPrisma.notificationPreference.findUnique.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue(notification);

      await service.create({
        userId: 'u1',
        type: NotificationType.match_created,
        title: 'Match!',
        body: 'Your match is ready',
      });

      expect(mockPrisma.notification.create).toHaveBeenCalled();
      expect(mockRealtime.emitToUser).toHaveBeenCalledWith('u1', 'notification:new', expect.objectContaining({
        body: 'Your match is ready',
        link: '/matches/match-1',
        category: 'match',
      }));
      expect(mockWebPushService.sendToUser).toHaveBeenCalledWith('u1', { title: 'Match!', body: 'Your match is ready' });
    });

    it('skips notification when category is disabled in user preferences', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue({
        id: 'pref-1',
        userId: 'u1',
        matchEnabled: false,
        teamEnabled: true,
        chatEnabled: true,
        paymentEnabled: true,
        teamApplicationEnabled: true,
        matchCompletedEnabled: true,
        eloChangedEnabled: true,
        chatMessageEnabled: true,
      });

      const result = await service.create({
        userId: 'u1',
        type: NotificationType.match_created,
        title: 'Match!',
        body: 'Your match is ready',
      });

      expect(result).toBeNull();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
      expect(mockRealtime.emitToUser).not.toHaveBeenCalled();
    });

    it('skips notification when teamApplicationEnabled=false for team_application_received', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue({
        id: 'pref-1',
        userId: 'u1',
        matchEnabled: true,
        teamEnabled: true,
        chatEnabled: true,
        paymentEnabled: true,
        teamApplicationEnabled: false,
        matchCompletedEnabled: true,
        eloChangedEnabled: true,
        chatMessageEnabled: true,
      });

      const result = await service.create({
        userId: 'u1',
        type: NotificationType.team_application_received,
        title: '새 팀 신청',
        body: '누군가 가입 신청했어요',
      });

      expect(result).toBeNull();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('skips notification when matchCompletedEnabled=false for match_completed', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue({
        id: 'pref-1',
        userId: 'u1',
        matchEnabled: true,
        teamEnabled: true,
        chatEnabled: true,
        paymentEnabled: true,
        teamApplicationEnabled: true,
        matchCompletedEnabled: false,
        eloChangedEnabled: true,
        chatMessageEnabled: true,
      });

      const result = await service.create({
        userId: 'u1',
        type: NotificationType.match_completed,
        title: '매치 완료',
        body: '매치가 종료됐어요',
      });

      expect(result).toBeNull();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('skips notification when eloChangedEnabled=false for elo_changed', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue({
        id: 'pref-1',
        userId: 'u1',
        matchEnabled: true,
        teamEnabled: true,
        chatEnabled: true,
        paymentEnabled: true,
        teamApplicationEnabled: true,
        matchCompletedEnabled: true,
        eloChangedEnabled: false,
        chatMessageEnabled: true,
      });

      const result = await service.create({
        userId: 'u1',
        type: NotificationType.elo_changed,
        title: 'ELO 변경',
        body: 'ELO 점수가 바뀌었어요',
      });

      expect(result).toBeNull();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('skips notification when chatMessageEnabled=false for chat_message', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue({
        id: 'pref-1',
        userId: 'u1',
        matchEnabled: true,
        teamEnabled: true,
        chatEnabled: true,
        paymentEnabled: true,
        teamApplicationEnabled: true,
        matchCompletedEnabled: true,
        eloChangedEnabled: true,
        chatMessageEnabled: false,
      });

      const result = await service.create({
        userId: 'u1',
        type: NotificationType.chat_message,
        title: '새 메시지',
        body: '채팅 메시지가 도착했어요',
      });

      expect(result).toBeNull();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('creates notification when granular field is enabled even if category fallback would also pass', async () => {
      const notification = buildNotification({
        id: 'n1',
        userId: 'u1',
        title: '새 팀 신청',
        body: '누군가 가입 신청했어요',
      });
      mockPrisma.notificationPreference.findUnique.mockResolvedValue({
        id: 'pref-1',
        userId: 'u1',
        matchEnabled: true,
        teamEnabled: true,
        chatEnabled: true,
        paymentEnabled: true,
        teamApplicationEnabled: true,
        matchCompletedEnabled: true,
        eloChangedEnabled: true,
        chatMessageEnabled: true,
      });
      mockPrisma.notification.create.mockResolvedValue(notification);

      const result = await service.create({
        userId: 'u1',
        type: NotificationType.team_application_received,
        title: '새 팀 신청',
        body: '누군가 가입 신청했어요',
      });

      expect(result).not.toBeNull();
      expect(mockPrisma.notification.create).toHaveBeenCalled();
    });
  });

  describe('getPreferences', () => {
    it('returns default values when no preference row exists', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue(null);

      const result = await service.getPreferences('u1');

      expect(result).toEqual({
        id: null,
        matchEnabled: true,
        teamEnabled: true,
        chatEnabled: true,
        paymentEnabled: true,
        teamApplicationEnabled: true,
        matchCompletedEnabled: true,
        eloChangedEnabled: true,
        chatMessageEnabled: true,
      });
    });

    it('returns stored preference values', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue({
        id: 'pref-1',
        matchEnabled: true,
        teamEnabled: false,
        chatEnabled: true,
        paymentEnabled: false,
        teamApplicationEnabled: false,
        matchCompletedEnabled: true,
        eloChangedEnabled: false,
        chatMessageEnabled: true,
      });

      const result = await service.getPreferences('u1');

      expect(result).toEqual({
        id: 'pref-1',
        matchEnabled: true,
        teamEnabled: false,
        chatEnabled: true,
        paymentEnabled: false,
        teamApplicationEnabled: false,
        matchCompletedEnabled: true,
        eloChangedEnabled: false,
        chatMessageEnabled: true,
      });
    });
  });

  describe('updatePreferences', () => {
    it('upserts preferences and returns updated values', async () => {
      const upserted = {
        id: 'pref-1',
        matchEnabled: true,
        teamEnabled: false,
        chatEnabled: true,
        paymentEnabled: true,
        teamApplicationEnabled: true,
        matchCompletedEnabled: true,
        eloChangedEnabled: true,
        chatMessageEnabled: true,
      };
      mockPrisma.notificationPreference.upsert.mockResolvedValue(upserted);

      const result = await service.updatePreferences('u1', { teamEnabled: false });

      expect(mockPrisma.notificationPreference.upsert).toHaveBeenCalled();
      expect(result.teamEnabled).toBe(false);
    });
  });

  describe('markRead', () => {
    it('marks the notification as read', async () => {
      mockPrisma.notification.findUnique.mockResolvedValue({ id: 'n1', userId: 'u1' });
      mockPrisma.notification.update.mockResolvedValue(
        buildNotification({
          id: 'n1',
          userId: 'u1',
          title: 'Match!',
          body: 'Your match is ready',
          data: { matchId: 'match-1' },
          isRead: true,
        }),
      );

      await service.markRead('n1', 'u1');

      expect(mockPrisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isRead: true } }),
      );
      expect(mockRealtime.emitToUser).toHaveBeenCalledWith('u1', 'notification:read', {
        notificationId: 'n1',
      });
    });

    it('throws NotFoundException for unknown notification', async () => {
      mockPrisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.markRead('nonexistent', 'u1')).rejects.toThrow();
    });
  });

  describe('markAllRead', () => {
    it('marks all unread notifications and emits a sync event', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 3 });

      await expect(service.markAllRead('u1')).resolves.toEqual({ count: 3 });
      expect(mockRealtime.emitToUser).toHaveBeenCalledWith('u1', 'notification:read-all', {
        count: 3,
      });
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WebPushService } from './web-push.service';
import { NotificationType } from '@prisma/client';

const mockPrisma = {
  notification: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
};

const mockRealtime = {
  emitToUser: jest.fn(),
};

const mockWebPushService = {
  sendToUser: jest.fn().mockResolvedValue(undefined),
  isEnabled: true,
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
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('persists notification, emits realtime event, and calls webPushService.sendToUser', async () => {
      const notification = {
        id: 'n1',
        userId: 'u1',
        type: NotificationType.match_created,
        title: 'Match!',
        body: 'Your match is ready',
        data: { matchId: 'match-1' },
        isRead: false,
        createdAt: new Date(),
      };
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
  });

  describe('markRead', () => {
    it('marks the notification as read', async () => {
      mockPrisma.notification.findUnique.mockResolvedValue({ id: 'n1', userId: 'u1' });
      mockPrisma.notification.update.mockResolvedValue({
        id: 'n1',
        type: NotificationType.match_created,
        title: 'Match!',
        body: 'Your match is ready',
        isRead: true,
        data: { matchId: 'match-1' },
        createdAt: new Date(),
      });

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

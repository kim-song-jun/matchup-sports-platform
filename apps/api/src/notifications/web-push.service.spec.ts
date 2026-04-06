import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WebPushService } from './web-push.service';
import { PrismaService } from '../prisma/prisma.service';

// Mock the web-push module
jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
  generateVAPIDKeys: jest.fn().mockReturnValue({ publicKey: 'pub', privateKey: 'priv' }),
}));

import * as webpush from 'web-push';

const mockPrisma = {
  pushSubscription: {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockConfigEnabled = {
  get: jest.fn((key: string) => {
    const values: Record<string, string> = {
      VAPID_PUBLIC_KEY: 'BFake_public_key',
      VAPID_PRIVATE_KEY: 'fake_private_key',
      VAPID_SUBJECT: 'mailto:admin@matchup.kr',
    };
    return values[key];
  }),
};

const mockConfigDisabled = {
  get: jest.fn(() => undefined),
};

describe('WebPushService', () => {
  describe('graceful disable — missing VAPID keys', () => {
    let service: WebPushService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          WebPushService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: ConfigService, useValue: mockConfigDisabled },
        ],
      }).compile();

      service = module.get<WebPushService>(WebPushService);
      service.onModuleInit();
      jest.clearAllMocks();
    });

    it('sets isEnabled to false', () => {
      expect(service.isEnabled).toBe(false);
    });

    it('sendToUser is a no-op when disabled', async () => {
      await service.sendToUser('u1', { title: 'Test', body: 'Body' });
      expect(mockPrisma.pushSubscription.findMany).not.toHaveBeenCalled();
    });
  });

  describe('enabled — VAPID keys present', () => {
    let service: WebPushService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          WebPushService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: ConfigService, useValue: mockConfigEnabled },
        ],
      }).compile();

      service = module.get<WebPushService>(WebPushService);
      service.onModuleInit();
      jest.clearAllMocks();
    });

    it('sets isEnabled to true', () => {
      expect(service.isEnabled).toBe(true);
    });

    it('subscribe upserts by endpoint', async () => {
      mockPrisma.pushSubscription.upsert.mockResolvedValue({});

      await service.subscribe('u1', {
        endpoint: 'https://push.example.com/sub/abc',
        keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
      });

      expect(mockPrisma.pushSubscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { endpoint: 'https://push.example.com/sub/abc' },
          update: expect.objectContaining({ userId: 'u1', p256dh: 'p256dh-value', auth: 'auth-value' }),
          create: expect.objectContaining({ userId: 'u1', endpoint: 'https://push.example.com/sub/abc' }),
        }),
      );
    });

    it('unsubscribe deletes by userId + endpoint', async () => {
      mockPrisma.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });

      await service.unsubscribe('u1', 'https://push.example.com/sub/abc');

      expect(mockPrisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1', endpoint: 'https://push.example.com/sub/abc' },
      });
    });

    it('sendToUser calls webpush.sendNotification for each subscription', async () => {
      mockPrisma.pushSubscription.findMany.mockResolvedValue([
        { id: 's1', endpoint: 'https://push.example.com/1', p256dh: 'p1', auth: 'a1' },
      ]);
      (webpush.sendNotification as jest.Mock).mockResolvedValue({});

      await service.sendToUser('u1', { title: 'Hello', body: 'World' });

      expect(webpush.sendNotification).toHaveBeenCalledWith(
        { endpoint: 'https://push.example.com/1', keys: { p256dh: 'p1', auth: 'a1' } },
        JSON.stringify({ title: 'Hello', body: 'World', url: undefined }),
      );
    });

    it('sendToUser removes subscriptions that return 410 Gone', async () => {
      mockPrisma.pushSubscription.findMany.mockResolvedValue([
        { id: 's2', endpoint: 'https://push.example.com/gone', p256dh: 'p2', auth: 'a2' },
      ]);
      (webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 410 });
      mockPrisma.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });

      await service.sendToUser('u1', { title: 'Gone', body: 'Test' });

      expect(mockPrisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['s2'] } },
      });
    });
  });

  describe('generateVapidKeys', () => {
    it('wraps webpush.generateVAPIDKeys', () => {
      const keys = WebPushService.generateVapidKeys();
      expect(keys).toEqual({ publicKey: 'pub', privateKey: 'priv' });
    });
  });
});

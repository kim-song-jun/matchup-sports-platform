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
  webPushFailureLog: {
    create: jest.fn(),
  },
};

const mockConfigEnabled = {
  get: jest.fn((key: string) => {
    const values: Record<string, string> = {
      'vapid.publicKey': 'BFake_public_key',
      'vapid.privateKey': 'fake_private_key',
      'vapid.subject': 'mailto:admin@teameet.kr',
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

    // C7 regression tests — push-subscribe upsert semantics (Task 73)
    // Rationale: Task 69 fixed the race by switching to endpoint-keyed upsert.
    // These tests lock that contract so a revert (e.g. back to findFirst+create)
    // would be caught immediately.

    it('second subscribe call with same endpoint uses same unique key — no duplicate row possible', async () => {
      mockPrisma.pushSubscription.upsert.mockResolvedValue({});

      const endpoint = 'https://push.example.com/sub/same-endpoint';
      const sub = { endpoint, keys: { p256dh: 'p256dh-first', auth: 'auth-first' } };

      await service.subscribe('u1', sub);
      await service.subscribe('u1', sub);

      // Both calls must target the same unique key (endpoint), not a user-scoped key
      expect(mockPrisma.pushSubscription.upsert).toHaveBeenCalledTimes(2);
      const calls = mockPrisma.pushSubscription.upsert.mock.calls;
      expect(calls[0][0].where).toEqual({ endpoint });
      expect(calls[1][0].where).toEqual({ endpoint });
    });

    it('second subscribe with same endpoint but updated keys overrides p256dh and auth', async () => {
      mockPrisma.pushSubscription.upsert.mockResolvedValue({});

      const endpoint = 'https://push.example.com/sub/rekey';

      await service.subscribe('u1', { endpoint, keys: { p256dh: 'old-p256dh', auth: 'old-auth' } });
      await service.subscribe('u1', { endpoint, keys: { p256dh: 'new-p256dh', auth: 'new-auth' } });

      const secondCall = mockPrisma.pushSubscription.upsert.mock.calls[1][0];
      expect(secondCall.update).toMatchObject({ p256dh: 'new-p256dh', auth: 'new-auth' });
      // update branch must also refresh lastUsedAt
      expect(secondCall.update).toHaveProperty('lastUsedAt');
    });

    it('device hand-off: same endpoint re-subscribed by a different user updates userId in update branch', async () => {
      mockPrisma.pushSubscription.upsert.mockResolvedValue({});

      const endpoint = 'https://push.example.com/sub/shared-device';

      await service.subscribe('user-A', { endpoint, keys: { p256dh: 'p1', auth: 'a1' } });
      await service.subscribe('user-B', { endpoint, keys: { p256dh: 'p2', auth: 'a2' } });

      const firstCreate = mockPrisma.pushSubscription.upsert.mock.calls[0][0];
      const secondUpdate = mockPrisma.pushSubscription.upsert.mock.calls[1][0];

      expect(firstCreate.create).toMatchObject({ userId: 'user-A', endpoint });
      // The update branch carries the new userId so ownership transfers atomically
      expect(secondUpdate.update).toMatchObject({ userId: 'user-B' });
    });

    it('rapid sequential calls with same endpoint each go through upsert (not create-then-fail)', async () => {
      mockPrisma.pushSubscription.upsert.mockResolvedValue({});

      const endpoint = 'https://push.example.com/sub/rapid';
      const sub = { endpoint, keys: { p256dh: 'p', auth: 'a' } };

      // Simulate rapid sequential calls (e.g. background tab retry)
      await Promise.all([
        service.subscribe('u1', sub),
        service.subscribe('u1', sub),
        service.subscribe('u1', sub),
      ]);

      // All three must use upsert — never a separate findFirst+create path
      expect(mockPrisma.pushSubscription.upsert).toHaveBeenCalledTimes(3);
      const uniqueWhereKeys = new Set(
        mockPrisma.pushSubscription.upsert.mock.calls.map((c: [{ where: { endpoint: string } }]) => c[0].where.endpoint),
      );
      expect(uniqueWhereKeys.size).toBe(1);
      expect(uniqueWhereKeys.has(endpoint)).toBe(true);
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

    it('sendToUser removes subscriptions that return 404 Not Found', async () => {
      mockPrisma.pushSubscription.findMany.mockResolvedValue([
        { id: 's3', endpoint: 'https://push.example.com/notfound', p256dh: 'p3', auth: 'a3' },
      ]);
      (webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 404 });
      mockPrisma.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });

      await service.sendToUser('u1', { title: 'NotFound', body: 'Test' });

      // 404 is treated same as 410 — expired subscription cleanup, no failure log
      expect(mockPrisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['s3'] } },
      });
      expect(mockPrisma.webPushFailureLog.create).not.toHaveBeenCalled();
    });

    it('sendToUser writes a WebPushFailureLog row for 5xx errors', async () => {
      const endpoint = 'https://push.example.com/abcdef';
      mockPrisma.pushSubscription.findMany.mockResolvedValue([
        { id: 'sfail', endpoint, p256dh: 'pf', auth: 'af' },
      ]);
      (webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 500 });
      mockPrisma.webPushFailureLog.create.mockResolvedValue({});

      await service.sendToUser('u1', { title: 'Error', body: 'Test' });

      expect(mockPrisma.webPushFailureLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u1',
            subscriptionId: 'sfail',
            statusCode: 500,
            errorCode: 'HTTP_5XX',
            endpointSuffix: 'abcdef',
          }),
        }),
      );
      // endpointSuffix must be exactly 6 characters (C12 PII guard)
      const callData = mockPrisma.webPushFailureLog.create.mock.calls[0][0].data;
      expect(callData.endpointSuffix).toHaveLength(6);
    });

    it('sendToUser writes a failure log for network errors (no statusCode) with NETWORK errorCode', async () => {
      const endpoint = 'https://push.example.com/net123';
      mockPrisma.pushSubscription.findMany.mockResolvedValue([
        { id: 'snet', endpoint, p256dh: 'pn', auth: 'an' },
      ]);
      (webpush.sendNotification as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));
      mockPrisma.webPushFailureLog.create.mockResolvedValue({});

      await service.sendToUser('u1', { title: 'NetError', body: 'Test' });

      expect(mockPrisma.webPushFailureLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u1',
            errorCode: 'NETWORK',
          }),
        }),
      );
    });

    it('sendToUser continues normally if WebPushFailureLog.create rejects (fire-and-forget)', async () => {
      const endpoint = 'https://push.example.com/zzfail';
      mockPrisma.pushSubscription.findMany.mockResolvedValue([
        { id: 'sff', endpoint, p256dh: 'pff', auth: 'aff' },
      ]);
      (webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 503 });
      // Simulate DB failure on log write
      mockPrisma.webPushFailureLog.create.mockRejectedValue(new Error('DB down'));

      // Must not throw even if log write fails
      await expect(service.sendToUser('u1', { title: 'FF', body: 'Test' })).resolves.toBeUndefined();
    });
  });

  describe('generateVapidKeys', () => {
    it('wraps webpush.generateVAPIDKeys', () => {
      const keys = WebPushService.generateVapidKeys();
      expect(keys).toEqual({ publicKey: 'pub', privateKey: 'priv' });
    });
  });
});

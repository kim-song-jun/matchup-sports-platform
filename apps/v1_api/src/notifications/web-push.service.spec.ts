import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WebPushService } from './web-push.service';

function uniqueConstraintError(target: string) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.2',
    meta: { target: [target] },
  });
}

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

import * as webpush from 'web-push';

describe('WebPushService', () => {
  const prisma = {
    v1PushSubscription: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    v1WebPushFailureLog: { create: jest.fn() },
  };

  async function build(env: Record<string, string | undefined>) {
    const originalEnv = { ...process.env };
    for (const [key, value] of Object.entries(env)) {
      // process.env stringifies assigned values, so `undefined` becomes the
      // truthy string "undefined" unless the key is deleted instead.
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    const moduleRef = await Test.createTestingModule({
      providers: [WebPushService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const service = moduleRef.get(WebPushService);
    service.onModuleInit();
    process.env = originalEnv;
    return service;
  }

  beforeEach(() => jest.clearAllMocks());

  it('stays disabled and returns a null public key when VAPID env vars are missing', async () => {
    const service = await build({ VAPID_PUBLIC_KEY: undefined, VAPID_PRIVATE_KEY: undefined, VAPID_SUBJECT: undefined });

    expect(service.getPublicKey()).toBeNull();
    await service.sendToUser('user-1', { title: 'hi' });

    expect(prisma.v1PushSubscription.findMany).not.toHaveBeenCalled();
  });

  it('enables and returns the configured public key when all three VAPID vars are set', async () => {
    const service = await build({
      VAPID_PUBLIC_KEY: 'pub-key',
      VAPID_PRIVATE_KEY: 'priv-key',
      VAPID_SUBJECT: 'mailto:ops@teameet.co.kr',
    });

    expect(service.getPublicKey()).toBe('pub-key');
    expect(webpush.setVapidDetails).toHaveBeenCalledWith('mailto:ops@teameet.co.kr', 'pub-key', 'priv-key');
  });

  it('sendToUser deletes a subscription on a 410 Gone response', async () => {
    const service = await build({
      VAPID_PUBLIC_KEY: 'pub-key',
      VAPID_PRIVATE_KEY: 'priv-key',
      VAPID_SUBJECT: 'mailto:ops@teameet.co.kr',
    });
    prisma.v1PushSubscription.findMany.mockResolvedValue([
      { id: 'sub-1', endpoint: 'https://push.example/abc', p256dh: 'p', auth: 'a' },
    ]);
    (webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 410 });

    await service.sendToUser('user-1', { title: 'hi' });

    expect(prisma.v1PushSubscription.delete).toHaveBeenCalledWith({ where: { id: 'sub-1' } });
  });

  it('sendToUser logs a failure without deleting the subscription on a non-expiry error', async () => {
    const service = await build({
      VAPID_PUBLIC_KEY: 'pub-key',
      VAPID_PRIVATE_KEY: 'priv-key',
      VAPID_SUBJECT: 'mailto:ops@teameet.co.kr',
    });
    prisma.v1PushSubscription.findMany.mockResolvedValue([
      { id: 'sub-1', endpoint: 'https://push.example/abc', p256dh: 'p', auth: 'a' },
    ]);
    (webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 500 });

    await service.sendToUser('user-1', { title: 'hi' });

    expect(prisma.v1PushSubscription.delete).not.toHaveBeenCalled();
    expect(prisma.v1WebPushFailureLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          subscriptionId: 'sub-1',
          statusCode: 500,
          endpointSuffix: 'le/abc',
        }),
      }),
    );
  });

  it('subscribe creates a new subscription when the endpoint is not yet registered', async () => {
    const service = await build({});
    prisma.v1PushSubscription.create.mockResolvedValue({ id: 'sub-1' });

    const dto = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p', auth: 'a' } };
    await service.subscribe('user-1', dto);

    expect(prisma.v1PushSubscription.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', endpoint: dto.endpoint, p256dh: 'p', auth: 'a' },
    });
    expect(prisma.v1PushSubscription.findUnique).not.toHaveBeenCalled();
  });

  it('subscribe refreshes the keys on a unique-constraint race when the existing row belongs to the same user', async () => {
    const service = await build({});
    prisma.v1PushSubscription.create.mockRejectedValue(uniqueConstraintError('endpoint'));
    prisma.v1PushSubscription.findUnique.mockResolvedValue({ id: 'sub-1', userId: 'user-1' });

    const dto = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p2', auth: 'a2' } };
    await service.subscribe('user-1', dto);

    expect(prisma.v1PushSubscription.update).toHaveBeenCalledWith({
      where: { endpoint: dto.endpoint },
      data: { p256dh: 'p2', auth: 'a2' },
    });
  });

  it('subscribe rejects on a unique-constraint race when the existing row belongs to a different user', async () => {
    const service = await build({});
    prisma.v1PushSubscription.create.mockRejectedValue(uniqueConstraintError('endpoint'));
    prisma.v1PushSubscription.findUnique.mockResolvedValue({ id: 'sub-1', userId: 'other-user' });

    const dto = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p', auth: 'a' } };

    await expect(service.subscribe('user-1', dto)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PUSH_ENDPOINT_ALREADY_REGISTERED' }),
    });
    expect(prisma.v1PushSubscription.update).not.toHaveBeenCalled();
  });

  it('subscribe rejects a non-conflict create error unchanged', async () => {
    const service = await build({});
    prisma.v1PushSubscription.create.mockRejectedValue(new Error('db down'));

    const dto = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p', auth: 'a' } };

    await expect(service.subscribe('user-1', dto)).rejects.toThrow('db down');
    expect(prisma.v1PushSubscription.findUnique).not.toHaveBeenCalled();
  });
});

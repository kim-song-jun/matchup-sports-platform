import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { getLoggerToken } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { WebPushService } from './web-push.service';
import { FcmPushService } from './fcm-push.service';

function uniqueConstraintError(target: string) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.2',
    meta: { target: [target] },
  });
}

function recordNotFoundError() {
  return new Prisma.PrismaClientKnownRequestError(
    'An operation failed because it depends on one or more records that were required but not found.',
    { code: 'P2025', clientVersion: '6.19.2' },
  );
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
  const logger = { warn: jest.fn(), error: jest.fn() };
  const fcmPushService = { sendToUser: jest.fn().mockResolvedValue({ disabled: false }) };

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
      providers: [
        WebPushService,
        { provide: PrismaService, useValue: prisma },
        { provide: getLoggerToken(WebPushService.name), useValue: logger },
        { provide: FcmPushService, useValue: fcmPushService },
      ],
    }).compile();
    const service = moduleRef.get(WebPushService);
    service.onModuleInit();
    process.env = originalEnv;
    return service;
  }

  beforeEach(() => jest.clearAllMocks());

  it('fans out to Android FCM even when browser Web Push is disabled', async () => {
    const service = await build({
      VAPID_PUBLIC_KEY: undefined,
      VAPID_PRIVATE_KEY: undefined,
      VAPID_SUBJECT: undefined,
    });

    await service.sendToUser('user-1', {
      notificationId: 'notification-1',
      title: '문의 답변',
      body: '답변을 확인해 주세요.',
      url: '/my/inquiries/inquiry-1',
    });

    expect(fcmPushService.sendToUser).toHaveBeenCalledWith('user-1', {
      notificationId: 'notification-1',
      title: '문의 답변',
      body: '답변을 확인해 주세요.',
      route: '/my/inquiries/inquiry-1',
    });
  });

  it('stays disabled and returns a null public key when VAPID env vars are missing', async () => {
    const service = await build({ VAPID_PUBLIC_KEY: undefined, VAPID_PRIVATE_KEY: undefined, VAPID_SUBJECT: undefined });

    expect(service.getPublicKey()).toBeNull();
    const summary = await service.sendToUser('user-1', { title: 'hi' });

    expect(prisma.v1PushSubscription.findMany).not.toHaveBeenCalled();
    // 꺼져 있다는 사실을 호출부가 알 수 있어야 한다 — 그래야 운영 화면이 "보냈다"고
    // 표시하지 않는다.
    expect(summary).toEqual({ subscriptions: 0, delivered: 0, failed: 0, disabled: true });
  });

  /**
   * sendToUser 는 예외를 전부 삼키므로, 반환하는 요약이 유일한 신호다. 이게 없으면
   * 호출부(어드민 발송)가 "구독 0건이라 아무 데도 안 감"과 "정상 발송"을 구분할 수 없다.
   */
  it('sendToUser reports zero subscriptions instead of silently succeeding when the user has none', async () => {
    const service = await build({
      VAPID_PUBLIC_KEY: 'pub-key',
      VAPID_PRIVATE_KEY: 'priv-key',
      VAPID_SUBJECT: 'mailto:ops@teameet.co.kr',
    });
    prisma.v1PushSubscription.findMany.mockResolvedValue([]);

    const summary = await service.sendToUser('user-1', { title: 'hi' });

    expect(summary).toEqual({ subscriptions: 0, delivered: 0, failed: 0, disabled: false });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('sendToUser counts delivered and failed sends separately across multiple subscriptions', async () => {
    const service = await build({
      VAPID_PUBLIC_KEY: 'pub-key',
      VAPID_PRIVATE_KEY: 'priv-key',
      VAPID_SUBJECT: 'mailto:ops@teameet.co.kr',
    });
    prisma.v1PushSubscription.findMany.mockResolvedValue([
      { id: 'sub-1', endpoint: 'https://fcm.googleapis.com/a', p256dh: 'p1', auth: 'a1' },
      { id: 'sub-2', endpoint: 'https://fcm.googleapis.com/b', p256dh: 'p2', auth: 'a2' },
    ]);
    (webpush.sendNotification as jest.Mock)
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ statusCode: 500, message: 'server error' });

    const summary = await service.sendToUser('user-1', { title: 'hi' });

    expect(summary).toEqual({ subscriptions: 2, delivered: 1, failed: 1, disabled: false });
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

  it('sendToUser silently ignores a P2025 (already deleted) error when cleaning up an expired subscription', async () => {
    const service = await build({
      VAPID_PUBLIC_KEY: 'pub-key',
      VAPID_PRIVATE_KEY: 'priv-key',
      VAPID_SUBJECT: 'mailto:ops@teameet.co.kr',
    });
    prisma.v1PushSubscription.findMany.mockResolvedValue([
      { id: 'sub-1', endpoint: 'https://push.example/abc', p256dh: 'p', auth: 'a' },
    ]);
    (webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 410 });
    prisma.v1PushSubscription.delete.mockRejectedValue(recordNotFoundError());

    await service.sendToUser('user-1', { title: 'hi' });

    expect(prisma.v1PushSubscription.delete).toHaveBeenCalledWith({ where: { id: 'sub-1' } });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('sendToUser logs a structured warning when deleting an expired subscription fails for a non-P2025 reason', async () => {
    const service = await build({
      VAPID_PUBLIC_KEY: 'pub-key',
      VAPID_PRIVATE_KEY: 'priv-key',
      VAPID_SUBJECT: 'mailto:ops@teameet.co.kr',
    });
    prisma.v1PushSubscription.findMany.mockResolvedValue([
      { id: 'sub-1', endpoint: 'https://push.example/abc', p256dh: 'p', auth: 'a' },
    ]);
    (webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 410 });
    const connectionError = new Error('connection timeout');
    prisma.v1PushSubscription.delete.mockRejectedValue(connectionError);

    await service.sendToUser('user-1', { title: 'hi' });

    expect(prisma.v1PushSubscription.delete).toHaveBeenCalledWith({ where: { id: 'sub-1' } });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', subscriptionId: 'sub-1', err: connectionError }),
      '만료된 웹 푸시 구독 삭제 실패',
    );
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
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', subscriptionId: 'sub-1', statusCode: 500 }),
      '웹 푸시 발송 실패',
    );
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
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('sendToUser includes the error message (not just statusCode) in the failure warn log', async () => {
    const service = await build({
      VAPID_PUBLIC_KEY: 'pub-key',
      VAPID_PRIVATE_KEY: 'priv-key',
      VAPID_SUBJECT: 'mailto:ops@teameet.co.kr',
    });
    prisma.v1PushSubscription.findMany.mockResolvedValue([
      { id: 'sub-1', endpoint: 'https://push.example/abc', p256dh: 'p', auth: 'a' },
    ]);
    (webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 500, message: 'gateway timeout' });

    await service.sendToUser('user-1', { title: 'hi' });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, message: 'gateway timeout' }),
      '웹 푸시 발송 실패',
    );
  });

  it('sendToUser logs an error via pino when the failure log itself cannot be written', async () => {
    const service = await build({
      VAPID_PUBLIC_KEY: 'pub-key',
      VAPID_PRIVATE_KEY: 'priv-key',
      VAPID_SUBJECT: 'mailto:ops@teameet.co.kr',
    });
    prisma.v1PushSubscription.findMany.mockResolvedValue([
      { id: 'sub-1', endpoint: 'https://push.example/abc', p256dh: 'p', auth: 'a' },
    ]);
    (webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 500 });
    const dbError = new Error('db unavailable');
    prisma.v1WebPushFailureLog.create.mockRejectedValue(dbError);

    await service.sendToUser('user-1', { title: 'hi' });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', subscriptionId: 'sub-1', statusCode: 500 }),
      '웹 푸시 발송 실패',
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', subscriptionId: 'sub-1', err: dbError }),
      '웹 푸시 실패 기록(V1WebPushFailureLog) 저장 실패',
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

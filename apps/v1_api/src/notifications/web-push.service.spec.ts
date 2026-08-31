import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { getLoggerToken } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { WebPushService } from './web-push.service';
import { FcmPushService } from './fcm-push.service';
import { ApnsPushService } from './apns-push.service';
import { PushDeviceService } from './push-device.service';

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
  const nativeSummary = { devices: 0, delivered: 0, failed: 0, disabled: false };
  const fcmPushService = { platform: 'android', isConfigured: true, send: jest.fn().mockResolvedValue(nativeSummary) };
  const apnsPushService = { platform: 'ios', isConfigured: true, send: jest.fn().mockResolvedValue(nativeSummary) };
  const pushDevices = { activeTokens: jest.fn().mockResolvedValue([]) };

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
    // The push environment is read when a notification is sent, not at startup — the
    // startup read made delivery depend on which provider Nest initialised first. So it has
    // to survive the env restore below, unlike the VAPID keys this helper is juggling.
    process.env.V1_PUSH_ENVIRONMENT ??= 'alpha';
    const pushEnvironment = process.env.V1_PUSH_ENVIRONMENT;
    const moduleRef = await Test.createTestingModule({
      providers: [
        WebPushService,
        { provide: PrismaService, useValue: prisma },
        { provide: getLoggerToken(WebPushService.name), useValue: logger },
        { provide: FcmPushService, useValue: fcmPushService },
        { provide: ApnsPushService, useValue: apnsPushService },
        { provide: PushDeviceService, useValue: pushDevices },
      ],
    }).compile();
    const service = moduleRef.get(WebPushService);
    service.onModuleInit();
    process.env = { ...originalEnv, V1_PUSH_ENVIRONMENT: pushEnvironment };
    return service;
  }

  beforeEach(() => jest.clearAllMocks());

  it('still reaches native devices when browser Web Push is disabled', async () => {
    pushDevices.activeTokens.mockResolvedValueOnce([
      { id: 'a1', token: 'android-token-1', platform: 'android' },
    ]);
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

    // The web `url` becomes the native `route`; the rest of the payload is shared verbatim.
    expect(fcmPushService.send).toHaveBeenCalledWith(
      [{ id: 'a1', token: 'android-token-1', platform: 'android' }],
      {
        notificationId: 'notification-1',
        title: '문의 답변',
        body: '답변을 확인해 주세요.',
        route: '/my/inquiries/inquiry-1',
      },
    );
  });

  it('stays disabled and returns a null public key when VAPID env vars are missing', async () => {
    const service = await build({ VAPID_PUBLIC_KEY: undefined, VAPID_PRIVATE_KEY: undefined, VAPID_SUBJECT: undefined });

    expect(service.getPublicKey()).toBeNull();
    const summary = await service.sendToUser('user-1', { title: 'hi' });

    expect(prisma.v1PushSubscription.findMany).not.toHaveBeenCalled();
    // 꺼져 있다는 사실을 호출부가 알 수 있어야 한다 — 그래야 운영 화면이 "보냈다"고
    // 표시하지 않는다.
    expect(summary).toEqual({
      subscriptions: 0, delivered: 0, failed: 0, disabled: true,
      native: { devices: 0, delivered: 0, failed: 0, disabled: false },
    });
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

    expect(summary).toEqual({
      subscriptions: 0, delivered: 0, failed: 0, disabled: false,
      native: { devices: 0, delivered: 0, failed: 0, disabled: false },
    });
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

    expect(summary).toEqual({
      subscriptions: 2, delivered: 1, failed: 1, disabled: false,
      native: { devices: 0, delivered: 0, failed: 0, disabled: false },
    });
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

/**
 * Platform routing.
 *
 * The dispatcher, not the adapters, decides which service a device goes to. That placement
 * is what makes an unrouted platform visible: if each adapter queried for its own devices,
 * a platform nobody handles would look exactly like "nobody was subscribed".
 */
describe('WebPushService native fan-out', () => {
  const prisma = {
    v1PushSubscription: { findMany: jest.fn().mockResolvedValue([]) },
    v1WebPushFailureLog: { create: jest.fn() },
  };
  const logger = { warn: jest.fn(), error: jest.fn() };
  const summary = { devices: 1, delivered: 1, failed: 0, disabled: false };
  const fcm = { platform: 'android', isConfigured: true, send: jest.fn().mockResolvedValue(summary) };
  const apns = { platform: 'ios', isConfigured: true, send: jest.fn().mockResolvedValue(summary) };
  const pushDevices = { activeTokens: jest.fn() };
  let previousEnvironment: string | undefined;

  async function build() {
    const moduleRef = await Test.createTestingModule({
      providers: [
        WebPushService,
        { provide: PrismaService, useValue: prisma },
        { provide: getLoggerToken(WebPushService.name), useValue: logger },
        { provide: FcmPushService, useValue: fcm },
        { provide: ApnsPushService, useValue: apns },
        { provide: PushDeviceService, useValue: pushDevices },
      ],
    }).compile();
    const service = moduleRef.get(WebPushService);
    // Resolves the push environment, as it does in the running app.
    service.onModuleInit();
    return service;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    previousEnvironment = process.env.V1_PUSH_ENVIRONMENT;
    process.env.V1_PUSH_ENVIRONMENT = 'alpha';
  });

  afterEach(() => {
    if (previousEnvironment === undefined) delete process.env.V1_PUSH_ENVIRONMENT;
    else process.env.V1_PUSH_ENVIRONMENT = previousEnvironment;
  });

  /**
   * Nest promises no order between one provider's `onModuleInit` and another's, and an
   * adapter only reports `isConfigured` from inside its own. Reading that flag while
   * deciding the push environment therefore made delivery depend on which ran first: if
   * this service went first it saw two unconfigured adapters, kept a null environment, and
   * every later send returned without a word. Nothing in a log, nothing on a device.
   */
  it('delivers even when its own onModuleInit runs before the adapters', async () => {
    const lateApns = {
      platform: 'ios',
      isConfigured: false,
      configure() {
        this.isConfigured = true;
      },
      send: jest.fn().mockResolvedValue(summary),
    };
    const lateFcm = { platform: 'android', isConfigured: false, send: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        WebPushService,
        { provide: PrismaService, useValue: prisma },
        { provide: getLoggerToken(WebPushService.name), useValue: logger },
        { provide: FcmPushService, useValue: lateFcm },
        { provide: ApnsPushService, useValue: lateApns },
        { provide: PushDeviceService, useValue: pushDevices },
      ],
    }).compile();
    const service = moduleRef.get(WebPushService);

    service.onModuleInit();
    lateApns.configure();

    pushDevices.activeTokens.mockResolvedValue([
      { id: 'i1', token: 'ios-token-1', platform: 'ios' },
    ]);
    await service.sendToUser('user-1', { notificationId: 'n-late', title: '문의 답변' });

    expect(lateApns.send).toHaveBeenCalledWith(
      [{ id: 'i1', token: 'ios-token-1', platform: 'ios' }],
      expect.objectContaining({ notificationId: 'n-late' }),
    );
  });

  /**
   * The one state that must never be silent: something can deliver, but the environment
   * that says *where* is missing. Returning without a word here is how a deployment ends up
   * sending nothing for days.
   */
  it('says so when an adapter is configured but the environment is not', async () => {
    delete process.env.V1_PUSH_ENVIRONMENT;
    pushDevices.activeTokens.mockResolvedValue([
      { id: 'i1', token: 'ios-token-1', platform: 'ios' },
    ]);
    const service = await build();

    await service.sendToUser('user-1', { notificationId: 'n-2', title: '문의 답변' });

    expect(apns.send).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('V1_PUSH_ENVIRONMENT'),
    );
  });

  /**
   * The summary is what an operator sees. `admin-ops.service.ts` returns it straight from
   * the manual-push endpoint, so a user with only app devices and no browser subscription
   * used to read as "0 sent" on screen even though the notification had gone out — which
   * invites sending it again, or filing an outage.
   */
  it('reports app deliveries for a user with no browser subscription', async () => {
    prisma.v1PushSubscription.findMany.mockResolvedValue([]);
    pushDevices.activeTokens.mockResolvedValue([
      { id: 'i1', token: 'ios-token-1', platform: 'ios' },
    ]);
    const service = await build();

    const result = await service.sendToUser('user-1', { notificationId: 'n-3', title: '문의 답변' });

    expect(result.native).toEqual({ devices: 1, delivered: 1, failed: 0, disabled: false });
    // The web half stays its own number: nothing was sent there, and saying otherwise would
    // hide a broken browser subscription behind a working phone.
    expect(result.subscriptions).toBe(0);
    expect(result.delivered).toBe(0);
  });

  it('sends each device to the service that owns its platform', async () => {
    pushDevices.activeTokens.mockResolvedValue([
      { id: 'a1', token: 'android-token-1', platform: 'android' },
      { id: 'i1', token: 'ios-token-1', platform: 'ios' },
      { id: 'a2', token: 'android-token-2', platform: 'android' },
    ]);
    const service = await build();

    await service.sendToUser('user-1', { notificationId: 'n-1', title: '문의 답변' });

    expect(fcm.send).toHaveBeenCalledWith(
      [
        { id: 'a1', token: 'android-token-1', platform: 'android' },
        { id: 'a2', token: 'android-token-2', platform: 'android' },
      ],
      expect.objectContaining({ notificationId: 'n-1', title: '문의 답변' }),
    );
    expect(apns.send).toHaveBeenCalledWith(
      [{ id: 'i1', token: 'ios-token-1', platform: 'ios' }],
      expect.objectContaining({ notificationId: 'n-1' }),
    );
  });

  it('never hands an iOS token to the Firebase adapter', async () => {
    pushDevices.activeTokens.mockResolvedValue([
      { id: 'i1', token: 'ios-token-1', platform: 'ios' },
    ]);
    const service = await build();

    await service.sendToUser('user-1', { notificationId: 'n-1', title: '문의 답변' });

    // An APNs token accepted by Firebase does not error — it silently never arrives.
    expect(fcm.send).not.toHaveBeenCalled();
    expect(apns.send).toHaveBeenCalledTimes(1);
  });

  /**
   * The failure this routing exists to prevent. A platform added to the enum with no
   * adapter behind it would otherwise deliver nothing and report the same "0 devices" a
   * user with no registrations reports.
   */
  it('logs an error rather than silently dropping a platform nothing routes', async () => {
    pushDevices.activeTokens.mockResolvedValue([
      { id: 'x1', token: 'future-platform-token', platform: 'web_unsupported' },
    ]);
    const service = await build();

    await service.sendToUser('user-1', { notificationId: 'n-1', title: '문의 답변' });

    expect(fcm.send).not.toHaveBeenCalled();
    expect(apns.send).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'web_unsupported', deviceCount: 1 }),
      expect.stringContaining('no push adapter'),
    );
  });

  it('lets one platform fail without cancelling the other', async () => {
    pushDevices.activeTokens.mockResolvedValue([
      { id: 'a1', token: 'android-token-1', platform: 'android' },
      { id: 'i1', token: 'ios-token-1', platform: 'ios' },
    ]);
    fcm.send.mockRejectedValueOnce(new Error('firebase unavailable'));
    const service = await build();

    await expect(
      service.sendToUser('user-1', { notificationId: 'n-1', title: '문의 답변' }),
    ).resolves.toEqual(expect.objectContaining({ disabled: expect.any(Boolean) }));

    expect(apns.send).toHaveBeenCalledTimes(1);
  });

  it('asks for devices once, not once per adapter', async () => {
    pushDevices.activeTokens.mockResolvedValue([
      { id: 'a1', token: 'android-token-1', platform: 'android' },
      { id: 'i1', token: 'ios-token-1', platform: 'ios' },
    ]);
    const service = await build();

    await service.sendToUser('user-1', { notificationId: 'n-1', title: '문의 답변' });

    expect(pushDevices.activeTokens).toHaveBeenCalledTimes(1);
    expect(pushDevices.activeTokens).toHaveBeenCalledWith('user-1', 'alpha');
  });
});

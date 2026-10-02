import { generateKeyPairSync } from 'node:crypto';
import { FcmAccessTokenProvider } from './fcm-access-token-provider';
import { FcmPushService } from './fcm-push.service';

function androidDevices(tokens: string[]) {
  return tokens.map((token, index) => ({
    id: 'device-' + (index + 1),
    token,
    platform: 'android' as const,
  }));
}

function fcmError(status: number, errorCode: string) {
  return new Response(JSON.stringify({
    error: {
      status: status === 404 ? 'NOT_FOUND' : 'UNAVAILABLE',
      details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }],
    },
  }), { status, headers: { 'content-type': 'application/json' } });
}

describe('FcmPushService', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const pushDevices = {
    recordSuccessfulDeliveries: jest.fn(),
    revokeTokens: jest.fn(),
    recordTransientFailures: jest.fn(),
  };
  const logger = { warn: jest.fn(), error: jest.fn() };
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let currentToken: jest.SpyInstance;
  let invalidateToken: jest.SpyInstance;

  function configureCredentials() {
    process.env.V1_PUSH_ENVIRONMENT = 'alpha';
    process.env.FIREBASE_PROJECT_ID = 'teameet-alpha';
    process.env.FIREBASE_CLIENT_EMAIL = 'push-sender@teameet-alpha.iam.gserviceaccount.com';
    process.env.FIREBASE_PRIVATE_KEY = privateKeyPem.replace(/\n/g, '\\n');
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.V1_PUSH_ENVIRONMENT;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    currentToken = jest.spyOn(FcmAccessTokenProvider.prototype, 'current')
      .mockResolvedValue('short-lived-access-token');
    invalidateToken = jest.spyOn(FcmAccessTokenProvider.prototype, 'invalidate')
      .mockImplementation(() => undefined);
    pushDevices.revokeTokens.mockResolvedValue(undefined);
    pushDevices.recordSuccessfulDeliveries.mockResolvedValue(undefined);
    pushDevices.recordTransientFailures.mockResolvedValue(undefined);
  });

  afterEach(() => {
    currentToken.mockRestore();
    invalidateToken.mockRestore();
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('stays disabled only when all FCM HTTP credentials are absent', async () => {
    const service = new FcmPushService(pushDevices as never, logger as never);
    service.onModuleInit();
    await expect(service.send(androidDevices(['token-with-safe-length-1']), {
      notificationId: 'notification-1',
      title: '문의 답변',
    })).resolves.toEqual({ devices: 0, delivered: 0, failed: 0, disabled: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails startup for partial credentials, cross-environment projects, or foreign service accounts', () => {
    process.env.FIREBASE_PROJECT_ID = 'teameet-alpha';
    expect(() => new FcmPushService(pushDevices as never, logger as never).onModuleInit())
      .toThrow('partially configured');

    configureCredentials();
    process.env.FIREBASE_PROJECT_ID = 'teameet-production';
    process.env.FIREBASE_CLIENT_EMAIL = 'push-sender@teameet-production.iam.gserviceaccount.com';
    expect(() => new FcmPushService(pushDevices as never, logger as never).onModuleInit())
      .toThrow('does not match V1_PUSH_ENVIRONMENT');

    configureCredentials();
    process.env.FIREBASE_CLIENT_EMAIL = 'push-sender@another-alpha.iam.gserviceaccount.com';
    expect(() => new FcmPushService(pushDevices as never, logger as never).onModuleInit())
      .toThrow('does not belong');
  });

  it('sends through FCM HTTP v1 and separates permanent from transient token failures', async () => {
    configureCredentials();
    fetchMock
      .mockResolvedValueOnce(fcmError(404, 'UNREGISTERED'))
      .mockResolvedValueOnce(fcmError(503, 'UNAVAILABLE'));
    const service = new FcmPushService(pushDevices as never, logger as never);
    service.onModuleInit();
    const devices = androidDevices([
      'permanent-fcm-registration-token',
      'transient-fcm-registration-token',
    ]);

    await expect(service.send(devices, {
      notificationId: 'notification-1',
      title: '문의 답변이 등록됐어요',
      body: '문의 내용을 확인해 주세요.',
      route: '/my/inquiries/inquiry-1',
    })).resolves.toEqual({ devices: 2, delivered: 0, failed: 2, disabled: false });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://fcm.googleapis.com/v1/projects/teameet-alpha/messages:send',
    );
    const request = fetchMock.mock.calls[0][1];
    expect(request.headers.authorization).toBe('Bearer short-lived-access-token');
    expect(JSON.parse(request.body)).toEqual({
      message: {
        token: 'permanent-fcm-registration-token',
        notification: { title: '문의 답변이 등록됐어요', body: '문의 내용을 확인해 주세요.' },
        data: {
          notificationId: 'notification-1',
          route: '/my/inquiries/inquiry-1',
        },
        android: {
          priority: 'high',
          notification: { channel_id: 'teameet_general', tag: 'notification-1' },
        },
      },
    });
    expect(pushDevices.revokeTokens).toHaveBeenCalledWith(['device-1']);
    expect(pushDevices.recordTransientFailures).toHaveBeenCalledWith(['device-2']);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('fcm-registration-token');
  });

  it('records successful HTTP responses and limits each concurrent request group to 50 devices', async () => {
    configureCredentials();
    const devices = androidDevices(Array.from({ length: 51 }, (_, index) => 'token-' + index));
    let active = 0;
    let maxActive = 0;
    fetchMock.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return new Response(JSON.stringify({ name: 'message-id' }), { status: 200 });
    });
    const service = new FcmPushService(pushDevices as never, logger as never);
    service.onModuleInit();

    await expect(service.send(devices, {
      notificationId: 'notification-1',
      title: '문의 답변',
    })).resolves.toEqual({ devices: 51, delivered: 51, failed: 0, disabled: false });
    expect(fetchMock).toHaveBeenCalledTimes(51);
    expect(maxActive).toBeLessThanOrEqual(50);
    expect(pushDevices.recordSuccessfulDeliveries)
      .toHaveBeenCalledWith(devices.map((device) => device.id));
  });

  it('refreshes authorization once on 401 and never logs credentials or device tokens', async () => {
    configureCredentials();
    fetchMock
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'message-id' }), { status: 200 }));
    const service = new FcmPushService(pushDevices as never, logger as never);
    service.onModuleInit();

    await expect(service.send(androidDevices(['sensitive-registration-token']), {
      notificationId: 'notification-1',
      title: '문의 답변',
    })).resolves.toEqual({ devices: 1, delivered: 1, failed: 0, disabled: false });
    expect(invalidateToken).toHaveBeenCalledWith('short-lived-access-token');
    expect(currentToken).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('sensitive-registration-token');
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('short-lived-access-token');
  });

  it('serves Android devices only', () => {
    expect(new FcmPushService({} as never, { warn: jest.fn() } as never).platform).toBe('android');
  });
});

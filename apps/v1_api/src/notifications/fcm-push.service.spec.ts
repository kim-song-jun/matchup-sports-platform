import { getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { FcmPushService } from './fcm-push.service';

jest.mock('firebase-admin/app', () => ({
  cert: jest.fn((value) => value),
  getApp: jest.fn(),
  getApps: jest.fn(),
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(),
}));

/**
 * The dispatcher hands this adapter only Android devices; it never queries for its own.
 * Building targets here keeps that contract visible in every case.
 */
function androidDevices(tokens: string[]) {
  return tokens.map((token, index) => ({
    id: `device-${index + 1}`,
    token,
    platform: 'android' as const,
  }));
}

describe('FcmPushService', () => {
  const messaging = { sendEachForMulticast: jest.fn() };
  const pushDevices = {
    recordSuccessfulDeliveries: jest.fn(),
    revokeTokens: jest.fn(),
    recordTransientFailures: jest.fn(),
  };
  const logger = { warn: jest.fn(), error: jest.fn() };
  const originalEnv = { ...process.env };

  function configureCredentials() {
    process.env.V1_PUSH_ENVIRONMENT = 'alpha';
    process.env.FIREBASE_PROJECT_ID = 'teameet-alpha';
    process.env.FIREBASE_CLIENT_EMAIL =
      'firebase-adminsdk-test@teameet-alpha.iam.gserviceaccount.com';
    process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nsecret\\n-----END PRIVATE KEY-----';
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.V1_PUSH_ENVIRONMENT;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
    (getApps as jest.Mock).mockReturnValue([]);
    (initializeApp as jest.Mock).mockReturnValue({ name: 'teameet-v1-fcm-alpha' });
    (getMessaging as jest.Mock).mockReturnValue(messaging);
    pushDevices.revokeTokens.mockResolvedValue(undefined);
    pushDevices.recordSuccessfulDeliveries.mockResolvedValue(undefined);
    pushDevices.recordTransientFailures.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('stays disabled only when all Firebase credentials are absent', async () => {
    const service = new FcmPushService(pushDevices as never, logger as never);
    service.onModuleInit();

    await expect(
      service.send(androidDevices(['token-with-safe-length-1']), {
        notificationId: 'notification-1',
        title: '문의 답변',
      }),
    ).resolves.toEqual({ devices: 0, delivered: 0, failed: 0, disabled: true });
    expect(messaging.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('fails startup when Firebase credentials are only partially configured', () => {
    process.env.FIREBASE_PROJECT_ID = 'teameet-alpha';
    const service = new FcmPushService(pushDevices as never, logger as never);
    expect(() => service.onModuleInit()).toThrow('partially configured');
  });

  it('fails startup when Alpha is connected to a production Firebase project', () => {
    configureCredentials();
    process.env.FIREBASE_PROJECT_ID = 'teameet-production';
    process.env.FIREBASE_CLIENT_EMAIL =
      'firebase-adminsdk-test@teameet-production.iam.gserviceaccount.com';
    const service = new FcmPushService(pushDevices as never, logger as never);
    expect(() => service.onModuleInit()).toThrow('does not match V1_PUSH_ENVIRONMENT');
  });

  it('fails startup when the service-account email belongs to another project', () => {
    configureCredentials();
    process.env.FIREBASE_CLIENT_EMAIL =
      'firebase-adminsdk-test@another-alpha.iam.gserviceaccount.com';
    const service = new FcmPushService(pushDevices as never, logger as never);
    expect(() => service.onModuleInit()).toThrow('does not belong');
  });

  it('delivers notification data and separates permanent from transient token failures', async () => {
    configureCredentials();
    const permanentToken = 'permanent-fcm-registration-token';
    const transientToken = 'transient-fcm-registration-token';
    const devices = androidDevices([permanentToken, transientToken]);
    messaging.sendEachForMulticast.mockResolvedValue({
      successCount: 0,
      failureCount: 2,
      responses: [
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
        { success: false, error: { code: 'messaging/internal-error' } },
      ],
    });
    const service = new FcmPushService(pushDevices as never, logger as never);
    service.onModuleInit();

    await expect(
      service.send(devices, {
        notificationId: 'notification-1',
        title: '문의 답변이 등록되었습니다',
        body: '문의 내용을 확인해 주세요.',
        route: '/my/inquiries/inquiry-1',
      }),
    ).resolves.toEqual({ devices: 2, delivered: 0, failed: 2, disabled: false });

    expect(messaging.sendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: [permanentToken, transientToken],
        data: { notificationId: 'notification-1', route: '/my/inquiries/inquiry-1' },
      }),
    );
    expect(pushDevices.revokeTokens).toHaveBeenCalledWith(['device-1']);
    expect(pushDevices.recordTransientFailures).toHaveBeenCalledWith(['device-2']);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(permanentToken);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(transientToken);
  });

  it('chunks more than 500 devices and records successful delivery timestamps', async () => {
    configureCredentials();
    const devices = androidDevices(
      Array.from({ length: 501 }, (_, index) => `registration-token-${index}`),
    );
    messaging.sendEachForMulticast
      .mockResolvedValueOnce({
        successCount: 500,
        failureCount: 0,
        responses: Array.from({ length: 500 }, () => ({ success: true })),
      })
      .mockResolvedValueOnce({
        successCount: 1,
        failureCount: 0,
        responses: [{ success: true }],
      });
    const service = new FcmPushService(pushDevices as never, logger as never);
    service.onModuleInit();

    await expect(
      service.send(devices, { notificationId: 'notification-1', title: '문의 답변' }),
    ).resolves.toEqual({ devices: 501, delivered: 501, failed: 0, disabled: false });

    expect(messaging.sendEachForMulticast).toHaveBeenCalledTimes(2);
    expect(messaging.sendEachForMulticast.mock.calls[0][0].tokens).toHaveLength(500);
    expect(messaging.sendEachForMulticast.mock.calls[1][0].tokens).toHaveLength(1);
    expect(pushDevices.recordSuccessfulDeliveries).toHaveBeenCalledWith(
      devices.map((device) => device.id),
    );
  });

  it('tracks an entire rejected multicast batch as transient without exposing tokens', async () => {
    configureCredentials();
    const devices = androidDevices(['sensitive-registration-token']);
    messaging.sendEachForMulticast.mockRejectedValue(new Error('firebase unavailable'));
    const service = new FcmPushService(pushDevices as never, logger as never);
    service.onModuleInit();

    await expect(
      service.send(devices, { notificationId: 'notification-1', title: '문의 답변' }),
    ).resolves.toEqual({ devices: 1, delivered: 0, failed: 1, disabled: false });

    expect(pushDevices.recordTransientFailures).toHaveBeenCalledWith(['device-1']);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('sensitive-registration-token');
  });
});

/**
 * The android-only contract, stated from this side.
 *
 * Device selection moved to the dispatcher when iOS gained its own adapter, so this service
 * can no longer refuse a foreign token by construction. What it can do — and what this pins
 * — is declare which platform it serves, so the dispatcher's routing has something to match
 * against and a device with no adapter is a loud failure rather than a silent zero.
 */
describe('FcmPushService platform contract', () => {
  it('serves android and nothing else', () => {
    const service = new FcmPushService({} as never, { warn: jest.fn() } as never);
    expect(service.platform).toBe('android');
  });
});

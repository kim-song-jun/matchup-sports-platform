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

describe('FcmPushService', () => {
  const messaging = { sendEachForMulticast: jest.fn() };
  const pushDevices = {
    activeAndroidTokens: jest.fn(),
    revokeTokens: jest.fn(),
    recordTransientFailures: jest.fn(),
  };
  const logger = { warn: jest.fn(), error: jest.fn() };
  const originalEnv = { ...process.env };

  function configureCredentials() {
    process.env.V1_PUSH_ENVIRONMENT = 'alpha';
    process.env.FIREBASE_PROJECT_ID = 'teameet-alpha';
    process.env.FIREBASE_CLIENT_EMAIL = 'firebase-admin@example.test';
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
    pushDevices.recordTransientFailures.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('stays disabled only when all Firebase credentials are absent', async () => {
    const service = new FcmPushService(pushDevices as never, logger as never);
    service.onModuleInit();

    await expect(
      service.sendToUser('user-1', { notificationId: 'notification-1', title: '문의 답변' }),
    ).resolves.toEqual({ devices: 0, delivered: 0, failed: 0, disabled: true });
    expect(pushDevices.activeAndroidTokens).not.toHaveBeenCalled();
  });

  it('fails startup when Firebase credentials are only partially configured', () => {
    process.env.FIREBASE_PROJECT_ID = 'teameet-alpha';
    const service = new FcmPushService(pushDevices as never, logger as never);
    expect(() => service.onModuleInit()).toThrow('partially configured');
  });

  it('delivers notification data and separates permanent from transient token failures', async () => {
    configureCredentials();
    const permanentToken = 'permanent-fcm-registration-token';
    const transientToken = 'transient-fcm-registration-token';
    pushDevices.activeAndroidTokens.mockResolvedValue([
      { id: 'device-1', token: permanentToken },
      { id: 'device-2', token: transientToken },
    ]);
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
      service.sendToUser('user-1', {
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
});

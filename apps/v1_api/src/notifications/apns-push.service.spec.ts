import { EventEmitter } from 'node:events';
import { generateKeyPairSync } from 'node:crypto';
import { connect } from 'node:http2';
import { ApnsPushService } from './apns-push.service';

jest.mock('node:http2', () => {
  const actual = jest.requireActual('node:http2');
  return { ...actual, connect: jest.fn() };
});

/** One APNs response, replayed through the event shape node's http2 client uses. */
interface Scripted {
  status: number;
  body?: string;
}

/**
 * A stand-in for the HTTP/2 session, recording the headers it was asked to send.
 *
 * The request shape matters more than it looks: `apns-topic` addresses the app,
 * `apns-collapse-id` is what stops a second copy of the same notification stacking, and the
 * path carries the device token. Apple answers a wrong one with a bare 4xx and a reason
 * string, never an exception.
 */
class FakeSession extends EventEmitter {
  closed = false;
  destroyed = false;
  readonly sent: Record<string, unknown>[] = [];
  readonly bodies: string[] = [];
  private readonly script: Scripted[];

  constructor(script: Scripted[]) {
    super();
    this.script = [...script];
  }

  request(headers: Record<string, unknown>) {
    this.sent.push(headers);
    const scripted = this.script.shift() ?? { status: 200 };
    const stream = new EventEmitter() as EventEmitter & {
      setEncoding(encoding: string): void;
      end(body: string): void;
    };
    stream.setEncoding = () => {};
    stream.end = (body: string) => {
      this.bodies.push(body);
      setImmediate(() => {
        stream.emit('response', { ':status': scripted.status });
        if (scripted.body) stream.emit('data', scripted.body);
        stream.emit('end');
      });
    };
    return stream;
  }

  close() {
    this.closed = true;
  }
}

describe('ApnsPushService', () => {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const logger = { warn: jest.fn(), error: jest.fn() };
  const pushDevices = {
    recordSuccessfulDeliveries: jest.fn().mockResolvedValue(undefined),
    revokeTokens: jest.fn().mockResolvedValue(undefined),
    recordTransientFailures: jest.fn().mockResolvedValue(undefined),
  };
  const originalEnv = { ...process.env };

  function configure(overrides: Record<string, string> = {}) {
    process.env.V1_PUSH_ENVIRONMENT = 'alpha';
    process.env.APNS_KEY_ID = 'ABC1234DEF';
    process.env.APNS_TEAM_ID = 'TEAM123456';
    process.env.APNS_BUNDLE_ID = 'kr.co.teameet.alpha';
    process.env.APNS_PRIVATE_KEY = pem;
    Object.assign(process.env, overrides);
  }

  let nowMs = 1_700_000_000_000;

  function build(script: Scripted[] = []) {
    const session = new FakeSession(script);
    (connect as jest.Mock).mockReturnValue(session);
    const service = new ApnsPushService(pushDevices as never, logger as never, () => nowMs);
    service.onModuleInit();
    return { service, session };
  }

  const iosDevice = (id: string, token: string) =>
    ({ id, token, platform: 'ios' }) as never;

  beforeEach(() => {
    jest.clearAllMocks();
    nowMs = 1_700_000_000_000;
    process.env = { ...originalEnv };
    for (const key of ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_BUNDLE_ID', 'APNS_PRIVATE_KEY']) {
      delete process.env[key];
    }
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // MARK: - Configuration

  it('stays disabled, not broken, when no credentials are present', async () => {
    process.env.V1_PUSH_ENVIRONMENT = 'alpha';
    const service = new ApnsPushService(pushDevices as never, logger as never);
    service.onModuleInit();

    await expect(service.send([iosDevice('d1', 'token')], { notificationId: 'n', title: 't' }))
      .resolves.toEqual({ devices: 0, delivered: 0, failed: 0, disabled: true });
    expect(connect).not.toHaveBeenCalled();
  });

  it('fails startup when credentials are only partially configured', () => {
    process.env.V1_PUSH_ENVIRONMENT = 'alpha';
    process.env.APNS_KEY_ID = 'ABC1234DEF';
    const service = new ApnsPushService(pushDevices as never, logger as never);
    expect(() => service.onModuleInit()).toThrow('partially configured');
  });

  /**
   * Fail-closed, and loudly. A deployment that supplies the APNs key but forgets
   * V1_PUSH_ENVIRONMENT cannot be allowed to start: there would be no way to tell the
   * sandbox gateway from the production one, and the wrong choice delivers nothing while
   * looking healthy. Nest propagates a throw from onModuleInit, so this stops the boot.
   */
  it('fails startup when credentials are present but the push environment is not set', () => {
    configure();
    delete process.env.V1_PUSH_ENVIRONMENT;
    const service = new ApnsPushService(pushDevices as never, logger as never);
    expect(() => service.onModuleInit()).toThrow('앱 푸시 환경이 설정되지 않았어요');
  });

  /**
   * Environment isolation, the same guarantee the Firebase adapter makes about its project.
   * The bundle id decides which app a notification is addressed to, so a production build
   * carrying the alpha bundle would deliver alpha notifications to production users.
   */
  it('fails startup when the bundle id belongs to the other environment', () => {
    configure({ V1_PUSH_ENVIRONMENT: 'production', APNS_BUNDLE_ID: 'kr.co.teameet.alpha' });
    expect(() => new ApnsPushService(pushDevices as never, logger as never).onModuleInit())
      .toThrow('does not match V1_PUSH_ENVIRONMENT');

    configure({ V1_PUSH_ENVIRONMENT: 'alpha', APNS_BUNDLE_ID: 'kr.co.teameet' });
    expect(() => new ApnsPushService(pushDevices as never, logger as never).onModuleInit())
      .toThrow('does not match V1_PUSH_ENVIRONMENT');
  });

  /** An alpha token must never be handed to Apple's production gateway, or the reverse. */
  it('talks to the gateway that belongs to its environment', async () => {
    configure();
    const alpha = build([{ status: 200 }]);
    await alpha.service.send([iosDevice('d1', 'token')], { notificationId: 'n', title: 't' });
    expect(connect).toHaveBeenCalledWith(`https://${ApnsPushService.SANDBOX_HOST}`);

    jest.clearAllMocks();
    configure({ V1_PUSH_ENVIRONMENT: 'production', APNS_BUNDLE_ID: 'kr.co.teameet' });
    const production = build([{ status: 200 }]);
    await production.service.send([iosDevice('d1', 'token')], { notificationId: 'n', title: 't' });
    expect(connect).toHaveBeenCalledWith(`https://${ApnsPushService.PRODUCTION_HOST}`);
  });

  // MARK: - Request shape

  it('addresses the device, the app and the notification', async () => {
    configure();
    const { service, session } = build([{ status: 200 }]);

    await service.send([iosDevice('d1', 'device-token-abc')], {
      notificationId: 'notification-1',
      title: '문의 답변이 등록되었습니다',
      body: '문의 내용을 확인해 주세요.',
      route: '/my/inquiries/inquiry-1',
    });

    const [headers] = session.sent;
    expect(headers[':method']).toBe('POST');
    expect(headers[':path']).toBe('/3/device/device-token-abc');
    expect(headers['apns-topic']).toBe('kr.co.teameet.alpha');
    expect(headers['apns-push-type']).toBe('alert');
    expect(headers['apns-priority']).toBe('10');
    // Replaces an earlier copy of the same notification instead of stacking a second one.
    expect(headers['apns-collapse-id']).toBe('notification-1');
    expect(String(headers.authorization)).toMatch(/^bearer eyJ/);

    const body = JSON.parse(session.bodies[0]) as Record<string, unknown>;
    expect(body.aps).toEqual({
      alert: { title: '문의 답변이 등록되었습니다', body: '문의 내용을 확인해 주세요.' },
      sound: 'default',
    });
    // The tap handler reads these two; they must survive as top-level custom keys.
    expect(body.notificationId).toBe('notification-1');
    expect(body.route).toBe('/my/inquiries/inquiry-1');
  });

  it('defaults a missing route to the notification list', async () => {
    configure();
    const { service, session } = build([{ status: 200 }]);
    await service.send([iosDevice('d1', 't')], { notificationId: 'n', title: 't' });
    expect((JSON.parse(session.bodies[0]) as { route: string }).route).toBe('/notifications');
  });

  // MARK: - Failure classification

  it('revokes a token Apple says is gone and keeps a transient failure registered', async () => {
    configure();
    const { service } = build([
      { status: 410, body: JSON.stringify({ reason: 'Unregistered' }) },
      { status: 400, body: JSON.stringify({ reason: 'BadDeviceToken' }) },
      { status: 503, body: JSON.stringify({ reason: 'ServiceUnavailable' }) },
      { status: 429, body: JSON.stringify({ reason: 'TooManyRequests' }) },
      { status: 200 },
    ]);

    const summary = await service.send(
      [
        iosDevice('gone', 'token-1'),
        iosDevice('bad', 'token-2'),
        iosDevice('unavailable', 'token-3'),
        iosDevice('throttled', 'token-4'),
        iosDevice('ok', 'token-5'),
      ],
      { notificationId: 'n', title: 't' },
    );

    expect(summary).toEqual({ devices: 5, delivered: 1, failed: 4, disabled: false });
    // Permanent: the device will never receive again, so stop addressing it.
    expect(pushDevices.revokeTokens).toHaveBeenCalledWith(['gone', 'bad']);
    // Transient: Apple is busy, not the device. Revoking here would lose a live subscriber.
    expect(pushDevices.recordTransientFailures).toHaveBeenCalledWith(['unavailable', 'throttled']);
    expect(pushDevices.recordSuccessfulDeliveries).toHaveBeenCalledWith(['ok']);
  });

  it('never writes a device token into the log', async () => {
    configure();
    const secret = 'sensitive-apns-device-token';
    const { service } = build([{ status: 503, body: JSON.stringify({ reason: 'ServiceUnavailable' }) }]);
    await service.send([iosDevice('d1', secret)], { notificationId: 'n', title: 't' });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(secret);
  });

  /**
   * A rejected provider token is our credential's problem, not the device's — retrying the
   * same request with a fresh token is the correct recovery, and doing it more than once
   * would trade one rejection for a rate-limit ban.
   */
  it('re-signs once when Apple rejects a token old enough to re-issue', async () => {
    configure();
    const { service, session } = build([
      { status: 200 },
      { status: 403, body: JSON.stringify({ reason: 'ExpiredProviderToken' }) },
      { status: 200 },
    ]);

    // First send mints the token; time then moves past Apple's minimum re-issue interval so
    // the refresh is actually allowed.
    await service.send([iosDevice('warm', 'token')], { notificationId: 'warm', title: 't' });
    nowMs += 25 * 60_000;

    const summary = await service.send([iosDevice('d1', 'token')], { notificationId: 'n', title: 't' });

    expect(summary.delivered).toBe(1);
    // The warm-up request plus the rejected one plus the retry.
    expect(session.sent).toHaveLength(3);
  });

  it('does not retry a provider-token rejection when re-signing is still rate limited', async () => {
    configure();
    // Two 403s: the first triggers a refresh that the token object refuses (too soon after
    // the initial signing), so no second request is made.
    const { service, session } = build([
      { status: 403, body: JSON.stringify({ reason: 'InvalidProviderToken' }) },
    ]);

    const summary = await service.send([iosDevice('d1', 'token')], { notificationId: 'n', title: 't' });

    expect(summary.failed).toBe(1);
    expect(session.sent).toHaveLength(1);
    expect(pushDevices.recordTransientFailures).toHaveBeenCalledWith(['d1']);
  });

  it('treats a connection error as transient rather than losing the device', async () => {
    configure();
    const service = new ApnsPushService(pushDevices as never, logger as never);
    (connect as jest.Mock).mockReturnValue({
      closed: false,
      destroyed: false,
      on: jest.fn(),
      close: jest.fn(),
      request: () => {
        throw new Error('socket hang up');
      },
    });
    service.onModuleInit();

    const summary = await service.send([iosDevice('d1', 'token')], { notificationId: 'n', title: 't' });
    expect(summary).toEqual({ devices: 1, delivered: 0, failed: 1, disabled: false });
    expect(pushDevices.revokeTokens).toHaveBeenCalledWith([]);
    expect(pushDevices.recordTransientFailures).toHaveBeenCalledWith(['d1']);
  });

  // MARK: - Connection reuse

  /**
   * APNs has no multicast endpoint, so every device is its own request. Opening a
   * connection per request would throw away the one thing HTTP/2 is here for.
   */
  it('reuses a single connection across devices and across pushes', async () => {
    configure();
    const { service } = build([{ status: 200 }, { status: 200 }, { status: 200 }]);

    await service.send([iosDevice('d1', 't1'), iosDevice('d2', 't2')], {
      notificationId: 'n-1',
      title: 't',
    });
    await service.send([iosDevice('d3', 't3')], { notificationId: 'n-2', title: 't' });

    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('opens a new connection after the old one closed', async () => {
    configure();
    const { service, session } = build([{ status: 200 }, { status: 200 }]);

    await service.send([iosDevice('d1', 't1')], { notificationId: 'n-1', title: 't' });
    session.closed = true;
    (connect as jest.Mock).mockReturnValue(new FakeSession([{ status: 200 }]));
    await service.send([iosDevice('d2', 't2')], { notificationId: 'n-2', title: 't' });

    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('serves ios and nothing else', () => {
    configure();
    const { service } = build();
    expect(service.platform).toBe('ios');
  });
});

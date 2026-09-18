import { EventEmitter } from 'node:events';
import { generateKeyPairSync } from 'node:crypto';
import { connect } from 'node:http2';
import { ApnsPushService } from './apns-push.service';
import type { PinoLogger } from 'nestjs-pino';
import type { PushDeviceService } from './push-device.service';
import type { PushTarget } from './native-push.types';

jest.mock('node:http2', () => {
  const actual = jest.requireActual('node:http2');
  return { ...actual, connect: jest.fn() };
});

/**
 * Records which gateway each request was sent to.
 *
 * That is the whole subject here. A token is only valid at the gateway that issued it:
 * send a sandbox token to the production host and Apple answers `BadDeviceToken`, which
 * this service classifies as permanent and the device store then revokes. Routing a device
 * to the wrong host does not merely drop one notification — it unregisters a working device.
 */
class RecordingSession extends EventEmitter {
  closed = false;
  destroyed = false;
  readonly paths: string[] = [];

  request(headers: Record<string, unknown>) {
    this.paths.push(String(headers[':path']));
    const stream = new EventEmitter() as EventEmitter & {
      setEncoding(encoding: string): void;
      end(body: string): void;
    };
    stream.setEncoding = () => {};
    stream.end = () => {
      setImmediate(() => {
        stream.emit('response', { ':status': 200 });
        stream.emit('end');
      });
    };
    return stream;
  }

  close() {
    this.closed = true;
  }
}

describe('ApnsPushService gateway selection', () => {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const logger = { warn: jest.fn(), error: jest.fn() } as unknown as PinoLogger;
  const pushDevices = {
    recordSuccessfulDeliveries: jest.fn().mockResolvedValue(undefined),
    revokeTokens: jest.fn().mockResolvedValue(undefined),
    recordTransientFailures: jest.fn().mockResolvedValue(undefined),
  } as unknown as PushDeviceService;
  const originalEnv = { ...process.env };

  /** One session per host, so a request can be attributed to the gateway it went to. */
  let sessions: Map<string, RecordingSession>;

  function build(environment: 'alpha' | 'production') {
    process.env.V1_PUSH_ENVIRONMENT = environment;
    process.env.APNS_KEY_ID = 'ABC1234DEF';
    process.env.APNS_TEAM_ID = 'TEAM123456';
    process.env.APNS_BUNDLE_ID = environment === 'alpha' ? 'kr.co.teameet.alpha' : 'kr.co.teameet';
    process.env.APNS_PRIVATE_KEY = pem;

    sessions = new Map();
    (connect as jest.Mock).mockImplementation((url: string) => {
      const host = new URL(url).host;
      const existing = sessions.get(host);
      if (existing) return existing;
      const session = new RecordingSession();
      sessions.set(host, session);
      return session;
    });

    const service = new ApnsPushService(pushDevices, logger);
    service.onModuleInit();
    return service;
  }

  const device = (id: string, token: string, apnsEnvironment?: 'sandbox' | 'production') =>
    ({ id, token, platform: 'ios', apnsEnvironment }) as PushTarget;

  const tokensSentTo = (host: string) =>
    (sessions.get(host)?.paths ?? []).map((path) => path.replace('/3/device/', ''));

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('sends a production-signed device to the production gateway and a sandbox one to sandbox', async () => {
    const service = build('alpha');

    await service.send(
      [device('d1', 'prod-token', 'production'), device('d2', 'sbx-token', 'sandbox')],
      { notificationId: 'n1', title: 'hello' },
    );

    expect(tokensSentTo('api.push.apple.com')).toEqual(['prod-token']);
    expect(tokensSentTo('api.sandbox.push.apple.com')).toEqual(['sbx-token']);
  });

  /**
   * The negative control this change had to preserve.
   *
   * Before it, the alpha deployment only ever opened the sandbox connection, so "an alpha
   * token cannot leak to production" was true by construction. It now opens both, so the
   * guarantee has to be asserted rather than assumed.
   */
  it('never puts a sandbox device in a production-gateway request', async () => {
    const service = build('alpha');

    await service.send(
      [
        device('d1', 'sbx-a', 'sandbox'),
        device('d2', 'prod-a', 'production'),
        device('d3', 'sbx-b', 'sandbox'),
        device('d4', 'legacy-null'),
      ],
      { notificationId: 'n2', title: 'hello' },
    );

    expect(tokensSentTo('api.push.apple.com')).not.toContain('sbx-a');
    expect(tokensSentTo('api.push.apple.com')).not.toContain('sbx-b');
    expect(tokensSentTo('api.push.apple.com')).not.toContain('legacy-null');
    expect(tokensSentTo('api.push.apple.com')).toEqual(['prod-a']);
  });

  /**
   * A registration made before the app reported its gateway. Falling back to the server's
   * own environment is exactly what it did before this field existed, so an existing device
   * keeps working across the deploy rather than being routed somewhere new.
   */
  it('falls back to the deployment environment for a device that reported no gateway', async () => {
    const alpha = build('alpha');
    await alpha.send([device('d1', 'legacy-alpha')], { notificationId: 'n3', title: 'hello' });
    expect(tokensSentTo('api.sandbox.push.apple.com')).toEqual(['legacy-alpha']);
    expect(sessions.has('api.push.apple.com')).toBe(false);

    const production = build('production');
    await production.send([device('d2', 'legacy-prod')], { notificationId: 'n4', title: 'hello' });
    expect(tokensSentTo('api.push.apple.com')).toEqual(['legacy-prod']);
    expect(sessions.has('api.sandbox.push.apple.com')).toBe(false);
  });

  it('reuses one connection per gateway rather than one per device', async () => {
    const service = build('alpha');

    await service.send(
      [
        device('d1', 'sbx-a', 'sandbox'),
        device('d2', 'sbx-b', 'sandbox'),
        device('d3', 'prod-a', 'production'),
      ],
      { notificationId: 'n5', title: 'hello' },
    );

    expect((connect as jest.Mock).mock.calls.map(([url]: [string]) => url)).toEqual([
      'https://api.sandbox.push.apple.com',
      'https://api.push.apple.com',
    ]);
  });
});

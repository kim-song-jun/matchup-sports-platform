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
 * A gateway that answers whatever it was told to, per host.
 *
 * The subject here is what happens when a device is wrong about which gateway issued its
 * token. That is not hypothetical: TestFlight 0.1.3 (5) registered as `sandbox` while being
 * production-signed, so every notification went to the sandbox gateway, came back
 * `BadDeviceToken`, and was silently written off as a dead device.
 */
class ScriptedSession extends EventEmitter {
  closed = false;
  destroyed = false;
  readonly paths: string[] = [];

  constructor(private readonly answer: { status: number; body?: string }) {
    super();
  }

  request(headers: Record<string, unknown>) {
    this.paths.push(String(headers[':path']));
    const stream = new EventEmitter() as EventEmitter & {
      setEncoding(encoding: string): void;
      end(body: string): void;
    };
    stream.setEncoding = () => {};
    stream.end = () => {
      setImmediate(() => {
        stream.emit('response', { ':status': this.answer.status });
        if (this.answer.body) stream.emit('data', this.answer.body);
        stream.emit('end');
      });
    };
    return stream;
  }

  close() {
    this.closed = true;
  }
}

const BAD_TOKEN = { status: 400, body: JSON.stringify({ reason: 'BadDeviceToken' }) };
const BUSY = { status: 503, body: JSON.stringify({ reason: 'ServiceUnavailable' }) };
const UNREGISTERED = { status: 410, body: JSON.stringify({ reason: 'Unregistered' }) };
const OK = { status: 200 };

describe('ApnsPushService gateway self-correction', () => {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const logger = { warn: jest.fn(), error: jest.fn() };
  const pushDevices = {
    recordSuccessfulDeliveries: jest.fn().mockResolvedValue(undefined),
    revokeTokens: jest.fn().mockResolvedValue(undefined),
    recordTransientFailures: jest.fn().mockResolvedValue(undefined),
    correctApnsEnvironment: jest.fn().mockResolvedValue(undefined),
  };
  const originalEnv = { ...process.env };

  const PRODUCTION = 'api.push.apple.com';
  const SANDBOX = 'api.sandbox.push.apple.com';

  let sessions: Map<string, ScriptedSession>;

  /** `answers` maps a gateway host to the single reply it gives every request. */
  function build(answers: Record<string, { status: number; body?: string }>) {
    process.env.V1_PUSH_ENVIRONMENT = 'alpha';
    process.env.APNS_KEY_ID = 'ABC1234DEF';
    process.env.APNS_TEAM_ID = 'TEAM123456';
    process.env.APNS_BUNDLE_ID = 'kr.co.teameet.alpha';
    process.env.APNS_PRIVATE_KEY = pem;

    sessions = new Map();
    (connect as jest.Mock).mockImplementation((url: string) => {
      const host = new URL(url).host;
      const existing = sessions.get(host);
      if (existing) return existing;
      const session = new ScriptedSession(answers[host] ?? OK);
      sessions.set(host, session);
      return session;
    });

    const service = new ApnsPushService(
      pushDevices as unknown as PushDeviceService,
      logger as unknown as PinoLogger,
    );
    service.onModuleInit();
    return service;
  }

  const device = (id: string, token: string, apnsEnvironment?: 'sandbox' | 'production') =>
    ({ id, token, platform: 'ios', apnsEnvironment }) as PushTarget;

  const requestCount = (host: string) => sessions.get(host)?.paths.length ?? 0;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  /** The bug as the reader met it: a production-signed build that registered as sandbox. */
  it('delivers to the other gateway when a device reported the wrong one, instead of revoking it', async () => {
    const service = build({ [SANDBOX]: BAD_TOKEN, [PRODUCTION]: OK });

    const summary = await service.send([device('d1', 'testflight-token', 'sandbox')], {
      notificationId: 'n1',
      title: '알림',
    });

    expect(summary).toEqual({ devices: 1, delivered: 1, failed: 0, disabled: false });
    expect(requestCount(SANDBOX)).toBe(1);
    expect(requestCount(PRODUCTION)).toBe(1);
    expect(pushDevices.revokeTokens).toHaveBeenCalledWith([]);
    expect(pushDevices.recordSuccessfulDeliveries).toHaveBeenCalledWith(['d1']);
  });

  it('writes the gateway that actually answered back to the device', async () => {
    const service = build({ [SANDBOX]: BAD_TOKEN, [PRODUCTION]: OK });

    await service.send([device('d1', 'testflight-token', 'sandbox')], { notificationId: 'n1', title: '알림' });

    expect(pushDevices.correctApnsEnvironment).toHaveBeenCalledWith(['d1'], 'production');
  });

  /** Symmetrical: a build that claims production while talking to the sandbox gateway. */
  it('corrects in the other direction too', async () => {
    const service = build({ [PRODUCTION]: BAD_TOKEN, [SANDBOX]: OK });

    await service.send([device('d1', 'xcode-token', 'production')], { notificationId: 'n1', title: '알림' });

    expect(pushDevices.correctApnsEnvironment).toHaveBeenCalledWith(['d1'], 'sandbox');
    expect(pushDevices.recordSuccessfulDeliveries).toHaveBeenCalledWith(['d1']);
  });

  /**
   * The objection the original design raised against retrying: `BadDeviceToken` cannot tell
   * a dead token from a misrouted one, so revoking would have to be abandoned. Asking both
   * gateways answers it — a token rejected at both is gone, and revoking stays.
   */
  it('still revokes a token that is rejected at both gateways', async () => {
    const service = build({ [SANDBOX]: BAD_TOKEN, [PRODUCTION]: BAD_TOKEN });

    const summary = await service.send([device('d1', 'dead-token', 'sandbox')], {
      notificationId: 'n1',
      title: '알림',
    });

    expect(summary).toEqual({ devices: 1, delivered: 0, failed: 1, disabled: false });
    expect(pushDevices.revokeTokens).toHaveBeenCalledWith(['d1']);
    expect(pushDevices.correctApnsEnvironment).not.toHaveBeenCalled();
  });

  /**
   * A probe that cannot answer settles nothing. Revoking on the first `BadDeviceToken`
   * because the other gateway happened to be busy would unregister a device that is fine —
   * the same failure this path exists to prevent, reached from the other side.
   */
  it('keeps the device registered when the other gateway is merely busy', async () => {
    const service = build({ [SANDBOX]: BAD_TOKEN, [PRODUCTION]: BUSY });

    const summary = await service.send([device('d1', 'testflight-token', 'sandbox')], {
      notificationId: 'n1',
      title: '알림',
    });

    expect(summary).toEqual({ devices: 1, delivered: 0, failed: 1, disabled: false });
    expect(pushDevices.revokeTokens).toHaveBeenCalledWith([]);
    expect(pushDevices.recordTransientFailures).toHaveBeenCalledWith(['d1']);
  });

  /**
   * `Unregistered` means the app was deleted — the token is not misrouted, it is gone. Only
   * `BadDeviceToken` carries the ambiguity worth a second request.
   */
  it('does not probe the other gateway for an uninstalled app', async () => {
    const service = build({ [SANDBOX]: UNREGISTERED });

    await service.send([device('d1', 'gone-token', 'sandbox')], { notificationId: 'n1', title: '알림' });

    expect(requestCount(PRODUCTION)).toBe(0);
    expect(pushDevices.revokeTokens).toHaveBeenCalledWith(['d1']);
  });

  /** A device that simply works costs one request, as it always did. */
  it('does not touch the other gateway when the first one delivers', async () => {
    const service = build({ [SANDBOX]: OK });

    await service.send([device('d1', 'good-token', 'sandbox')], { notificationId: 'n1', title: '알림' });

    expect(requestCount(SANDBOX)).toBe(1);
    expect(requestCount(PRODUCTION)).toBe(0);
    expect(pushDevices.correctApnsEnvironment).not.toHaveBeenCalled();
  });

  /**
   * The silence is what made this cost two days. A permanently rejected device produced no
   * log line at all, so a fleet failing on every notification looked exactly like a server
   * that never tried.
   */
  it('logs the reason when it gives up on a device', async () => {
    const service = build({ [SANDBOX]: BAD_TOKEN, [PRODUCTION]: BAD_TOKEN });

    await service.send([device('d1', 'dead-token', 'sandbox')], { notificationId: 'n1', title: '알림' });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: 'd1', reason: 'BadDeviceToken' }),
      expect.stringContaining('permanently rejected'),
    );
  });
});

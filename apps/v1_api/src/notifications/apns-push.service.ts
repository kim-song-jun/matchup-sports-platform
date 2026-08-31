import { Injectable, Optional, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { V1ApnsEnvironment, V1PushPlatform } from '@prisma/client';
import { connect, constants, ClientHttp2Session } from 'node:http2';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ApnsProviderToken } from './apns-provider-token';
import { NativePushAdapter, NativePushPayload, NativeDeliverySummary, PushTarget } from './native-push.types';
import { PushDeviceService } from './push-device.service';
import { resolvePushEnvironment } from './push-environment';

/**
 * Sends notifications to Apple devices, talking to APNs directly rather than through a relay.
 *
 * Chosen over routing iOS through Firebase (2026-08-29, user decision) because FCM's one
 * structural advantage here — multicast — never applies: delivery is scoped to a single
 * user's own devices, so a batch is one to three tokens. Meanwhile the APNs auth key is
 * required either way, since Firebase would only be relaying to the same service.
 *
 * What Firebase Admin used to do for us and this file now owns: signing and refreshing the
 * provider token, holding the HTTP/2 connection, issuing one request per device, and
 * turning Apple's status codes into the permanent/transient buckets the device store
 * already understands.
 */
@Injectable()
export class ApnsPushService implements NativePushAdapter, OnModuleInit, OnModuleDestroy {
  readonly platform = V1PushPlatform.ios;

  /** Apple rejects a token older than an hour and a re-issue closer than twenty minutes. */
  private providerToken: ApnsProviderToken | null = null;
  /**
   * One connection per gateway, not one overall.
   *
   * A single deployment now talks to both: a TestFlight build of the alpha app is
   * production-signed while one installed from Xcode is not, so the same user's two devices
   * can need different hosts in the same send.
   */
  private readonly sessions = new Map<string, ClientHttp2Session>();
  /** Used only for a device that did not say which gateway issued its token. */
  private defaultHost: string | null = null;
  private bundleId: string | null = null;

  constructor(
    private readonly pushDevices: PushDeviceService,
    @InjectPinoLogger(ApnsPushService.name) private readonly logger: PinoLogger,
    /**
     * Injected so the provider token's lifetime can be exercised without waiting an hour.
     * The retry-after-403 path only fires once the token is older than Apple's minimum
     * re-issue interval, which is unreachable in a test with a real clock.
     *
     * `@Optional()` is load-bearing: Nest reads the constructor's parameter types, not its
     * default values, so without it the container looks for a provider of type `Function`,
     * finds none, and refuses to build the module. That failure surfaces as every
     * integration suite failing to create the app, not as anything about push.
     */
    @Optional() private readonly clock: () => number = () => Date.now(),
  ) {}

  static readonly SANDBOX_HOST = 'api.sandbox.push.apple.com';
  static readonly PRODUCTION_HOST = 'api.push.apple.com';

  /** Apple's own reasons. Kept as data so the classification is readable and testable. */
  static readonly PERMANENT_REASONS = new Set(['Unregistered', 'BadDeviceToken', 'DeviceTokenNotForTopic']);
  static readonly PROVIDER_TOKEN_REASONS = new Set(['ExpiredProviderToken', 'InvalidProviderToken']);

  onModuleInit(): void {
    const keyId = process.env.APNS_KEY_ID;
    const teamId = process.env.APNS_TEAM_ID;
    const bundleId = process.env.APNS_BUNDLE_ID;
    const privateKey = process.env.APNS_PRIVATE_KEY;
    const configured = [keyId, teamId, bundleId, privateKey].filter(Boolean).length;

    if (configured === 0) {
      this.logger.warn('APNs credentials not configured — iOS push disabled');
      return;
    }
    if (configured !== 4) {
      // Same shape as the Firebase guard: a half-configured deployment must not start and
      // pretend push works.
      throw new Error('APNs credentials are partially configured');
    }

    const environment = resolvePushEnvironment();
    // The bundle identifier decides which app the notification is addressed to, so a build
    // pointed at the wrong environment would deliver to the wrong app. Fail closed, exactly
    // as the Firebase adapter does for a mismatched project.
    const expectedBundleId = environment === 'alpha' ? 'kr.co.teameet.alpha' : 'kr.co.teameet';
    if (bundleId !== expectedBundleId) {
      throw new Error('APNS_BUNDLE_ID does not match V1_PUSH_ENVIRONMENT');
    }

    this.bundleId = bundleId!;
    // The fallback only. Which gateway a given device needs is a property of its token, and
    // the device reports it; this is what a registration that predates that reporting gets,
    // which is the behaviour it already had.
    this.defaultHost =
      environment === 'alpha' ? ApnsPushService.SANDBOX_HOST : ApnsPushService.PRODUCTION_HOST;
    this.providerToken = new ApnsProviderToken(privateKey!, keyId!, teamId!, this.clock);
  }

  onModuleDestroy(): void {
    for (const session of this.sessions.values()) session.close();
    this.sessions.clear();
  }

  get isConfigured(): boolean {
    return this.providerToken !== null && this.defaultHost !== null;
  }

  async send(devices: PushTarget[], payload: NativePushPayload): Promise<NativeDeliverySummary> {
    if (!this.isConfigured) return { devices: 0, delivered: 0, failed: 0, disabled: true };
    if (devices.length === 0) return { devices: 0, delivered: 0, failed: 0, disabled: false };

    const successIds: string[] = [];
    const permanentFailureIds: string[] = [];
    const transientFailureIds: string[] = [];

    // APNs has no multicast endpoint, so each device is its own request — but they share one
    // HTTP/2 connection, which is the whole point of the protocol here.
    for (const device of devices) {
      const outcome = await this.deliver(device, payload);
      switch (outcome) {
        case 'delivered':
          successIds.push(device.id);
          break;
        case 'permanent':
          permanentFailureIds.push(device.id);
          break;
        case 'transient':
          transientFailureIds.push(device.id);
          break;
      }
    }

    // Same three buckets, same writers the Firebase adapter already uses — the device store
    // never needed to know which service reported the failure.
    await Promise.all([
      this.pushDevices.recordSuccessfulDeliveries(successIds),
      this.pushDevices.revokeTokens(permanentFailureIds),
      this.pushDevices.recordTransientFailures(transientFailureIds),
    ]).catch((err: unknown) => {
      this.logger.error(
        { permanentFailureCount: permanentFailureIds.length, transientFailureCount: transientFailureIds.length, err },
        'APNs device failure state update failed',
      );
    });

    return {
      devices: devices.length,
      delivered: successIds.length,
      failed: permanentFailureIds.length + transientFailureIds.length,
      disabled: false,
    };
  }

  /**
   * The gateway this device's token is valid at.
   *
   * A token only works at the gateway that issued it: send a sandbox token to the production
   * host and Apple answers `BadDeviceToken`, which this service classifies as permanent and
   * the device store then revokes. So getting this wrong does not merely fail a delivery, it
   * unregisters a working device.
   */
  hostFor(device: PushTarget): string {
    switch (device.apnsEnvironment) {
      case V1ApnsEnvironment.production:
        return ApnsPushService.PRODUCTION_HOST;
      case V1ApnsEnvironment.sandbox:
        return ApnsPushService.SANDBOX_HOST;
      default:
        return this.defaultHost!;
    }
  }

  private async deliver(
    device: PushTarget,
    payload: NativePushPayload,
    isRetry = false,
  ): Promise<'delivered' | 'permanent' | 'transient'> {
    try {
      const response = await this.request(this.hostFor(device), device.token, payload, this.providerToken!.current());
      if (response.status === 200) return 'delivered';

      const reason = this.reasonOf(response.body);
      if (ApnsPushService.PERMANENT_REASONS.has(reason)) return 'permanent';

      // A rejected provider token is our problem, not the device's: re-sign and try once.
      // The token object refuses to re-issue inside Apple's minimum interval, so a retry
      // storm cannot turn one rejection into a rate-limit ban — which also means a token
      // signed moments ago is not retried at all. That is the right trade: a brand-new
      // token being rejected points at the key or team id, not at expiry.
      if (!isRetry && ApnsPushService.PROVIDER_TOKEN_REASONS.has(reason)) {
        const { reissued } = this.providerToken!.refresh();
        if (reissued) return this.deliver(device, payload, true);
      }

      this.logger.warn({ deviceId: device.id, status: response.status, reason }, 'APNs rejected a notification');
      return 'transient';
    } catch (err) {
      this.logger.warn({ deviceId: device.id, err }, 'APNs request failed');
      return 'transient';
    }
  }

  private reasonOf(body: string): string {
    try {
      return (JSON.parse(body) as { reason?: string }).reason ?? '';
    } catch {
      return '';
    }
  }

  private request(
    host: string,
    deviceToken: string,
    payload: NativePushPayload,
    providerToken: string,
  ): Promise<{ status: number; body: string }> {
    const session = this.openSession(host);
    const body = JSON.stringify({
      aps: { alert: { title: payload.title, body: payload.body }, sound: 'default' },
      notificationId: payload.notificationId,
      route: payload.route ?? '/notifications',
    });

    return new Promise((resolve, reject) => {
      const request = session.request({
        [constants.HTTP2_HEADER_METHOD]: 'POST',
        [constants.HTTP2_HEADER_PATH]: `/3/device/${deviceToken}`,
        [constants.HTTP2_HEADER_AUTHORIZATION]: `bearer ${providerToken}`,
        'apns-topic': this.bundleId!,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        // Replaces an earlier notification about the same thing instead of stacking a
        // second copy — the counterpart of the Android notification tag.
        'apns-collapse-id': payload.notificationId,
      });

      let status = 0;
      let received = '';
      request.setEncoding('utf8');
      request.on('response', (headers) => {
        status = Number(headers[constants.HTTP2_HEADER_STATUS] ?? 0);
      });
      request.on('data', (chunk: string) => {
        received += chunk;
      });
      request.on('end', () => resolve({ status, body: received }));
      request.on('error', reject);
      request.end(body);
    });
  }

  /** Reuses one connection per gateway across pushes; only a closed session is replaced. */
  private openSession(host: string): ClientHttp2Session {
    const existing = this.sessions.get(host);
    if (existing && !existing.closed && !existing.destroyed) return existing;
    const session = connect(`https://${host}`);
    session.on('error', (err) => {
      this.logger.warn({ host, err }, 'APNs connection error');
      if (this.sessions.get(host) === session) this.sessions.delete(host);
    });
    session.on('close', () => {
      if (this.sessions.get(host) === session) this.sessions.delete(host);
    });
    this.sessions.set(host, session);
    return session;
  }
}

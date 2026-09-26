import { Injectable, OnModuleInit } from '@nestjs/common';
import { V1PushPlatform } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { FcmAccessTokenProvider } from './fcm-access-token-provider';
import { NativePushAdapter, NativeDeliverySummary, NativePushPayload, PushTarget } from './native-push.types';
import { PushDeviceService } from './push-device.service';
import { resolvePushEnvironment } from './push-environment';

const PERMANENT_TOKEN_ERRORS = new Set(['UNREGISTERED', 'SENDER_ID_MISMATCH']);
const FCM_HTTP_CONCURRENCY = 50;

type DeliveryOutcome = 'delivered' | 'permanent' | 'transient';

@Injectable()
export class FcmPushService implements NativePushAdapter, OnModuleInit {
  readonly platform = V1PushPlatform.android;
  private projectId: string | null = null;
  private accessTokens: FcmAccessTokenProvider | null = null;

  constructor(
    private readonly pushDevices: PushDeviceService,
    @InjectPinoLogger(FcmPushService.name) private readonly logger: PinoLogger,
  ) {}

  get isConfigured(): boolean {
    return this.projectId !== null && this.accessTokens !== null;
  }

  onModuleInit(): void {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    const credentialCount = [projectId, clientEmail, privateKey].filter(Boolean).length;
    if (credentialCount === 0) {
      this.logger.warn('FCM HTTP credentials not configured — Android push disabled');
      return;
    }
    if (credentialCount !== 3) throw new Error('FCM HTTP credentials are partially configured');

    const environment = resolvePushEnvironment();
    if (!clientEmail!.endsWith('@' + projectId + '.iam.gserviceaccount.com')) {
      throw new Error('FCM service-account email does not belong to FIREBASE_PROJECT_ID');
    }
    const alphaProject = /(^|-)alpha($|-)/.test(projectId!);
    if ((environment === 'alpha' && !alphaProject)
      || (environment === 'production' && alphaProject)) {
      throw new Error('FCM project does not match V1_PUSH_ENVIRONMENT');
    }
    this.projectId = projectId!;
    this.accessTokens = new FcmAccessTokenProvider(privateKey!, clientEmail!);
  }

  async send(devices: PushTarget[], payload: NativePushPayload): Promise<NativeDeliverySummary> {
    if (!this.isConfigured) return { devices: 0, delivered: 0, failed: 0, disabled: true };
    if (devices.length === 0) return { devices: 0, delivered: 0, failed: 0, disabled: false };

    const successfulIds: string[] = [];
    const permanentFailureIds: string[] = [];
    const transientFailureIds: string[] = [];
    for (let offset = 0; offset < devices.length; offset += FCM_HTTP_CONCURRENCY) {
      const group = devices.slice(offset, offset + FCM_HTTP_CONCURRENCY);
      const outcomes = await Promise.all(group.map((device) => this.deliver(device, payload)));
      outcomes.forEach((outcome, index) => {
        const id = group[index]!.id;
        if (outcome === 'delivered') successfulIds.push(id);
        else if (outcome === 'permanent') permanentFailureIds.push(id);
        else transientFailureIds.push(id);
      });
    }

    await Promise.all([
      this.pushDevices.recordSuccessfulDeliveries(successfulIds),
      this.pushDevices.revokeTokens(permanentFailureIds),
      this.pushDevices.recordTransientFailures(transientFailureIds),
    ]).catch((error: unknown) => {
      this.logger.error({
        permanentFailureCount: permanentFailureIds.length,
        transientFailureCount: transientFailureIds.length,
        err: error,
      }, 'FCM device failure state update failed');
    });

    const failed = permanentFailureIds.length + transientFailureIds.length;
    if (failed > 0) {
      this.logger.warn({ deviceCount: devices.length, failureCount: failed },
        'Android FCM HTTP delivery partially failed');
    }
    return { devices: devices.length, delivered: successfulIds.length, failed, disabled: false };
  }

  private async deliver(
    device: PushTarget,
    payload: NativePushPayload,
    authorizationRetry = false,
  ): Promise<DeliveryOutcome> {
    try {
      const accessToken = await this.accessTokens!.current();
      const endpoint = 'https://fcm.googleapis.com/v1/projects/'
        + encodeURIComponent(this.projectId!) + '/messages:send';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { authorization: 'Bearer ' + accessToken, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: device.token,
            notification: { title: payload.title, body: payload.body ?? '' },
            data: {
              notificationId: payload.notificationId,
              route: payload.route ?? '/notifications',
            },
            android: {
              priority: 'high',
              notification: {
                channel_id: 'teameet_general',
                tag: payload.notificationId,
              },
            },
          },
        }),
      });
      if (response.ok) return 'delivered';
      if (response.status === 401 && !authorizationRetry) {
        this.accessTokens!.invalidate(accessToken);
        return this.deliver(device, payload, true);
      }
      const errorCode = await this.errorCode(response);
      if (PERMANENT_TOKEN_ERRORS.has(errorCode)) return 'permanent';
      this.logger.warn({ deviceId: device.id, status: response.status, errorCode },
        'FCM HTTP request was rejected');
      return 'transient';
    } catch (error) {
      this.logger.warn({ deviceId: device.id, err: error }, 'FCM HTTP request failed');
      return 'transient';
    }
  }

  private async errorCode(response: Response): Promise<string> {
    try {
      const body = await response.json() as {
        error?: { status?: unknown; details?: Array<{ errorCode?: unknown }> };
      };
      const detail = body.error?.details?.find((item) => typeof item.errorCode === 'string');
      if (typeof detail?.errorCode === 'string') return detail.errorCode;
      return typeof body.error?.status === 'string' ? body.error.status : '';
    } catch {
      return '';
    }
  }
}

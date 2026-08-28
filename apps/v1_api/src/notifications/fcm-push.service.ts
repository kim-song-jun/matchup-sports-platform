import { Injectable, OnModuleInit } from '@nestjs/common';
import { App, cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { Messaging, getMessaging } from 'firebase-admin/messaging';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PushDeviceService } from './push-device.service';
import { resolvePushEnvironment } from './push-environment';

interface FcmPushPayload {
  notificationId: string;
  title: string;
  body?: string;
  route?: string;
}

export interface FcmDeliverySummary {
  devices: number;
  delivered: number;
  failed: number;
  disabled: boolean;
}

const PERMANENT_TOKEN_ERRORS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

@Injectable()
export class FcmPushService implements OnModuleInit {
  private messaging: Messaging | null = null;
  private environment: ReturnType<typeof resolvePushEnvironment> | null = null;

  constructor(
    private readonly pushDevices: PushDeviceService,
    @InjectPinoLogger(FcmPushService.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    const credentialCount = [projectId, clientEmail, privateKey].filter(Boolean).length;

    if (credentialCount === 0) {
      this.logger.warn('Firebase Admin credentials not configured — Android FCM disabled');
      return;
    }
    if (credentialCount !== 3) {
      throw new Error('Firebase Admin credentials are partially configured');
    }

    this.environment = resolvePushEnvironment();
    const appName = `teameet-v1-fcm-${this.environment}`;
    const existing = getApps().some((app) => app.name === appName);
    const app: App = existing
      ? getApp(appName)
      : initializeApp(
          {
            credential: cert({
              projectId: projectId!,
              clientEmail: clientEmail!,
              privateKey: privateKey!.replace(/\\n/g, '\n'),
            }),
          },
          appName,
        );
    this.messaging = getMessaging(app);
  }

  async sendToUser(userId: string, payload: FcmPushPayload): Promise<FcmDeliverySummary> {
    if (!this.messaging || !this.environment) {
      return { devices: 0, delivered: 0, failed: 0, disabled: true };
    }

    const devices = await this.pushDevices.activeAndroidTokens(userId, this.environment);
    if (devices.length === 0) {
      return { devices: 0, delivered: 0, failed: 0, disabled: false };
    }

    const result = await this.messaging.sendEachForMulticast({
      tokens: devices.map((device) => device.token),
      notification: { title: payload.title, body: payload.body },
      data: {
        notificationId: payload.notificationId,
        route: payload.route ?? '/notifications',
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'teameet_general',
          tag: payload.notificationId,
        },
      },
    });

    const permanentFailureIds: string[] = [];
    const transientFailureIds: string[] = [];
    result.responses.forEach((response, index) => {
      if (response.success) return;
      const deviceId = devices[index]?.id;
      if (!deviceId) return;
      if (PERMANENT_TOKEN_ERRORS.has(response.error?.code ?? '')) permanentFailureIds.push(deviceId);
      else transientFailureIds.push(deviceId);
    });

    await Promise.all([
      this.pushDevices.revokeTokens(permanentFailureIds),
      this.pushDevices.recordTransientFailures(transientFailureIds),
    ]).catch((error: unknown) => {
      this.logger.error(
        {
          userId,
          permanentFailureCount: permanentFailureIds.length,
          transientFailureCount: transientFailureIds.length,
          err: error,
        },
        'FCM device failure state update failed',
      );
    });

    if (result.failureCount > 0) {
      this.logger.warn(
        { userId, deviceCount: devices.length, failureCount: result.failureCount },
        'Android FCM delivery partially failed',
      );
    }

    return {
      devices: devices.length,
      delivered: result.successCount,
      failed: result.failureCount,
      disabled: false,
    };
  }
}

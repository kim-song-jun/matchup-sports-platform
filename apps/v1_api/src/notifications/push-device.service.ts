import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, V1ApnsEnvironment, V1PushEnvironment, V1PushPlatform } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterPushDeviceDto } from './dto/push-device.dto';
import { resolvePushEnvironment } from './push-environment';

const pushDevicePublicSelect = {
  id: true,
  installationId: true,
  platform: true,
  environment: true,
  appVersion: true,
  deviceModel: true,
  lastSeenAt: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.V1PushDeviceSelect;

/**
 * The gateway to record for a registration.
 *
 * Null for Android whatever the client sent: Firebase has one endpoint, and storing a value
 * there would suggest a choice exists. Null too when an iOS client did not report one, which
 * is how a build older than this field keeps its previous behaviour.
 */
function apnsEnvironmentFor(dto: RegisterPushDeviceDto): V1ApnsEnvironment | null {
  if (dto.platform !== V1PushPlatform.ios) return null;
  return dto.apnsEnvironment ?? null;
}

@Injectable()
export class PushDeviceService {
  constructor(private readonly prisma: PrismaService) {}

  async register(userId: string, dto: RegisterPushDeviceDto) {
    const environment = resolvePushEnvironment();

    try {
      return await this.prisma.v1PushDevice.upsert({
        where: {
          environment_installationId: {
            environment,
            installationId: dto.installationId,
          },
        },
        create: {
          userId,
          installationId: dto.installationId,
          platform: dto.platform,
          environment,
          apnsEnvironment: apnsEnvironmentFor(dto),
          token: dto.token,
          appVersion: dto.appVersion,
          deviceModel: dto.deviceModel,
        },
        update: {
          userId,
          // A reinstall can change the platform behind a stored installation id — a device
          // restored from an Android backup onto a new phone keeps the id. Trusting the
          // registration over the stored row keeps the send path addressing the real device.
          platform: dto.platform,
          // Re-read on every registration for the same reason as the platform above: a build
          // can be replaced by one signed differently behind the same installation id — a
          // tester moving from an Xcode build to TestFlight does exactly that — and a stale
          // value here sends a live token to the wrong gateway, where Apple's BadDeviceToken
          // gets it revoked.
          apnsEnvironment: apnsEnvironmentFor(dto),
          token: dto.token,
          appVersion: dto.appVersion,
          deviceModel: dto.deviceModel,
          lastSeenAt: new Date(),
          revokedAt: null,
          failureCount: 0,
          lastFailureAt: null,
        },
        select: pushDevicePublicSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'PUSH_TOKEN_ALREADY_REGISTERED',
          message: '이미 다른 앱 설치에 등록된 푸시 토큰이에요.',
        });
      }
      throw error;
    }
  }

  /**
   * Revokes one installation, whatever platform it registered as.
   *
   * The platform filter is gone deliberately: the caller identifies the device by
   * installation id, and a filter that disagreed with the stored row would leave a device
   * the user asked to unsubscribe still receiving notifications.
   */
  async revoke(userId: string, installationId: string): Promise<void> {
    const environment = resolvePushEnvironment();
    await this.prisma.v1PushDevice.updateMany({
      where: { userId, environment, installationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Every device that should receive a notification, with the platform that decides which
   * service delivers it. The dispatcher groups on that field.
   */
  activeTokens(userId: string, environment: V1PushEnvironment) {
    return this.prisma.v1PushDevice.findMany({
      where: { userId, environment, revokedAt: null },
      select: { id: true, token: true, platform: true, apnsEnvironment: true },
    });
  }

  async revokeTokens(deviceIds: string[]): Promise<void> {
    if (deviceIds.length === 0) return;
    await this.prisma.v1PushDevice.updateMany({
      where: { id: { in: deviceIds } },
      data: { revokedAt: new Date(), lastFailureAt: new Date(), failureCount: { increment: 1 } },
    });
  }

  /**
   * Records the gateway a device's token actually answered at.
   *
   * Written only after a delivery succeeded there, so it replaces what the app *said* with
   * what the send *proved*. Registration still re-reads the app's value on every launch, so
   * a build that keeps reporting the wrong gateway will keep overwriting this — it pays one
   * extra request per notification until that build is replaced, and still delivers. The
   * value earns its keep in between: a notification arriving while the app is closed uses
   * the corrected gateway on the first try.
   */
  async correctApnsEnvironment(deviceIds: string[], environment: V1ApnsEnvironment): Promise<void> {
    if (deviceIds.length === 0) return;
    await this.prisma.v1PushDevice.updateMany({
      where: { id: { in: deviceIds } },
      data: { apnsEnvironment: environment },
    });
  }

  async recordSuccessfulDeliveries(deviceIds: string[]): Promise<void> {
    if (deviceIds.length === 0) return;
    await this.prisma.v1PushDevice.updateMany({
      where: { id: { in: deviceIds } },
      data: { lastSuccessAt: new Date() },
    });
  }

  async recordTransientFailures(deviceIds: string[]): Promise<void> {
    if (deviceIds.length === 0) return;
    await this.prisma.v1PushDevice.updateMany({
      where: { id: { in: deviceIds } },
      data: { lastFailureAt: new Date(), failureCount: { increment: 1 } },
    });
  }
}

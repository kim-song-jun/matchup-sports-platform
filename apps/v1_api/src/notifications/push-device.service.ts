import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, V1PushEnvironment, V1PushPlatform } from '@prisma/client';
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
      select: { id: true, token: true, platform: true },
    });
  }

  async revokeTokens(deviceIds: string[]): Promise<void> {
    if (deviceIds.length === 0) return;
    await this.prisma.v1PushDevice.updateMany({
      where: { id: { in: deviceIds } },
      data: { revokedAt: new Date(), lastFailureAt: new Date(), failureCount: { increment: 1 } },
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

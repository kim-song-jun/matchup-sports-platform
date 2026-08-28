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

  async registerAndroid(userId: string, dto: RegisterPushDeviceDto) {
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
          platform: V1PushPlatform.android,
          environment,
          token: dto.token,
          appVersion: dto.appVersion,
          deviceModel: dto.deviceModel,
        },
        update: {
          userId,
          platform: V1PushPlatform.android,
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

  async revokeAndroid(userId: string, installationId: string): Promise<void> {
    const environment = resolvePushEnvironment();
    await this.prisma.v1PushDevice.updateMany({
      where: {
        userId,
        environment,
        platform: V1PushPlatform.android,
        installationId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  activeAndroidTokens(userId: string, environment: V1PushEnvironment) {
    return this.prisma.v1PushDevice.findMany({
      where: {
        userId,
        environment,
        platform: V1PushPlatform.android,
        revokedAt: null,
      },
      select: { id: true, token: true },
    });
  }

  async revokeTokens(deviceIds: string[]): Promise<void> {
    if (deviceIds.length === 0) return;
    await this.prisma.v1PushDevice.updateMany({
      where: { id: { in: deviceIds } },
      data: { revokedAt: new Date(), lastFailureAt: new Date(), failureCount: { increment: 1 } },
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

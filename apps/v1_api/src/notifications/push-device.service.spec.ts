import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PUSH_ENVIRONMENT_VARIABLE } from './push-environment';
import { PushDeviceService } from './push-device.service';

function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.2',
    meta: { target: ['token'] },
  });
}

describe('PushDeviceService', () => {
  const prisma = {
    v1PushDevice: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
  };
  let service: PushDeviceService;
  let previousEnvironment: string | undefined;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PushDeviceService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(PushDeviceService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    previousEnvironment = process.env[PUSH_ENVIRONMENT_VARIABLE];
    process.env[PUSH_ENVIRONMENT_VARIABLE] = 'alpha';
  });

  afterEach(() => {
    if (previousEnvironment === undefined) delete process.env[PUSH_ENVIRONMENT_VARIABLE];
    else process.env[PUSH_ENVIRONMENT_VARIABLE] = previousEnvironment;
  });

  it('derives alpha from the server and never returns the token', async () => {
    const publicDevice = {
      id: 'device-row-1',
      installationId: '0e65978c-3a58-42e5-a371-cf6d6239699a',
      platform: 'android',
      environment: 'alpha',
      appVersion: '1.0.0',
      deviceModel: null,
      lastSeenAt: new Date(),
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.v1PushDevice.upsert.mockResolvedValue(publicDevice);

    const result = await service.registerAndroid('user-1', {
      installationId: publicDevice.installationId,
      token: 'fcm-registration-token-with-safe-length',
      appVersion: '1.0.0',
    });

    expect(result).toEqual(publicDevice);
    expect(result).not.toHaveProperty('token');
    expect(prisma.v1PushDevice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          environment_installationId: {
            environment: 'alpha',
            installationId: publicDevice.installationId,
          },
        },
        create: expect.objectContaining({ userId: 'user-1', environment: 'alpha', platform: 'android' }),
        select: expect.not.objectContaining({ token: true }),
      }),
    );
  });

  it('fails closed when the server environment is not configured', async () => {
    delete process.env[PUSH_ENVIRONMENT_VARIABLE];
    await expect(
      service.registerAndroid('user-1', {
        installationId: '0e65978c-3a58-42e5-a371-cf6d6239699a',
        token: 'fcm-registration-token-with-safe-length',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.v1PushDevice.upsert).not.toHaveBeenCalled();
  });

  it('does not transfer a token already owned by another installation', async () => {
    prisma.v1PushDevice.upsert.mockRejectedValue(uniqueConstraintError());
    await expect(
      service.registerAndroid('user-1', {
        installationId: '0e65978c-3a58-42e5-a371-cf6d6239699a',
        token: 'fcm-registration-token-with-safe-length',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('revokes only the current user installation in the server environment', async () => {
    prisma.v1PushDevice.updateMany.mockResolvedValue({ count: 1 });
    await service.revokeAndroid('user-1', '0e65978c-3a58-42e5-a371-cf6d6239699a');
    expect(prisma.v1PushDevice.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        environment: 'alpha',
        platform: 'android',
        installationId: '0e65978c-3a58-42e5-a371-cf6d6239699a',
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

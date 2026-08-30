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

    const result = await service.register('user-1', {
      installationId: publicDevice.installationId,
      token: 'fcm-registration-token-with-safe-length',
      platform: 'android',
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
      service.register('user-1', {
        installationId: '0e65978c-3a58-42e5-a371-cf6d6239699a',
        token: 'fcm-registration-token-with-safe-length',
        platform: 'android',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.v1PushDevice.upsert).not.toHaveBeenCalled();
  });

  it('does not transfer a token already owned by another installation', async () => {
    prisma.v1PushDevice.upsert.mockRejectedValue(uniqueConstraintError());
    await expect(
      service.register('user-1', {
        installationId: '0e65978c-3a58-42e5-a371-cf6d6239699a',
        token: 'fcm-registration-token-with-safe-length',
        platform: 'android',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('revokes only the current user installation in the server environment', async () => {
    prisma.v1PushDevice.updateMany.mockResolvedValue({ count: 1 });
    await service.revoke('user-1', '0e65978c-3a58-42e5-a371-cf6d6239699a');
    // No platform filter: the caller identifies the device by installation id, and a filter
    // that disagreed with the stored row would leave a device the user unsubscribed still
    // receiving notifications.
    expect(prisma.v1PushDevice.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        environment: 'alpha',
        installationId: '0e65978c-3a58-42e5-a371-cf6d6239699a',
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

/**
 * The registration now carries its own platform, and the send path now depends on that
 * field being right — an APNs token routed to Firebase does not error, it silently stops
 * delivering. These pin both halves.
 */
describe('PushDeviceService platform routing inputs', () => {
  const prisma = { v1PushDevice: { upsert: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() } };
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

  it('stores the platform the client declared rather than assuming android', async () => {
    prisma.v1PushDevice.upsert.mockResolvedValue({ id: 'device-row-1' });
    await service.register('user-1', {
      installationId: '0e65978c-3a58-42e5-a371-cf6d6239699a',
      token: 'apns-device-token-64-hex-characters-long-enough-for-the-dto',
      platform: 'ios',
    });
    expect(prisma.v1PushDevice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ platform: 'ios' }),
        update: expect.objectContaining({ platform: 'ios' }),
      }),
    );
  });

  it('returns every platform with the token so the dispatcher can route', async () => {
    prisma.v1PushDevice.findMany.mockResolvedValue([]);
    await service.activeTokens('user-1', 'alpha');
    expect(prisma.v1PushDevice.findMany).toHaveBeenCalledWith({
      // Deliberately unfiltered by platform. Filtering here would hide a registered device
      // whose platform has no adapter, turning a routing gap into a silent zero.
      where: { userId: 'user-1', environment: 'alpha', revokedAt: null },
      select: { id: true, token: true, platform: true },
    });
  });
});

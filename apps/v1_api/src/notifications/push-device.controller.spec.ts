import { Test } from '@nestjs/testing';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { PushDeviceController } from './push-device.controller';
import { PushDeviceService } from './push-device.service';

const user = {
  id: 'user-1',
  email: 'member@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

describe('PushDeviceController', () => {
  const pushDeviceService = {
    registerAndroid: jest.fn(),
    revokeAndroid: jest.fn(),
  };
  let controller: PushDeviceController;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PushDeviceController],
      providers: [
        { provide: PushDeviceService, useValue: pushDeviceService },
        { provide: PrismaService, useValue: {} },
        { provide: V1AuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();
    controller = moduleRef.get(PushDeviceController);
  });

  beforeEach(() => jest.clearAllMocks());

  it('registers for the authenticated user only', async () => {
    const dto = {
      installationId: '0e65978c-3a58-42e5-a371-cf6d6239699a',
      token: 'fcm-registration-token-with-safe-length',
    };
    await controller.register(user, dto);
    expect(pushDeviceService.registerAndroid).toHaveBeenCalledWith(user.id, dto);
  });

  it('revokes for the authenticated user only', async () => {
    const installationId = '0e65978c-3a58-42e5-a371-cf6d6239699a';
    await controller.revoke(user, installationId);
    expect(pushDeviceService.revokeAndroid).toHaveBeenCalledWith(user.id, installationId);
  });
});

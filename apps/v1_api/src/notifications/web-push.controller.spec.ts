import { Test } from '@nestjs/testing';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { WebPushController } from './web-push.controller';
import { WebPushService } from './web-push.service';

const user = {
  id: 'user-1',
  email: 'applicant@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

describe('WebPushController', () => {
  const webPushService = {
    getPublicKey: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    sendToUser: jest.fn(),
  };

  let controller: WebPushController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [WebPushController],
      providers: [
        { provide: WebPushService, useValue: webPushService },
        { provide: PrismaService, useValue: {} },
        { provide: V1AuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();
    controller = moduleRef.get(WebPushController);
  });

  it('vapid-public-key returns the service public key', () => {
    webPushService.getPublicKey.mockReturnValue('pub-key');

    expect(controller.vapidPublicKey()).toEqual({ publicKey: 'pub-key' });
  });

  it('push-subscribe delegates to WebPushService.subscribe with the current user', async () => {
    const dto = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };

    await controller.pushSubscribe(user, dto as never);

    expect(webPushService.subscribe).toHaveBeenCalledWith(user.id, dto);
  });

  it('push-unsubscribe delegates to WebPushService.unsubscribe', async () => {
    await controller.pushUnsubscribe(user, { endpoint: 'https://push.example/abc' } as never);

    expect(webPushService.unsubscribe).toHaveBeenCalledWith(user.id, 'https://push.example/abc');
  });
});

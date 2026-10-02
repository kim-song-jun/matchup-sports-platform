import { Test } from '@nestjs/testing';
import { getLoggerToken } from 'nestjs-pino';
import { ApnsPushService } from './apns-push.service';
import { PushDeviceService } from './push-device.service';

/**
 * That the container can actually build this service.
 *
 * Nest resolves constructor arguments from their declared *types*, never from TypeScript
 * default values, so a parameter with a default but no `@Optional()` sends the container
 * looking for a provider of type `Function`. It finds none and refuses to build the module.
 *
 * The damage is nowhere near push: the app graph fails to construct, so every integration
 * suite dies at `createV1IntegrationApp` with a dependency-resolution message. The unit
 * specs never notice, because they construct the service with `new`.
 */
describe('ApnsPushService dependency injection', () => {
  it('resolves without a provider for the injected clock', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ApnsPushService,
        { provide: PushDeviceService, useValue: {} },
        {
          provide: getLoggerToken(ApnsPushService.name),
          useValue: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
        },
      ],
    }).compile();

    expect(moduleRef.get(ApnsPushService)).toBeInstanceOf(ApnsPushService);
  });
});

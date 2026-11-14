import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { OmitErrorLogBodyMiddleware } from '../common/logging/omit-error-log-body';
import { AuthModule } from './auth.module';
import { KakaoWebhookController } from './kakao-webhook.controller';
import { KakaoWebhookService } from './kakao-webhook.service';

describe('KakaoWebhookController', () => {
  const prototype = KakaoWebhookController.prototype as unknown as Record<string, unknown>;
  const routes = Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => ({
      name,
      method: Reflect.getMetadata(METHOD_METADATA, prototype[name] as object) as RequestMethod | undefined,
      path: Reflect.getMetadata(PATH_METADATA, prototype[name] as object) as string | undefined,
      status: Reflect.getMetadata(HTTP_CODE_METADATA, prototype[name] as object) as number | undefined,
    }));

  it('is mounted outside /auth, so the proxy\'s per-IP /auth limit does not apply to Kakao\'s servers', () => {
    expect(Reflect.getMetadata(PATH_METADATA, KakaoWebhookController)).toBe('webhooks/kakao');
  });

  it('serves POST /unlink only and answers 200 (Nest\'s POST default is 201); there is no GET route', () => {
    expect(routes).toEqual([{ name: 'unlink', method: RequestMethod.POST, path: 'unlink', status: 200 }]);
  });

  it('hands the Authorization header and the parsed form body to the service', async () => {
    const receiveUnlink = jest.fn().mockResolvedValue(undefined);
    const controller = new KakaoWebhookController({ receiveUnlink } as never);
    const body = { app_id: '1', user_id: '2', referrer_type: 'UNLINK_FROM_APPS' };

    await expect(controller.unlink({ headers: { authorization: 'KakaoAK key' }, body })).resolves.toBeUndefined();

    expect(receiveUnlink).toHaveBeenCalledWith('KakaoAK key', body);
  });

  it('passes a missing header through as undefined so the service answers 401', async () => {
    const receiveUnlink = jest.fn().mockResolvedValue(undefined);
    const controller = new KakaoWebhookController({ receiveUnlink } as never);

    await controller.unlink({ headers: {}, body: {} });

    expect(receiveUnlink).toHaveBeenCalledWith(undefined, {});
  });
});

describe('AuthModule', () => {
  it('keeps the request body out of the error log for POST /webhooks/kakao/unlink only', () => {
    const forRoutes = jest.fn();
    const apply = jest.fn(() => ({ forRoutes }));

    new AuthModule().configure({ apply } as never);

    expect(apply).toHaveBeenCalledWith(OmitErrorLogBodyMiddleware);
    expect(forRoutes).toHaveBeenCalledTimes(1);
    expect(forRoutes).toHaveBeenCalledWith({ path: 'webhooks/kakao/unlink', method: RequestMethod.POST });
  });

  it('registers the webhook controller and service', () => {
    expect(Reflect.getMetadata('controllers', AuthModule)).toContain(KakaoWebhookController);
    expect(Reflect.getMetadata('providers', AuthModule)).toContain(KakaoWebhookService);
  });
});

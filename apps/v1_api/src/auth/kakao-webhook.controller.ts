import { Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { KakaoWebhookService } from './kakao-webhook.service';

/**
 * Kakao calls this from its own servers, so it sits outside `/auth` (nginx caps that prefix per IP at a rate a burst of
 * notifications would exceed) and carries no session guard: the service checks the `KakaoAK <admin key>` header.
 *
 * Register it in the Kakao console as POST only. A GET carries the member number in the URL, which the proxy's
 * access log would keep, so there is no GET route.
 */
@Controller('webhooks/kakao')
export class KakaoWebhookController {
  constructor(private readonly kakaoWebhook: KakaoWebhookService) {}

  /** The raw form body is read instead of a DTO; see `readNotice` in the service. */
  @Post('unlink')
  @HttpCode(200)
  async unlink(@Req() request: Pick<Request, 'headers' | 'body'>): Promise<void> {
    await this.kakaoWebhook.receiveUnlink(request.headers.authorization, request.body);
  }
}

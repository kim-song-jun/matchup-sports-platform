import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { PushSubscribeDto, PushUnsubscribeDto } from './dto/push-subscribe.dto';
import { WebPushService } from './web-push.service';

/**
 * Separate, unguarded-by-default controller: `vapid-public-key` must be
 * publicly readable (the browser needs it before the user is authenticated
 * with an established session), and there is no `@Public()`-style bypass
 * decorator anywhere under apps/v1_api/src/auth/ to layer onto a
 * class-level `@UseGuards(V1AuthGuard)` controller (confirmed by reading
 * NotificationsController + the auth/ directory) — so the public route
 * lives on its own controller and only the two mutating routes opt into
 * V1AuthGuard per-method.
 */
@Controller()
export class WebPushController {
  constructor(private readonly webPushService: WebPushService) {}

  @Get('notifications/vapid-public-key')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  vapidPublicKey() {
    return { publicKey: this.webPushService.getPublicKey() };
  }

  @Post('notifications/push-subscribe')
  @UseGuards(V1AuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  pushSubscribe(@CurrentUser() user: V1AuthUser, @Body() dto: PushSubscribeDto) {
    return this.webPushService.subscribe(user.id, dto);
  }

  @Delete('notifications/push-unsubscribe')
  @UseGuards(V1AuthGuard)
  @HttpCode(204)
  pushUnsubscribe(@CurrentUser() user: V1AuthUser, @Body() dto: PushUnsubscribeDto) {
    return this.webPushService.unsubscribe(user.id, dto.endpoint);
  }
}

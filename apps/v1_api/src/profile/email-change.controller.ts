import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { readCurrentV1SessionAgeSeconds } from '../auth/v1-session';
import { EmailChangeRequestDto, EmailChangeVerifyDto } from './dto/email-change.dto';
import { EmailChangeService } from './email-change.service';

/**
 * Proof of the new address for `PATCH /me/profile`: mail a code, check it, receive an `emailChangeToken`. The profile
 * save refuses an email change without that token.
 */
@Controller('me/email-change')
@UseGuards(V1AuthGuard)
export class EmailChangeController {
  constructor(private readonly emailChange: EmailChangeService) {}

  // Sends mail, so it is as narrow as the email-login request; the per-address and per-account send quota is in the service.
  // A password account's session older than 30 minutes is refused here.
  @Post('request')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  request(@CurrentUser() user: V1AuthUser, @Body() dto: EmailChangeRequestDto, @Req() request: Pick<Request, 'headers'>) {
    return this.emailChange.requestCode(user, dto, readCurrentV1SessionAgeSeconds(request.headers.cookie));
  }

  // The 6-digit code is guessable, so the code itself caps attempts per token (5) on top of this limit.
  @Post('verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verify(@CurrentUser() user: V1AuthUser, @Body() dto: EmailChangeVerifyDto) {
    return this.emailChange.verifyCode(user.id, dto);
  }
}

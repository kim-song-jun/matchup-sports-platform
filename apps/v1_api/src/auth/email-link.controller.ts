import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from './current-user.decorator';
import { LinkEmailCompleteDto, LinkEmailRequestDto, LinkEmailVerifyDto } from './dto/link-email.dto';
import { EmailLinkService } from './email-link.service';
import type { V1AuthUser } from './v1-auth-user';
import { V1AuthGuard } from './v1-auth.guard';
import { readCurrentV1SessionAgeSeconds } from './v1-session';

/**
 * Adds an email + password login to the signed-in account: mail a code, check it, set the password. The session
 * proves the account and the mailed code proves the address; a phone number proves neither.
 */
@Controller('auth/link/email')
@UseGuards(V1AuthGuard)
export class EmailLinkController {
  constructor(private readonly emailLink: EmailLinkService) {}

  // Sends mail, so it is as narrow as the recovery mail route; the per-address and per-account send quota is in the service.
  // A session older than 30 minutes is refused here.
  @Post('request')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  request(@CurrentUser() user: V1AuthUser, @Body() dto: LinkEmailRequestDto, @Req() request: Pick<Request, 'headers'>) {
    return this.emailLink.requestCode(user.id, dto, readCurrentV1SessionAgeSeconds(request.headers.cookie));
  }

  // The 6-digit code is guessable, so the code itself caps attempts per token (5) on top of this limit.
  @Post('verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verify(@CurrentUser() user: V1AuthUser, @Body() dto: LinkEmailVerifyDto) {
    return this.emailLink.verifyCode(user.id, dto);
  }

  @Post('complete')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  complete(@CurrentUser() user: V1AuthUser, @Body() dto: LinkEmailCompleteDto) {
    return this.emailLink.complete(user.id, dto);
  }
}

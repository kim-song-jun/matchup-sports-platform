import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from './current-user.decorator';
import { UnlinkLoginMethodDto } from './dto/unlink-login-method.dto';
import { LoginMethodService } from './login-method.service';
import type { V1AuthUser } from './v1-auth-user';
import { V1AuthGuard } from './v1-auth.guard';
import { readCurrentV1SessionProof, reissueV1SessionCookie } from './v1-session';
import type { V1SessionCookieResponse } from './v1-session';

/**
 * Both routes bump the account's `sessionEpoch`, which signs every other device out; the response re-signs this
 * device's cookie with the new epoch (keeping its issue time) so the caller stays signed in.
 */
@Controller('auth')
@UseGuards(V1AuthGuard)
export class LoginMethodController {
  constructor(private readonly loginMethods: LoginMethodService) {}

  /** Removes a login method. A session older than 30 minutes is refused; the last remaining method cannot be removed. */
  @Post('identities/unlink')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async unlink(
    @CurrentUser() user: V1AuthUser,
    @Body() dto: UnlinkLoginMethodDto,
    @Req() request: Pick<Request, 'headers'>,
    @Res({ passthrough: true }) response: Pick<V1SessionCookieResponse, 'cookie'>,
  ) {
    const { sessionEpoch, ...result } = await this.loginMethods.unlink(
      user.id,
      dto.provider,
      readCurrentV1SessionProof(request.headers.cookie),
    );
    reissueV1SessionCookie(response, request.headers.cookie, sessionEpoch);
    return result;
  }

  /** Signs out every other device. Needs no recent sign-in: it only narrows who can act as the account. */
  @Post('sessions/revoke-others')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async revokeOthers(
    @CurrentUser() user: V1AuthUser,
    @Req() request: Pick<Request, 'headers'>,
    @Res({ passthrough: true }) response: Pick<V1SessionCookieResponse, 'cookie'>,
  ) {
    const { sessionEpoch } = await this.loginMethods.revokeOtherSessions(user.id, readCurrentV1SessionProof(request.headers.cookie));
    reissueV1SessionCookie(response, request.headers.cookie, sessionEpoch);
    return { revoked: true as const };
  }
}

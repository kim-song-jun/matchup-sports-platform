import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from './current-user.decorator';
import { AccountLinkService } from './account-link.service';
import { AuthService } from './auth.service';
import { AppleLoginDto } from './dto/apple-login.dto';
import { AppleIdentityService } from './apple-identity.service';
import { CheckEmailQueryDto, CheckNicknameQueryDto } from './dto/check-availability.dto';
import { KakaoLoginDto, KakaoTokenLoginDto } from './dto/kakao-login.dto';
import { LoginDto } from './dto/login.dto';
import { LoginStepUpResendDto, LoginStepUpVerifyDto } from './dto/login-step-up.dto';
import { RegisterDto } from './dto/register.dto';
import { LinkKakaoDto } from './dto/link-kakao.dto';
import { SocialProfileDto, SocialTermsDto } from './dto/social-profile.dto';
import type { V1AuthUser } from './v1-auth-user';
import { OptionalV1AuthGuard } from './optional-v1-auth.guard';
import { V1AuthGuard } from './v1-auth.guard';
import { NonProductionGuard } from './non-production.guard';
import { V1SessionCookieInterceptor } from './v1-session.interceptor';
import { readCurrentV1SessionAgeSeconds } from './v1-session';

@Controller('auth')
@UseInterceptors(V1SessionCookieInterceptor)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountLink: AccountLinkService,
    private readonly appleIdentity: AppleIdentityService,
  ) {}

  @Get('me')
  @UseGuards(V1AuthGuard)
  me(@CurrentUser() user: V1AuthUser) {
    return this.authService.me(user.id);
  }

  /** A step-up challenge is a 200 (no session, nothing created); a completed login keeps its existing status. */
  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) response: { status(code: number): unknown },
  ) {
    const result = await this.authService.login(dto, { ip });
    if ('stepUp' in result) response.status(HttpStatus.OK);
    return result;
  }

  @Post('login/step-up/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyLoginStepUp(@Body() dto: LoginStepUpVerifyDto, @Ip() ip: string) {
    return this.authService.verifyLoginStepUp(dto, { ip });
  }

  @Post('login/step-up/resend')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resendLoginStepUp(@Body() dto: LoginStepUpResendDto) {
    return this.authService.resendLoginStepUp(dto.challengeToken);
  }

  /**
   * `V1AuthGuard` resolves identity via `resolveV1RequestIdentity()`, which
   * only accepts header-based (passwordless) identity when `NODE_ENV !==
   * 'production'` — in production this route 401s unless the caller already
   * presents a valid signed session cookie, so it grants nothing beyond what
   * the guard already grants callers on every other guarded route. Lets E2E
   * (and other header-authenticated dev/test callers) upgrade their existing
   * trusted identity into the same signed `teameet_v1_session` cookie
   * `login()` issues — most seeded personas have no password, so `login()`
   * itself isn't usable to obtain one.
   */
  @Post('dev-session')
  // A valid cookie in, a fresh seven-day cookie out: in production that would keep a stolen cookie alive forever.
  @UseGuards(NonProductionGuard, V1AuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  devSession(@CurrentUser() user: V1AuthUser) {
    return this.authService.devSession(user.id, user.email);
  }

  @Post('kakao')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  kakaoLogin(@Body() dto: KakaoLoginDto) {
    return this.authService.kakaoLogin(dto);
  }

  @Post('kakao/token')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  kakaoTokenLogin(@Body() dto: KakaoTokenLoginDto) {
    return this.authService.kakaoTokenLogin(dto);
  }

  /**
   * Issues the nonce the Apple sheet must answer. Unauthenticated by design — it is asked for
   * before anyone has signed in — and rate limited because it is a free HMAC otherwise.
   */
  @Post('apple/nonce')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  appleNonce() {
    return this.appleIdentity.issueNonce();
  }

  @Post('apple')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  appleSignIn(@Body() dto: AppleLoginDto) {
    return this.authService.appleSignIn(dto);
  }

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('social-profile')
  @UseGuards(V1AuthGuard)
  completeSocialProfile(@CurrentUser() user: V1AuthUser, @Body() dto: SocialProfileDto) {
    return this.authService.completeSocialProfile(user.id, dto);
  }

  @Post('social-profile/defer')
  @UseGuards(V1AuthGuard)
  deferSocialProfile(@CurrentUser() user: V1AuthUser) {
    return this.authService.deferSocialProfile(user.id);
  }

  /**
   * Attaches a Kakao login to the signed-in account. The session proves the account, the Kakao token proves the
   * identity; a session older than 30 minutes is refused.
   */
  @Post('link/kakao')
  @HttpCode(200)
  @UseGuards(V1AuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  linkKakao(@CurrentUser() user: V1AuthUser, @Body() dto: LinkKakaoDto, @Req() request: Pick<Request, 'headers'>) {
    return this.accountLink.linkKakao(user.id, dto, readCurrentV1SessionAgeSeconds(request.headers.cookie));
  }

  @Post('link/apple')
  @HttpCode(200)
  @UseGuards(V1AuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  linkApple(@CurrentUser() user: V1AuthUser, @Body() dto: AppleLoginDto, @Req() request: Pick<Request, 'headers'>) {
    return this.accountLink.linkApple(user.id, dto, readCurrentV1SessionAgeSeconds(request.headers.cookie));
  }

  @Post('social-terms')
  @UseGuards(V1AuthGuard)
  completeSocialTerms(@CurrentUser() user: V1AuthUser, @Body() dto: SocialTermsDto) {
    return this.authService.completeSocialTerms(user.id, dto);
  }

  @Get('check-email')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  checkEmail(@Query() query: CheckEmailQueryDto) {
    return this.authService.checkEmail(query.email);
  }

  @Get('check-nickname')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseGuards(OptionalV1AuthGuard)
  checkNickname(@Query() query: CheckNicknameQueryDto, @CurrentUser() user?: V1AuthUser) {
    return this.authService.checkNickname(query.nickname, user?.id);
  }
}

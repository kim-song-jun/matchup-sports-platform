import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from './current-user.decorator';
import { AuthService } from './auth.service';
import { KakaoLoginDto } from './dto/kakao-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SocialProfileDto, SocialTermsDto } from './dto/social-profile.dto';
import { V1AuthUser } from './v1-auth-user';
import { V1AuthGuard } from './v1-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(V1AuthGuard)
  me(@CurrentUser() user: V1AuthUser) {
    return this.authService.me(user.id);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('kakao')
  kakaoLogin(@Body() dto: KakaoLoginDto) {
    return this.authService.kakaoLogin(dto);
  }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('social-profile')
  @UseGuards(V1AuthGuard)
  completeSocialProfile(@CurrentUser() user: V1AuthUser, @Body() dto: SocialProfileDto) {
    return this.authService.completeSocialProfile(user.id, dto);
  }

  @Post('social-terms')
  @UseGuards(V1AuthGuard)
  completeSocialTerms(@CurrentUser() user: V1AuthUser, @Body() dto: SocialTermsDto) {
    return this.authService.completeSocialTerms(user.id, dto);
  }

  @Get('check-email')
  checkEmail(@Query('email') email: string) {
    return this.authService.checkEmail(email);
  }

  @Get('check-nickname')
  checkNickname(@Query('nickname') nickname: string) {
    return this.authService.checkNickname(nickname);
  }
}

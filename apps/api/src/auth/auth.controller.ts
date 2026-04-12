import { Controller, Post, Body, Delete, UseGuards, Get, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OAuthLoginDto, RefreshTokenDto, EmailRegisterDto, EmailLoginDto } from './dto/auth.dto';

@ApiTags('인증')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: '이메일 회원가입' })
  async register(@Body() dto: EmailRegisterDto) {
    return this.authService.emailRegister(dto.email, dto.password, dto.nickname);
  }

  @Post('login')
  @ApiOperation({ summary: '이메일 로그인' })
  async login(@Body() dto: EmailLoginDto) {
    return this.authService.emailLogin(dto.email, dto.password);
  }

  @Post('dev-login')
  @ApiOperation({ summary: '개발용 로그인 (닉네임으로 바로 로그인/가입)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { nickname: { type: 'string', example: '테스트유저' } },
    },
  })
  async devLogin(@Body('nickname') nickname: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Dev login is not available in production');
    }
    return this.authService.devLogin(nickname || '테스트유저');
  }

  @Post('kakao')
  @ApiOperation({ summary: '카카오 로그인' })
  async kakaoLogin(@Body() dto: OAuthLoginDto) {
    return this.authService.oauthLogin('kakao', dto.code, dto.redirectUri);
  }

  @Post('naver')
  @ApiOperation({ summary: '네이버 로그인' })
  async naverLogin(@Body() dto: OAuthLoginDto) {
    return this.authService.oauthLogin('naver', dto.code, dto.redirectUri);
  }

  @Post('apple')
  @ApiOperation({ summary: 'Apple Sign-In (not yet available)', deprecated: true })
  async appleLogin(@Body() _dto: OAuthLoginDto) {
    throw new HttpException('Apple Sign-In is not yet available', HttpStatus.NOT_IMPLEMENTED);
  }

  @Post('refresh')
  @ApiOperation({ summary: '토큰 갱신' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '현재 사용자 정보' })
  async getMe(@CurrentUser('id') userId: string) {
    return this.authService.getMe(userId);
  }

  @Delete('withdraw')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '회원 탈퇴' })
  async withdraw(@CurrentUser('id') userId: string) {
    return this.authService.withdraw(userId);
  }
}

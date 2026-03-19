import { Controller, Post, Body, Delete, UseGuards, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OAuthLoginDto, RefreshTokenDto } from './dto/auth.dto';

@ApiTags('인증')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('dev-login')
  @ApiOperation({ summary: '개발용 로그인 (닉네임으로 바로 로그인/가입)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { nickname: { type: 'string', example: '테스트유저' } },
    },
  })
  async devLogin(@Body('nickname') nickname: string) {
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
  @ApiOperation({ summary: '애플 로그인' })
  async appleLogin(@Body() dto: OAuthLoginDto) {
    return this.authService.oauthLogin('apple', dto.code, dto.redirectUri);
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

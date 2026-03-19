import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async oauthLogin(provider: string, code: string, redirectUri?: string) {
    // TODO: 실제 OAuth 검증 및 사용자 정보 조회
    throw new UnauthorizedException(
      `OAuth ${provider} login not yet implemented. Use /api/v1/auth/dev-login for testing.`,
    );
  }

  /**
   * 개발 전용 로그인 — 닉네임으로 바로 로그인/가입
   * 프로덕션에서는 비활성화 해야 함
   */
  async devLogin(nickname: string) {
    // 기존 사용자 찾기
    let user = await this.prisma.user.findFirst({
      where: { nickname, deletedAt: null },
    });

    // 없으면 새로 생성
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          nickname,
          oauthProvider: 'kakao',
          oauthId: `dev_${nickname}_${Date.now()}`,
          sportTypes: ['futsal', 'basketball'],
          mannerScore: 3.5,
          locationCity: '서울',
          locationDistrict: '마포구',
        },
      });

      // 기본 종목 프로필 생성
      await this.prisma.userSportProfile.createMany({
        data: [
          {
            userId: user.id,
            sportType: 'futsal',
            level: 3,
            eloRating: 1200,
            preferredPositions: ['MF', 'FW'],
          },
          {
            userId: user.id,
            sportType: 'basketball',
            level: 2,
            eloRating: 1000,
            preferredPositions: ['SG', 'SF'],
          },
        ],
      });
    }

    const tokens = this.generateTokens(user.id);
    const fullUser = await this.usersService.findById(user.id);

    return {
      ...tokens,
      user: fullUser,
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('jwt.secret'),
      });

      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      return this.generateTokens(user.id);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getMe(userId: string) {
    return this.usersService.findById(userId);
  }

  async withdraw(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });
    return { message: '탈퇴가 완료되었습니다.' };
  }

  generateTokens(userId: string) {
    const payload = { sub: userId };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get('jwt.refreshExpiresIn'),
    });

    return { accessToken, refreshToken };
  }
}

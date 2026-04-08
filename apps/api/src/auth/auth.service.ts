import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

type PasswordHasher = {
  compare(data: string, encrypted: string): Promise<boolean>;
  hash(data: string, saltOrRounds: string | number): Promise<string>;
};

const loadPasswordHasher = (driver: string): PasswordHasher => {
  if (driver !== 'bcryptjs') {
    throw new Error(`Unsupported auth hash driver: ${driver}`);
  }

  return require('bcryptjs') as PasswordHasher;
};

@Injectable()
export class AuthService {
  private readonly adminEmail = 'test2@gmail.com';
  private readonly passwordHasher: PasswordHasher;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const hashDriver = this.configService.get<string>('auth.hashDriver') ?? 'bcryptjs';

    this.passwordHasher = loadPasswordHasher(hashDriver);
  }

  private getRoleForEmail(email?: string | null) {
    return email === this.adminEmail ? 'admin' : 'user';
  }

  private async syncFixedAdminRole(userId: string, email?: string | null) {
    const role = this.getRoleForEmail(email);

    await this.prisma.user.update({
      where: { id: userId },
      data: { role },
    });
  }

  /** 이메일 회원가입 */
  async emailRegister(email: string, password: string, nickname: string) {
    // 이메일 중복 체크
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { nickname }], deletedAt: null },
    });
    if (existing) {
      if (existing.email === email) throw new ConflictException('이미 가입된 이메일이에요');
      throw new ConflictException('이미 사용 중인 닉네임이에요');
    }

    const passwordHash = await this.passwordHasher.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        nickname,
        role: this.getRoleForEmail(email),
        oauthProvider: 'email',
        oauthId: `email_${email}`,
        sportTypes: [],
        mannerScore: 3.0,
      },
    });

    const tokens = this.generateTokens(user.id);
    const fullUser = await this.usersService.findById(user.id);
    return { ...tokens, user: fullUser };
  }

  /** 이메일 로그인 */
  async emailLogin(email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
    if (!user || !user.passwordHash) {
      throw new BadRequestException('이메일 또는 비밀번호가 올바르지 않아요');
    }

    const valid = await this.passwordHasher.compare(password, user.passwordHash);
    if (!valid) {
      throw new BadRequestException('이메일 또는 비밀번호가 올바르지 않아요');
    }

    await this.syncFixedAdminRole(user.id, user.email);
    const tokens = this.generateTokens(user.id);
    const fullUser = await this.usersService.findById(user.id);
    return { ...tokens, user: fullUser };
  }

  async oauthLogin(provider: string, code: string, redirectUri?: string) {
    // TODO: 실제 OAuth 검증 — 카카오/네이버 API 연동 필요
    throw new UnauthorizedException(
      `OAuth ${provider} login not yet implemented. Use /api/v1/auth/dev-login or email login.`,
    );
  }

  /**
   * 개발 전용 로그인 — 닉네임으로 바로 로그인/가입
   * 프로덕션에서는 비활성화 해야 함
   */
  async devLogin(nickname: string) {
    try {
      // 기존 사용자 찾기
      let user = await this.prisma.user.findUnique({
        where: { nickname },
      });

      if (user?.deletedAt) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { deletedAt: null },
        });
      }

      // 없으면 새로 생성
      if (!user) {
        user = await this.prisma.user.create({
          data: {
            nickname,
            role: 'user',
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
    } catch (error) {
      this.logger.error(
        `devLogin failed for ${nickname}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
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

import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
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

/** Normalized social profile returned from each provider */
interface SocialProfile {
  providerId: string;
  email: string | null;
  nickname: string;
  profileImage: string | null;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly adminEmail = 'test2@gmail.com';
  private readonly passwordHasher: PasswordHasher;
  private readonly logger = new Logger(AuthService.name);

  private readonly kakaoEnabled: boolean;
  private readonly naverEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const hashDriver = this.configService.get<string>('auth.hashDriver') ?? 'bcryptjs';

    this.passwordHasher = loadPasswordHasher(hashDriver);
    this.kakaoEnabled = !!process.env.KAKAO_CLIENT_ID;
    this.naverEnabled = !!process.env.NAVER_CLIENT_ID;
  }

  onModuleInit() {
    const missing: string[] = [];
    if (!this.kakaoEnabled) missing.push('KAKAO_CLIENT_ID');
    if (!this.naverEnabled) missing.push('NAVER_CLIENT_ID');
    if (missing.length > 0) {
      this.logger.warn(
        `OAuth credentials not configured: ${missing.join(', ')}. ` +
        'Social login for these providers will be unavailable.',
      );
    }
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
    let profile: SocialProfile;

    if (provider === 'kakao') {
      profile = this.kakaoEnabled
        ? await this.fetchKakaoProfile(code, redirectUri)
        : this.mockSocialProfile('kakao', code);
    } else if (provider === 'naver') {
      profile = this.naverEnabled
        ? await this.fetchNaverProfile(code, redirectUri)
        : this.mockSocialProfile('naver', code);
    } else {
      throw new UnauthorizedException(
        `OAuth ${provider} login not yet implemented.`,
      );
    }

    return this.upsertSocialUser(provider, profile);
  }

  // ---------------------------------------------------------------------------
  // Kakao
  // ---------------------------------------------------------------------------

  private async fetchKakaoProfile(code: string, redirectUri?: string): Promise<SocialProfile> {
    const clientId = process.env.KAKAO_CLIENT_ID!;
    const clientSecret = process.env.KAKAO_CLIENT_SECRET ?? '';
    const redirect = redirectUri ?? process.env.KAKAO_REDIRECT_URI ?? '';

    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirect,
        code,
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      this.logger.warn(`Kakao token exchange failed: ${tokenRes.status} ${body}`);
      throw new UnauthorizedException('카카오 로그인에 실패했습니다.');
    }

    const tokenData = (await tokenRes.json()) as { access_token: string };

    const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      this.logger.warn(`Kakao user info fetch failed: ${userRes.status}`);
      throw new UnauthorizedException('카카오 사용자 정보를 가져오지 못했습니다.');
    }

    const userData = (await userRes.json()) as {
      id: number;
      kakao_account?: {
        email?: string;
        profile?: { nickname?: string; profile_image_url?: string };
      };
      properties?: { nickname?: string; profile_image?: string };
    };

    const account = userData.kakao_account;
    const nickname =
      account?.profile?.nickname ??
      userData.properties?.nickname ??
      `kakao_${userData.id}`;

    return {
      providerId: String(userData.id),
      email: account?.email ?? null,
      nickname,
      profileImage:
        account?.profile?.profile_image_url ??
        userData.properties?.profile_image ??
        null,
    };
  }

  // ---------------------------------------------------------------------------
  // Naver
  // ---------------------------------------------------------------------------

  private async fetchNaverProfile(code: string, redirectUri?: string): Promise<SocialProfile> {
    const clientId = process.env.NAVER_CLIENT_ID!;
    const clientSecret = process.env.NAVER_CLIENT_SECRET!;
    const redirect = redirectUri ?? process.env.NAVER_REDIRECT_URI ?? '';
    const state = 'matchup';

    const tokenRes = await fetch(
      `https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${encodeURIComponent(redirect)}&code=${code}&state=${state}`,
      { method: 'POST' },
    );

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      this.logger.warn(`Naver token exchange failed: ${tokenRes.status} ${body}`);
      throw new UnauthorizedException('네이버 로그인에 실패했습니다.');
    }

    const tokenData = (await tokenRes.json()) as { access_token: string };

    const userRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      this.logger.warn(`Naver user info fetch failed: ${userRes.status}`);
      throw new UnauthorizedException('네이버 사용자 정보를 가져오지 못했습니다.');
    }

    const userData = (await userRes.json()) as {
      resultcode: string;
      response: {
        id: string;
        email?: string;
        nickname?: string;
        profile_image?: string;
      };
    };

    const r = userData.response;
    return {
      providerId: r.id,
      email: r.email ?? null,
      nickname: r.nickname ?? `naver_${r.id}`,
      profileImage: r.profile_image ?? null,
    };
  }

  // ---------------------------------------------------------------------------
  // Mock (dev — env keys missing)
  // ---------------------------------------------------------------------------

  private mockSocialProfile(provider: string, code: string): SocialProfile {
    this.logger.warn(
      `OAuth ${provider} keys not configured — returning mock profile for code="${code}"`,
    );
    return {
      providerId: `mock_${provider}_${code}`,
      email: `mock_${provider}_${code}@dev.matchup.kr`,
      nickname: `${provider}_dev_${code.slice(0, 6)}`,
      profileImage: null,
    };
  }

  // ---------------------------------------------------------------------------
  // Upsert social user
  // ---------------------------------------------------------------------------

  private async upsertSocialUser(provider: string, profile: SocialProfile) {
    // 1. provider + providerId 로 조회
    let user = await this.prisma.user.findFirst({
      where: {
        oauthProvider: provider as 'kakao' | 'naver',
        oauthId: profile.providerId,
        deletedAt: null,
      },
    });

    // 2. 같은 이메일의 기존 계정이 있으면 연결
    if (!user && profile.email) {
      user = await this.prisma.user.findFirst({
        where: { email: profile.email, deletedAt: null },
      });
    }

    if (user) {
      // Soft-deleted account reactivation is not needed here (deletedAt: null filter above).
      await this.syncFixedAdminRole(user.id, user.email);
      const tokens = this.generateTokens(user.id);
      const fullUser = await this.usersService.findById(user.id);
      return { ...tokens, user: fullUser };
    }

    // 3. 신규 회원가입
    const nickname = await this.resolveUniqueNickname(profile.nickname);

    const newUser = await this.prisma.user.create({
      data: {
        email: profile.email,
        nickname,
        role: this.getRoleForEmail(profile.email),
        oauthProvider: provider as 'kakao' | 'naver',
        oauthId: profile.providerId,
        profileImageUrl: profile.profileImage,
        sportTypes: [],
        mannerScore: 3.0,
      },
    });

    const tokens = this.generateTokens(newUser.id);
    const fullUser = await this.usersService.findById(newUser.id);
    return { ...tokens, user: fullUser };
  }

  /** Append numeric suffix until nickname is unique. */
  private async resolveUniqueNickname(base: string): Promise<string> {
    let candidate = base;
    let attempt = 0;
    while (true) {
      const existing = await this.prisma.user.findUnique({ where: { nickname: candidate } });
      if (!existing) return candidate;
      attempt += 1;
      candidate = `${base}_${attempt}`;
    }
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

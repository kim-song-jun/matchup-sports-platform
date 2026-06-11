import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { V1AuthProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildOnboardingSummary } from '../onboarding/onboarding-summary';
import { KakaoLoginDto } from './dto/kakao-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SocialProfileDto, SocialTermsDto } from './dto/social-profile.dto';
import { hashPassword, verifyPassword } from './password-hash';

const SOCIAL_SIGNUP_TTL_MS = 24 * 60 * 60 * 1000;

type KakaoProfile = {
  providerUserKey: string;
  email: string | null;
  nickname: string;
  profileImageUrl: string | null;
};

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto) {
    if (!dto.requiredTermsAccepted) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Required terms must be accepted before registration',
      });
    }

    const email = normalizeEmail(dto.email);
    const nickname = dto.nickname.trim();
    const displayName = dto.displayName?.trim() || nickname;
    const phone = dto.phone?.trim() || null;
    const birthDate = dto.birthDate?.trim() || null;
    const profileImageUrl = dto.profileImageUrl?.trim() || null;

    if (birthDate && !isValidBirthDate(birthDate)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Birth date must be a valid YYYYMMDD value',
      });
    }

    const existing = await this.prisma.v1User.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_CONFLICT',
        message: 'Email is already registered',
      });
    }

    const existingNickname = await this.prisma.v1UserProfile.findFirst({
      where: { nickname },
      select: { id: true },
    });

    if (existingNickname) {
      throw new ConflictException({
        code: 'NICKNAME_CONFLICT',
        message: 'Nickname is already registered',
      });
    }

    if (phone) {
      const existingPhone = await this.prisma.v1User.findUnique({
        where: { phone },
        select: { id: true },
      });

      if (existingPhone) {
        throw new ConflictException({
          code: 'PHONE_CONFLICT',
          message: 'Phone is already registered',
        });
      }
    }

    const requiredTerms = await this.prisma.v1TermsDocument.findMany({
      where: { isRequired: true, status: 'published' },
      select: { id: true },
    });

    if (requiredTerms.length === 0) {
      throw new BadRequestException({
        code: 'TERMS_NOT_READY',
        message: 'Published required terms are not available',
      });
    }

    const passwordHash = await hashPassword(dto.password);
    const user = await this.prisma.v1User.create({
      data: {
        email,
        phone,
        accountStatus: 'active',
        onboardingStatus: 'signup_done',
        lastLoginAt: new Date(),
        authIdentities: {
          create: {
            provider: V1AuthProvider.email,
            providerUserKey: email,
            email,
            passwordHash,
            status: 'active',
            lastLoginAt: new Date(),
          },
        },
        profile: {
          create: {
            nickname,
            displayName,
            gender: dto.gender,
            birthDate,
            profileImageUrl,
            visibility: 'public',
          },
        },
        onboardingProgress: {
          create: {
            currentStep: 'sport',
          },
        },
        notificationPreference: {
          create: {
            importantEnabled: true,
            activityEnabled: true,
            marketingEnabled: false,
          },
        },
        termsConsents: {
          create: requiredTerms.map((termsDocument) => ({
            termsDocumentId: termsDocument.id,
          })),
        },
      },
      select: { id: true, email: true },
    });

    return this.sessionResponse(user.id, user.email);
  }

  async checkEmail(emailValue: string) {
    const email = normalizeEmail(emailValue);
    if (!email || email.length < 3) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Email is required',
      });
    }

    const existing = await this.prisma.v1User.findUnique({
      where: { email },
      select: { id: true },
    });

    return { available: !existing };
  }

  async checkNickname(nicknameValue: string) {
    const nickname = nicknameValue?.trim() ?? '';
    if (nickname.length < 2) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Nickname must be at least 2 characters',
      });
    }

    const existing = await this.prisma.v1UserProfile.findFirst({
      where: { nickname },
      select: { id: true },
    });

    return { available: !existing };
  }

  async login(dto: LoginDto) {
    const email = normalizeEmail(dto.email);
    const identity = await this.prisma.v1AuthIdentity.findUnique({
      where: {
        provider_providerUserKey: {
          provider: V1AuthProvider.email,
          providerUserKey: email,
        },
      },
      select: {
        id: true,
        passwordHash: true,
        status: true,
        user: {
          select: {
            id: true,
            email: true,
            accountStatus: true,
            onboardingStatus: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    const passwordMatches = await verifyPassword(dto.password, identity?.passwordHash);
    if (!identity || !passwordMatches) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Email or password is incorrect',
      });
    }

    if (identity.status !== 'active' || identity.user.accountStatus !== 'active') {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'This account cannot sign in',
      });
    }

    await this.prisma.$transaction([
      this.prisma.v1AuthIdentity.update({
        where: { id: identity.id },
        data: { lastLoginAt: new Date() },
      }),
      this.prisma.v1User.update({
        where: { id: identity.user.id },
        data: { lastLoginAt: new Date() },
      }),
    ]);

    return this.sessionResponse(identity.user.id, identity.user.email);
  }

  async kakaoLogin(dto: KakaoLoginDto) {
    const profile = await this.fetchKakaoProfile(dto.code, dto.redirectUri);
    const now = new Date();
    const existingIdentity = await this.prisma.v1AuthIdentity.findUnique({
      where: {
        provider_providerUserKey: {
          provider: V1AuthProvider.kakao,
          providerUserKey: profile.providerUserKey,
        },
      },
      select: {
        id: true,
        status: true,
        user: {
          select: {
            id: true,
            email: true,
            accountStatus: true,
            onboardingStatus: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (existingIdentity) {
      if (isExpiredSocialSignup(existingIdentity.user)) {
        await this.prisma.v1User.delete({ where: { id: existingIdentity.user.id } });
      } else {
        if (existingIdentity.status !== 'active' || existingIdentity.user.accountStatus !== 'active') {
          throw new ForbiddenException({
            code: 'PERMISSION_DENIED',
            message: 'This account cannot sign in',
          });
        }

        await this.prisma.$transaction([
          this.prisma.v1AuthIdentity.update({
            where: { id: existingIdentity.id },
            data: {
              email: profile.email,
              lastLoginAt: now,
            },
          }),
          this.prisma.v1User.update({
            where: { id: existingIdentity.user.id },
            data: { lastLoginAt: now },
          }),
        ]);

        return this.sessionResponse(existingIdentity.user.id, existingIdentity.user.email, { social: true });
      }
    }

    const email = profile.email ? normalizeEmail(profile.email) : null;
    const existingUser = email
      ? await this.prisma.v1User.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            accountStatus: true,
          },
        })
      : null;

    if (existingUser) {
      if (existingUser.accountStatus !== 'active') {
        throw new ForbiddenException({
          code: 'PERMISSION_DENIED',
          message: 'This account cannot sign in',
        });
      }

      await this.prisma.$transaction([
        this.prisma.v1AuthIdentity.create({
          data: {
            userId: existingUser.id,
            provider: V1AuthProvider.kakao,
            providerUserKey: profile.providerUserKey,
            email,
            status: 'active',
            lastLoginAt: now,
          },
        }),
        this.prisma.v1User.update({
          where: { id: existingUser.id },
          data: { lastLoginAt: now },
        }),
      ]);

      return this.sessionResponse(existingUser.id, existingUser.email, { social: true });
    }

    const user = await this.prisma.v1User.create({
      data: {
        email,
        accountStatus: 'active',
        onboardingStatus: 'social_terms_required',
        lastLoginAt: now,
        authIdentities: {
          create: {
            provider: V1AuthProvider.kakao,
            providerUserKey: profile.providerUserKey,
            email,
            status: 'active',
            lastLoginAt: now,
          },
        },
        onboardingProgress: {
          create: {
            currentStep: 'terms',
            draftJson: {
              kakaoNickname: profile.nickname,
              kakaoProfileImageUrl: profile.profileImageUrl,
            },
          },
        },
        notificationPreference: {
          create: {
            importantEnabled: true,
            activityEnabled: true,
            marketingEnabled: false,
          },
        },
      },
      select: { id: true, email: true },
    });

    return this.sessionResponse(user.id, user.email, { social: true });
  }

  async completeSocialTerms(userId: string, dto: SocialTermsDto) {
    if (!dto.requiredTermsAccepted) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Required terms must be accepted before registration',
      });
    }

    const user = await this.prisma.v1User.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        accountStatus: true,
        onboardingStatus: true,
        createdAt: true,
        updatedAt: true,
        authIdentities: {
          where: { provider: V1AuthProvider.kakao, status: 'active' },
          select: { id: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'V1 user was not found',
      });
    }

    if (user.accountStatus !== 'active' || user.authIdentities.length === 0) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'This account cannot complete social terms',
      });
    }

    if (isExpiredSocialSignup(user)) {
      await this.prisma.v1User.delete({ where: { id: userId } });
      throw new UnauthorizedException({
        code: 'SOCIAL_SIGNUP_EXPIRED',
        message: 'Social signup session expired. Please sign in again.',
      });
    }

    const requiredTerms = await this.prisma.v1TermsDocument.findMany({
      where: { isRequired: true, status: 'published' },
      select: { id: true },
    });

    if (requiredTerms.length === 0) {
      throw new BadRequestException({
        code: 'TERMS_NOT_READY',
        message: 'Published required terms are not available',
      });
    }

    await this.prisma.$transaction([
      this.prisma.v1User.update({
        where: { id: userId },
        data: { onboardingStatus: 'social_profile_required' },
      }),
      this.prisma.v1UserOnboardingProgress.upsert({
        where: { userId },
        update: { currentStep: 'signup' },
        create: { userId, currentStep: 'signup' },
      }),
      this.prisma.v1UserTermsConsent.createMany({
        data: requiredTerms.map((termsDocument) => ({
          userId,
          termsDocumentId: termsDocument.id,
        })),
        skipDuplicates: true,
      }),
    ]);

    return this.sessionResponse(user.id, user.email, { social: true });
  }

  async completeSocialProfile(userId: string, dto: SocialProfileDto) {
    const nickname = dto.nickname.trim();
    const displayName = dto.displayName?.trim() || nickname;
    const phone = dto.phone?.trim() || null;
    const birthDate = dto.birthDate?.trim() || null;
    const profileImageUrl = dto.profileImageUrl?.trim() || null;

    if (birthDate && !isValidBirthDate(birthDate)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Birth date must be a valid YYYYMMDD value',
      });
    }

    const user = await this.prisma.v1User.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        accountStatus: true,
        onboardingStatus: true,
        createdAt: true,
        updatedAt: true,
        authIdentities: {
          where: { provider: V1AuthProvider.kakao, status: 'active' },
          select: { id: true },
        },
        termsConsents: {
          where: {
            revokedAt: null,
            termsDocument: {
              isRequired: true,
              status: 'published',
            },
          },
          select: { id: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'V1 user was not found',
      });
    }

    if (user.accountStatus !== 'active' || user.authIdentities.length === 0) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'This account cannot complete social signup',
      });
    }

    if (isExpiredSocialSignup(user)) {
      await this.prisma.v1User.delete({ where: { id: userId } });
      throw new UnauthorizedException({
        code: 'SOCIAL_SIGNUP_EXPIRED',
        message: 'Social signup session expired. Please sign in again.',
      });
    }

    if (user.onboardingStatus === 'social_terms_required' || user.termsConsents.length === 0) {
      throw new BadRequestException({
        code: 'TERMS_REQUIRED',
        message: 'Required terms must be accepted before social profile registration',
      });
    }

    const existingNickname = await this.prisma.v1UserProfile.findFirst({
      where: {
        nickname,
        deletedAt: null,
        userId: { not: userId },
      },
      select: { id: true },
    });

    if (existingNickname) {
      throw new ConflictException({
        code: 'NICKNAME_CONFLICT',
        message: 'Nickname is already registered',
      });
    }

    if (phone) {
      const existingPhone = await this.prisma.v1User.findFirst({
        where: {
          phone,
          id: { not: userId },
        },
        select: { id: true },
      });

      if (existingPhone) {
        throw new ConflictException({
          code: 'PHONE_CONFLICT',
          message: 'Phone is already registered',
        });
      }
    }

    await this.prisma.$transaction([
      this.prisma.v1UserProfile.upsert({
        where: { userId },
        update: {
          nickname,
          displayName,
          gender: dto.gender,
          birthDate,
          profileImageUrl,
          visibility: 'public',
        },
        create: {
          userId,
          nickname,
          displayName,
          gender: dto.gender,
          birthDate,
          profileImageUrl,
          visibility: 'public',
        },
      }),
      this.prisma.v1User.update({
        where: { id: userId },
        data: { onboardingStatus: 'signup_done', phone },
      }),
      this.prisma.v1UserOnboardingProgress.upsert({
        where: { userId },
        update: { currentStep: 'sport' },
        create: { userId, currentStep: 'sport' },
      }),
    ]);

    return this.sessionResponse(user.id, user.email, { social: true });
  }

  async devLogin(email: string) {
    const user = await this.prisma.v1User.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        accountStatus: true,
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'V1 seed user was not found',
      });
    }

    if (user.accountStatus !== 'active') {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Only active v1 users can use dev login',
      });
    }

    await this.prisma.v1User.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.sessionResponse(user.id, user.email);
  }

  async me(userId: string) {
    const user = await this.prisma.v1User.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        onboardingProgress: true,
        sportPreferences: {
          include: {
            sport: true,
            sportLevel: true,
          },
        },
        regions: {
          include: { region: true },
        },
        reputationSummary: true,
        termsConsents: {
          where: {
            revokedAt: null,
            termsDocument: {
              isRequired: true,
              status: 'published',
            },
          },
          select: { id: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'V1 user was not found',
      });
    }

    if (user.accountStatus === 'deleted') {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Deleted account cannot access v1 API',
      });
    }

    const onboarding = buildOnboardingSummary({
      onboardingStatus: user.onboardingStatus,
      currentStep: user.onboardingProgress?.currentStep ?? null,
      sportPreferences: user.sportPreferences,
      regions: user.regions,
      hasRequiredTerms: user.termsConsents.length > 0,
      hasProfile: Boolean(user.profile?.nickname),
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        accountStatus: user.accountStatus,
        onboardingStatus: user.onboardingStatus,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      },
      profile: {
        displayName: user.profile?.displayName ?? user.profile?.nickname ?? 'Teameet user',
        nickname: user.profile?.nickname ?? null,
        avatarUrl: user.profile?.profileImageUrl ?? null,
        profileVisibility: user.profile?.visibility ?? 'public',
        regionSummary: user.profile?.displayRegion ?? user.regions[0]?.region.name ?? null,
      },
      onboarding,
      reputation: {
        mannerScore: user.reputationSummary?.mannerScore
          ? Number(user.reputationSummary.mannerScore)
          : null,
        reviewCount: user.reputationSummary?.reviewCount ?? 0,
        trustState: user.reputationSummary?.trustState ?? 'none',
      },
    };
  }

  private async sessionResponse(userId: string, userEmail: string | null, options?: { social?: boolean }) {
    const snapshot = await this.me(userId);
    const nextRoute = getAuthNextRoute(snapshot.onboarding, options);

    return {
      session: {
        userId,
        userEmail,
      },
      next: nextRoute ? { route: nextRoute } : undefined,
      ...snapshot,
    };
  }

  private async fetchKakaoProfile(code: string, redirectUri?: string): Promise<KakaoProfile> {
    const clientId = process.env.KAKAO_CLIENT_ID;
    const clientSecret = process.env.KAKAO_CLIENT_SECRET;
    const redirect = redirectUri ?? process.env.KAKAO_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirect) {
      throw new BadRequestException({
        code: 'OAUTH_NOT_CONFIGURED',
        message: 'Kakao login is not configured',
      });
    }

    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirect,
        code,
      }),
    });

    if (!tokenRes.ok) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Kakao token exchange failed',
      });
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Kakao token response is invalid',
      });
    }

    const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Kakao profile fetch failed',
      });
    }

    const userData = (await userRes.json()) as {
      id?: number | string;
      kakao_account?: {
        email?: string;
        profile?: {
          nickname?: string;
          profile_image_url?: string;
        };
      };
      properties?: {
        nickname?: string;
        profile_image?: string;
      };
    };

    if (!userData.id) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Kakao profile response is invalid',
      });
    }

    const nickname =
      userData.kakao_account?.profile?.nickname ??
      userData.properties?.nickname ??
      `kakao_${userData.id}`;

    return {
      providerUserKey: String(userData.id),
      email: userData.kakao_account?.email ?? null,
      nickname,
      profileImageUrl:
        userData.kakao_account?.profile?.profile_image_url ??
        userData.properties?.profile_image ??
        null,
    };
  }

  private async resolveUniqueNickname(base: string) {
    let candidate = base.trim() || 'Teameet user';
    let attempt = 0;

    while (true) {
      const existing = await this.prisma.v1UserProfile.findFirst({
        where: { nickname: candidate, deletedAt: null },
        select: { id: true },
      });
      if (!existing) return candidate;

      attempt += 1;
      candidate = `${base}_${attempt}`;
    }
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidBirthDate(value: string) {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function getAuthNextRoute(onboarding: { status: string; missing: string[]; currentStep: string }, options?: { social?: boolean }) {
  if (onboarding.status === 'social_terms_required') {
    return '/terms?mode=social';
  }

  if (onboarding.status === 'deferred') {
    return null;
  }

  if (options?.social && onboarding.missing.includes('terms')) {
    return '/terms?mode=social';
  }

  if (onboarding.status === 'social_profile_required' || onboarding.missing.includes('profile')) {
    return '/signup/social';
  }

  if (onboarding.status !== 'completed' && onboarding.currentStep !== 'done') {
    return `/onboarding/${onboarding.currentStep}`;
  }

  return null;
}

function isExpiredSocialSignup(user: { onboardingStatus: string; createdAt: Date; updatedAt: Date }) {
  if (user.onboardingStatus !== 'social_terms_required' && user.onboardingStatus !== 'social_profile_required') {
    return false;
  }

  const referenceTime = user.updatedAt ?? user.createdAt;
  return Date.now() - referenceTime.getTime() > SOCIAL_SIGNUP_TTL_MS;
}

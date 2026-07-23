import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { V1AccountStatus, V1AuthProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildOnboardingSummary, hasAcceptedRequiredTerms } from '../onboarding/onboarding-summary';
import { KakaoLoginDto } from './dto/kakao-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { isValidBirthDateDigits, normalizeSignupDisplayName } from './dto/required-signup-profile.dto';
import { SocialProfileDto, SocialTermsDto } from './dto/social-profile.dto';
import { hashPassword, verifyPassword } from './password-hash';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';

const SOCIAL_SIGNUP_TTL_MS = 24 * 60 * 60 * 1000;

type KakaoProfile = {
  providerUserKey: string;
  email: string | null;
  profileImageUrl: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly managedTerms: ManagedTermsRuntimeService,
  ) {}

  async register(dto: RegisterDto) {
    if (!dto.requiredTermsAccepted) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Required terms must be accepted before registration',
      });
    }

    const email = normalizeEmail(dto.email);
    const nickname = dto.nickname.trim();
    const displayName = normalizeSignupDisplayName(dto.realName ?? dto.displayName ?? '');
    const realName = displayName;
    const phone = dto.phone.trim();
    const birthDate = dto.birthDate.trim();
    const profileImageUrl = dto.profileImageUrl?.trim() || null;

    if (!isValidBirthDateDigits(birthDate)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Birth date must be a valid YYYYMMDD value',
      });
    }

    const signupTermsDecisions = await this.managedTerms.assertSignupAcceptances(
      dto.acceptedTermsDocumentIds ?? [],
    );

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

    const passwordHash = await hashPassword(dto.password);
    const user = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.v1User.create({
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
            realName,
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
        ...(buildTermsConsentCreate(requiredTerms)),
      },
        select: { id: true, email: true },
      });
      await this.managedTerms.recordSignupDecisions(
        transaction,
        created.id,
        signupTermsDecisions,
      );
      return created;
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
      this.assertNotWithdrawalPending(identity.user.accountStatus);
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
          this.assertNotWithdrawalPending(existingIdentity.user.accountStatus);
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
        this.assertNotWithdrawalPending(existingUser.accountStatus);
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
        onboardingProgress: {
          select: { draftJson: true },
        },
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

    if (user.onboardingStatus !== 'social_terms_required') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Social terms can only be completed from the required terms state',
      });
    }

    if (isExpiredSocialSignup(user)) {
      await this.prisma.v1User.delete({ where: { id: userId } });
      throw new UnauthorizedException({
        code: 'SOCIAL_SIGNUP_EXPIRED',
        message: 'Social signup session expired. Please sign in again.',
      });
    }

    const signupTermsDecisions = await this.managedTerms.assertSignupAcceptances(
      dto.acceptedTermsDocumentIds ?? [],
      userId,
    );

    await this.prisma.$transaction(async (transaction) => {
      const transition = await transaction.v1User.updateMany({
        where: { id: userId, onboardingStatus: 'social_terms_required' },
        data: { onboardingStatus: 'social_profile_required' },
      });
      if (transition.count !== 1) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Social signup state changed before terms completion',
        });
      }

      const requiredTerms = await transaction.v1TermsDocument.findMany({
        where: { isRequired: true, status: 'published' },
        select: { id: true },
      });
      await transaction.v1UserOnboardingProgress.upsert({
        where: { userId },
        update: { currentStep: 'signup' },
        create: { userId, currentStep: 'signup' },
      });
      if (requiredTerms.length > 0) {
        await transaction.v1UserTermsConsent.createMany({
          data: requiredTerms.map((termsDocument) => ({
            userId,
            termsDocumentId: termsDocument.id,
          })),
          skipDuplicates: true,
        });
      }
      await this.managedTerms.recordSignupDecisions(
        transaction,
        userId,
        signupTermsDecisions,
      );
    });

    return this.sessionResponse(user.id, user.email, { social: true });
  }

  async completeSocialProfile(userId: string, dto: SocialProfileDto) {
    const nickname = dto.nickname.trim();
    const displayName = normalizeSignupDisplayName(dto.realName ?? dto.displayName ?? '');
    const realName = displayName;
    const phone = dto.phone.trim();
    const birthDate = dto.birthDate.trim();
    const profileImageUrl = dto.profileImageUrl?.trim() || null;

    if (!isValidBirthDateDigits(birthDate)) {
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

    if (user.onboardingStatus === 'social_terms_required') {
      throw new BadRequestException({
        code: 'TERMS_REQUIRED',
        message: 'Required terms must be accepted before social profile registration',
      });
    }

    if (user.onboardingStatus !== 'social_profile_required') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Social profile can only be completed from the required profile state',
      });
    }

    if (isExpiredSocialSignup(user)) {
      await this.prisma.v1User.delete({ where: { id: userId } });
      throw new UnauthorizedException({
        code: 'SOCIAL_SIGNUP_EXPIRED',
        message: 'Social signup session expired. Please sign in again.',
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

    await this.prisma.$transaction(async (transaction) => {
      const transition = await transaction.v1User.updateMany({
        where: { id: userId, onboardingStatus: 'social_profile_required' },
        data: { onboardingStatus: 'signup_done', phone },
      });
      if (transition.count !== 1) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Social signup state changed before profile completion',
        });
      }

      await transaction.v1UserProfile.upsert({
        where: { userId },
        update: {
          nickname,
          displayName,
          realName,
          gender: dto.gender,
          birthDate,
          profileImageUrl,
          visibility: 'public',
        },
        create: {
          userId,
          nickname,
          displayName,
          realName,
          gender: dto.gender,
          birthDate,
          profileImageUrl,
          visibility: 'public',
        },
      });
      await transaction.v1UserOnboardingProgress.upsert({
        where: { userId },
        update: { currentStep: 'sport' },
        create: { userId, currentStep: 'sport' },
      });
    });

    return this.sessionResponse(user.id, user.email, { social: true });
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
        authIdentities: {
          where: { status: 'active' },
          select: { provider: true, passwordHash: true },
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
      hasRequiredTerms: hasAcceptedRequiredTerms(user.onboardingStatus, user.termsConsents.length),
      hasProfile: Boolean(user.profile?.nickname),
    });
    const termsCompliance = await this.managedTerms.signupCompliance(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        accountStatus: user.accountStatus,
        onboardingStatus: user.onboardingStatus,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        authProvider: user.authIdentities[0]?.provider ?? null,
        authProviders: user.authIdentities.map((identity) => identity.provider),
        hasPassword: user.authIdentities.some((identity) => Boolean(identity.passwordHash)),
      },
      verification: {
        emailVerified: Boolean(user.emailVerifiedAt),
        phoneVerified: Boolean(user.phoneVerifiedAt),
      },
      profile: {
        displayName: user.profile?.nickname ?? 'Teameet user',
        nickname: user.profile?.nickname ?? null,
        avatarUrl: user.profile?.profileImageUrl ?? null,
        regionSummary: user.profile?.displayRegion ?? user.regions[0]?.region.name ?? null,
      },
      onboarding,
      termsCompliance,
      reputation: {
        mannerScore: user.reputationSummary?.mannerScore
          ? Number(user.reputationSummary.mannerScore)
          : null,
        reviewCount: user.reputationSummary?.reviewCount ?? 0,
        trustState: user.reputationSummary?.trustState ?? 'none',
      },
    };
  }

  private assertNotWithdrawalPending(accountStatus: V1AccountStatus) {
    if (accountStatus === 'withdrawal_pending') {
      throw new ForbiddenException({
        code: 'ACCOUNT_WITHDRAWAL_PENDING',
        message: '탈퇴 신청 중인 계정이에요. 문의는 고객센터로 연락해 주세요.',
      });
    }
  }

  private async sessionResponse(userId: string, userEmail: string | null, options?: { social?: boolean }) {
    const snapshot = await this.me(userId);
    const onboardingRoute = getAuthNextRoute(snapshot.onboarding, options);
    const nextRoute = onboardingRoute
      ?? (snapshot.termsCompliance?.compliant === false
        ? snapshot.termsCompliance.nextRoute ?? '/terms?mode=renewal'
        : null);

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


    return {
      providerUserKey: String(userData.id),
      email: userData.kakao_account?.email ?? null,
      profileImageUrl:
        userData.kakao_account?.profile?.profile_image_url ??
        userData.properties?.profile_image ??
        null,
    };
  }

}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getAuthNextRoute(onboarding: { status: string; missing: string[]; currentStep: string }, options?: { social?: boolean }) {
  if (onboarding.status === 'social_terms_required') {
    return '/terms?mode=social';
  }

  if (onboarding.status === 'deferred') {
    return null;
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

function buildTermsConsentCreate(requiredTerms: Array<{ id: string }>) {
  if (requiredTerms.length === 0) return {};

  return {
    termsConsents: {
      create: requiredTerms.map((termsDocument) => ({
        termsDocumentId: termsDocument.id,
      })),
    },
  };
}

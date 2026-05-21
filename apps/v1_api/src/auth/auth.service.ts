import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { V1AuthProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildOnboardingSummary } from '../onboarding/onboarding-summary';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { hashPassword, verifyPassword } from './password-hash';

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
    const existing = await this.prisma.v1User.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Email is already registered',
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

    const passwordHash = await hashPassword(dto.password);
    const user = await this.prisma.v1User.create({
      data: {
        email,
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
            displayName: nickname,
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

  private async sessionResponse(userId: string, userEmail: string | null) {
    return {
      session: {
        userId,
        userEmail,
      },
      ...(await this.me(userId)),
    };
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

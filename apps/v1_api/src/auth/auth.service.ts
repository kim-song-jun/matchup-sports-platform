import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma, V1AccountStatus, V1AuthProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildOnboardingSummary, hasAcceptedRequiredTerms } from '../onboarding/onboarding-summary';
import { maskEmail } from './account-recovery.service';
import { AppleLoginDto } from './dto/apple-login.dto';
import { AppleIdentityService } from './apple-identity.service';
import type { AppleIdentityClaims } from './apple-identity-token';
import { AppleTokenService } from './apple-token.service';
import { KakaoLoginDto } from './dto/kakao-login.dto';
import {
  buildKakaoSignupPrefill,
  normalizeKakaoNickname,
  readKakaoSignupPrefill,
  readSocialNicknameSeed,
  type KakaoSignupPrefill,
} from './kakao-profile';
import { generateSocialNickname } from './social-nickname';
import { isPendingSocialSignup } from './social-signup-access';
import { normalizeEmail } from './normalize-email';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { isSignupAgeEligible, isValidBirthDateDigits, normalizeSignupDisplayName } from './dto/required-signup-profile.dto';
import { SocialLinkDto } from './dto/social-link.dto';
import { SocialProfileDto, SocialTermsDto } from './dto/social-profile.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { recordSignupConsent } from './signup-record-consent';
import { hashPassword, verifyPassword } from './password-hash';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';
import { PhoneVerificationService } from '../verification/phone-verification.service';
import { verifyPhoneProofToken } from '../verification/phone-proof-token';

const SOCIAL_SIGNUP_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Providers whose signup goes through the terms step rather than the email form.
 *
 * The two gates below used to name Kakao alone — true while it was the only social login,
 * and silently wrong the moment a second one existed: an Apple signup could not have
 * finished onboarding at all.
 */
// `as const` 를 붙이지 않는다 — Prisma 의 `in` 은 mutable 배열을 요구해서 readonly 튜플은
// 타입이 맞지 않고, 그 자리에서 select 전체의 추론이 무너져 관계 필드까지 사라진다.
const SOCIAL_AUTH_PROVIDERS: V1AuthProvider[] = [V1AuthProvider.kakao, V1AuthProvider.apple];

/**
 * 소셜 로그인이 이메일만 보고 기존 계정을 흡수할 때 우리 쪽 이메일 인증까지 요구한다.
 *
 * 제공자가 "이 이메일은 확인된 것" 이라고 말해도, 그 말은 **제공자 쪽 소유**만 증명한다.
 * 우리 계정의 이메일은 `PATCH /me/profile` 로 소유 증명 없이 바꿀 수 있고(휴대폰은
 * phoneProofToken 으로 막혀 있지만 이메일은 열려 있다) 바뀌는 순간 `emailVerifiedAt` 은
 * null 이 된다. 그래서 우리가 검증한 적 없는 이메일을 신뢰하면 이런 순서가 성립한다:
 *
 *   1. 공격자가 자기 계정 이메일을 피해자의 Apple ID 주소로 바꿔 둔다
 *   2. 피해자가 **처음으로** Apple 로그인을 한다
 *   3. 그 계정이 이메일로 매칭돼 공격자 계정에 피해자의 Apple identity 가 붙는다
 *   4. 피해자는 공격자의 계정으로 들어가고, 공격자는 계속 그 계정에 들어갈 수 있다
 *
 * 흔히 account pre-hijacking 이라 부르는 모양이다. 막는 방법은 **우리가 인증한 이메일일
 * 때만** 흡수하는 것 하나뿐이다.
 *
 * 매칭 실패로 떨어뜨리지 않고 명시적으로 끊는 이유: `V1User.email` 은 unique 라, 그냥
 * 못 찾은 척하면 아래 create 가 P2002 로 터져 500 이 된다. 사용자에게는 무엇을 해야
 * 하는지 말해 주는 편이 낫다.
 */
function assertLinkableByEmail(user: { emailVerifiedAt: Date | null }): void {
  if (user.emailVerifiedAt) return;
  throw new ConflictException({
    code: 'SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL',
    message: '이 이메일을 쓰는 계정이 이미 있는데 이메일 인증이 끝나지 않았어요. 기존 방법으로 로그인해 이메일 인증을 마친 뒤 다시 시도해 주세요.',
  });
}

const SOCIAL_PROVIDER_LABELS: Partial<Record<V1AuthProvider, string>> = {
  kakao: '카카오',
  apple: 'Apple',
};

type KakaoProfile = {
  providerUserKey: string;
  email: string | null;
  emailValid: boolean;
  emailVerified: boolean;
  profileImageUrl: string | null;
  nickname: string | null;
  /** 콘솔 동의항목이 승인된 앱에서만 값이 온다. 미승인이면 null. */
  signupPrefill: KakaoSignupPrefill | null;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly appleIdentity: AppleIdentityService,
    private readonly prisma: PrismaService,
    private readonly managedTerms: ManagedTermsRuntimeService,
    private readonly phoneVerification: PhoneVerificationService,
    private readonly appleTokens: AppleTokenService,
    private readonly notifications: NotificationsService,
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

    if (isValidBirthDateDigits(birthDate) && !isSignupAgeEligible(birthDate)) {
      throw new BadRequestException({
        code: 'SIGNUP_AGE_RESTRICTED',
        message: '만 14세 이상만 가입할 수 있어요. 생년월일을 확인해 주세요.',
      });
    }

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
      where: { nickname, deletedAt: null },
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

    const phoneVerificationRequired = this.phoneVerification.enabled;
    if (phoneVerificationRequired && (!dto.phoneProofToken || !verifyPhoneProofToken(dto.phoneProofToken, phone))) {
      throw new BadRequestException({
        code: 'PHONE_NOT_VERIFIED',
        message: '휴대폰 본인인증을 먼저 완료해 주세요.',
      });
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
        phoneVerifiedAt: phoneVerificationRequired ? new Date() : null,
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
      await recordSignupConsent(transaction, created.id, dto.recordConsent);
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

  async checkNickname(nicknameValue: string, callerUserId?: string) {
    const nickname = nicknameValue?.trim() ?? '';
    if (nickname.length < 2) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Nickname must be at least 2 characters',
      });
    }

    const existing = await this.prisma.v1UserProfile.findFirst({
      where: {
        nickname,
        deletedAt: null,
        ...(callerUserId ? { userId: { not: callerUserId } } : {}),
      },
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
      if (existingIdentity.status !== 'active' || existingIdentity.user.accountStatus !== 'active') {
        this.assertNotWithdrawalPending(existingIdentity.user.accountStatus);
        throw new ForbiddenException({
          code: 'PERMISSION_DENIED',
          message: 'This account cannot sign in',
        });
      }

      await this.touchExistingSocialIdentity(
        existingIdentity,
        now,
        profile.nickname ? { kakaoNickname: profile.nickname } : null,
      );

      return this.sessionResponse(existingIdentity.user.id, existingIdentity.user.email, { social: true });
    }

    const providerEmail = profile.email ? normalizeEmail(profile.email) : null;
    const providerEmailVerified =
      providerEmail !== null && profile.emailValid === true && profile.emailVerified === true;
    // Kakao email is a linking key only when both provider assertions are
    // strict true. If email consent is absent, keep social signup available
    // without persisting an untrusted address.
    const email = providerEmailVerified ? providerEmail : null;
    const existingUser = providerEmail
      ? await this.prisma.v1User.findUnique({
          where: { email: providerEmail },
          select: {
            id: true,
            email: true,
            accountStatus: true,
            emailVerifiedAt: true,
          },
        })
      : null;

    if (existingUser) {
      if (!providerEmailVerified || providerEmail === null) {
        throw new ConflictException({
          code: 'SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL',
          message: '카카오에서 이메일 소유 확인이 되지 않아 기존 계정과 연결할 수 없어요. 카카오 이메일 인증 후 다시 시도해 주세요.',
        });
      }
      const linked = await this.linkExistingSocialIdentity({
        provider: V1AuthProvider.kakao,
        providerUserKey: profile.providerUserKey,
        email: providerEmail,
        existingUserId: existingUser.id,
        now,
      });
      return this.sessionResponse(linked.id, linked.email, { social: true });
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
            // 카카오가 준 값은 가입 완료 전까지 여기 보관했다가 프로필 입력 화면에서 자동 채움에 쓴다
            // (별도 테이블 없이 기존 draftJson 을 확장 — 동의항목 미승인이면 kakao* 키가 아예 없다).
            draftJson: {
              kakaoProfileImageUrl: profile.profileImageUrl,
              ...(profile.nickname ? { kakaoNickname: profile.nickname } : {}),
              ...(profile.signupPrefill
                ? {
                    kakaoName: profile.signupPrefill.name,
                    kakaoPhone: profile.signupPrefill.phone,
                    kakaoGender: profile.signupPrefill.gender,
                  }
                : {}),
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

  /**
   * Sign in with Apple, from the identity token the iOS shell collected.
   *
   * Required by App Store Review Guideline 4.8: an app that offers Kakao — a third-party
   * social login — must offer an equivalent login that limits collection to name and email
   * and lets the reader keep the address private. Apple's private relay is exactly that, so
   * a `@privaterelay.appleid.com` address arriving here is the normal case, not a degraded one.
   *
   * The account is keyed on Apple's `sub`, never on the email: the reader can change or hide
   * the relay address, and `sub` is the only value Apple promises stays stable for our team.
   */
  async appleSignIn(dto: AppleLoginDto) {
    const claims = await this.appleIdentity.verifyIdentityToken(dto.identityToken, dto.nonce);
    const session = await this.appleSession(dto, claims);
    // Only after the sign-in succeeded: a refused sign-in must not leave a token behind, and
    // the code is single-use and expires in minutes, so it cannot be exchanged later.
    if (dto.authorizationCode) {
      await this.appleTokens.storeFromAuthorizationCode({
        subject: claims.subject,
        clientId: claims.audience,
        authorizationCode: dto.authorizationCode,
      });
    }
    return session;
  }

  private async appleSession(dto: AppleLoginDto, claims: AppleIdentityClaims) {
    const now = new Date();
    // Only a verified address may match an existing account. Linking on an unverified one
    // would hand the account that owns the mailbox to whoever can mint that claim.
    const email = claims.email && claims.emailVerified ? normalizeEmail(claims.email) : null;

    const existingIdentity = await this.prisma.v1AuthIdentity.findUnique({
      where: {
        provider_providerUserKey: {
          provider: V1AuthProvider.apple,
          providerUserKey: claims.subject,
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
      if (existingIdentity.status !== 'active' || existingIdentity.user.accountStatus !== 'active') {
        this.assertNotWithdrawalPending(existingIdentity.user.accountStatus);
        throw new ForbiddenException({
          code: 'PERMISSION_DENIED',
          message: 'This account cannot sign in',
        });
      }

      // Apple sends the name on the first authorization only; later logins carry none.
      const appleName = dto.fullName?.trim();
      await this.touchExistingSocialIdentity(existingIdentity, now, appleName ? { appleName } : null);

      return this.sessionResponse(existingIdentity.user.id, existingIdentity.user.email, { social: true });
    }

    const existingUser = email
      ? await this.prisma.v1User.findUnique({
          where: { email },
          select: { id: true, email: true, accountStatus: true, emailVerifiedAt: true },
        })
      : null;

    if (existingUser && email !== null) {
      const linked = await this.linkExistingSocialIdentity({
        provider: V1AuthProvider.apple,
        providerUserKey: claims.subject,
        email,
        existingUserId: existingUser.id,
        now,
      });
      return this.sessionResponse(linked.id, linked.email, { social: true });
    }

    const displayName = dto.fullName?.trim();
    const user = await this.prisma.v1User.create({
      data: {
        email,
        accountStatus: 'active',
        onboardingStatus: 'social_terms_required',
        lastLoginAt: now,
        authIdentities: {
          create: {
            provider: V1AuthProvider.apple,
            providerUserKey: claims.subject,
            email,
            status: 'active',
            lastLoginAt: now,
          },
        },
        onboardingProgress: {
          create: {
            currentStep: 'terms',
            // Apple sends the name on the **first** authorization only and never again — not
            // even after a delete and reinstall. Storing it here is the only chance to have
            // it; drop it and the reader retypes their own name during onboarding.
            draftJson: displayName ? { appleName: displayName } : {},
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

  /**
   * Login bookkeeping for an already-linked social identity. A pending signup (and an abandoned,
   * expired one, which restarts at the terms step) gets the provider seed merged into its onboarding
   * draft. The draft is read and written in the same transaction so concurrent logins cannot
   * overwrite each other's keys; completed users' drafts are never touched.
   */
  private async touchExistingSocialIdentity(
    identity: {
      id: string;
      user: { id: string; onboardingStatus: string; createdAt: Date; updatedAt: Date };
    },
    now: Date,
    seed: Record<string, string> | null,
  ): Promise<void> {
    const { user } = identity;
    const expired = isExpiredSocialSignup(user);
    const pending =
      user.onboardingStatus === 'social_terms_required' || user.onboardingStatus === 'social_profile_required';

    await this.prisma.$transaction(async (tx) => {
      await tx.v1AuthIdentity.update({
        where: { id: identity.id },
        // The provider user key is the established identity; keep its stored email untouched.
        data: { lastLoginAt: now },
      });
      await tx.v1User.update({
        where: { id: user.id },
        data: expired ? { onboardingStatus: 'social_terms_required', lastLoginAt: now } : { lastLoginAt: now },
      });

      const mergeSeed = pending && seed !== null;
      if (!expired && !mergeSeed) return;

      let draftJson: Prisma.InputJsonObject | undefined;
      if (mergeSeed) {
        const progress = await tx.v1UserOnboardingProgress.findUnique({
          where: { userId: user.id },
          select: { draftJson: true },
        });
        draftJson = { ...draftObject(progress?.draftJson), ...seed };
      }
      await tx.v1UserOnboardingProgress.upsert({
        where: { userId: user.id },
        update: { ...(expired ? { currentStep: 'terms' } : {}), ...(draftJson ? { draftJson } : {}) },
        create: { userId: user.id, currentStep: 'terms', ...(draftJson ? { draftJson } : {}) },
      });
    });
  }

  /**
   * Re-reads and conditionally locks the candidate in the same transaction as
   * the provider identity insert. Profile email changes also lock this user
   * row, so a changed email or cleared verification makes the guarded update
   * affect zero rows and no identity is created.
   */
  private async linkExistingSocialIdentity(input: {
    provider: V1AuthProvider;
    providerUserKey: string;
    email: string;
    existingUserId: string;
    now: Date;
  }): Promise<{ id: string; email: string }> {
    return this.prisma.$transaction(async (tx) => {
      const candidate = await tx.v1User.findUnique({
        where: { id: input.existingUserId },
        select: { id: true, email: true, accountStatus: true, emailVerifiedAt: true },
      });

      if (!candidate || candidate.email !== input.email) {
        throw new ConflictException({
          code: 'SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL',
          message: '이메일 계정 정보가 바뀌어 소셜 계정을 연결할 수 없어요. 다시 시도해 주세요.',
        });
      }
      if (candidate.accountStatus !== 'active') {
        this.assertNotWithdrawalPending(candidate.accountStatus);
        throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'This account cannot sign in' });
      }
      assertLinkableByEmail(candidate);

      const claimed = await tx.v1User.updateMany({
        where: {
          id: candidate.id,
          email: input.email,
          accountStatus: 'active',
          emailVerifiedAt: { not: null },
        },
        data: { lastLoginAt: input.now },
      });
      if (claimed.count !== 1) {
        throw new ConflictException({
          code: 'SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL',
          message: '이메일 계정 정보가 바뀌어 소셜 계정을 연결할 수 없어요. 다시 시도해 주세요.',
        });
      }

      await tx.v1AuthIdentity.create({
        data: {
          userId: candidate.id,
          provider: input.provider,
          providerUserKey: input.providerUserKey,
          email: input.email,
          status: 'active',
          lastLoginAt: input.now,
        },
      });
      return { id: candidate.id, email: candidate.email };
    });
  }

  async completeSocialTerms(userId: string, dto: SocialTermsDto) {
    if (!dto.requiredTermsAccepted) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Required terms must be accepted before registration',
      });
    }

    if (!dto.ageConfirmed) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Age confirmation is required before registration',
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
          where: { provider: { in: SOCIAL_AUTH_PROVIDERS }, status: 'active' },
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
      await this.resetExpiredSocialSignup(userId);
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
      // Read inside the transaction: a concurrent login may have merged a provider seed since the outer read.
      const progress = await transaction.v1UserOnboardingProgress.findUnique({
        where: { userId },
        select: { draftJson: true },
      });
      const draft = {
        ...draftObject(progress?.draftJson),
        ageConfirmedAt: new Date().toISOString(),
      };
      await transaction.v1UserOnboardingProgress.upsert({
        where: { userId },
        update: { currentStep: 'signup', draftJson: draft },
        create: { userId, currentStep: 'signup', draftJson: draft },
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
    const profileImageOmitted = dto.profileImageUrl === undefined;

    if (isValidBirthDateDigits(birthDate) && !isSignupAgeEligible(birthDate)) {
      throw new BadRequestException({
        code: 'SIGNUP_AGE_RESTRICTED',
        message: '만 14세 이상만 가입할 수 있어요. 생년월일을 확인해 주세요.',
      });
    }

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
          where: { provider: { in: SOCIAL_AUTH_PROVIDERS }, status: 'active' },
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

    const previousStatus = user.onboardingStatus;
    if (previousStatus !== 'social_profile_required' && previousStatus !== 'social_profile_deferred') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Social profile can only be completed from the required or deferred profile state',
      });
    }
    const wasDeferred = previousStatus === 'social_profile_deferred';

    if (isExpiredSocialSignup(user)) {
      await this.resetExpiredSocialSignup(userId);
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

    if (this.phoneVerification.enabled) {
      const verified = await this.prisma.v1User.findUnique({
        where: { id: userId },
        select: { phone: true, phoneVerifiedAt: true },
      });
      if (!verified?.phoneVerifiedAt || verified.phone !== phone) {
        throw new BadRequestException({
          code: 'PHONE_NOT_VERIFIED',
          message: '휴대폰 본인인증을 먼저 완료해 주세요.',
        });
      }
    }

    await this.prisma.$transaction(async (transaction) => {
      const transition = await transaction.v1User.updateMany({
        where: { id: userId, onboardingStatus: previousStatus },
        data: { onboardingStatus: wasDeferred ? 'deferred' : 'signup_done', phone },
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
          // A deferred caller may have uploaded an avatar from profile edit; omission must not clear it.
          ...(wasDeferred && profileImageOmitted ? {} : { profileImageUrl }),
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
        update: { currentStep: wasDeferred ? 'confirm' : 'sport' },
        create: { userId, currentStep: wasDeferred ? 'confirm' : 'sport' },
      });
      await recordSignupConsent(transaction, userId, dto.recordConsent);
    });

    return this.sessionResponse(user.id, user.email, { social: true });
  }

  async deferSocialProfile(userId: string) {
    const user = await this.prisma.v1User.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        accountStatus: true,
        onboardingStatus: true,
        createdAt: true,
        updatedAt: true,
        onboardingProgress: { select: { draftJson: true } },
        authIdentities: {
          where: { provider: { in: SOCIAL_AUTH_PROVIDERS }, status: 'active' },
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
        message: 'This account cannot defer social signup',
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
        message: 'Social profile can only be deferred from the required profile state',
      });
    }

    if (isExpiredSocialSignup(user)) {
      await this.resetExpiredSocialSignup(userId);
      throw new UnauthorizedException({
        code: 'SOCIAL_SIGNUP_EXPIRED',
        message: 'Social signup session expired. Please sign in again.',
      });
    }

    // Accounts parked in social_profile_required before the 14+ confirmation moved to the
    // terms step have no ageConfirmedAt; they must pass the terms step again.
    if (!draftObject(user.onboardingProgress?.draftJson).ageConfirmedAt) {
      await this.resetExpiredSocialSignup(userId);
      throw new BadRequestException({
        code: 'TERMS_REQUIRED',
        message: 'Required terms must be accepted before social profile registration',
      });
    }

    const nickname = await generateSocialNickname(
      readSocialNicknameSeed(user.onboardingProgress?.draftJson),
      async (candidate) =>
        (await this.prisma.v1UserProfile.findFirst({
          where: { nickname: candidate, deletedAt: null, userId: { not: userId } },
          select: { id: true },
        })) !== null,
    );

    await this.prisma.$transaction(async (transaction) => {
      const transition = await transaction.v1User.updateMany({
        where: { id: userId, onboardingStatus: 'social_profile_required' },
        data: { onboardingStatus: 'social_profile_deferred' },
      });
      if (transition.count !== 1) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Social signup state changed before profile deferral',
        });
      }

      await transaction.v1UserProfile.upsert({
        where: { userId },
        update: { nickname, visibility: 'public' },
        create: { userId, nickname, visibility: 'public' },
      });
      await transaction.v1UserOnboardingProgress.upsert({
        where: { userId },
        update: { currentStep: 'confirm' },
        create: { userId, currentStep: 'confirm' },
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
    // 소셜 가입이 진행 중일 때만 내려준다 — 가입이 끝나면 같은 값이 프로필/유저에 저장되므로
    // 이 필드를 계속 실어 보낼 이유가 없고, 노출 범위도 필요한 순간으로 좁힌다.
    const socialSignupPrefill = isPendingSocialSignup(user.onboardingStatus)
      ? readKakaoSignupPrefill(user.onboardingProgress?.draftJson)
      : null;

    return {
      socialSignupPrefill,
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

  /**
   * 휴대폰 OTP 로 소유를 증명한 뒤, 대기 중인 소셜 신원을 그 번호의 기존 계정으로 옮기고 빈 대기 계정을 지운다.
   * 이메일 없는 소셜 로그인이 같은 사람의 두 번째 계정을 만든 경우(MD-QA #126)를 푸는 경로다.
   */
  async linkSocialToPhoneOwner(callerId: string, dto: SocialLinkDto) {
    const { phone } = dto;
    const { identity, holder } = await this.resolveSocialLinkTarget(callerId, dto);

    const now = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        // 이 갱신이 holder 행 잠금을 쥐어 아래 재검증들을 동시 요청과 직렬화한다.
        const locked = await tx.v1User.updateMany({
          where: { id: holder.id, phone, accountStatus: 'active', phoneVerifiedAt: { not: null } },
          data: { lastLoginAt: now },
        });
        if (locked.count !== 1) throw this.socialLinkConflict();

        await this.assertHolderLinkable(tx, holder.id, identity.provider);

        // 증명 토큰은 stateless 라 챌린지 행이 단회성의 실체다.
        const consumed = await tx.v1PhoneVerificationChallenge.deleteMany({
          where: { phone, verifiedAt: { not: null } },
        });
        if (consumed.count !== 1) throw this.phoneNotVerified();

        const stillPending = await tx.v1User.updateMany({
          where: { id: callerId, onboardingStatus: { in: ['social_profile_required', 'social_profile_deferred'] } },
          data: { updatedAt: now },
        });
        if (stillPending.count !== 1) throw this.socialLinkConflict();

        // create 가 아니라 이동 — Apple refresh token 과 (provider, key) unique 를 그대로 보존한다.
        await tx.v1AuthIdentity.update({
          where: { id: identity.id, userId: callerId },
          data: { userId: holder.id, lastLoginAt: now },
        });
        // A deferred account may already have filed support inquiries (cascade on user delete); they are the same person's.
        await tx.v1Inquiry.updateMany({ where: { userId: callerId }, data: { userId: holder.id } });
        await tx.v1User.delete({ where: { id: callerId } });
        await tx.v1StatusChangeLog.create({
          data: {
            targetType: 'auth_identity',
            targetId: identity.id,
            fromStatus: 'pending_social_account',
            toStatus: 'linked',
            actorType: 'user',
            actorUserId: holder.id,
            reason: `social_link:${identity.provider}; removed_pending_user=${callerId}`,
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new ConflictException({
            code: 'SOCIAL_LINK_ACCOUNT_NOT_EMPTY',
            message: '이미 활동 기록이 있는 계정이라 연결할 수 없어요.',
          });
        }
        if (error.code === 'P2002' || error.code === 'P2025') throw this.socialLinkConflict();
      }
      throw error;
    }

    void this.notifications
      .emitNotification(holder.id, 'social_identity_linked', null, undefined, {
        vars: { name: SOCIAL_PROVIDER_LABELS[identity.provider] ?? '소셜' },
        businessKey: `social-link:${identity.id}`,
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `social link notification failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

    return this.sessionResponse(holder.id, holder.email, { social: true });
  }

  /**
   * 연결 전 확인 창용 요약. link 와 같은 검사를 같은 순서로 하되 증명을 소모하지 않고 아무것도 쓰지 않는다.
   * 증명을 통과한 뒤에만 번호 주인의 정보가 나간다.
   */
  async previewSocialLink(callerId: string, dto: SocialLinkDto) {
    const { identity, holder } = await this.resolveSocialLinkTarget(callerId, dto);
    await this.assertHolderLinkable(this.prisma, holder.id, identity.provider);

    const proofStillValid = await this.prisma.v1PhoneVerificationChallenge.count({
      where: { phone: dto.phone, verifiedAt: { not: null } },
    });
    if (proofStillValid !== 1) throw this.phoneNotVerified();

    const holderIdentities = await this.prisma.v1AuthIdentity.findMany({
      where: { userId: holder.id, status: 'active' },
      select: { provider: true, passwordHash: true },
    });
    return {
      maskedEmail: holder.email ? maskEmail(holder.email) : null,
      providers: holderIdentities.map((row) => row.provider),
      hasPassword: holderIdentities.some((row) => Boolean(row.passwordHash)),
      linkingProvider: identity.provider,
    };
  }

  /** link 와 preview 가 공유하는 증명·호출자·번호 주인 검사 (계약 3절 1~4). */
  private async resolveSocialLinkTarget(callerId: string, dto: SocialLinkDto) {
    const phone = dto.phone;
    if (!verifyPhoneProofToken(dto.proofToken, phone, 'social_link')) {
      throw this.phoneNotVerified();
    }

    const caller = await this.prisma.v1User.findUnique({
      where: { id: callerId },
      select: {
        id: true,
        accountStatus: true,
        onboardingStatus: true,
        createdAt: true,
        updatedAt: true,
        profile: { select: { id: true } },
        authIdentities: {
          where: { status: 'active' },
          select: { id: true, provider: true },
        },
      },
    });
    if (!caller || caller.accountStatus !== 'active') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: '이 계정으로는 연결할 수 없어요.' });
    }
    const [identity] = caller.authIdentities;
    // A deferred caller owns an auto-generated profile; a required one has none yet.
    const isLinkableSignupState =
      caller.onboardingStatus === 'social_profile_deferred' ||
      (caller.onboardingStatus === 'social_profile_required' && !caller.profile);
    if (
      !isLinkableSignupState ||
      caller.authIdentities.length !== 1 ||
      !identity ||
      !SOCIAL_AUTH_PROVIDERS.includes(identity.provider)
    ) {
      throw new ConflictException({
        code: 'SOCIAL_LINK_NOT_PENDING',
        message: '가입을 진행 중인 소셜 계정에서만 기존 계정에 연결할 수 있어요.',
      });
    }
    if (isExpiredSocialSignup(caller)) {
      await this.resetExpiredSocialSignup(callerId);
      throw new UnauthorizedException({
        code: 'SOCIAL_SIGNUP_EXPIRED',
        message: 'Social signup session expired. Please sign in again.',
      });
    }

    const holder = await this.prisma.v1User.findFirst({
      where: { phone },
      select: { id: true, email: true, accountStatus: true, phoneVerifiedAt: true },
    });
    if (!holder) {
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: '이 번호로 가입된 계정을 찾지 못했어요.',
      });
    }
    this.assertNotWithdrawalPending(holder.accountStatus);
    if (holder.accountStatus !== 'active') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: '이 계정으로는 연결할 수 없어요.' });
    }
    if (holder.id === caller.id) {
      throw new ConflictException({
        code: 'SOCIAL_LINK_SAME_ACCOUNT',
        message: '이미 이 계정으로 로그인하고 있어요.',
      });
    }
    // A number the holder never proved may belong to someone else (typo, legacy signup); proving it
    // now must not hand that person the holder's account.
    if (!holder.phoneVerifiedAt) {
      throw new ConflictException({
        code: 'SOCIAL_LINK_PHONE_UNVERIFIED',
        message: '기존 계정에서 인증되지 않은 번호라 연결할 수 없어요. 처음 가입한 방법으로 로그인해 주세요.',
      });
    }
    return { identity, holder };
  }

  private async assertHolderLinkable(
    db: Pick<Prisma.TransactionClient, 'v1AdminUser' | 'v1AuthIdentity'>,
    holderId: string,
    provider: V1AuthProvider,
  ) {
    const admin = await db.v1AdminUser.findUnique({
      where: { userId: holderId },
      select: { status: true },
    });
    if (admin && admin.status !== 'revoked') {
      throw new ConflictException({
        code: 'SOCIAL_LINK_ADMIN_FORBIDDEN',
        message: '운영 권한이 있는 계정에는 연결할 수 없어요. 기존 방법으로 로그인해 주세요.',
      });
    }
    const sameProvider = await db.v1AuthIdentity.findFirst({
      where: { userId: holderId, provider, status: 'active' },
      select: { id: true },
    });
    if (sameProvider) {
      throw new ConflictException({
        code: 'SOCIAL_LINK_PROVIDER_EXISTS',
        message: '이미 같은 종류의 소셜 로그인이 연결된 계정이에요. 그 계정으로 로그인해 주세요.',
      });
    }
  }

  private phoneNotVerified() {
    return new BadRequestException({
      code: 'PHONE_NOT_VERIFIED',
      message: '휴대폰 본인인증을 다시 진행해 주세요.',
    });
  }

  private socialLinkConflict() {
    return new ConflictException({
      code: 'SOCIAL_LINK_CONFLICT',
      message: '계정 정보가 바뀌어 연결하지 못했어요. 다시 시도해 주세요.',
    });
  }

  private async resetExpiredSocialSignup(userId: string) {
    // Only a still-pending social signup goes back to terms — a completion that won a race stays.
    await this.prisma.$transaction(async (tx) => {
      const reset = await tx.v1User.updateMany({
        where: { id: userId, onboardingStatus: { in: ['social_terms_required', 'social_profile_required'] } },
        data: { onboardingStatus: 'social_terms_required' },
      });
      if (reset.count === 0) return;
      await tx.v1UserOnboardingProgress.upsert({
        where: { userId },
        update: { currentStep: 'terms' },
        create: { userId, currentStep: 'terms' },
      });
    });
  }

  /**
   * `/auth/dev-session` — mints a real signed session cookie for a caller who is
   * ALREADY authenticated by `V1AuthGuard` (production refuses header/email
   * identity there, so this reaches Prisma only when a valid signed cookie was
   * already presented, or outside production). It grants no capability beyond
   * what `V1AuthGuard` already granted the caller — it only upgrades an
   * already-established identity into the same signed cookie `login()` issues,
   * via the same `sessionResponse()` + `V1SessionCookieInterceptor` path. Exists
   * so E2E can obtain a production-shaped session (rather than relying solely on
   * dev header auth) without a password, which most seeded personas don't have.
   */
  async devSession(userId: string, userEmail: string | null) {
    return this.sessionResponse(userId, userEmail);
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
        is_email_valid?: boolean;
        is_email_verified?: boolean;
        // 이름/전화번호/성별은 카카오 콘솔 동의항목이 승인된 앱에만 내려온다(미승인 시 필드 자체가 없음).
        // 따라서 전부 optional 로 두고, 없으면 프리필을 포기한다.
        name?: string;
        phone_number?: string;
        gender?: string;
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
      emailValid: userData.kakao_account?.is_email_valid === true,
      emailVerified: userData.kakao_account?.is_email_verified === true,
      profileImageUrl:
        userData.kakao_account?.profile?.profile_image_url ??
        userData.properties?.profile_image ??
        null,
      nickname: normalizeKakaoNickname(
        userData.kakao_account?.profile?.nickname ?? userData.properties?.nickname,
      ),
      signupPrefill: buildKakaoSignupPrefill({
        name: userData.kakao_account?.name,
        phone: userData.kakao_account?.phone_number,
        gender: userData.kakao_account?.gender,
      }),
    };
  }

}

function getAuthNextRoute(onboarding: { status: string; missing: string[]; currentStep: string }, options?: { social?: boolean }) {
  if (onboarding.status === 'social_terms_required') {
    return '/terms?mode=social';
  }

  if (onboarding.status === 'deferred' || onboarding.status === 'social_profile_deferred') {
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

function draftObject(draftJson: unknown): Prisma.InputJsonObject {
  return draftJson && typeof draftJson === 'object' && !Array.isArray(draftJson)
    ? (draftJson as Prisma.InputJsonObject)
    : {};
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

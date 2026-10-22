/**
 * auth.service.spec.ts
 *
 * Service-layer contract tests for AuthService.
 * Every assertion targets real observable behaviour — a thrown error with the
 * right status/code, a guard that fires before any DB write, or a response
 * shape that proves a computation happened correctly.
 * "Mock-verifying-mock" tests (asserting a mock returned what we told it) are
 * forbidden.  All tests compile and run with jest --runInBand.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { V1AuthProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppleIdentityService } from './apple-identity.service';
import { AppleTokenService } from './apple-token.service';
import { AuthService } from './auth.service';
import { LoginSecurityService } from './login-security/login-security.service';
import { LoginStepUpService } from './login-security/login-step-up.service';
import type { RegisterDto } from './dto/register.dto';
import { hashPassword } from './password-hash';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';
import { PhoneVerificationService } from '../verification/phone-verification.service';
import { issuePhoneProofToken } from '../verification/phone-proof-token';

// ─── helpers ────────────────────────────────────────────────────────────────

const NOW = new Date('2026-06-21T00:00:00.000Z');
const TERMS_DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';

function registerInput(overrides: Partial<RegisterDto> = {}): RegisterDto {
  return {
    email: 'new@teameet.v1',
    password: 'Password1!',
    nickname: '신규유저',
    displayName: '신규 사용자',
    phone: '01012345678',
    birthDate: '20000229',
    gender: 'male',
    requiredTermsAccepted: true,
    acceptedTermsDocumentIds: [TERMS_DOCUMENT_ID],
    ...overrides,
  };
}

/** 완성된 사용자 DB row (me() 쿼리가 반환하는 include 형태) */
function completedUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'user@teameet.v1',
    phone: null,
    accountStatus: 'active',
    onboardingStatus: 'completed',
    emailVerifiedAt: null,
    phoneVerifiedAt: null,
    lastLoginAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    profile: {
      id: 'profile-1',
      nickname: '테스트유저',
      displayName: '테스트 유저',
      profileImageUrl: null,
      visibility: 'public',
      displayRegion: null,
    },
    onboardingProgress: { currentStep: 'done' },
    sportPreferences: [],
    regions: [],
    reputationSummary: null,
    termsConsents: [{ id: 'consent-1' }],
    authIdentities: [{ provider: V1AuthProvider.email, passwordHash: 'hash' }],
    ...overrides,
  };
}

/** 소셜 회원가입이 아직 완료되지 않은 사용자 (social_terms_required, 만료 전) */
function pendingSocialUserRow(overrides: Record<string, unknown> = {}) {
  return {
    ...completedUserRow({
      email: null,
      onboardingStatus: 'social_terms_required',
      onboardingProgress: { currentStep: 'terms' },
      termsConsents: [],
    }),
    authIdentities: [{ id: 'identity-1', provider: V1AuthProvider.kakao, passwordHash: null }],
    ...overrides,
  };
}

// ─── prisma mock skeleton ────────────────────────────────────────────────────

function buildPrismaMock() {
  return {
    v1User: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    v1UserProfile: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    v1AuthIdentity: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'created-identity' }),
    },
    v1TermsDocument: {
      findMany: jest.fn(),
    },
    v1UserOnboardingProgress: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    v1UserRecordConsent: {
      upsert: jest.fn(),
    },
    v1StatusChangeLog: { create: jest.fn() },
    v1UserTermsConsent: {
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

// ─── suite ──────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof buildPrismaMock>;
  const managedTerms = {
    assertSignupAcceptances: jest.fn(async (documentIds: string[]) => ({
      acceptedDocumentIds: documentIds,
      notAcceptedDocumentIds: [],
    })),
    recordSignupDecisions: jest.fn(),
    signupCompliance: jest.fn().mockResolvedValue({
      compliant: true,
      pendingRequiredDocumentIds: [],
      nextRoute: null,
    }),
  };
  const phoneVerification = { enabled: false };
  const loginSecurity = {
    isStepUpRequired: jest.fn().mockResolvedValue(false),
    record: jest.fn().mockResolvedValue(undefined),
    scheduleSprayDetection: jest.fn(),
  };
  const loginStepUp = { start: jest.fn(), verify: jest.fn(), resend: jest.fn() };
  const CLIENT = { ip: '203.0.113.9' };

  beforeEach(async () => {
    prisma = buildPrismaMock();
    prisma.v1User.updateMany.mockResolvedValue({ count: 1 });
    phoneVerification.enabled = false;

    // $transaction: execute the callback with prisma itself (no real tx isolation)
    (prisma.$transaction as jest.Mock).mockImplementation(
      (arg: unknown) => {
        if (typeof arg === 'function') {
          return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
        }
        // array form: resolve each item
        return Promise.all(arg as Promise<unknown>[]);
      },
    );

    // Apple's half of the sign-in is verified by its own spec; here the service only needs a
    // stand-in that yields claims, so the account logic can be asserted on its own.
    const appleIdentity = { verifyIdentityToken: jest.fn(), issueNonce: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: ManagedTermsRuntimeService, useValue: managedTerms },
        { provide: PhoneVerificationService, useValue: phoneVerification },
        { provide: AppleIdentityService, useValue: appleIdentity },
        { provide: AppleTokenService, useValue: { storeFromAuthorizationCode: jest.fn() } },
        { provide: LoginSecurityService, useValue: loginSecurity },
        { provide: LoginStepUpService, useValue: loginStepUp },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── register ────────────────────────────────────────────────────────────

  it.each(['20200101', '20990101'])('rejects underage/future birthdays on email and social signup: %s', async (birthDate) => {
    const input = registerInput({ birthDate });
    await expect(service.register(input)).rejects.toMatchObject({ response: { code: 'SIGNUP_AGE_RESTRICTED' } });
    await expect(service.completeSocialProfile('pending-social', input)).rejects.toMatchObject({ response: { code: 'SIGNUP_AGE_RESTRICTED' } });
    expect(prisma.v1User.findUnique).not.toHaveBeenCalled();
  });

  it('register: requiredTermsAccepted=false → 400 VALIDATION_ERROR (DB에 접근하지 않아야 함)', async () => {
    await expect(
      service.register(registerInput({
        requiredTermsAccepted: false,
      })),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'VALIDATION_ERROR' },
    });

    // guard must fire before any DB read
    expect(prisma.v1User.findUnique).not.toHaveBeenCalled();
  });

  it('register: 이미 등록된 이메일 → 409 EMAIL_CONFLICT', async () => {
    prisma.v1User.findUnique.mockResolvedValue({ id: 'existing-1' });

    await expect(
      service.register(registerInput({
        email: 'existing@teameet.v1',
      })),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'EMAIL_CONFLICT' },
    });

    // nickname check must NOT be reached after email conflict
    expect(prisma.v1UserProfile.findFirst).not.toHaveBeenCalled();
  });

  describe('checkNickname', () => {
    const profiles = [
      { userId: 'me', nickname: '내닉네임', deletedAt: null },
      { userId: 'other', nickname: '남닉네임', deletedAt: null },
      { userId: 'gone', nickname: '탈퇴닉네임', deletedAt: new Date() },
    ];
    beforeEach(() => {
      prisma.v1UserProfile.findFirst.mockImplementation(
        async ({ where }: { where: { nickname: string; deletedAt?: null; userId?: { not: string } } }) =>
          profiles.find(
            (p) =>
              p.nickname === where.nickname &&
              (where.deletedAt === undefined || p.deletedAt === null) &&
              (!where.userId || p.userId !== where.userId.not),
          ) ?? null,
      );
    });

    it('treats the caller\'s own nickname as available but another user\'s as taken', async () => {
      await expect(service.checkNickname('내닉네임', 'me')).resolves.toEqual({ available: true });
      await expect(service.checkNickname('남닉네임', 'me')).resolves.toEqual({ available: false });
    });

    it('stays strict for anonymous callers and ignores deleted profiles', async () => {
      await expect(service.checkNickname('내닉네임')).resolves.toEqual({ available: false });
      await expect(service.checkNickname('탈퇴닉네임')).resolves.toEqual({ available: true });
    });
  });

  it('register: 이미 사용 중인 닉네임 → 409 NICKNAME_CONFLICT', async () => {
    prisma.v1User.findUnique.mockResolvedValue(null);            // email available
    prisma.v1UserProfile.findFirst.mockResolvedValue({ id: 'p-1' }); // nickname taken

    await expect(
      service.register(registerInput({
        nickname: '중복닉네임',
      })),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'NICKNAME_CONFLICT' },
    });
    // check-nickname 과 같은 기준이어야 한다 — 탈퇴한 프로필의 닉네임은 다시 쓸 수 있다.
    expect(prisma.v1UserProfile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { nickname: '중복닉네임', deletedAt: null } }),
    );
  });

  it('register: 유효하지 않은 생년월일(잘못된 날짜) → 400 VALIDATION_ERROR', async () => {
    // 20001332 → month=13, day=32 → invalid
    await expect(
      service.register(registerInput({
        nickname: '신규',
        birthDate: '20001332',
      })),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'VALIDATION_ERROR' },
    });
  });

  it('register: 필수 프로필 값을 정규화해 사용자와 프로필에 저장한다', async () => {
    // Given
    prisma.v1User.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(completedUserRow({
        id: 'new-user',
        email: 'new@teameet.v1',
        onboardingStatus: 'signup_done',
        onboardingProgress: { currentStep: 'sport' },
      }));
    prisma.v1UserProfile.findFirst.mockResolvedValue(null);
    prisma.v1TermsDocument.findMany.mockResolvedValue([]);
    prisma.v1User.create.mockResolvedValue({ id: 'new-user', email: 'new@teameet.v1' });

    // When
    await service.register(registerInput({
      displayName: '  신규 사용자  ',
      phone: '01087654321',
      birthDate: '20000229',
      gender: 'female',
      profileImageUrl: '/mock/profile-email.jpg',
    }));

    // Then
    expect(prisma.v1User.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phone: '01087654321',
          profile: {
            create: {
              nickname: '신규유저',
              displayName: '신규 사용자',
              realName: '신규 사용자',
              gender: 'female',
              birthDate: '20000229',
              profileImageUrl: '/mock/profile-email.jpg',
              visibility: 'public',
            },
          },
        }),
      }),
    );
  });

  it('register: 게시된 필수 약관 문서가 없어도 동의값이 true면 가입을 진행한다', async () => {
    prisma.v1User.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(completedUserRow({
        id: 'new-user',
        email: 'new@teameet.v1',
        onboardingStatus: 'signup_done',
        onboardingProgress: { currentStep: 'sport' },
        termsConsents: [],
      }));
    prisma.v1UserProfile.findFirst.mockResolvedValue(null);
    prisma.v1TermsDocument.findMany.mockResolvedValue([]);
    prisma.v1User.create.mockResolvedValue({ id: 'new-user', email: 'new@teameet.v1' });

    const result = await service.register(registerInput({
      nickname: '신규',
    }));

    expect(result.session).toEqual({ userId: 'new-user', userEmail: 'new@teameet.v1' });
    expect(result.next).toEqual({ route: '/onboarding/sport' });
    expect(prisma.v1User.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ termsConsents: expect.anything() }),
      }),
    );
  });

  it('register: 게시된 필수 약관 문서가 있으면 consent row를 함께 생성한다', async () => {
    prisma.v1User.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(completedUserRow({
        id: 'new-user',
        email: 'new@teameet.v1',
        onboardingStatus: 'signup_done',
        onboardingProgress: { currentStep: 'sport' },
      }));
    prisma.v1UserProfile.findFirst.mockResolvedValue(null);
    prisma.v1TermsDocument.findMany.mockResolvedValue([{ id: 'terms-1' }, { id: 'privacy-1' }]);
    prisma.v1User.create.mockResolvedValue({ id: 'new-user', email: 'new@teameet.v1' });

    await service.register(registerInput({
      nickname: '신규',
    }));

    expect(prisma.v1User.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          termsConsents: {
            create: [
              { termsDocumentId: 'terms-1' },
              { termsDocumentId: 'privacy-1' },
            ],
          },
        }),
      }),
    );
  });

  // ─── register: phone verification gate ──────────────────────────────────

  it('register: phoneVerification enabled + phoneProofToken 없음 → 400 PHONE_NOT_VERIFIED (가입 진행 안 함)', async () => {
    phoneVerification.enabled = true;
    prisma.v1User.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prisma.v1UserProfile.findFirst.mockResolvedValue(null);

    await expect(
      service.register(registerInput()),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'PHONE_NOT_VERIFIED' },
    });

    expect(prisma.v1User.create).not.toHaveBeenCalled();
  });

  it('register: phoneVerification enabled + 무효한 proof token → 400 PHONE_NOT_VERIFIED (가입 진행 안 함)', async () => {
    phoneVerification.enabled = true;
    prisma.v1User.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prisma.v1UserProfile.findFirst.mockResolvedValue(null);

    await expect(
      service.register(registerInput({ phoneProofToken: 'tampered.invalid-signature' })),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'PHONE_NOT_VERIFIED' },
    });

    expect(prisma.v1User.create).not.toHaveBeenCalled();
  });

  it('register: phoneVerification enabled + 유효한 proof token → 가입을 진행하고 phoneVerifiedAt을 세팅한다', async () => {
    const OLD_SECRET = process.env.V1_SESSION_SECRET;
    process.env.V1_SESSION_SECRET = 'x'.repeat(48);
    try {
      phoneVerification.enabled = true;
      const phone = '01012345678';
      const validToken = issuePhoneProofToken(phone);

      prisma.v1User.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(completedUserRow({
          id: 'new-user',
          email: 'new@teameet.v1',
          onboardingStatus: 'signup_done',
          onboardingProgress: { currentStep: 'sport' },
        }));
      prisma.v1UserProfile.findFirst.mockResolvedValue(null);
      prisma.v1TermsDocument.findMany.mockResolvedValue([]);
      prisma.v1User.create.mockResolvedValue({ id: 'new-user', email: 'new@teameet.v1' });

      await service.register(registerInput({ phone, phoneProofToken: validToken }));

      expect(prisma.v1User.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phone,
            phoneVerifiedAt: expect.any(Date),
          }),
        }),
      );
    } finally {
      process.env.V1_SESSION_SECRET = OLD_SECRET;
    }
  });

  it('register: phoneVerification disabled → proof token 없이도 가입을 진행하고 phoneVerifiedAt은 null이다', async () => {
    phoneVerification.enabled = false;
    prisma.v1User.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(completedUserRow({
        id: 'new-user',
        email: 'new@teameet.v1',
        onboardingStatus: 'signup_done',
        onboardingProgress: { currentStep: 'sport' },
      }));
    prisma.v1UserProfile.findFirst.mockResolvedValue(null);
    prisma.v1TermsDocument.findMany.mockResolvedValue([]);
    prisma.v1User.create.mockResolvedValue({ id: 'new-user', email: 'new@teameet.v1' });

    await service.register(registerInput());

    expect(prisma.v1User.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phoneVerifiedAt: null }),
      }),
    );
  });

  // ─── login ────────────────────────────────────────────────────────────────

  it('login: 존재하지 않는 이메일 → 401 UNAUTHENTICATED', async () => {
    prisma.v1AuthIdentity.findUnique.mockResolvedValue(null);

    await expect(
      service.login({ email: 'ghost@teameet.v1', password: 'any' }, CLIENT),
    ).rejects.toMatchObject({
      status: 401,
      response: { code: 'UNAUTHENTICATED' },
    });

    // Unknown emails count as failures too, keyed by hash — never by the raw address.
    expect(loginSecurity.record).toHaveBeenCalledWith(
      'failed',
      expect.objectContaining({ emailKey: expect.not.stringContaining('ghost') }),
    );
    expect(loginSecurity.scheduleSprayDetection).toHaveBeenCalledTimes(1);
  });

  it('login: 올바른 이메일 + 틀린 비밀번호 → 401 UNAUTHENTICATED (타이밍 공격 방지 — verifyPassword 호출되어야 함)', async () => {
    const correctHash = await hashPassword('CorrectPass1!');
    prisma.v1AuthIdentity.findUnique.mockResolvedValue({
      id: 'identity-1',
      passwordHash: correctHash,
      status: 'active',
      user: {
        id: 'user-1',
        email: 'user@teameet.v1',
        accountStatus: 'active',
        onboardingStatus: 'completed',
        createdAt: NOW,
        updatedAt: NOW,
      },
    });

    await expect(
      service.login({ email: 'user@teameet.v1', password: 'WrongPass999!' }, CLIENT),
    ).rejects.toMatchObject({
      status: 401,
      response: { code: 'UNAUTHENTICATED' },
    });

    // no DB mutation must occur on wrong password
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(loginSecurity.record).toHaveBeenCalledWith('failed', expect.any(Object));
    expect(loginSecurity.record).not.toHaveBeenCalledWith('success', expect.any(Object));
    expect(loginStepUp.start).not.toHaveBeenCalled();
  });

  it('login: 맞는 비밀번호는 성공으로 기록하고 공격 감지를 예약하지 않는다', async () => {
    const hash = await hashPassword('ValidPass1!');
    prisma.v1AuthIdentity.findUnique.mockResolvedValue({
      id: 'identity-1',
      passwordHash: hash,
      status: 'active',
      user: { id: 'user-1', email: 'user@teameet.v1', accountStatus: 'active', onboardingStatus: 'completed', createdAt: NOW, updatedAt: NOW },
    });
    jest.spyOn(service, 'me').mockResolvedValue({
      user: { id: 'user-1', email: 'user@teameet.v1' },
      onboarding: { status: 'completed', missing: [] },
    } as unknown as Awaited<ReturnType<AuthService['me']>>);

    const result = await service.login({ email: 'user@teameet.v1', password: 'ValidPass1!' }, CLIENT);

    expect(result).toMatchObject({ session: { userId: 'user-1', userEmail: 'user@teameet.v1' } });
    expect(loginSecurity.record).toHaveBeenCalledWith('success', expect.any(Object));
    expect(loginSecurity.scheduleSprayDetection).not.toHaveBeenCalled();
  });

  it('login: identity.status=suspended 계정 → 403 PERMISSION_DENIED', async () => {
    const correctHash = await hashPassword('ValidPass1!');
    prisma.v1AuthIdentity.findUnique.mockResolvedValue({
      id: 'identity-1',
      passwordHash: correctHash,
      status: 'suspended',           // ← suspended identity
      user: {
        id: 'user-1',
        email: 'user@teameet.v1',
        accountStatus: 'active',
        onboardingStatus: 'completed',
        createdAt: NOW,
        updatedAt: NOW,
      },
    });

    await expect(
      service.login({ email: 'user@teameet.v1', password: 'ValidPass1!' }, CLIENT),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: 'PERMISSION_DENIED' },
    });
  });

  it('login: accountStatus=withdrawal_pending 계정 → 403 ACCOUNT_WITHDRAWAL_PENDING (일반 PERMISSION_DENIED와 구분되는 메시지)', async () => {
    const correctHash = await hashPassword('ValidPass1!');
    prisma.v1AuthIdentity.findUnique.mockResolvedValue({
      id: 'identity-1',
      passwordHash: correctHash,
      status: 'active',
      user: {
        id: 'user-1',
        email: 'user@teameet.v1',
        accountStatus: 'withdrawal_pending', // ← 탈퇴 신청 상태
        onboardingStatus: 'completed',
        createdAt: NOW,
        updatedAt: NOW,
      },
    });

    await expect(
      service.login({ email: 'user@teameet.v1', password: 'ValidPass1!' }, CLIENT),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: 'ACCOUNT_WITHDRAWAL_PENDING' },
    });
  });

  it('login: 이메일 대소문자 정규화 — Upper@Example.com 로 로그인해도 email 키는 소문자로 조회', async () => {
    // identity lookup should be called with the lower-cased email as providerUserKey
    prisma.v1AuthIdentity.findUnique.mockResolvedValue(null);

    await expect(
      service.login({ email: 'UPPER@Example.COM', password: 'any' }, CLIENT),
    ).rejects.toThrow(UnauthorizedException);

    expect(prisma.v1AuthIdentity.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_providerUserKey: {
            provider: V1AuthProvider.email,
            providerUserKey: 'upper@example.com',
          },
        },
      }),
    );
  });

  // ─── completeSocialTerms ─────────────────────────────────────────────────

  it('completeSocialTerms: requiredTermsAccepted=false → 400 VALIDATION_ERROR', async () => {
    await expect(
      service.completeSocialTerms('user-1', { requiredTermsAccepted: false, ageConfirmed: true }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'VALIDATION_ERROR' },
    });

    expect(prisma.v1User.findUnique).not.toHaveBeenCalled();
  });

  it('completeSocialTerms: 존재하지 않는 userId → 404 NOT_FOUND', async () => {
    prisma.v1User.findUnique.mockResolvedValue(null);

    await expect(
      service.completeSocialTerms('ghost', { requiredTermsAccepted: true, ageConfirmed: true }),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'NOT_FOUND' },
    });
  });

  it('completeSocialTerms: 소셜 회원가입 세션 만료(>24h) → 리셋 후 401 SOCIAL_SIGNUP_EXPIRED', async () => {
    const expiredTime = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25시간 전
    const expiredUser = pendingSocialUserRow({
      createdAt: expiredTime,
      updatedAt: expiredTime,
    });
    prisma.v1User.findUnique.mockResolvedValue(expiredUser);
    prisma.v1User.update.mockResolvedValue(expiredUser);

    await expect(
      service.completeSocialTerms('user-1', { requiredTermsAccepted: true, ageConfirmed: true }),
    ).rejects.toMatchObject({
      status: 401,
      response: { code: 'SOCIAL_SIGNUP_EXPIRED' },
    });

    // expired user must be reset in place (never hard-deleted — a user with
    // any FK-restricted row, e.g. chat participation, would fail to delete
    // and 500-loop on every subsequent login attempt)
    expect(prisma.v1User.delete).not.toHaveBeenCalled();
    expect(prisma.v1User.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', onboardingStatus: { in: ['social_terms_required', 'social_profile_required'] } },
      data: { onboardingStatus: 'social_terms_required' },
    });
    expect(prisma.v1UserOnboardingProgress.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      update: { currentStep: 'terms' },
      create: { userId: 'user-1', currentStep: 'terms' },
    });
  });

  it.each(['social_profile_required', 'signup_done', 'completed'])(
    'completeSocialTerms: %s 상태 replay는 거부하고 write를 만들지 않는다',
    async (onboardingStatus) => {
      // Given
      prisma.v1User.findUnique.mockResolvedValue(pendingSocialUserRow({ onboardingStatus }));

      // When
      const action = service.completeSocialTerms('user-1', { requiredTermsAccepted: true, ageConfirmed: true });

      // Then
      await expect(action).rejects.toMatchObject({ status: 400 });
      expect(prisma.v1TermsDocument.findMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
      expect(prisma.v1UserTermsConsent.createMany).not.toHaveBeenCalled();
    },
  );

  it('completeSocialTerms: 상태 CAS 실패 시 후속 write 없이 전체 전이를 거부한다', async () => {
    // Given
    const activeTime = new Date();
    prisma.v1User.findUnique.mockResolvedValue(pendingSocialUserRow({ createdAt: activeTime, updatedAt: activeTime }));
    prisma.v1TermsDocument.findMany.mockResolvedValue([{ id: 'terms-1' }]);
    prisma.v1User.updateMany.mockResolvedValue({ count: 0 });

    // When
    const action = service.completeSocialTerms('user-1', { requiredTermsAccepted: true, ageConfirmed: true });

    // Then
    await expect(action).rejects.toMatchObject({ status: 400 });
    expect(prisma.v1UserOnboardingProgress.upsert).not.toHaveBeenCalled();
    expect(prisma.v1UserTermsConsent.createMany).not.toHaveBeenCalled();
  });

  it('completeSocialTerms: 필수 consent와 상태 전이를 하나의 transaction에서 저장한다', async () => {
    // Given
    const activeTime = new Date();
    prisma.v1User.findUnique
      .mockResolvedValueOnce(pendingSocialUserRow({ createdAt: activeTime, updatedAt: activeTime }))
      .mockResolvedValueOnce(completedUserRow({
        onboardingStatus: 'social_profile_required',
        onboardingProgress: { currentStep: 'signup' },
        termsConsents: [{ id: 'consent-1' }],
      }));
    prisma.v1TermsDocument.findMany.mockResolvedValue([{ id: 'terms-1' }, { id: 'privacy-1' }]);

    // When
    await service.completeSocialTerms('user-1', { requiredTermsAccepted: true, ageConfirmed: true });

    // Then
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(prisma.v1UserTermsConsent.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 'user-1', termsDocumentId: 'terms-1' },
        { userId: 'user-1', termsDocumentId: 'privacy-1' },
      ],
      skipDuplicates: true,
    });
  });

  it('completeSocialTerms: moves the user to the required social profile step without creating a profile', async () => {
    const activeTime = new Date();
    prisma.v1User.findUnique
      .mockResolvedValueOnce(pendingSocialUserRow({ createdAt: activeTime, updatedAt: activeTime }))
      .mockResolvedValueOnce(completedUserRow({ onboardingStatus: 'social_profile_required', onboardingProgress: { currentStep: 'signup' }, termsConsents: [], createdAt: activeTime, updatedAt: activeTime }));
    prisma.v1TermsDocument.findMany.mockResolvedValue([]);

    const result = await service.completeSocialTerms('user-1', { requiredTermsAccepted: true, ageConfirmed: true });

    expect(result.next).toEqual({ route: '/signup/social' });
    expect(prisma.v1UserProfile.upsert).not.toHaveBeenCalled();
    expect(prisma.v1User.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', onboardingStatus: 'social_terms_required' },
      data: { onboardingStatus: 'social_profile_required' },
    });
    const ageDraft = { ageConfirmedAt: expect.any(String) };
    expect(prisma.v1UserOnboardingProgress.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      update: { currentStep: 'signup', draftJson: ageDraft },
      create: { userId: 'user-1', currentStep: 'signup', draftJson: ageDraft },
    });
  });

  it('completeSocialTerms: merges the onboarding draft read inside the transaction, keeping a concurrently merged seed', async () => {
    const activeTime = new Date();
    prisma.v1User.findUnique
      .mockResolvedValueOnce(pendingSocialUserRow({
        createdAt: activeTime,
        updatedAt: activeTime,
        onboardingProgress: { draftJson: { kakaoName: '홍길동' } },
      }))
      .mockResolvedValueOnce(completedUserRow({ onboardingStatus: 'social_profile_required', onboardingProgress: { currentStep: 'signup' }, termsConsents: [], createdAt: activeTime, updatedAt: activeTime }));
    prisma.v1TermsDocument.findMany.mockResolvedValue([]);
    prisma.v1UserOnboardingProgress.findUnique.mockResolvedValue({
      draftJson: { kakaoName: '홍길동', kakaoNickname: '새닉네임' },
    });

    await service.completeSocialTerms('user-1', { requiredTermsAccepted: true, ageConfirmed: true });

    const draft = { kakaoName: '홍길동', kakaoNickname: '새닉네임', ageConfirmedAt: expect.any(String) };
    expect(prisma.v1UserOnboardingProgress.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      update: { currentStep: 'signup', draftJson: draft },
      create: { userId: 'user-1', currentStep: 'signup', draftJson: draft },
    });
  });

  describe('signup record consent', () => {
    function arrangeRegister() {
      prisma.v1User.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(completedUserRow({ id: 'new-user', email: 'new@teameet.v1' }));
      prisma.v1UserProfile.findFirst.mockResolvedValue(null);
      prisma.v1TermsDocument.findMany.mockResolvedValue([]);
      prisma.v1User.create.mockResolvedValue({ id: 'new-user', email: 'new@teameet.v1' });
    }

    function arrangeSocialProfile(onboardingStatus = 'social_profile_required') {
      const activeTime = new Date();
      prisma.v1User.findUnique
        .mockResolvedValueOnce(pendingSocialUserRow({
          onboardingStatus,
          onboardingProgress: { currentStep: 'signup' },
          termsConsents: [],
          createdAt: activeTime,
          updatedAt: activeTime,
        }))
        .mockResolvedValueOnce(completedUserRow({ onboardingStatus: 'signup_done' }));
      prisma.v1UserProfile.findFirst.mockResolvedValue(null);
    }

    const socialInput = {
      nickname: '소셜유저',
      gender: 'female' as const,
      displayName: '소셜 유저',
      phone: '01087654321',
      birthDate: '19991231',
    };

    it.each([
      [true, 'GRANTED'],
      [false, 'REVOKED'],
    ])('register: recordConsent.granted=%s 는 가입 트랜잭션에서 %s 로 저장한다', async (granted, state) => {
      arrangeRegister();
      await service.register(registerInput({ recordConsent: { granted, policyHash: 'v1-public-record-consent-1' } }));
      expect(prisma.v1UserRecordConsent.upsert).toHaveBeenCalledWith({
        where: { userId: 'new-user' },
        update: expect.objectContaining({ state, policyHash: 'v1-public-record-consent-1' }),
        create: { userId: 'new-user', state, policyHash: 'v1-public-record-consent-1' },
      });
    });

    it('register: recordConsent 가 없으면(구 클라이언트) 동의 row 를 만들지 않는다', async () => {
      arrangeRegister();
      await service.register(registerInput());
      expect(prisma.v1UserRecordConsent.upsert).not.toHaveBeenCalled();
    });

    it.each([
      [true, 'GRANTED'],
      [false, 'REVOKED'],
    ])('completeSocialProfile: recordConsent.granted=%s 는 %s 로 저장한다', async (granted, state) => {
      arrangeSocialProfile();
      await service.completeSocialProfile('user-1', {
        ...socialInput,
        recordConsent: { granted, policyHash: 'v1-public-record-consent-1' },
      });
      expect(prisma.v1UserRecordConsent.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        update: expect.objectContaining({ state, policyHash: 'v1-public-record-consent-1' }),
        create: { userId: 'user-1', state, policyHash: 'v1-public-record-consent-1' },
      });
    });

    it('completeSocialProfile: recordConsent 가 없으면 동의 row 를 만들지 않는다', async () => {
      arrangeSocialProfile();
      await service.completeSocialProfile('user-1', socialInput);
      expect(prisma.v1UserRecordConsent.upsert).not.toHaveBeenCalled();
    });

    it('completeSocialProfile: 미룬 계정이 프로필 사진을 생략하면 기존 사진을 지우지 않는다', async () => {
      arrangeSocialProfile('social_profile_deferred');
      await service.completeSocialProfile('user-1', socialInput);
      const { update } = prisma.v1UserProfile.upsert.mock.calls[0][0];
      expect(update).not.toHaveProperty('profileImageUrl');
    });

    it('completeSocialProfile: 미룬 계정이 새 프로필 사진을 보내면 교체한다', async () => {
      arrangeSocialProfile('social_profile_deferred');
      await service.completeSocialProfile('user-1', { ...socialInput, profileImageUrl: '/mock/new.jpg' });
      expect(prisma.v1UserProfile.upsert.mock.calls[0][0].update.profileImageUrl).toBe('/mock/new.jpg');
    });

    it('completeSocialProfile: 가입 중 계정이 사진을 생략하면 기존처럼 null 로 저장한다', async () => {
      arrangeSocialProfile();
      await service.completeSocialProfile('user-1', socialInput);
      expect(prisma.v1UserProfile.upsert.mock.calls[0][0].update.profileImageUrl).toBeNull();
    });
  });

  describe('Kakao signup without duplicate phone verification', () => {
    const input = { nickname: '카카오회원', displayName: '회원', phone: '01012345678', gender: 'female' as const, birthDate: '20000229' };
    function arrange(draft: Record<string, unknown>, provider: V1AuthProvider = V1AuthProvider.kakao) {
      phoneVerification.enabled = true;
      prisma.v1User.findUnique
        .mockResolvedValueOnce(pendingSocialUserRow({
          onboardingStatus: 'social_profile_required', createdAt: new Date(), updatedAt: new Date(),
          onboardingProgress: { draftJson: draft }, authIdentities: [{ id: 'i', provider }],
        }))
        .mockResolvedValueOnce(completedUserRow({ onboardingStatus: 'signup_done' }));
    }
    it('still returns provider prefill when a member resumes a deferred profile', async () => {
      prisma.v1User.findUnique.mockResolvedValue(completedUserRow({
        onboardingStatus: 'social_profile_deferred', onboardingProgress: { draftJson: { kakaoPhone: input.phone, kakaoBirthDate: input.birthDate } },
      }));
      expect((await service.me('user-1')).socialSignupPrefill).toMatchObject({ phone: input.phone, birthDate: input.birthDate });
    });
    it('accepts the server-fetched Kakao phone with no OTP and records its source', async () => {
      arrange({ kakaoPhone: input.phone });
      await service.completeSocialProfile('user-1', input);
      expect(prisma.v1User.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ phone: input.phone, phoneVerifiedAt: expect.any(Date) }),
      }));
      expect(prisma.v1StatusChangeLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ reason: 'kakao_provided_phone' }),
      }));
    });
    it.each([
      [{}, V1AuthProvider.kakao],
      [{ kakaoPhone: '01099998888' }, V1AuthProvider.kakao],
      [{ kakaoPhone: input.phone }, V1AuthProvider.apple],
    ])('does not accept a missing, changed or unrelated provider phone', async (draft, provider) => {
      arrange(draft, provider);
      await expect(service.completeSocialProfile('user-1', input)).rejects.toMatchObject({ response: { code: 'PHONE_NOT_VERIFIED' } });
      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
    });
    it('does not transfer a phone already owned by another user through profile submission', async () => {
      arrange({ kakaoPhone: input.phone });
      prisma.v1User.findFirst.mockResolvedValue({ id: 'other-user' });
      await expect(service.completeSocialProfile('user-1', input)).rejects.toMatchObject({ response: { code: 'PHONE_CONFLICT' } });
      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
    });
  });

  it('completeSocialProfile: consent row가 없어도 약관 단계 완료 상태면 프로필을 저장한다', async () => {
    const activeTime = new Date();
    prisma.v1User.findUnique
      .mockResolvedValueOnce(pendingSocialUserRow({
        onboardingStatus: 'social_profile_required',
        onboardingProgress: { currentStep: 'signup' },
        termsConsents: [],
        createdAt: activeTime,
        updatedAt: activeTime,
      }))
      .mockResolvedValueOnce(completedUserRow({
        onboardingStatus: 'signup_done',
        onboardingProgress: { currentStep: 'sport' },
        termsConsents: [],
      }));
    prisma.v1UserProfile.findFirst.mockResolvedValue(null);

    const result = await service.completeSocialProfile('user-1', {
      nickname: '소셜유저',
      gender: 'female',
      displayName: '  소셜 유저  ',
      phone: '01087654321',
      birthDate: '19991231',
      profileImageUrl: '/mock/profile-social.jpg',
    });

    expect(result.next).toEqual({ route: '/onboarding/sport' });
    expect(prisma.v1UserProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        update: {
          nickname: '소셜유저',
          displayName: '소셜 유저',
          realName: '소셜 유저',
          gender: 'female',
          birthDate: '19991231',
          profileImageUrl: '/mock/profile-social.jpg',
          visibility: 'public',
        },
        create: {
          userId: 'user-1',
          nickname: '소셜유저',
          displayName: '소셜 유저',
          realName: '소셜 유저',
          gender: 'female',
          birthDate: '19991231',
          profileImageUrl: '/mock/profile-social.jpg',
          visibility: 'public',
        },
      }),
    );
    expect(prisma.v1User.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', onboardingStatus: 'social_profile_required' },
      data: { onboardingStatus: 'signup_done', phone: '01087654321' },
    });
  });

  it.each([
    ['social_terms_required', 'TERMS_REQUIRED'],
    ['signup_done', 'VALIDATION_ERROR'],
    ['completed', 'VALIDATION_ERROR'],
  ])('completeSocialProfile: %s 상태 replay는 %s로 거부하고 write를 만들지 않는다', async (onboardingStatus, code) => {
    // Given
    prisma.v1User.findUnique.mockResolvedValue(pendingSocialUserRow({ onboardingStatus }));

    // When
    const action = service.completeSocialProfile('user-1', {
      nickname: '소셜유저',
      gender: 'female',
      displayName: '소셜 유저',
      phone: '01087654321',
      birthDate: '19991231',
    });

    // Then
    await expect(action).rejects.toMatchObject({ status: 400, response: { code } });
    expect(prisma.v1UserProfile.findFirst).not.toHaveBeenCalled();
    expect(prisma.v1User.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.v1UserProfile.upsert).not.toHaveBeenCalled();
  });

  it('completeSocialProfile: 상태 CAS 실패 시 프로필 write 없이 전체 전이를 거부한다', async () => {
    // Given
    const activeTime = new Date();
    prisma.v1User.findUnique.mockResolvedValue(pendingSocialUserRow({
      onboardingStatus: 'social_profile_required',
      createdAt: activeTime,
      updatedAt: activeTime,
    }));
    prisma.v1UserProfile.findFirst.mockResolvedValue(null);
    prisma.v1User.findFirst.mockResolvedValue(null);
    prisma.v1User.updateMany.mockResolvedValue({ count: 0 });

    // When
    const action = service.completeSocialProfile('user-1', {
      nickname: '소셜유저',
      gender: 'female',
      displayName: '소셜 유저',
      phone: '01087654321',
      birthDate: '19991231',
    });

    // Then
    await expect(action).rejects.toMatchObject({ status: 400 });
    expect(prisma.v1UserProfile.upsert).not.toHaveBeenCalled();
    expect(prisma.v1UserOnboardingProgress.upsert).not.toHaveBeenCalled();
  });

  it('completeSocialProfile: 소셜 회원가입 세션 만료(>24h) → 리셋 후 401 SOCIAL_SIGNUP_EXPIRED', async () => {
    const expiredTime = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25시간 전
    const expiredUser = pendingSocialUserRow({
      onboardingStatus: 'social_profile_required',
      createdAt: expiredTime,
      updatedAt: expiredTime,
    });
    prisma.v1User.findUnique.mockResolvedValue(expiredUser);
    prisma.v1User.update.mockResolvedValue(expiredUser);

    await expect(
      service.completeSocialProfile('user-1', {
        nickname: '소셜유저',
        gender: 'female',
        displayName: '소셜 유저',
        phone: '01087654321',
        birthDate: '19991231',
      }),
    ).rejects.toMatchObject({
      status: 401,
      response: { code: 'SOCIAL_SIGNUP_EXPIRED' },
    });

    expect(prisma.v1User.delete).not.toHaveBeenCalled();
    expect(prisma.v1User.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', onboardingStatus: { in: ['social_terms_required', 'social_profile_required'] } },
      data: { onboardingStatus: 'social_terms_required' },
    });
    expect(prisma.v1UserOnboardingProgress.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      update: { currentStep: 'terms' },
      create: { userId: 'user-1', currentStep: 'terms' },
    });
  });

  // ─── social profile deferral ─────────────────────────────────────────────

  describe('social profile deferral', () => {
    const freshProfileRequired = (overrides: Record<string, unknown> = {}) => {
      const now = new Date();
      return pendingSocialUserRow({
        onboardingStatus: 'social_profile_required',
        onboardingProgress: { currentStep: 'signup', draftJson: { kakaoNickname: '카카오닉', ageConfirmedAt: '2026-10-11T00:00:00.000Z' } },
        createdAt: now,
        updatedAt: now,
        ...overrides,
      });
    };
    const socialProfileInput = {
      nickname: '카카오닉',
      gender: 'female' as const,
      displayName: '소셜 유저',
      phone: '01087654321',
      birthDate: '19991231',
    };

    it('completeSocialTerms: ageConfirmed=false → 400 VALIDATION_ERROR, DB 접근 없음', async () => {
      await expect(
        service.completeSocialTerms('user-1', { requiredTermsAccepted: true, ageConfirmed: false }),
      ).rejects.toMatchObject({ status: 400, response: { code: 'VALIDATION_ERROR' } });
      expect(prisma.v1User.findUnique).not.toHaveBeenCalled();
    });

    it('completeSocialTerms: 가입 시점 확인 기록을 기존 draftJson 을 지우지 않고 남긴다', async () => {
      const now = new Date();
      prisma.v1User.findUnique.mockResolvedValueOnce(pendingSocialUserRow({
        onboardingStatus: 'social_terms_required',
        createdAt: now,
        updatedAt: now,
      })).mockResolvedValue(completedUserRow({ onboardingStatus: 'social_profile_required' }));
      prisma.v1UserOnboardingProgress.findUnique.mockResolvedValue({ draftJson: { kakaoNickname: '카카오닉' } });
      prisma.v1TermsDocument.findMany.mockResolvedValue([]);

      await service.completeSocialTerms('user-1', {
        requiredTermsAccepted: true,
        ageConfirmed: true,
        acceptedTermsDocumentIds: ['11111111-1111-4111-8111-111111111111'],
      });

      const call = prisma.v1UserOnboardingProgress.upsert.mock.calls[0][0];
      expect(call.update.draftJson).toEqual({
        kakaoNickname: '카카오닉',
        ageConfirmedAt: expect.any(String),
      });
      expect(Number.isNaN(Date.parse(call.update.draftJson.ageConfirmedAt))).toBe(false);
    });

    it('deferSocialProfile: 카카오 닉네임으로 프로필을 만들고 social_profile_deferred 로 전이한다', async () => {
      prisma.v1User.findUnique
        .mockResolvedValueOnce(freshProfileRequired())
        .mockResolvedValue(completedUserRow({ onboardingStatus: 'social_profile_deferred' }));
      prisma.v1UserProfile.findFirst.mockResolvedValue(null);

      const result = await service.deferSocialProfile('user-1');

      expect(prisma.v1User.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', onboardingStatus: 'social_profile_required' },
        data: { onboardingStatus: 'social_profile_deferred' },
      });
      expect(prisma.v1UserProfile.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        update: { nickname: '카카오닉', visibility: 'public' },
        create: { userId: 'user-1', nickname: '카카오닉', visibility: 'public' },
      });
      expect(result.next).toBeUndefined();
      expect(result.onboarding.status).toBe('social_profile_deferred');
    });

    it('deferSocialProfile: 닉네임이 겹치면 숫자 접미를 붙인다', async () => {
      prisma.v1User.findUnique
        .mockResolvedValueOnce(freshProfileRequired())
        .mockResolvedValue(completedUserRow({ onboardingStatus: 'social_profile_deferred' }));
      prisma.v1UserProfile.findFirst
        .mockResolvedValueOnce({ id: 'someone' })
        .mockResolvedValue(null);

      await service.deferSocialProfile('user-1');

      const { create } = prisma.v1UserProfile.upsert.mock.calls[0][0];
      expect(create.nickname).toMatch(/^카카오닉\d{2}$/);
    });

    it('deferSocialProfile: 시드가 없으면 팀밋사용자 계열 닉네임을 쓴다', async () => {
      prisma.v1User.findUnique
        .mockResolvedValueOnce(freshProfileRequired({ onboardingProgress: { currentStep: 'signup', draftJson: { ageConfirmedAt: '2026-10-11T00:00:00.000Z' } } }))
        .mockResolvedValue(completedUserRow({ onboardingStatus: 'social_profile_deferred' }));
      prisma.v1UserProfile.findFirst.mockResolvedValue(null);

      await service.deferSocialProfile('user-1');

      expect(prisma.v1UserProfile.upsert.mock.calls[0][0].create.nickname).toMatch(/^팀밋사용자\d{6}$/);
    });

    it.each([
      ['social_terms_required', 'TERMS_REQUIRED'],
      ['social_profile_deferred', 'VALIDATION_ERROR'],
      ['signup_done', 'VALIDATION_ERROR'],
      ['completed', 'VALIDATION_ERROR'],
    ])('deferSocialProfile: %s 상태는 400 %s 로 거부하고 write 가 없다', async (onboardingStatus, code) => {
      prisma.v1User.findUnique.mockResolvedValue(freshProfileRequired({ onboardingStatus }));

      await expect(service.deferSocialProfile('user-1')).rejects.toMatchObject({
        status: 400,
        response: { code },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.v1UserProfile.upsert).not.toHaveBeenCalled();
    });

    it('deferSocialProfile: 소셜 identity 가 없는 계정은 403', async () => {
      prisma.v1User.findUnique.mockResolvedValue(freshProfileRequired({ authIdentities: [] }));

      await expect(service.deferSocialProfile('user-1')).rejects.toMatchObject({ status: 403 });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('deferSocialProfile: 24시간이 지난 가입은 리셋하고 401 SOCIAL_SIGNUP_EXPIRED', async () => {
      const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const expired = freshProfileRequired({ createdAt: old, updatedAt: old });
      prisma.v1User.findUnique.mockResolvedValue(expired);
      prisma.v1User.update.mockResolvedValue(expired);

      await expect(service.deferSocialProfile('user-1')).rejects.toMatchObject({
        status: 401,
        response: { code: 'SOCIAL_SIGNUP_EXPIRED' },
      });
      expect(prisma.v1UserProfile.upsert).not.toHaveBeenCalled();
    });

    it('deferSocialProfile: ageConfirmedAt 이 없으면 약관 단계로 되돌리고 TERMS_REQUIRED, 프로필은 만들지 않는다', async () => {
      prisma.v1User.findUnique.mockResolvedValue(freshProfileRequired({
        onboardingProgress: { currentStep: 'signup', draftJson: { kakaoNickname: '카카오닉' } },
      }));
      prisma.v1User.update.mockResolvedValue({});

      await expect(service.deferSocialProfile('user-1')).rejects.toMatchObject({
        status: 400,
        response: { code: 'TERMS_REQUIRED' },
      });
      expect(prisma.v1User.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', onboardingStatus: { in: ['social_terms_required', 'social_profile_required'] } },
        data: { onboardingStatus: 'social_terms_required' },
      });
      expect(prisma.v1UserProfile.upsert).not.toHaveBeenCalled();
      expect(prisma.v1User.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ onboardingStatus: 'social_profile_deferred' }) }),
      );
    });

    it('deferSocialProfile: 약관 단계 되돌리기는 그 사이 가입을 마친 계정을 건드리지 않는다', async () => {
      prisma.v1User.findUnique.mockResolvedValue(freshProfileRequired({
        onboardingProgress: { currentStep: 'signup', draftJson: { kakaoNickname: '카카오닉' } },
      }));
      prisma.v1User.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.deferSocialProfile('user-1')).rejects.toMatchObject({
        response: { code: 'TERMS_REQUIRED' },
      });
      expect(prisma.v1UserOnboardingProgress.upsert).not.toHaveBeenCalled();
    });

    it('deferSocialProfile: 상태 CAS 실패 시 프로필을 만들지 않는다', async () => {
      prisma.v1User.findUnique.mockResolvedValue(freshProfileRequired());
      prisma.v1UserProfile.findFirst.mockResolvedValue(null);
      prisma.v1User.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.deferSocialProfile('user-1')).rejects.toMatchObject({ status: 400 });
      expect(prisma.v1UserProfile.upsert).not.toHaveBeenCalled();
    });

    it('completeSocialProfile: deferred 에서 완료하면 상태가 deferred 로 가고 자기 닉네임은 중복이 아니다', async () => {
      const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
      prisma.v1User.findUnique
        .mockResolvedValueOnce(freshProfileRequired({
          onboardingStatus: 'social_profile_deferred',
          createdAt: old,
          updatedAt: old,
        }))
        .mockResolvedValue(completedUserRow({ onboardingStatus: 'deferred' }));
      prisma.v1UserProfile.findFirst.mockResolvedValue(null);
      prisma.v1User.findFirst.mockResolvedValue(null);

      await service.completeSocialProfile('user-1', socialProfileInput);

      expect(prisma.v1UserProfile.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ userId: { not: 'user-1' } }),
      }));
      expect(prisma.v1User.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', onboardingStatus: 'social_profile_deferred' },
        data: { onboardingStatus: 'deferred', phone: '01087654321' },
      });
      expect(prisma.v1UserOnboardingProgress.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: { currentStep: 'confirm' },
      }));
      // 25h-old deferred account is a normal account: no reset, no expiry error.
      expect(prisma.v1User.update).not.toHaveBeenCalled();
    });

    it('completeSocialProfile: deferred 에서도 만 14세 미만은 거부한다', async () => {
      await expect(
        service.completeSocialProfile('user-1', { ...socialProfileInput, birthDate: '20200101' }),
      ).rejects.toMatchObject({ response: { code: 'SIGNUP_AGE_RESTRICTED' } });
    });

    it('completeSocialProfile: required 에서 완료하면 기존처럼 signup_done → sport', async () => {
      prisma.v1User.findUnique
        .mockResolvedValueOnce(freshProfileRequired())
        .mockResolvedValue(completedUserRow({ onboardingStatus: 'signup_done' }));
      prisma.v1UserProfile.findFirst.mockResolvedValue(null);
      prisma.v1User.findFirst.mockResolvedValue(null);

      await service.completeSocialProfile('user-1', socialProfileInput);

      expect(prisma.v1User.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', onboardingStatus: 'social_profile_required' },
        data: { onboardingStatus: 'signup_done', phone: '01087654321' },
      });
    });
  });

  // ─── kakaoTokenLogin ─────────────────────────────────────────────────────

  describe('kakaoTokenLogin', () => {
    const originalFetch = global.fetch;
    const originalEnv = { ...process.env };
    const TOKEN = 'native-access-token-value';

    const json = (body: unknown, ok = true, status = ok ? 200 : 401) =>
      ({ ok, status, json: async () => body }) as unknown as Response;
    const stubKakao = (responses: Response[]) => {
      const fn = jest.fn();
      responses.forEach((r) => fn.mockResolvedValueOnce(r));
      global.fetch = fn as unknown as typeof fetch;
      return fn;
    };
    const tokenInfo = (appId: number, id = 4994014420) => json({ id, app_id: appId, expires_in: 3000 });
    const me = (body: Record<string, unknown> = { id: 4994014420, kakao_account: {} }) => json(body);

    beforeEach(() => {
      process.env.KAKAO_APP_ID = '123456';
      prisma.v1User.findUnique.mockResolvedValue(pendingSocialUserRow());
    });

    afterEach(() => {
      global.fetch = originalFetch;
      process.env = { ...originalEnv };
    });

    it('app_id 가 우리 앱과 다르면 401 이고 프로필은 조회하지 않는다', async () => {
      const fetchMock = stubKakao([tokenInfo(999999)]);

      await expect(service.kakaoTokenLogin({ accessToken: TOKEN })).rejects.toMatchObject({
        status: 401,
        response: { code: 'UNAUTHENTICATED' },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe('https://kapi.kakao.com/v1/user/access_token_info');
      expect(prisma.v1User.create).not.toHaveBeenCalled();
    });

    it('app_id 가 같으면 같은 토큰으로 가입 흐름이 진행된다', async () => {
      const fetchMock = stubKakao([tokenInfo(123456), me()]);
      prisma.v1AuthIdentity.findUnique.mockResolvedValue(null);
      prisma.v1User.create.mockResolvedValue({ id: 'new-social-user', email: null });

      await service.kakaoTokenLogin({ accessToken: TOKEN });

      expect(fetchMock.mock.calls[1][0]).toBe('https://kapi.kakao.com/v2/user/me');
      expect(fetchMock.mock.calls[1][1].headers.authorization).toBe(`Bearer ${TOKEN}`);
      expect(prisma.v1User.create).toHaveBeenCalledTimes(1);
    });

    it('KAKAO_APP_ID 가 없으면 카카오를 호출하기 전에 400 OAUTH_NOT_CONFIGURED', async () => {
      delete process.env.KAKAO_APP_ID;
      const fetchMock = stubKakao([]);

      await expect(service.kakaoTokenLogin({ accessToken: TOKEN })).rejects.toMatchObject({
        status: 400,
        response: { code: 'OAUTH_NOT_CONFIGURED' },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('access_token_info 의 id 와 /v2/user/me 의 id 가 다르면 401', async () => {
      stubKakao([tokenInfo(123456, 111), me({ id: 222, kakao_account: {} })]);

      await expect(service.kakaoTokenLogin({ accessToken: TOKEN })).rejects.toMatchObject({
        status: 401,
        response: { code: 'UNAUTHENTICATED' },
      });
      expect(prisma.v1User.create).not.toHaveBeenCalled();
    });

    it('만료·무효 토큰(-401)은 401, 카카오 내부 오류(-1)와 네트워크 실패는 503 KAKAO_UNAVAILABLE', async () => {
      stubKakao([json({ code: -401, msg: 'invalid token' }, false, 401)]);
      await expect(service.kakaoTokenLogin({ accessToken: TOKEN })).rejects.toMatchObject({ status: 401 });

      stubKakao([json({ code: -1, msg: 'internal' }, false, 400)]);
      await expect(service.kakaoTokenLogin({ accessToken: TOKEN })).rejects.toMatchObject({
        status: 503,
        response: { code: 'KAKAO_UNAVAILABLE' },
      });

      global.fetch = jest.fn().mockRejectedValue(new Error('socket hang up')) as unknown as typeof fetch;
      await expect(service.kakaoTokenLogin({ accessToken: TOKEN })).rejects.toMatchObject({
        status: 503,
        response: { code: 'KAKAO_UNAVAILABLE' },
      });
    });

    it('토큰은 로그에 남지 않는다', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      stubKakao([json({ code: -401, msg: `bad ${TOKEN}` }, false, 401)]);

      await expect(service.kakaoTokenLogin({ accessToken: TOKEN })).rejects.toBeDefined();

      expect(warn).toHaveBeenCalled();
      expect(JSON.stringify(warn.mock.calls)).not.toContain(TOKEN);
      warn.mockRestore();
    });

    it('미인증 이메일은 code 경로와 같이 409 SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL', async () => {
      stubKakao([
        tokenInfo(123456, 779),
        me({ id: 779, kakao_account: { email: 'victim@example.com', is_email_valid: true, is_email_verified: false } }),
      ]);
      prisma.v1AuthIdentity.findUnique.mockResolvedValue(null);
      prisma.v1User.findUnique.mockResolvedValue({
        id: 'victim-local', email: 'victim@example.com', accountStatus: 'active', emailVerifiedAt: NOW,
      });

      await expect(service.kakaoTokenLogin({ accessToken: TOKEN })).rejects.toMatchObject({
        status: 409,
        response: { code: 'SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL' },
      });
      expect(prisma.v1AuthIdentity.create).not.toHaveBeenCalled();
    });

    it('신규 가입은 code 경로와 같은 user 생성 payload 를 만든다', async () => {
      const profile = { id: 5150, kakao_account: { profile: { nickname: '카카오닉' } } };
      prisma.v1AuthIdentity.findUnique.mockResolvedValue(null);
      prisma.v1User.create.mockResolvedValue({ id: 'new-social-user', email: null });

      process.env.KAKAO_CLIENT_ID = 'cid';
      process.env.KAKAO_CLIENT_SECRET = 'secret';
      process.env.KAKAO_REDIRECT_URI = 'https://teameet.co.kr/callback/kakao';
      // lastLoginAt is stamped with new Date(); freeze it so the two payloads are comparable.
      jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'queueMicrotask'] });
      let viaCode;
      let viaToken;
      try {
        stubKakao([json({ access_token: TOKEN }), me(profile)]);
        await service.kakaoLogin({ code: 'auth-code' });
        viaCode = prisma.v1User.create.mock.calls[0][0];

        prisma.v1User.create.mockClear();
        stubKakao([tokenInfo(123456, 5150), me(profile)]);
        await service.kakaoTokenLogin({ accessToken: TOKEN });
        viaToken = prisma.v1User.create.mock.calls[0][0];
      } finally {
        jest.useRealTimers();
      }

      expect(viaToken).toEqual(viaCode);
      expect(viaToken.data.onboardingProgress.create.draftJson).toMatchObject({ kakaoNickname: '카카오닉' });
    });

    const verifiedKakaoAccount = {
      email: 'member@example.com', is_email_valid: true, is_email_verified: true,
      phone_number: '+82 10-1234-5678', name: '회원', gender: 'female',
      birthyear: '2000', birthday: '0229', birthday_type: 'SOLAR',
    };
    const contactOwner = {
      id: 'email-member', email: 'member@example.com', phone: '01012345678',
      accountStatus: 'active', emailVerifiedAt: NOW, phoneVerifiedAt: NOW,
    };
    it('new Kakao members store provider-verified contacts and Gregorian DOB without OTP', async () => {
      stubKakao([tokenInfo(123456), me({ id: 4994014420, kakao_account: verifiedKakaoAccount })]);
      prisma.v1User.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(pendingSocialUserRow());
      prisma.v1User.create.mockResolvedValue({ id: 'user-1', email: verifiedKakaoAccount.email });
      await service.kakaoTokenLogin({ accessToken: TOKEN });
      expect(prisma.v1User.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
        phone: '01012345678', phoneVerifiedAt: expect.any(Date), emailVerifiedAt: expect.any(Date),
        onboardingProgress: { create: expect.objectContaining({ draftJson: expect.objectContaining({ kakaoBirthDate: '20000229' }) }) },
      }) }));
    });
    it.each(['email', 'both'])('links an existing verified %s contact to the same user ID without OTP', async (match) => {
      const account = match === 'email' ?
        { email: verifiedKakaoAccount.email, is_email_valid: true, is_email_verified: true } : verifiedKakaoAccount;
      stubKakao([tokenInfo(123456), me({ id: 4994014420, kakao_account: account })]);
      prisma.v1User.findUnique.mockResolvedValueOnce(contactOwner);
      prisma.v1User.findUnique.mockResolvedValueOnce(contactOwner).mockResolvedValueOnce(completedUserRow({ id: contactOwner.id }));
      if (match !== 'email') prisma.v1User.findFirst.mockResolvedValue(contactOwner);
      prisma.v1AuthIdentity.create.mockResolvedValue({ id: 'new-kakao-identity' });
      const result = await service.kakaoTokenLogin({ accessToken: TOKEN });
      expect(result.session.userId).toBe(contactOwner.id);
      expect(prisma.v1AuthIdentity.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: contactOwner.id, provider: 'kakao' }) }));
      expect(prisma.v1User.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: contactOwner.id, email: contactOwner.email, emailVerifiedAt: { not: null } }),
      }));
      expect(prisma.v1User.create).not.toHaveBeenCalled();
      expect(prisma.v1User.delete).not.toHaveBeenCalled();
    });
    it.each([
      { phone_number: verifiedKakaoAccount.phone_number },
      { ...verifiedKakaoAccount, is_email_valid: false },
      { ...verifiedKakaoAccount, is_email_verified: false },
      { email: verifiedKakaoAccount.email, phone_number: verifiedKakaoAccount.phone_number },
    ])('requires independent account proof when the provider supplies only trusted phone possession: %j', async (account) => {
      // Given: a historically verified phone holder without matching trusted provider email proof.
      stubKakao([tokenInfo(123456), me({ id: 4994014420, kakao_account: account })]);
      prisma.v1User.findFirst.mockResolvedValue(contactOwner);
      prisma.v1User.findUnique.mockResolvedValue(contactOwner);
      // When / Then: attaching a new identity cannot authenticate the older account.
      await expect(service.kakaoTokenLogin({ accessToken: TOKEN })).rejects.toMatchObject({
        status: 409, response: { code: 'SOCIAL_LINK_REQUIRES_ACCOUNT_PROOF' },
      });
      expect(prisma.v1AuthIdentity.create).not.toHaveBeenCalled();
      expect(prisma.v1AuthIdentity.update).not.toHaveBeenCalled();
      expect(prisma.v1StatusChangeLog.create).not.toHaveBeenCalled();
      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
      expect(prisma.v1User.create).not.toHaveBeenCalled();
      expect(prisma.v1User.delete).not.toHaveBeenCalled();
    });
    it('refuses contacts pointing to two different existing users without modifying either', async () => {
      stubKakao([tokenInfo(123456), me({ id: 4994014420, kakao_account: verifiedKakaoAccount })]);
      prisma.v1User.findUnique.mockResolvedValue(contactOwner);
      prisma.v1User.findFirst.mockResolvedValue({ ...contactOwner, id: 'different-phone-owner' });
      await expect(service.kakaoTokenLogin({ accessToken: TOKEN })).rejects.toMatchObject({ response: { code: 'SOCIAL_LINK_CONTACT_CONFLICT' } });
      expect(prisma.v1AuthIdentity.create).not.toHaveBeenCalled();
      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
    });
    it('refuses a legacy unverified phone without changing an identity', async () => {
      const profile = { id: 4994014420, kakao_account: { phone_number: verifiedKakaoAccount.phone_number } };
      prisma.v1User.findFirst.mockResolvedValue(contactOwner);
      prisma.v1User.findUnique.mockResolvedValue({ ...contactOwner, phoneVerifiedAt: null });
      stubKakao([tokenInfo(123456), me(profile)]);
      await expect(service.kakaoTokenLogin({ accessToken: TOKEN })).rejects.toMatchObject({ response: { code: 'SOCIAL_LINK_CONTACT_CONFLICT' } });
      expect(prisma.v1AuthIdentity.create).not.toHaveBeenCalled();
      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
    });
    it('refuses a verified email contact changed during the link transaction', async () => {
      prisma.v1User.findUnique.mockResolvedValue(contactOwner);
      prisma.v1User.findFirst.mockResolvedValue(contactOwner);
      prisma.v1User.updateMany.mockResolvedValue({ count: 0 });
      stubKakao([tokenInfo(123456), me({ id: 4994014420, kakao_account: verifiedKakaoAccount })]);
      await expect(service.kakaoTokenLogin({ accessToken: TOKEN })).rejects.toMatchObject({ response: { code: 'SOCIAL_LINK_CONTACT_CONFLICT' } });
      expect(prisma.v1AuthIdentity.create).not.toHaveBeenCalled();
      expect(prisma.v1StatusChangeLog.create).not.toHaveBeenCalled();
    });

    it('기존 identity 는 같은 providerUserKey 로 조회되어 재로그인된다', async () => {
      stubKakao([tokenInfo(123456, 4994014420), me()]);
      prisma.v1AuthIdentity.findUnique.mockResolvedValue({
        id: 'existing-identity',
        status: 'active',
        user: {
          id: 'existing-user', email: null, accountStatus: 'active',
          onboardingStatus: 'completed', createdAt: new Date(), updatedAt: new Date(),
        },
      });

      const result = await service.kakaoTokenLogin({ accessToken: TOKEN });

      expect(prisma.v1AuthIdentity.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { provider_providerUserKey: { provider: V1AuthProvider.kakao, providerUserKey: '4994014420' } },
        }),
      );
      expect(result.session.userId).toBe('existing-user');
      expect(prisma.v1User.create).not.toHaveBeenCalled();
    });
  });

  // ─── kakaoLogin ──────────────────────────────────────────────────────────

  describe('kakaoLogin', () => {
    const originalFetch = global.fetch;
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env.KAKAO_CLIENT_ID = 'test-client-id';
      process.env.KAKAO_CLIENT_SECRET = 'test-client-secret';
      process.env.KAKAO_REDIRECT_URI = 'https://teameet.co.kr/callback/kakao';
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'kakao-access-token' }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 4994014420, kakao_account: {} }),
        }) as unknown as typeof fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
      process.env = { ...originalEnv };
    });

    /**
     * Kakao 이메일은 주소 문자열만으로 신뢰하지 않는다. `is_email_valid`와
     * `is_email_verified`가 모두 true인 실제 profile 응답만 계정 연결 키가 된다.
     */
    it.each([undefined, false])('is_email_verified=%s이면 기존 계정에 자동 연결하지 않는다', async (verified) => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'kakao-access-token' }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 779,
            kakao_account: {
              email: 'victim@example.com',
              is_email_valid: true,
              ...(verified === undefined ? {} : { is_email_verified: verified }),
            },
          }),
        }) as unknown as typeof fetch;
      prisma.v1AuthIdentity.findUnique.mockResolvedValue(null);
      prisma.v1User.findUnique.mockResolvedValue({
        id: 'victim-local', email: 'victim@example.com', accountStatus: 'active', emailVerifiedAt: NOW,
      });

      await expect(service.kakaoLogin({ code: 'auth-code' })).rejects.toMatchObject({
        status: 409,
        response: { code: 'SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL' },
      });
      expect(prisma.v1AuthIdentity.create).not.toHaveBeenCalled();
      expect(prisma.v1User.create).not.toHaveBeenCalled();
    });

    it('unverified Kakao email is not persisted on a new social identity', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'kakao-access-token' }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 781,
            kakao_account: { email: 'unverified@example.com', is_email_valid: true, is_email_verified: false },
          }),
        }) as unknown as typeof fetch;
      prisma.v1AuthIdentity.findUnique.mockResolvedValue(null);
      prisma.v1User.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValue(completedUserRow({
          id: 'new-social-user',
          email: null,
          onboardingStatus: 'social_terms_required',
          onboardingProgress: { currentStep: 'terms', draftJson: {} },
          authIdentities: [{ id: 'new-social-identity', provider: V1AuthProvider.kakao, passwordHash: null }],
        }));
      prisma.v1User.create.mockResolvedValue({ id: 'new-social-user', email: null });

      await service.kakaoLogin({ code: 'auth-code' });

      expect(prisma.v1User.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          email: null,
          authIdentities: {
            create: expect.objectContaining({ email: null }),
          },
        }),
      }));
    });

    it('우리가 인증하지 않은 이메일로는 기존 계정에 붙이지 않는다 → 409', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'kakao-access-token' }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 777, kakao_account: {
            email: 'victim@example.com', is_email_valid: true, is_email_verified: true,
          } }),
        }) as unknown as typeof fetch;
      prisma.v1AuthIdentity.findUnique.mockResolvedValue(null);
      prisma.v1User.findUnique.mockResolvedValue({
        id: 'attacker-1', email: 'victim@example.com', accountStatus: 'active', emailVerifiedAt: null,
      });

      await expect(service.kakaoLogin({ code: 'auth-code' })).rejects.toMatchObject({
        status: 409,
        response: { code: 'SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL' },
      });

      // 붙이지도, 새로 만들지도 않아야 한다. email 은 unique 라 조용히 흘려보내면 P2002 → 500 이다.
      expect(prisma.v1AuthIdentity.create).not.toHaveBeenCalled();
      expect(prisma.v1User.create).not.toHaveBeenCalled();
      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
      expect(prisma.v1StatusChangeLog.create).not.toHaveBeenCalled();
    });

    it('우리가 인증한 이메일이면 기존 계정에 붙인다', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'kakao-access-token' }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 778,
            kakao_account: {
              email: 'owner@example.com',
              is_email_valid: true,
              is_email_verified: true,
            },
          }),
        }) as unknown as typeof fetch;
      prisma.v1AuthIdentity.findUnique.mockResolvedValue(null);
      prisma.v1User.findUnique
        .mockResolvedValueOnce({
          id: 'user-owner', email: 'owner@example.com', accountStatus: 'active', emailVerifiedAt: NOW,
        })
        .mockResolvedValueOnce({
          id: 'user-owner', email: 'owner@example.com', accountStatus: 'active', emailVerifiedAt: NOW,
        })
        .mockResolvedValue(completedUserRow({ id: 'user-owner', email: 'owner@example.com' }));

      await service.kakaoLogin({ code: 'auth-code' });

      expect(prisma.v1AuthIdentity.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-owner', provider: V1AuthProvider.kakao }) }),
      );
      expect(prisma.v1User.create).not.toHaveBeenCalled();
    });

    it('후보 계정이 transaction 재조회 시 이메일을 바꾸면 Kakao identity를 만들지 않는다', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'kakao-access-token' }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 782,
            kakao_account: { email: 'owner@example.com', is_email_valid: true, is_email_verified: true },
          }),
        }) as unknown as typeof fetch;
      prisma.v1AuthIdentity.findUnique.mockResolvedValue(null);
      prisma.v1User.findUnique
        .mockResolvedValueOnce({
          id: 'candidate-user', email: 'owner@example.com', accountStatus: 'active', emailVerifiedAt: NOW,
        })
        .mockResolvedValueOnce({
          id: 'candidate-user', email: 'changed@example.com', accountStatus: 'active', emailVerifiedAt: NOW,
        });

      await expect(service.kakaoLogin({ code: 'auth-code' })).rejects.toMatchObject({
        status: 409,
        response: { code: 'SOCIAL_LINK_CONTACT_CONFLICT' },
      });
      expect(prisma.v1AuthIdentity.create).not.toHaveBeenCalled();
    });

    it('이미 연결된 Kakao identity는 provider 이메일 플래그가 없어도 ID로 로그인한다', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'kakao-access-token' }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 780, kakao_account: { email: 'changed@example.com' } }),
        }) as unknown as typeof fetch;
      prisma.v1AuthIdentity.findUnique.mockResolvedValue({
        id: 'linked-kakao-identity',
        status: 'active',
        user: {
          id: 'linked-user', email: 'old@example.com', accountStatus: 'active',
          onboardingStatus: 'completed', createdAt: NOW, updatedAt: NOW,
        },
      });
      prisma.v1User.findUnique.mockResolvedValue(completedUserRow({
        id: 'linked-user', email: 'old@example.com',
      }));

      await service.kakaoLogin({ code: 'auth-code' });

      expect(prisma.v1AuthIdentity.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'linked-kakao-identity' },
        data: { lastLoginAt: expect.any(Date) },
      }));
      expect(prisma.v1AuthIdentity.create).not.toHaveBeenCalled();
    });

    it('Kakao 닉네임을 가입 프리필(draftJson)에 보관한다', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'kakao-access-token' }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 782,
            kakao_account: { profile: { nickname: '  카카오닉  ' } },
          }),
        }) as unknown as typeof fetch;
      prisma.v1AuthIdentity.findUnique.mockResolvedValue(null);
      prisma.v1User.findUnique.mockResolvedValue(pendingSocialUserRow());
      prisma.v1User.create.mockResolvedValue({ id: 'new-social-user', email: null });

      await service.kakaoLogin({ code: 'auth-code' });

      const { data } = prisma.v1User.create.mock.calls[0][0];
      expect(data.onboardingProgress.create.draftJson).toMatchObject({ kakaoNickname: '카카오닉' });
    });

    describe('기존 identity 의 닉네임 시드', () => {
      const withNickname = () => {
        global.fetch = jest
          .fn()
          .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'kakao-access-token' }) })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: 784, kakao_account: { profile: { nickname: ' 새닉네임 ' } } }),
          }) as unknown as typeof fetch;
      };
      const identityWith = (onboardingStatus: string) => ({
        id: 'seed-identity',
        status: 'active',
        user: {
          id: 'seed-user', email: null, accountStatus: 'active',
          onboardingStatus, createdAt: new Date(), updatedAt: new Date(),
        },
      });

      it.each(['social_terms_required', 'social_profile_required'])(
        '%s 사용자는 새로 받은 닉네임을 기존 draft 에 병합한다',
        async (status) => {
          withNickname();
          prisma.v1AuthIdentity.findUnique.mockResolvedValue(identityWith(status));
          prisma.v1User.findUnique.mockResolvedValue(pendingSocialUserRow());
          prisma.v1UserOnboardingProgress.findUnique.mockResolvedValue({
            draftJson: { ageConfirmedAt: '2026-10-11T00:00:00.000Z', kakaoName: '홍길동', kakaoNickname: '옛닉' },
          });

          await service.kakaoLogin({ code: 'auth-code' });

          expect(prisma.v1UserOnboardingProgress.upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: { userId: 'seed-user' },
            update: {
              draftJson: {
                ageConfirmedAt: '2026-10-11T00:00:00.000Z',
                  kakaoName: null,
                  kakaoPhone: null,
                  kakaoGender: null,
                  kakaoBirthDate: null,
                kakaoNickname: '새닉네임',
              },
            },
          }));
        },
      );

      it('만료된 pending 사용자도 닉네임을 병합하고 약관 단계로 리셋한다', async () => {
        withNickname();
        const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
        const identity = identityWith('social_profile_required');
        identity.user.createdAt = old;
        identity.user.updatedAt = old;
        prisma.v1AuthIdentity.findUnique.mockResolvedValue(identity);
        prisma.v1User.findUnique.mockResolvedValue(pendingSocialUserRow({ onboardingStatus: 'social_terms_required' }));
        prisma.v1UserOnboardingProgress.findUnique.mockResolvedValue({
          draftJson: { ageConfirmedAt: '2026-10-11T00:00:00.000Z' },
        });

        await service.kakaoLogin({ code: 'auth-code' });

        expect(prisma.v1User.update).toHaveBeenCalledWith({
          where: { id: 'seed-user' },
          data: { onboardingStatus: 'social_terms_required', lastLoginAt: expect.any(Date) },
        });
        expect(prisma.v1UserOnboardingProgress.upsert).toHaveBeenCalledWith(expect.objectContaining({
          update: {
            currentStep: 'terms',
            draftJson: { ageConfirmedAt: '2026-10-11T00:00:00.000Z', kakaoNickname: '새닉네임', kakaoName: null, kakaoPhone: null, kakaoGender: null, kakaoBirthDate: null },
          },
        }));
      });

      it('완료된 사용자의 draft 는 건드리지 않는다', async () => {
        withNickname();
        prisma.v1AuthIdentity.findUnique.mockResolvedValue(identityWith('completed'));
        prisma.v1User.findUnique.mockResolvedValue(completedUserRow({ id: 'seed-user', email: null }));

        await service.kakaoLogin({ code: 'auth-code' });

        expect(prisma.v1UserOnboardingProgress.findUnique).not.toHaveBeenCalled();
        expect(prisma.v1UserOnboardingProgress.upsert).not.toHaveBeenCalled();
      });
    });

    it('Kakao 닉네임이 없으면 kakaoNickname 키를 남기지 않는다', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'kakao-access-token' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 783, kakao_account: {} }) }) as unknown as typeof fetch;
      prisma.v1AuthIdentity.findUnique.mockResolvedValue(null);
      prisma.v1User.findUnique.mockResolvedValue(pendingSocialUserRow());
      prisma.v1User.create.mockResolvedValue({ id: 'new-social-user', email: null });

      await service.kakaoLogin({ code: 'auth-code' });

      const { data } = prisma.v1User.create.mock.calls[0][0];
      expect(data.onboardingProgress.create.draftJson).not.toHaveProperty('kakaoNickname');
    });

    it('만료된(>24h) 소셜 가입 계정으로 재로그인 → 삭제하지 않고 온보딩을 리셋한 뒤 세션을 반환한다', async () => {
      const expiredTime = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25시간 전
      prisma.v1AuthIdentity.findUnique.mockResolvedValue({
        id: 'identity-1',
        status: 'active',
        user: {
          id: 'user-1',
          email: null,
          accountStatus: 'active',
          onboardingStatus: 'social_profile_required',
          createdAt: expiredTime,
          updatedAt: expiredTime,
        },
      });
      // sessionResponse() -> me() re-reads the (now reset) user row
      prisma.v1User.findUnique.mockResolvedValue(
        pendingSocialUserRow({ onboardingStatus: 'social_terms_required' }),
      );

      const result = await service.kakaoLogin({ code: 'auth-code' });

      // a user who already has an FK-restricted row (chat participation, a
      // match application, ...) would fail v1User.delete() with a foreign
      // key violation and 500-loop on every retry — must never be attempted
      expect(prisma.v1User.delete).not.toHaveBeenCalled();
      expect(prisma.v1User.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { onboardingStatus: 'social_terms_required', lastLoginAt: expect.any(Date) },
      });
      expect(prisma.v1UserOnboardingProgress.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        update: { currentStep: 'terms', draftJson: { kakaoName: null, kakaoPhone: null, kakaoGender: null, kakaoBirthDate: null } },
        create: { userId: 'user-1', currentStep: 'terms', draftJson: { kakaoName: null, kakaoPhone: null, kakaoGender: null, kakaoBirthDate: null } },
      });
      expect(prisma.v1AuthIdentity.update).toHaveBeenCalledWith({
        where: { id: 'identity-1' },
        data: { lastLoginAt: expect.any(Date) },
      });
      expect(result.session.userId).toBe('user-1');
    });
  });

  describe('appleSignIn 기존 identity 의 이름 시드', () => {
    const pendingIdentity = (onboardingStatus: string, createdAt = new Date()) => ({
      id: 'apple-identity',
      status: 'active',
      user: {
        id: 'apple-user', email: null, accountStatus: 'active',
        onboardingStatus, createdAt, updatedAt: createdAt,
      },
    });
    const signIn = (fullName?: string) => {
      const appleIdentity = service['appleIdentity'] as unknown as { verifyIdentityToken: jest.Mock };
      appleIdentity.verifyIdentityToken.mockResolvedValue({
        subject: 'apple-sub', audience: 'app', email: null, emailVerified: false,
      });
      return service.appleSignIn({ identityToken: 't', nonce: 'n', fullName } as never);
    };

    beforeEach(() => {
      prisma.v1User.findUnique.mockResolvedValue(pendingSocialUserRow());
      prisma.v1UserOnboardingProgress.findUnique.mockResolvedValue({
        draftJson: { ageConfirmedAt: '2026-10-11T00:00:00.000Z' },
      });
    });

    it('fullName 이 있으면 기존 draft 에 appleName 을 병합한다', async () => {
      prisma.v1AuthIdentity.findUnique.mockResolvedValue(pendingIdentity('social_terms_required'));

      await signIn(' 김애플 ');

      expect(prisma.v1UserOnboardingProgress.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: { draftJson: { ageConfirmedAt: '2026-10-11T00:00:00.000Z', appleName: '김애플' } },
      }));
    });

    it('만료된 pending 사용자도 appleName 을 병합하고 리셋한다', async () => {
      const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
      prisma.v1AuthIdentity.findUnique.mockResolvedValue(pendingIdentity('social_profile_required', old));

      await signIn('김애플');

      expect(prisma.v1UserOnboardingProgress.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: {
          currentStep: 'terms',
          draftJson: { ageConfirmedAt: '2026-10-11T00:00:00.000Z', appleName: '김애플' },
        },
      }));
    });

    it('fullName 이 없으면 draft 를 건드리지 않는다', async () => {
      prisma.v1AuthIdentity.findUnique.mockResolvedValue(pendingIdentity('social_terms_required'));

      await signIn(undefined);

      expect(prisma.v1UserOnboardingProgress.findUnique).not.toHaveBeenCalled();
      expect(prisma.v1UserOnboardingProgress.upsert).not.toHaveBeenCalled();
    });

    it('완료된 사용자의 draft 는 fullName 이 와도 건드리지 않는다', async () => {
      prisma.v1AuthIdentity.findUnique.mockResolvedValue(pendingIdentity('completed'));
      prisma.v1User.findUnique.mockResolvedValue(completedUserRow({ id: 'apple-user', email: null }));

      await signIn('김애플');

      expect(prisma.v1UserOnboardingProgress.upsert).not.toHaveBeenCalled();
    });
  });

  // ─── me ──────────────────────────────────────────────────────────────────

  it('me: 삭제된 계정 → 403 PERMISSION_DENIED', async () => {
    prisma.v1User.findUnique.mockResolvedValue(
      completedUserRow({ accountStatus: 'deleted' }),
    );

    await expect(service.me('user-1')).rejects.toMatchObject({
      status: 403,
      response: { code: 'PERMISSION_DENIED' },
    });
  });

  it('me: 정상 완료 사용자 → onboarding.status=completed, next route 없음', async () => {
    prisma.v1User.findUnique.mockResolvedValue(completedUserRow());

    const result = await service.me('user-1');

    expect(result.user.id).toBe('user-1');
    expect(result.onboarding.status).toBe('completed');
    expect(result.onboarding.canResume).toBe(false);
  });
});

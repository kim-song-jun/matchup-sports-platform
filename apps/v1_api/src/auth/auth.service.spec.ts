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
import { readSocialLinkToken, socialLinkAccountDigest } from './social-link-token';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, V1AuthProvider } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppleIdentityService } from './apple-identity.service';
import { AppleTokenService } from './apple-token.service';
import { AuthService } from './auth.service';
import { readWithdrawalCancelToken } from './withdrawal-cancel-token';
import { ACTIVITY_RELATION_COUNTS } from './empty-signup-account';
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
    deletedAt: null,
    adminUser: null,
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

const zeroActivityCounts = Object.fromEntries(Object.keys(ACTIVITY_RELATION_COUNTS).map((key) => [key, 0]));
const signupHolder = (counts: Record<string, number> = zeroActivityCounts) => ({
  id: 'identity-1', status: 'active', passwordHash: null,
  user: {
    accountStatus: 'active', onboardingStatus: 'social_terms_required', phone: '01012345678',
    adminUser: null, authIdentities: [{ id: 'identity-1' }], _count: counts,
  },
});
const phoneRelease = {
  where: {
    id: 'user-1', accountStatus: 'active',
    onboardingStatus: { in: ['social_terms_required', 'social_profile_required'] }, phone: { not: null },
  },
  data: { phone: null, phoneVerifiedAt: null },
};
const phoneReleaseLog = {
  data: { targetType: 'user_phone', targetId: 'user-1', fromStatus: 'signup', toStatus: 'released', actorType: 'system', actorUserId: null, reason: 'expired_signup' },
};
const expiredAt = () => new Date(Date.now() - 25 * 60 * 60 * 1000);

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
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
    v1StatusChangeLog: { create: jest.fn(), findFirst: jest.fn() },
    v1UserTermsConsent: {
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

// ─── suite ──────────────────────────────────────────────────────────────────

// Conflict responses carry a signed link token, which needs the session secret.
const savedSessionSecret = process.env.V1_SESSION_SECRET;
beforeAll(() => {
  process.env.V1_SESSION_SECRET = 'x'.repeat(48);
});
afterAll(() => {
  if (savedSessionSecret === undefined) delete process.env.V1_SESSION_SECRET;
  else process.env.V1_SESSION_SECRET = savedSessionSecret;
});

/** adjective + animal + number, e.g. 씩씩한오리너구리4 */
const NICKNAME_SHAPE = /^[가-힣]+\d{1,4}$/;

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
  const NOTICE = { id: 'notice-1', targetType: 'system', targetId: null, title: '로그인 수단이 연결됐어요', body: null, deepLink: '/my/settings' };
  const notifications = { createInTransaction: jest.fn(), deliverCreated: jest.fn() };
  const CLIENT = { ip: '203.0.113.9' };

  beforeEach(async () => {
    prisma = buildPrismaMock();
    prisma.v1User.updateMany.mockResolvedValue({ count: 1 });
    phoneVerification.enabled = false;
    notifications.createInTransaction.mockResolvedValue(NOTICE);

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
        { provide: NotificationsService, useValue: notifications },
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

      // email lookup, release lookup for the proven phone, registered-phone lookup, then the session read.
      prisma.v1User.findUnique
        .mockResolvedValueOnce(null)
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

  it('register: 10분이 지나 만료된 proof token → 400 PHONE_NOT_VERIFIED (가입 진행 안 함)', async () => {
    phoneVerification.enabled = true;
    const phone = '01012345678';
    const expiredToken = issuePhoneProofToken(phone, 'signup', Date.now() - 11 * 60 * 1000);
    prisma.v1User.findUnique.mockResolvedValue(null);
    prisma.v1UserProfile.findFirst.mockResolvedValue(null);

    await expect(service.register(registerInput({ phone, phoneProofToken: expiredToken }))).rejects.toMatchObject({
      status: 400,
      response: { code: 'PHONE_NOT_VERIFIED' },
    });
    expect(prisma.v1User.create).not.toHaveBeenCalled();
  });

  describe('register: 가입을 그만둔 소셜 계정이 쥔 번호', () => {
    const phone = '01012345678';
    const holderRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'user-1', accountStatus: 'active', onboardingStatus: 'social_profile_required', createdAt: expiredAt(), updatedAt: expiredAt(), ...overrides,
    });
    const validToken = () => issuePhoneProofToken(phone);

    /** `v1_users.phone` is unique: the holder row answers every phone lookup until a release write lands. */
    function arrangeHolder(row: ReturnType<typeof holderRow> | null) {
      let released = false;
      prisma.v1User.updateMany.mockImplementation(async () => {
        released = true;
        return { count: 1 };
      });
      prisma.v1User.findUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
        if ('email' in where) return null;
        if ('phone' in where) return released ? null : row;
        return completedUserRow({ id: 'new-user', email: 'new@teameet.v1', onboardingStatus: 'signup_done', onboardingProgress: { currentStep: 'sport' } });
      });
    }

    beforeEach(() => {
      phoneVerification.enabled = true;
      prisma.v1UserProfile.findFirst.mockResolvedValue(null);
      prisma.v1TermsDocument.findMany.mockResolvedValue([]);
      prisma.v1User.create.mockResolvedValue({ id: 'new-user', email: 'new@teameet.v1' });
      prisma.v1AuthIdentity.findFirst.mockResolvedValue(signupHolder());
    });

    it('24시간이 지난 빈 가입이 쥔 번호는 증명을 마친 사람에게 풀어 주고, 가입이 이어진다', async () => {
      arrangeHolder(holderRow());

      await service.register(registerInput({ phone, phoneProofToken: validToken() }));

      expect(prisma.v1User.updateMany).toHaveBeenCalledWith({
        where: { ...phoneRelease.where, updatedAt: { lt: expect.any(Date) } },
        data: phoneRelease.data,
      });
      expect(prisma.v1StatusChangeLog.create).toHaveBeenCalledWith({
        data: { ...phoneReleaseLog.data, reason: 'expired_signup_lazy' },
      });
      expect(prisma.v1User.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ phone }) }));
    });

    it('증명이 없는 호출은 번호를 풀지 못하고 PHONE_NOT_VERIFIED 로 끝난다', async () => {
      arrangeHolder(holderRow());

      await expect(service.register(registerInput({ phone }))).rejects.toMatchObject({ response: { code: 'PHONE_NOT_VERIFIED' } });

      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
      expect(prisma.v1StatusChangeLog.create).not.toHaveBeenCalled();
    });

    it('만료된 증명으로는 번호를 풀지 못한다', async () => {
      arrangeHolder(holderRow());
      const expiredProof = issuePhoneProofToken(phone, 'signup', Date.now() - 11 * 60 * 1000);

      await expect(service.register(registerInput({ phone, phoneProofToken: expiredProof }))).rejects.toMatchObject({
        response: { code: 'PHONE_NOT_VERIFIED' },
      });

      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
    });

    // 증명 전에는 번호를 쥔 계정이 있는지 응답으로 알 수 없어야 한다.
    it.each([
      ['증명 없음', {}],
      ['변조된 증명', { phoneProofToken: 'tampered.invalid-signature' }],
      ['만료된 증명', { phoneProofToken: issuePhoneProofToken(phone, 'signup', Date.now() - 11 * 60 * 1000) }],
      ['다른 번호의 증명', { phoneProofToken: issuePhoneProofToken('01099998888') }],
    ])('%s 이면 번호를 쥔 계정이 있든 없든 응답이 같고 보유자를 조회하지 않는다', async (_name, proof) => {
      const answerFor = async (row: ReturnType<typeof holderRow> | null) => {
        arrangeHolder(row);
        const error = await service.register(registerInput({ phone, ...proof })).catch((e) => e);
        return { status: error.getStatus(), body: error.getResponse() };
      };

      const held = await answerFor(holderRow({ onboardingStatus: 'completed' }));
      prisma.v1User.findUnique.mockClear();
      const free = await answerFor(null);

      expect(held).toEqual(free);
      expect(held).toMatchObject({ status: 400, body: { code: 'PHONE_NOT_VERIFIED' } });
      const lookedUpByPhone = prisma.v1User.findUnique.mock.calls.some(([args]) => 'phone' in args.where);
      expect(lookedUpByPhone).toBe(false);
    });

    describe('같은 번호로 증명을 마친 두 가입이 동시에 들어올 때', () => {
      const uniqueViolation = (target: string[]) =>
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test', meta: { target } });

      it('번호 유일 제약에 늦게 걸린 쪽은 조회에서 걸렸을 때와 같은 PHONE_CONFLICT 를 받는다', async () => {
        arrangeHolder(null);
        prisma.v1User.create.mockRejectedValue(uniqueViolation(['phone']));

        const error = await service.register(registerInput({ phone, phoneProofToken: validToken() })).catch((e) => e);

        expect(error).toBeInstanceOf(ConflictException);
        expect(error.getResponse()).toEqual({ code: 'PHONE_CONFLICT', message: 'Phone is already registered' });
      });

      it('이메일 유일 제약 위반은 PHONE_CONFLICT 로 바꾸지 않는다', async () => {
        arrangeHolder(null);
        const violation = uniqueViolation(['email']);
        prisma.v1User.create.mockRejectedValue(violation);

        await expect(service.register(registerInput({ phone, phoneProofToken: validToken() }))).rejects.toBe(violation);
      });
    });

    it('활동이 남은 계정이 쥔 번호는 증명이 있어도 풀리지 않고 PHONE_CONFLICT 다', async () => {
      arrangeHolder(holderRow());
      prisma.v1AuthIdentity.findFirst.mockResolvedValue(signupHolder({ ...zeroActivityCounts, teamMemberships: 1 }));

      await expect(service.register(registerInput({ phone, phoneProofToken: validToken() }))).rejects.toMatchObject({
        response: { code: 'PHONE_CONFLICT' },
      });

      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
      expect(prisma.v1User.create).not.toHaveBeenCalled();
    });

    it.each([
      ['아직 24시간이 안 된 가입', { createdAt: new Date(), updatedAt: new Date() }],
      ['가입을 마친 계정', { onboardingStatus: 'completed' }],
      ['프로필을 미룬 계정', { onboardingStatus: 'social_profile_deferred' }],
      ['탈퇴 대기 계정', { accountStatus: 'withdrawal_pending', onboardingStatus: 'completed' }],
    ])('%s 이 쥔 번호는 증명이 있어도 풀리지 않는다', async (_name, overrides) => {
      arrangeHolder(holderRow(overrides));

      await expect(service.register(registerInput({ phone, phoneProofToken: validToken() }))).rejects.toMatchObject({
        response: { code: 'PHONE_CONFLICT' },
      });

      expect(prisma.v1AuthIdentity.findFirst).not.toHaveBeenCalled();
      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
    });
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

  it('login: 비밀번호를 확인한 사이 재설정으로 해시가 바뀌면 세션 없이 401, 통과하면 확인 때 읽은 세션 번호를 넘긴다', async () => {
    const hash = await hashPassword('ValidPass1!');
    prisma.v1AuthIdentity.findUnique.mockResolvedValue({
      id: 'identity-1',
      passwordHash: hash,
      status: 'active',
      user: { id: 'user-1', email: 'user@teameet.v1', accountStatus: 'active', onboardingStatus: 'completed', createdAt: NOW, updatedAt: NOW, sessionEpoch: 4 },
    });
    jest.spyOn(service, 'me').mockResolvedValue({
      user: { id: 'user-1', email: 'user@teameet.v1' },
      onboarding: { status: 'completed', missing: [] },
    } as unknown as Awaited<ReturnType<AuthService['me']>>);

    prisma.v1AuthIdentity.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.login({ email: 'user@teameet.v1', password: 'ValidPass1!' }, CLIENT)).rejects.toMatchObject({
      response: { code: 'UNAUTHENTICATED' },
    });
    expect(prisma.v1AuthIdentity.updateMany).toHaveBeenCalledWith({
      where: { id: 'identity-1', passwordHash: hash },
      data: { lastLoginAt: expect.any(Date) },
    });

    const result = await service.login({ email: 'user@teameet.v1', password: 'ValidPass1!' }, CLIENT);
    expect(result).toMatchObject({ session: { userId: 'user-1', sessionEpoch: 4 } });
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

  describe('login: withdrawal_pending account', () => {
    const pendingIdentity = async (status = 'active') => ({
      id: 'identity-1',
      passwordHash: await hashPassword('ValidPass1!'),
      status,
      user: {
        id: 'user-1',
        email: 'user@teameet.v1',
        accountStatus: 'withdrawal_pending', // ← 탈퇴 신청 상태
        onboardingStatus: 'completed',
        createdAt: NOW,
        updatedAt: NOW,
        sessionEpoch: 6,
      },
    });
    const secret = process.env.V1_SESSION_SECRET;
    beforeAll(() => { process.env.V1_SESSION_SECRET = 'x'.repeat(48); });
    afterAll(() => {
      if (secret === undefined) delete process.env.V1_SESSION_SECRET;
      else process.env.V1_SESSION_SECRET = secret;
    });

    it('right password → 403 ACCOUNT_WITHDRAWAL_PENDING carrying a cancel token bound to the account and its epoch', async () => {
      prisma.v1AuthIdentity.findUnique.mockResolvedValue(await pendingIdentity());

      const failure = (await service
        .login({ email: 'user@teameet.v1', password: 'ValidPass1!' }, CLIENT)
        .catch((error: unknown) => error)) as {
        getStatus(): number;
        getResponse(): { code: string; details: { withdrawalCancelToken: string; expiresInSeconds: number } };
      };

      expect(failure.getStatus()).toBe(403);
      expect(failure.getResponse().code).toBe('ACCOUNT_WITHDRAWAL_PENDING');
      expect(failure.getResponse().details.expiresInSeconds).toBe(600);
      expect(readWithdrawalCancelToken(failure.getResponse().details.withdrawalCancelToken)).toEqual({ userId: 'user-1', sessionEpoch: 6 });
    });

    it('wrong password → the same generic 401 as any account, with no sign of the account state', async () => {
      prisma.v1AuthIdentity.findUnique.mockResolvedValue(await pendingIdentity());

      await expect(
        service.login({ email: 'user@teameet.v1', password: 'WrongPass1!' }, CLIENT),
      ).rejects.toMatchObject({ status: 401, response: { code: 'UNAUTHENTICATED' } });
      expect(loginSecurity.record).toHaveBeenCalledWith('failed', expect.anything());
    });

    it('right password but a suspended sign-in identity → still no token', async () => {
      prisma.v1AuthIdentity.findUnique.mockResolvedValue(await pendingIdentity('suspended'));

      await expect(
        service.login({ email: 'user@teameet.v1', password: 'ValidPass1!' }, CLIENT),
      ).rejects.toMatchObject({ status: 403, response: { code: 'ACCOUNT_WITHDRAWAL_PENDING' } });
      await expect(
        service.login({ email: 'user@teameet.v1', password: 'ValidPass1!' }, CLIENT),
      ).rejects.not.toHaveProperty('response.details');
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

  describe('abandoned social signup releases the number it saved on a completion call', () => {
    it('completeSocialTerms: 만료 리셋이 가입 대기 계정의 번호를 비운다', async () => {
      const expiredUser = pendingSocialUserRow({ createdAt: expiredAt(), updatedAt: expiredAt() });
      prisma.v1User.findUnique.mockResolvedValue(expiredUser);
      prisma.v1AuthIdentity.findFirst.mockResolvedValue(signupHolder());

      await expect(
        service.completeSocialTerms('user-1', { requiredTermsAccepted: true, ageConfirmed: true }),
      ).rejects.toMatchObject({ response: { code: 'SOCIAL_SIGNUP_EXPIRED' } });

      expect(prisma.v1User.updateMany).toHaveBeenCalledWith(phoneRelease);
      expect(prisma.v1StatusChangeLog.create).toHaveBeenCalledWith(phoneReleaseLog);
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
    const ageDraft = { ageConfirmedAt: expect.any(String), autoNickname: expect.stringMatching(NICKNAME_SHAPE) };
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
      draftJson: { kakaoName: '홍길동', kakaoGender: 'female' },
    });

    await service.completeSocialTerms('user-1', { requiredTermsAccepted: true, ageConfirmed: true });

    const draft = { kakaoName: '홍길동', kakaoGender: 'female', ageConfirmedAt: expect.any(String), autoNickname: expect.stringMatching(NICKNAME_SHAPE) };
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

    it('register: recordConsent 생략 시 공개 기본값을 저장한다', async () => {
      arrangeRegister();
      await service.register(registerInput());
      expect(prisma.v1UserRecordConsent.upsert).toHaveBeenCalledWith({
        where: { userId: 'new-user' }, update: {},
        create: { userId: 'new-user', state: 'GRANTED', policyHash: 'v1-public-record-default-2' },
      });
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

    it('completeSocialProfile: recordConsent 생략 시 공개 기본값을 저장한다', async () => {
      arrangeSocialProfile();
      await service.completeSocialProfile('user-1', socialInput);
      expect(prisma.v1UserRecordConsent.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' }, update: {},
        create: { userId: 'user-1', state: 'GRANTED', policyHash: 'v1-public-record-default-2' },
      });
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
    const input = { displayName: '회원', phone: '01012345678', gender: 'female' as const, birthDate: '20000229' };
    function arrange(
      draft: Record<string, unknown>,
      provider: V1AuthProvider = V1AuthProvider.kakao,
      proof?: { phone: string; phoneVerifiedAt: Date },
    ) {
      phoneVerification.enabled = true;
      // signup row, [SMS proof row], release lookup for the proven phone (nobody holds it), session read.
      const reads = [
        pendingSocialUserRow({
          onboardingStatus: 'social_profile_required', createdAt: new Date(), updatedAt: new Date(),
          onboardingProgress: { draftJson: draft }, authIdentities: [{ id: 'i', provider, providerUserKey: `${provider}-key-1` }],
        }),
        ...(proof ? [proof] : []),
        null,
        completedUserRow({ onboardingStatus: 'signup_done' }),
      ];
      for (const read of reads) prisma.v1User.findUnique.mockResolvedValueOnce(read);
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
      [{ kakaoPhone: input.phone }, V1AuthProvider.apple],
    ])('does not accept a missing or unrelated provider phone without verification', async (draft, provider) => {
      arrange(draft, provider);
      await expect(service.completeSocialProfile('user-1', input)).rejects.toMatchObject({ response: { code: 'PHONE_NOT_VERIFIED' } });
      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
    });
    it('rejects a changed Kakao-provided phone during signup even if the alternate number was SMS verified', async () => {
      arrange({ kakaoPhone: '01099998888' }, V1AuthProvider.kakao, { phone: input.phone, phoneVerifiedAt: new Date() });
      await expect(service.completeSocialProfile('user-1', input)).rejects.toMatchObject({ response: { code: 'KAKAO_PHONE_CHANGE_FORBIDDEN' } });
      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
      expect(prisma.v1User.findFirst).not.toHaveBeenCalled();
    });
    it('frees the number Kakao handed over when an expired, abandoned signup still holds it, then completes', async () => {
      phoneVerification.enabled = true;
      let released = false;
      let idReads = 0;
      const holder = { id: 'holder-1', accountStatus: 'active', onboardingStatus: 'social_profile_required', createdAt: expiredAt(), updatedAt: expiredAt() };
      prisma.v1User.findUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
        if ('phone' in where) return released ? null : holder;
        return idReads++ === 0
          ? pendingSocialUserRow({
              onboardingStatus: 'social_profile_required', createdAt: new Date(), updatedAt: new Date(),
              onboardingProgress: { draftJson: { kakaoPhone: input.phone } }, authIdentities: [{ id: 'i', provider: V1AuthProvider.kakao, providerUserKey: 'kakao-key-1' }],
            })
          : completedUserRow({ onboardingStatus: 'signup_done' });
      });
      prisma.v1User.findFirst.mockImplementation(async () => (released ? null : { id: 'holder-1', accountStatus: 'active' }));
      prisma.v1User.updateMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
        if ('phone' in where) released = true;
        return { count: 1 };
      });
      prisma.v1AuthIdentity.findFirst.mockResolvedValue(signupHolder());

      await service.completeSocialProfile('user-1', input);

      expect(prisma.v1StatusChangeLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ targetId: 'holder-1', reason: 'expired_signup_lazy' }),
      });
      expect(prisma.v1User.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ phone: input.phone, phoneVerifiedAt: expect.any(Date) }),
      }));
    });
    it('does not transfer a phone already owned by another user, and for the number Kakao itself handed over links the signup to that owner', async () => {
      arrange({ kakaoPhone: input.phone }, V1AuthProvider.kakao);
      prisma.v1User.findFirst.mockResolvedValue({ id: 'other-user' });
      const error = await service.completeSocialProfile('user-1', input).catch((e) => e);
      expect(error.getResponse()).toMatchObject({
        code: 'PHONE_CONFLICT',
        details: { next: 'sign_in_then_link', provider: 'kakao', linkTokenExpiresInSeconds: 1800 },
      });
      // The token names this very signup and its login, so linking can later move exactly that identity,
      // and only the owner of the number may spend it.
      expect(readSocialLinkToken(error.getResponse().details.linkToken)).toEqual({
        kind: 'pending_account', provider: 'kakao', providerUserKey: 'kakao-key-1',
        pendingAccount: socialLinkAccountDigest('user-1'),
        allowedAccounts: [socialLinkAccountDigest('other-user')],
      });
      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
    });
    it('says until when a withdrawal holds the Kakao-proven number', async () => {
      arrange({ kakaoPhone: input.phone }, V1AuthProvider.kakao);
      prisma.v1User.findFirst.mockResolvedValue({ id: 'other-user', accountStatus: 'withdrawal_pending' });
      prisma.v1StatusChangeLog.findFirst.mockResolvedValue({ createdAt: new Date('2026-10-08T08:28:00.000Z') });
      const pending = await service.completeSocialProfile('user-1', input).catch((e) => e);
      expect(pending.getResponse()).toMatchObject({
        code: 'PHONE_CONFLICT',
        details: { next: 'sign_in_then_link', withdrawalPendingUntil: '2026-11-07T08:28:00.000Z' },
      });
      expect(prisma.v1StatusChangeLog.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ targetId: 'other-user', toStatus: 'withdrawal_pending' }),
      }));
    });
    it('says nothing of a withdrawal when an active account holds the Kakao-proven number', async () => {
      arrange({ kakaoPhone: input.phone }, V1AuthProvider.kakao);
      prisma.v1User.findFirst.mockResolvedValue({ id: 'other-user', accountStatus: 'active' });
      const active = await service.completeSocialProfile('user-1', input).catch((e) => e);
      expect(active.getResponse()).toMatchObject({ code: 'PHONE_CONFLICT', details: { next: 'sign_in_then_link' } });
      expect(active.getResponse().details).not.toHaveProperty('withdrawalPendingUntil');
    });

    // A typed number is proven by its SMS code before anything is said about who holds it — otherwise the form
    // would tell anyone, holding the number or not, whether it is registered.
    it.each([
      ['a Kakao signup that typed another number', {}, V1AuthProvider.kakao],
      ['an Apple signup', { kakaoPhone: input.phone }, V1AuthProvider.apple],
    ])('asks %s for the SMS proof first and does not look up the holder', async (_name, draft, provider) => {
      arrange(draft, provider);
      prisma.v1User.findFirst.mockResolvedValue({ id: 'other-user' });

      const error = await service.completeSocialProfile('user-1', input).catch((e) => e);

      expect(error.getResponse()).toMatchObject({ code: 'PHONE_NOT_VERIFIED' });
      expect(JSON.stringify(error.getResponse())).not.toContain('PHONE_CONFLICT');
      expect(prisma.v1User.findFirst).not.toHaveBeenCalled();
      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
    });

    it('answers a typed number that was proven by SMS with the holder-bound token', async () => {
      arrange({}, V1AuthProvider.apple, { phone: input.phone, phoneVerifiedAt: new Date() });
      prisma.v1User.findFirst.mockResolvedValue({ id: 'other-user' });

      const error = await service.completeSocialProfile('user-1', input).catch((e) => e);

      expect(error.getResponse()).toMatchObject({ code: 'PHONE_CONFLICT', details: { provider: 'apple', linkTokenExpiresInSeconds: 1800 } });
      expect(readSocialLinkToken(error.getResponse().details.linkToken)?.allowedAccounts).toEqual([socialLinkAccountDigest('other-user')]);
    });

    it('gives the advice without a token for a typed number when SMS proof is switched off', async () => {
      arrange({}, V1AuthProvider.kakao);
      phoneVerification.enabled = false;
      prisma.v1User.findFirst.mockResolvedValue({ id: 'other-user', accountStatus: 'withdrawal_pending' });

      const error = await service.completeSocialProfile('user-1', input).catch((e) => e);

      expect(error.getResponse()).toMatchObject({ code: 'PHONE_CONFLICT', details: { next: 'sign_in_then_link', provider: 'kakao' } });
      expect(error.getResponse().details).not.toHaveProperty('linkToken');
      expect(error.getResponse().details).not.toHaveProperty('withdrawalPendingUntil');
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
          nickname: expect.stringMatching(NICKNAME_SHAPE),
          displayName: '소셜 유저',
          realName: '소셜 유저',
          gender: 'female',
          birthDate: '19991231',
          profileImageUrl: '/mock/profile-social.jpg',
          visibility: 'public',
        },
        create: {
          userId: 'user-1',
          nickname: expect.stringMatching(NICKNAME_SHAPE),
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
      where: { id: 'user-1', accountStatus: 'active', onboardingStatus: 'social_profile_required' },
      data: { onboardingStatus: 'signup_done', phone: '01087654321', signupEmailLoginRequired: false },
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
        onboardingProgress: { currentStep: 'signup', draftJson: { kakaoName: '홍길동', ageConfirmedAt: '2026-10-11T00:00:00.000Z' } },
        createdAt: now,
        updatedAt: now,
        ...overrides,
      });
    };
    const appleIdentity = [{ id: 'identity-1', provider: V1AuthProvider.apple, passwordHash: null }];
    const freshAppleProfileRequired = (overrides: Record<string, unknown> = {}) =>
      freshProfileRequired({ authIdentities: appleIdentity, ...overrides });
    const socialProfileInput = {
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
      prisma.v1UserOnboardingProgress.findUnique.mockResolvedValue({ draftJson: { kakaoName: '홍길동' } });
      prisma.v1TermsDocument.findMany.mockResolvedValue([]);

      await service.completeSocialTerms('user-1', {
        requiredTermsAccepted: true,
        ageConfirmed: true,
        acceptedTermsDocumentIds: ['11111111-1111-4111-8111-111111111111'],
      });

      const call = prisma.v1UserOnboardingProgress.upsert.mock.calls[0][0];
      expect(call.update.draftJson).toEqual({
        kakaoName: '홍길동',
        ageConfirmedAt: expect.any(String),
        autoNickname: expect.stringMatching(NICKNAME_SHAPE),
      });
      expect(Number.isNaN(Date.parse(call.update.draftJson.ageConfirmedAt))).toBe(false);
    });

    it('deferSocialProfile: 가입 때 정해 둔 자동 닉네임으로 프로필을 만들고 social_profile_deferred 로 전이한다', async () => {
      prisma.v1User.findUnique
        .mockResolvedValueOnce(freshAppleProfileRequired({ onboardingProgress: { currentStep: 'signup', draftJson: { kakaoName: '홍길동', autoNickname: '씩씩한수달3', ageConfirmedAt: '2026-10-11T00:00:00.000Z' } } }))
        .mockResolvedValue(completedUserRow({ onboardingStatus: 'social_profile_deferred' }));
      prisma.v1UserProfile.findFirst.mockResolvedValue(null);

      const result = await service.deferSocialProfile('user-1');

      expect(prisma.v1User.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', onboardingStatus: 'social_profile_required' },
        data: { onboardingStatus: 'social_profile_deferred', signupEmailLoginRequired: false },
      });
      expect(prisma.v1UserProfile.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        update: { nickname: '씩씩한수달3', visibility: 'public' },
        create: { userId: 'user-1', nickname: '씩씩한수달3', visibility: 'public' },
      });
      expect(result.next).toBeUndefined();
      expect(result.onboarding.status).toBe('social_profile_deferred');
      // Deferring leaves the draft alone: the provider values stay until the profile is actually finished.
      expect(prisma.v1UserOnboardingProgress.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        update: { currentStep: 'confirm' },
        create: { userId: 'user-1', currentStep: 'confirm' },
      });
      expect(prisma.v1UserRecordConsent.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' }, update: {},
        create: { userId: 'user-1', state: 'GRANTED', policyHash: 'v1-public-record-default-2' },
      });
    });

    it('deferSocialProfile: 정해 둔 닉네임을 그새 누가 쓰면 새 랜덤 닉네임을 만든다 (카카오 이름은 쓰지 않는다)', async () => {
      prisma.v1User.findUnique
        .mockResolvedValueOnce(freshAppleProfileRequired({ onboardingProgress: { currentStep: 'signup', draftJson: { kakaoName: '홍길동', autoNickname: '씩씩한수달3', ageConfirmedAt: '2026-10-11T00:00:00.000Z' } } }))
        .mockResolvedValue(completedUserRow({ onboardingStatus: 'social_profile_deferred' }));
      prisma.v1UserProfile.findFirst
        .mockResolvedValueOnce({ id: 'someone' })
        .mockResolvedValue(null);

      await service.deferSocialProfile('user-1');

      const { create } = prisma.v1UserProfile.upsert.mock.calls[0][0];
      expect(create.nickname).toMatch(NICKNAME_SHAPE);
      expect(create.nickname).not.toBe('씩씩한수달3');
      expect(create.nickname).not.toContain('홍길동');
    });

    it('deferSocialProfile: 미리 정한 닉네임이 없어도 카카오 이름과 무관한 랜덤 닉네임을 만든다', async () => {
      prisma.v1User.findUnique
        .mockResolvedValueOnce(freshAppleProfileRequired())
        .mockResolvedValue(completedUserRow({ onboardingStatus: 'social_profile_deferred' }));
      prisma.v1UserProfile.findFirst.mockResolvedValue(null);

      await service.deferSocialProfile('user-1');

      const { create } = prisma.v1UserProfile.upsert.mock.calls[0][0];
      expect(create.nickname).toMatch(NICKNAME_SHAPE);
      expect(create.nickname).not.toContain('홍길동');
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

    describe('deferSocialProfile: 카카오 가입은 미룰 수 없다', () => {
      const completeDraft = { kakaoName: '홍길동', kakaoPhone: '01012345678', kakaoGender: 'female', kakaoBirthDate: '20000229', ageConfirmedAt: '2026-10-11T00:00:00.000Z' };
      const emptyDraft = { ageConfirmedAt: '2026-10-11T00:00:00.000Z' };
      const unlinkedDraft = { autoNickname: '씩씩한수달3', ageConfirmedAt: '2026-10-11T00:00:00.000Z' };

      it.each([
        ['카카오가 값을 모두 준 가입', completeDraft],
        ['카카오가 값을 하나도 주지 않은 가입', emptyDraft],
        ['카카오 값 키가 지워진 임시 저장 칸 (연결 해제 알림 뒤)', unlinkedDraft],
      ])('%s → 409 SOCIAL_PROFILE_DEFER_UNAVAILABLE, 상태와 임시 저장 칸이 그대로다', async (_label, draftJson) => {
        prisma.v1User.findUnique.mockResolvedValue(freshProfileRequired({ onboardingProgress: { currentStep: 'signup', draftJson } }));

        await expect(service.deferSocialProfile('user-1')).rejects.toMatchObject({
          status: 409,
          response: { code: 'SOCIAL_PROFILE_DEFER_UNAVAILABLE' },
        });
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
        expect(prisma.v1UserProfile.upsert).not.toHaveBeenCalled();
        expect(prisma.v1UserOnboardingProgress.upsert).not.toHaveBeenCalled();
      });

      it('기존 검사의 순서를 바꾸지 않는다 — 약관 단계는 TERMS_REQUIRED, 만료는 401 로 먼저 거절된다', async () => {
        prisma.v1User.findUnique.mockResolvedValueOnce(freshProfileRequired({ onboardingStatus: 'social_terms_required' }));
        await expect(service.deferSocialProfile('user-1')).rejects.toMatchObject({ status: 400, response: { code: 'TERMS_REQUIRED' } });

        const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
        const expired = freshProfileRequired({ createdAt: old, updatedAt: old });
        prisma.v1User.findUnique.mockResolvedValueOnce(expired);
        prisma.v1User.update.mockResolvedValue(expired);
        await expect(service.deferSocialProfile('user-1')).rejects.toMatchObject({ status: 401, response: { code: 'SOCIAL_SIGNUP_EXPIRED' } });
      });

      it('Apple 가입은 같은 임시 저장 칸으로도 미룰 수 있다', async () => {
        prisma.v1User.findUnique
          .mockResolvedValueOnce(freshAppleProfileRequired({ onboardingProgress: { currentStep: 'signup', draftJson: emptyDraft } }))
          .mockResolvedValue(completedUserRow({ onboardingStatus: 'social_profile_deferred' }));
        prisma.v1UserProfile.findFirst.mockResolvedValue(null);

        const result = await service.deferSocialProfile('user-1');

        expect(result.onboarding.status).toBe('social_profile_deferred');
        expect(prisma.v1User.updateMany).toHaveBeenCalledWith(expect.objectContaining({
          data: expect.objectContaining({ onboardingStatus: 'social_profile_deferred' }),
        }));
      });
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
        onboardingProgress: { currentStep: 'signup', draftJson: { kakaoName: '홍길동' } },
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
        onboardingProgress: { currentStep: 'signup', draftJson: { kakaoName: '홍길동' } },
      }));
      prisma.v1User.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.deferSocialProfile('user-1')).rejects.toMatchObject({
        response: { code: 'TERMS_REQUIRED' },
      });
      expect(prisma.v1UserOnboardingProgress.upsert).not.toHaveBeenCalled();
    });

    it('deferSocialProfile: 상태 CAS 실패 시 프로필을 만들지 않는다', async () => {
      prisma.v1User.findUnique.mockResolvedValue(freshAppleProfileRequired());
      prisma.v1UserProfile.findFirst.mockResolvedValue(null);
      prisma.v1User.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.deferSocialProfile('user-1')).rejects.toMatchObject({ status: 400 });
      expect(prisma.v1UserProfile.upsert).not.toHaveBeenCalled();
    });

    it('completeSocialProfile: deferred 에서 완료하면 상태가 deferred 로 가고 기존 닉네임을 그대로 둔다', async () => {
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

      // The deferred account keeps the nickname it already has (it may have changed it); nothing is re-generated.
      expect(prisma.v1UserProfile.upsert.mock.calls[0][0].update).not.toHaveProperty('nickname');
      expect(prisma.v1User.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', accountStatus: 'active', onboardingStatus: 'social_profile_deferred' },
        data: { onboardingStatus: 'deferred', phone: '01087654321', signupEmailLoginRequired: false },
      });
      expect(prisma.v1UserOnboardingProgress.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ currentStep: 'confirm' }),
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
        where: { id: 'user-1', accountStatus: 'active', onboardingStatus: 'social_profile_required' },
        data: { onboardingStatus: 'signup_done', phone: '01087654321', signupEmailLoginRequired: false },
      });
    });

    describe('completeSocialProfile: 제공자가 준 값은 가입을 끝낼 때 draft 에서 지운다', () => {
      const providerValues = { kakaoName: '홍길동', kakaoPhone: '01012345678', kakaoGender: 'female', kakaoBirthDate: '20000229' };
      const keptKeys = { ageConfirmedAt: '2026-10-11T00:00:00.000Z', autoNickname: '씩씩한수달3' };

      it.each([
        ['social_profile_required', 'signup_done', 'sport'],
        ['social_profile_deferred', 'deferred', 'confirm'],
      ])('%s 에서 끝내면 이름·전화·성별·생일 값만 지우고 나머지 키는 그대로 둔다', async (status, finalStatus, step) => {
        const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
        prisma.v1User.findUnique
          .mockResolvedValueOnce(freshProfileRequired({
            onboardingStatus: status,
            ...(status === 'social_profile_deferred' ? { createdAt: old, updatedAt: old } : {}),
          }))
          .mockResolvedValue(completedUserRow({ onboardingStatus: finalStatus }));
        // The draft is re-read inside the transaction; a login that merged a seed after the outer read must not be lost.
        prisma.v1UserOnboardingProgress.findUnique.mockResolvedValue({ draftJson: { ...keptKeys, ...providerValues } });
        prisma.v1UserProfile.findFirst.mockResolvedValue(null);
        prisma.v1User.findFirst.mockResolvedValue(null);

        await service.completeSocialProfile('user-1', socialProfileInput);

        expect(prisma.v1UserOnboardingProgress.upsert).toHaveBeenCalledWith({
          where: { userId: 'user-1' },
          update: { currentStep: step, draftJson: keptKeys },
          create: { userId: 'user-1', currentStep: step, draftJson: keptKeys },
        });
      });

      it('Apple 이 준 이름도 같은 방식으로 지운다', async () => {
        prisma.v1User.findUnique
          .mockResolvedValueOnce(freshProfileRequired())
          .mockResolvedValue(completedUserRow({ onboardingStatus: 'signup_done' }));
        prisma.v1UserOnboardingProgress.findUnique.mockResolvedValue({ draftJson: { ...keptKeys, appleName: '김애플' } });
        prisma.v1UserProfile.findFirst.mockResolvedValue(null);
        prisma.v1User.findFirst.mockResolvedValue(null);

        await service.completeSocialProfile('user-1', socialProfileInput);

        expect(prisma.v1UserOnboardingProgress.upsert).toHaveBeenCalledWith(expect.objectContaining({
          update: { currentStep: 'sport', draftJson: keptKeys },
        }));
      });

      it('가입이 거부되면 draft 를 건드리지 않는다', async () => {
        prisma.v1User.findUnique.mockResolvedValueOnce(freshProfileRequired());
        prisma.v1UserProfile.findFirst.mockResolvedValue(null);
        prisma.v1User.findFirst.mockResolvedValue(null);
        prisma.v1User.updateMany.mockResolvedValue({ count: 0 });

        await expect(service.completeSocialProfile('user-1', socialProfileInput)).rejects.toMatchObject({ status: 400 });

        expect(prisma.v1UserOnboardingProgress.upsert).not.toHaveBeenCalled();
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

    it('탈퇴 신청 중인 계정은 토큰이 검증된 경우에만 철회 토큰과 함께 403 을 받는다', async () => {
      process.env.V1_SESSION_SECRET = 'x'.repeat(48);
      const pending = (status: string) => ({
        id: 'identity-1',
        status,
        user: { id: 'user-1', email: null, accountStatus: 'withdrawal_pending', onboardingStatus: 'completed', createdAt: NOW, updatedAt: NOW, sessionEpoch: 2 },
      });

      stubKakao([tokenInfo(123456), me()]);
      prisma.v1AuthIdentity.findUnique.mockResolvedValue(pending('active'));
      const failure = (await service.kakaoTokenLogin({ accessToken: TOKEN }).catch((error: unknown) => error)) as {
        getResponse(): { code: string; details: { withdrawalCancelToken: string } };
      };
      expect(failure.getResponse().code).toBe('ACCOUNT_WITHDRAWAL_PENDING');
      expect(readWithdrawalCancelToken(failure.getResponse().details.withdrawalCancelToken)).toEqual({ userId: 'user-1', sessionEpoch: 2 });

      stubKakao([tokenInfo(123456), me()]);
      prisma.v1AuthIdentity.findUnique.mockResolvedValue(pending('unlinked'));
      await expect(service.kakaoTokenLogin({ accessToken: TOKEN })).rejects.not.toHaveProperty('response.details');

      stubKakao([tokenInfo(999999)]);
      await expect(service.kakaoTokenLogin({ accessToken: TOKEN })).rejects.toMatchObject({ status: 401 });
    });

    it('스스로 해제한 카카오 로그인은 LOGIN_METHOD_UNLINKED, 정지·차단된 계정은 그대로 PERMISSION_DENIED 로 거절한다', async () => {
      const held = (identityStatus: string, accountStatus: string) => ({
        id: 'identity-1',
        status: identityStatus,
        user: { id: 'user-1', email: null, accountStatus, onboardingStatus: 'completed', createdAt: NOW, updatedAt: NOW, sessionEpoch: 2 },
      });
      const refusal = async (identityStatus: string, accountStatus: string) => {
        stubKakao([tokenInfo(123456), me()]);
        prisma.v1AuthIdentity.findUnique.mockResolvedValue(held(identityStatus, accountStatus));
        return (await service.kakaoTokenLogin({ accessToken: TOKEN }).catch((error: unknown) => error)) as {
          getStatus(): number;
          getResponse(): { code: string };
        };
      };

      const unlinked = await refusal('unlinked', 'active');
      expect([unlinked.getStatus(), unlinked.getResponse().code]).toEqual([403, 'LOGIN_METHOD_UNLINKED']);

      for (const [identityStatus, accountStatus] of [['blocked', 'active'], ['active', 'suspended'], ['unlinked', 'suspended']]) {
        const blocked = await refusal(identityStatus, accountStatus);
        expect([blocked.getStatus(), blocked.getResponse().code]).toEqual([403, 'PERMISSION_DENIED']);
      }
      expect(prisma.v1User.create).not.toHaveBeenCalled();
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

      const error = await service.kakaoTokenLogin({ accessToken: TOKEN }).catch((e) => e);
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({
        code: 'SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL',
        details: { next: 'sign_in_then_link', provider: 'kakao', linkToken: expect.any(String), linkTokenExpiresInSeconds: 1800 },
      });
      // The token holds what Kakao just vouched for — the identity, and no email because Kakao did not verify it —
      // and may only be spent by the member whose email it collided with.
      expect(readSocialLinkToken(error.getResponse().details.linkToken)).toEqual({
        kind: 'verified_identity', provider: 'kakao', providerUserKey: '779', email: null,
        allowedAccounts: [socialLinkAccountDigest('victim-local')],
      });
      expect(prisma.v1AuthIdentity.create).not.toHaveBeenCalled();
    });

    it('신규 가입은 code 경로와 같은 user 생성 payload 를 만든다', async () => {
      const profile = { id: 5150, kakao_account: { name: '홍길동', gender: 'female', profile: { nickname: '카카오닉' } } };
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
      expect(viaToken.data.onboardingProgress.create.draftJson).toEqual({
        kakaoName: '홍길동',
        kakaoPhone: null,
        kakaoGender: 'female',
        kakaoBirthDate: null,
      });
    });

    const verifiedKakaoAccount = {
      email: 'member@example.com', is_email_valid: true, is_email_verified: true,
      phone_number: '+82 10-1234-5678', name: '회원', gender: 'female',
      birthyear: '2000', birthday: '0229', birthday_type: 'SOLAR',
    };
    const contactOwner = {
      id: 'email-member', email: 'member@example.com', phone: '01012345678',
      accountStatus: 'active', emailVerifiedAt: NOW, phoneVerifiedAt: NOW, adminUser: null,
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
    describe('login that matches an existing account by its verified email', () => {
      const emailOnly = { email: verifiedKakaoAccount.email, is_email_valid: true, is_email_verified: true };
      const arrange = (owner: Record<string, unknown> = contactOwner) => {
        stubKakao([tokenInfo(123456), me({ id: 4994014420, kakao_account: emailOnly })]);
        prisma.v1User.findUnique.mockResolvedValueOnce(owner).mockResolvedValueOnce(owner).mockResolvedValue(completedUserRow({ id: contactOwner.id }));
        prisma.v1AuthIdentity.create.mockResolvedValue({ id: 'new-kakao-identity' });
      };
      const expectUntouched = () => {
        expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
        expect(prisma.v1AuthIdentity.create).not.toHaveBeenCalled();
        expect(prisma.v1StatusChangeLog.create).not.toHaveBeenCalled();
        expect(prisma.v1User.create).not.toHaveBeenCalled();
        expect(notifications.createInTransaction).not.toHaveBeenCalled();
        expect(notifications.deliverCreated).not.toHaveBeenCalled();
      };

      it('stores a security notice with the link and pushes it only after the link has committed', async () => {
        arrange();
        let committed = false;
        let deliveredAfterCommit: boolean | null = null;
        const runTransaction = (prisma.$transaction as jest.Mock).getMockImplementation() as (arg: unknown) => Promise<unknown>;
        (prisma.$transaction as jest.Mock).mockImplementation(async (arg: unknown) => {
          const result = await runTransaction(arg);
          committed = true;
          return result;
        });
        notifications.deliverCreated.mockImplementation(() => { deliveredAfterCommit = committed; });

        await service.kakaoTokenLogin({ accessToken: TOKEN });

        expect(notifications.createInTransaction).toHaveBeenCalledWith(prisma, contactOwner.id, 'social_identity_linked', {
          vars: { name: '카카오' },
          businessKey: 'social-link:new-kakao-identity',
        });
        expect(notifications.deliverCreated).toHaveBeenCalledWith(contactOwner.id, 'social_identity_linked', NOTICE);
        expect(deliveredAfterCommit).toBe(true);
      });

      it('refuses a second Kakao login for an account that already has one, after the account row is locked', async () => {
        arrange();
        prisma.v1AuthIdentity.findFirst.mockResolvedValue({ id: 'older-kakao-identity' });

        await expect(service.kakaoTokenLogin({ accessToken: TOKEN })).rejects.toMatchObject({
          status: 409, response: { code: 'SOCIAL_LINK_PROVIDER_EXISTS' },
        });

        expect(prisma.v1AuthIdentity.findFirst).toHaveBeenCalledWith({
          where: { userId: contactOwner.id, provider: 'kakao', status: 'active' },
          select: { id: true },
        });
        // A login another transaction attached while this one waited for the row is only visible once the row is held.
        expect(prisma.v1User.updateMany.mock.invocationCallOrder[0]).toBeLessThan(prisma.v1AuthIdentity.findFirst.mock.invocationCallOrder[0]);
        expect(prisma.v1AuthIdentity.create).not.toHaveBeenCalled();
        expect(prisma.v1StatusChangeLog.create).not.toHaveBeenCalled();
        expect(notifications.createInTransaction).not.toHaveBeenCalled();
        expect(notifications.deliverCreated).not.toHaveBeenCalled();
        expect(prisma.v1User.create).not.toHaveBeenCalled();
      });

      it.each(['active', 'suspended'])('refuses an operator account whose admin grant is %s without touching it', async (status) => {
        arrange({ ...contactOwner, adminUser: { status } });

        await expect(service.kakaoTokenLogin({ accessToken: TOKEN })).rejects.toMatchObject({
          status: 403, response: { code: 'SOCIAL_LINK_ADMIN_FORBIDDEN' },
        });

        expectUntouched();
      });

      it('still links an account whose admin grant was revoked', async () => {
        arrange({ ...contactOwner, adminUser: { status: 'revoked' } });

        const result = await service.kakaoTokenLogin({ accessToken: TOKEN });

        expect(result.session.userId).toBe(contactOwner.id);
        expect(prisma.v1AuthIdentity.create).toHaveBeenCalledTimes(1);
      });

      it('does not tell a caller who proves only a phone number that the account is an operator account', async () => {
        const operator = { ...contactOwner, adminUser: { status: 'active' } };
        stubKakao([tokenInfo(123456), me({ id: 4994014420, kakao_account: { phone_number: verifiedKakaoAccount.phone_number } })]);
        prisma.v1User.findFirst.mockResolvedValue(operator);
        prisma.v1User.findUnique.mockResolvedValue(operator);

        await expect(service.kakaoTokenLogin({ accessToken: TOKEN })).rejects.toMatchObject({
          status: 409, response: { code: 'SOCIAL_LINK_REQUIRES_ACCOUNT_PROOF' },
        });

        expectUntouched();
      });
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
        status: 409, response: { code: 'SOCIAL_LINK_REQUIRES_ACCOUNT_PROOF', details: { next: 'sign_in_then_link', provider: 'kakao', linkToken: expect.any(String), linkTokenExpiresInSeconds: 1800 } },
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
      const error = await service.kakaoTokenLogin({ accessToken: TOKEN }).catch((e) => e);
      expect(error.getResponse()).toMatchObject({ code: 'SOCIAL_LINK_CONTACT_CONFLICT', details: { next: 'sign_in_then_link', provider: 'kakao' } });
      // Both members the contacts point to may spend the link token; nobody else.
      expect(readSocialLinkToken(error.getResponse().details.linkToken)?.allowedAccounts).toEqual([
        socialLinkAccountDigest(contactOwner.id),
        socialLinkAccountDigest('different-phone-owner'),
      ]);
      expect(prisma.v1AuthIdentity.create).not.toHaveBeenCalled();
      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
    });
    it('refuses a legacy unverified phone without changing an identity', async () => {
      const profile = { id: 4994014420, kakao_account: { phone_number: verifiedKakaoAccount.phone_number } };
      prisma.v1User.findFirst.mockResolvedValue(contactOwner);
      prisma.v1User.findUnique.mockResolvedValue({ ...contactOwner, phoneVerifiedAt: null });
      stubKakao([tokenInfo(123456), me(profile)]);
      await expect(service.kakaoTokenLogin({ accessToken: TOKEN })).rejects.toMatchObject({ response: { code: 'SOCIAL_LINK_CONTACT_CONFLICT', details: { next: 'sign_in_then_link', provider: 'kakao', linkToken: expect.any(String), linkTokenExpiresInSeconds: 1800 } } });
      expect(prisma.v1AuthIdentity.create).not.toHaveBeenCalled();
      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
    });
    describe('a contact held by a withdrawal-pending account', () => {
      const withdrawing = { ...contactOwner, accountStatus: 'withdrawal_pending' };
      beforeEach(() => {
        prisma.v1StatusChangeLog.findFirst.mockResolvedValue({ createdAt: new Date('2026-10-08T08:28:00.000Z') });
      });
      const refusal = async (account: Record<string, unknown>) => {
        stubKakao([tokenInfo(123456), me({ id: 4994014420, kakao_account: account })]);
        return (await service.kakaoTokenLogin({ accessToken: TOKEN }).catch((e: unknown) => e)) as {
          status: number;
          getResponse(): { code: string; details: { linkToken?: string; withdrawalPendingUntil?: string } };
        };
      };
      const attachedNothing = () => {
        expect(prisma.v1AuthIdentity.create).not.toHaveBeenCalled();
        expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
        expect(prisma.v1User.create).not.toHaveBeenCalled();
      };

      it.each([
        ['the verified email', { email: verifiedKakaoAccount.email, is_email_valid: true, is_email_verified: true }, 'email'],
        ['the Kakao-supplied phone', { phone_number: verifiedKakaoAccount.phone_number }, 'phone'],
      ])('answers %s match with a link token for that account and the date the withdrawal becomes final', async (_name, account, via) => {
        prisma.v1User.findUnique.mockResolvedValue(withdrawing);
        if (via === 'phone') prisma.v1User.findFirst.mockResolvedValue(withdrawing);

        const error = await refusal(account);

        expect(error.status).toBe(409);
        expect(error.getResponse()).toMatchObject({
          code: 'SOCIAL_LINK_REQUIRES_ACCOUNT_PROOF',
          details: { next: 'sign_in_then_link', provider: 'kakao', linkTokenExpiresInSeconds: 1800, withdrawalPendingUntil: '2026-11-07T08:28:00.000Z' },
        });
        expect(readSocialLinkToken(error.getResponse().details.linkToken!)?.allowedAccounts).toEqual([socialLinkAccountDigest(withdrawing.id)]);
        expect(prisma.v1StatusChangeLog.findFirst).toHaveBeenCalledWith(expect.objectContaining({
          where: expect.objectContaining({ targetId: withdrawing.id, toStatus: 'withdrawal_pending' }),
        }));
        attachedNothing();
      });

      it('tells nothing of the withdrawal when Kakao did not vouch for the email that matched', async () => {
        prisma.v1User.findUnique.mockResolvedValue(withdrawing);

        const error = await refusal({ email: verifiedKakaoAccount.email, is_email_valid: true, is_email_verified: false });

        expect(error.getResponse().code).toBe('SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL');
        expect(error.getResponse().details).not.toHaveProperty('withdrawalPendingUntil');
        expect(prisma.v1StatusChangeLog.findFirst).not.toHaveBeenCalled();
        attachedNothing();
      });

      it('answers like an active account when the matched contact changed under the lock, naming no withdrawal', async () => {
        // The first read matched on the email; by the time the transaction re-reads, the holder no longer carries it.
        prisma.v1User.findUnique.mockResolvedValueOnce(withdrawing).mockResolvedValueOnce({ ...withdrawing, email: null });

        const error = await refusal({ email: verifiedKakaoAccount.email, is_email_valid: true, is_email_verified: true });

        expect(error.status).toBe(409);
        expect(error.getResponse().code).toBe('SOCIAL_LINK_CONTACT_CONFLICT');
        expect(error.getResponse().details).not.toHaveProperty('withdrawalPendingUntil');
        expect(prisma.v1StatusChangeLog.findFirst).not.toHaveBeenCalled();
        attachedNothing();
      });

      it('tells nothing of the withdrawal when the contacts disagree with the stored ones', async () => {
        prisma.v1User.findUnique.mockResolvedValue({ ...withdrawing, email: 'someone-else@example.com' });

        const error = await refusal({ email: verifiedKakaoAccount.email, is_email_valid: true, is_email_verified: true });

        expect(error.getResponse().code).toBe('SOCIAL_LINK_CONTACT_CONFLICT');
        expect(error.getResponse().details).not.toHaveProperty('withdrawalPendingUntil');
        attachedNothing();
      });

      it('still refuses a suspended holder outright instead of offering a way in', async () => {
        prisma.v1User.findUnique.mockResolvedValue({ ...contactOwner, accountStatus: 'suspended' });

        const error = await refusal({ email: verifiedKakaoAccount.email, is_email_valid: true, is_email_verified: true });

        expect(error.status).toBe(403);
        expect(error.getResponse().code).toBe('PERMISSION_DENIED');
        attachedNothing();
      });
    });
    it('refuses a verified email contact changed during the link transaction', async () => {
      prisma.v1User.findUnique.mockResolvedValue(contactOwner);
      prisma.v1User.findFirst.mockResolvedValue(contactOwner);
      prisma.v1User.updateMany.mockResolvedValue({ count: 0 });
      stubKakao([tokenInfo(123456), me({ id: 4994014420, kakao_account: verifiedKakaoAccount })]);
      await expect(service.kakaoTokenLogin({ accessToken: TOKEN })).rejects.toMatchObject({ response: { code: 'SOCIAL_LINK_CONTACT_CONFLICT', details: { next: 'sign_in_then_link', provider: 'kakao', linkToken: expect.any(String), linkTokenExpiresInSeconds: 1800 } } });
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
        response: { code: 'SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL', details: { next: 'sign_in_then_link', provider: 'kakao', linkToken: expect.any(String), linkTokenExpiresInSeconds: 1800 } },
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
        response: { code: 'SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL', details: { next: 'sign_in_then_link', provider: 'kakao', linkToken: expect.any(String), linkTokenExpiresInSeconds: 1800 } },
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
          id: 'user-owner', email: 'owner@example.com', accountStatus: 'active', emailVerifiedAt: NOW, adminUser: null,
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
        response: { code: 'SOCIAL_LINK_CONTACT_CONFLICT', details: { next: 'sign_in_then_link', provider: 'kakao', linkToken: expect.any(String), linkTokenExpiresInSeconds: 1800 } },
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

    // 카카오가 내려주는 닉네임·프로필 사진은 가입 프로필에서 쓰지 않으므로 받아도 보관하지 않는다.
    it('신규 가입은 프리필 값만 draftJson 에 보관하고 Kakao 닉네임·프로필 사진은 보관하지 않는다', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'kakao-access-token' }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 782,
            kakao_account: {
              name: '홍길동',
              gender: 'female',
              birthyear: '2000',
              birthday: '0229',
              birthday_type: 'SOLAR',
              profile: { nickname: '  카카오닉  ', profile_image_url: 'https://img.example/a.png' },
            },
            properties: { nickname: '카카오닉', profile_image: 'https://img.example/b.png' },
          }),
        }) as unknown as typeof fetch;
      prisma.v1AuthIdentity.findUnique.mockResolvedValue(null);
      prisma.v1User.findUnique.mockResolvedValue(pendingSocialUserRow());
      prisma.v1User.create.mockResolvedValue({ id: 'new-social-user', email: null });

      await service.kakaoLogin({ code: 'auth-code' });

      const { data } = prisma.v1User.create.mock.calls[0][0];
      expect(data.onboardingProgress.create.draftJson).toEqual({
        kakaoName: '홍길동',
        kakaoPhone: null,
        kakaoGender: 'female',
        kakaoBirthDate: '20000229',
      });
    });

    describe('기존 identity 의 프리필 시드', () => {
      const withPrefill = () => {
        global.fetch = jest
          .fn()
          .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'kakao-access-token' }) })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              id: 784,
              kakao_account: {
                name: '홍길동',
                gender: 'female',
                profile: { nickname: ' 새닉네임 ', profile_image_url: 'https://img.example/a.png' },
              },
            }),
          }) as unknown as typeof fetch;
      };
      const seeded = { kakaoName: '홍길동', kakaoPhone: null, kakaoGender: 'female', kakaoBirthDate: null };
      const identityWith = (onboardingStatus: string) => ({
        id: 'seed-identity',
        status: 'active',
        user: {
          id: 'seed-user', email: null, accountStatus: 'active',
          onboardingStatus, createdAt: new Date(), updatedAt: new Date(),
        },
      });

      it.each(['social_terms_required', 'social_profile_required'])(
        '%s 사용자는 새로 받은 프리필을 기존 draft 에 병합하고 닉네임·사진은 넣지 않는다',
        async (status) => {
          withPrefill();
          prisma.v1AuthIdentity.findUnique.mockResolvedValue(identityWith(status));
          prisma.v1User.findUnique.mockResolvedValue(pendingSocialUserRow());
          prisma.v1UserOnboardingProgress.findUnique.mockResolvedValue({
            draftJson: { ageConfirmedAt: '2026-10-11T00:00:00.000Z', kakaoName: '옛이름' },
          });

          await service.kakaoLogin({ code: 'auth-code' });

          expect(prisma.v1UserOnboardingProgress.upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: { userId: 'seed-user' },
            update: { draftJson: { ageConfirmedAt: '2026-10-11T00:00:00.000Z', ...seeded } },
          }));
        },
      );

      it('만료된 pending 사용자도 프리필을 병합하고 약관 단계로 리셋한다', async () => {
        withPrefill();
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
            draftJson: { ageConfirmedAt: '2026-10-11T00:00:00.000Z', ...seeded },
          },
        }));
      });

      it('완료된 사용자의 draft 는 건드리지 않는다', async () => {
        withPrefill();
        prisma.v1AuthIdentity.findUnique.mockResolvedValue(identityWith('completed'));
        prisma.v1User.findUnique.mockResolvedValue(completedUserRow({ id: 'seed-user', email: null }));

        await service.kakaoLogin({ code: 'auth-code' });

        expect(prisma.v1UserOnboardingProgress.findUnique).not.toHaveBeenCalled();
        expect(prisma.v1UserOnboardingProgress.upsert).not.toHaveBeenCalled();
      });
    });

    it('Kakao 동의항목이 하나도 없으면 draftJson 은 빈 객체다', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'kakao-access-token' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 783, kakao_account: {} }) }) as unknown as typeof fetch;
      prisma.v1AuthIdentity.findUnique.mockResolvedValue(null);
      prisma.v1User.findUnique.mockResolvedValue(pendingSocialUserRow());
      prisma.v1User.create.mockResolvedValue({ id: 'new-social-user', email: null });

      await service.kakaoLogin({ code: 'auth-code' });

      const { data } = prisma.v1User.create.mock.calls[0][0];
      expect(data.onboardingProgress.create.draftJson).toEqual({});
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

    describe('abandoned social signup releases the number it saved', () => {
      it('만료된 가입 대기 계정으로 다시 로그인하면 리셋과 함께 번호를 비운다', async () => {
        prisma.v1AuthIdentity.findUnique.mockResolvedValue({
          id: 'identity-1', status: 'active',
          user: {
            id: 'user-1', email: null, accountStatus: 'active', onboardingStatus: 'social_profile_required',
            createdAt: expiredAt(), updatedAt: expiredAt(),
          },
        });
        prisma.v1User.findUnique.mockResolvedValue(pendingSocialUserRow({ onboardingStatus: 'social_terms_required' }));
        prisma.v1AuthIdentity.findFirst.mockResolvedValue(signupHolder());

        await service.kakaoLogin({ code: 'auth-code' });

        expect(prisma.v1User.updateMany).toHaveBeenCalledWith(phoneRelease);
        expect(prisma.v1StatusChangeLog.create).toHaveBeenCalledWith(phoneReleaseLog);
      });

      it('방치됐어도 활동 기록이 있는 계정의 번호는 그대로 둔다', async () => {
        prisma.v1AuthIdentity.findUnique.mockResolvedValue({
          id: 'identity-1', status: 'active',
          user: {
            id: 'user-1', email: null, accountStatus: 'active', onboardingStatus: 'social_profile_required',
            createdAt: expiredAt(), updatedAt: expiredAt(),
          },
        });
        prisma.v1User.findUnique.mockResolvedValue(pendingSocialUserRow({ onboardingStatus: 'social_terms_required' }));
        prisma.v1AuthIdentity.findFirst.mockResolvedValue(signupHolder({ ...zeroActivityCounts, teamMemberships: 1 }));

        await service.kakaoLogin({ code: 'auth-code' });

        expect(prisma.v1User.updateMany).not.toHaveBeenCalledWith(phoneRelease);
        expect(prisma.v1StatusChangeLog.create).not.toHaveBeenCalledWith(phoneReleaseLog);
      });

      it('24시간이 지나지 않은 가입은 다시 로그인해도 번호를 그대로 둔다', async () => {
        prisma.v1AuthIdentity.findUnique.mockResolvedValue({
          id: 'identity-1', status: 'active',
          user: {
            id: 'user-1', email: null, accountStatus: 'active', onboardingStatus: 'social_profile_required',
            createdAt: new Date(), updatedAt: new Date(),
          },
        });
        prisma.v1User.findUnique.mockResolvedValue(pendingSocialUserRow());
        prisma.v1AuthIdentity.findFirst.mockResolvedValue(signupHolder());

        await service.kakaoLogin({ code: 'auth-code' });

        expect(prisma.v1AuthIdentity.findFirst).not.toHaveBeenCalled();
        expect(prisma.v1User.updateMany).not.toHaveBeenCalledWith(phoneRelease);
      });
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

  it.each([
    ['일반 계정', null, 'completed', true],
    ['활성 관리자', { status: 'active' }, 'completed', false],
    ['정지 관리자', { status: 'suspended' }, 'completed', false],
    ['권한 회수 관리자', { status: 'revoked' }, 'completed', true],
    ['미완료 소셜 가입', null, 'social_profile_required', false],
  ] as const)('me: %s의 로그인 수단 연결 가능 여부를 서버 가드와 같이 제공한다', async (_label, adminUser, onboardingStatus, allowed) => {
    prisma.v1User.findUnique.mockResolvedValue(completedUserRow({ adminUser, onboardingStatus, deletedAt: null }));
    const result = await service.me('user-1');
    expect(result.user.canLinkLoginMethods).toBe(allowed);
    expect(result.user.canLinkAfterSignup).toBe(adminUser === null || adminUser.status === 'revoked');
  });

  describe('me: socialSignupCanDefer', () => {
    const kakaoRow = [{ id: 'identity-1', provider: V1AuthProvider.kakao, passwordHash: null }];
    const appleRow = [{ id: 'identity-2', provider: V1AuthProvider.apple, passwordHash: null }];
    const stateOf = (overrides: Record<string, unknown>) => completedUserRow({
      email: null, termsConsents: [], onboardingProgress: { currentStep: 'signup', draftJson: {} }, ...overrides,
    });

    it.each([
      ['카카오 가입 진행 — 값이 온 임시 저장 칸', 'social_profile_required', kakaoRow, { kakaoName: '홍길동', kakaoPhone: '01012345678' }, false],
      ['카카오 가입 진행 — 빈 임시 저장 칸', 'social_profile_required', kakaoRow, {}, false],
      ['카카오 가입 진행 — 카카오 키가 지워진 임시 저장 칸', 'social_profile_required', kakaoRow, { autoNickname: '씩씩한수달3' }, false],
      ['Apple 가입 진행', 'social_profile_required', appleRow, {}, true],
      ['Apple 가입 진행 — Apple 이름이 든 임시 저장 칸', 'social_profile_required', appleRow, { kakaoName: '김애플' }, true],
      ['약관 단계', 'social_terms_required', appleRow, {}, false],
      ['이미 미룬 계정', 'social_profile_deferred', appleRow, {}, false],
      ['가입이 끝난 계정', 'completed', kakaoRow, {}, false],
    ])('%s', async (_label, onboardingStatus, authIdentities, draftJson, expected) => {
      prisma.v1User.findUnique.mockResolvedValue(stateOf({
        onboardingStatus, authIdentities, onboardingProgress: { currentStep: 'signup', draftJson },
      }));

      expect((await service.me('user-1')).socialSignupCanDefer).toBe(expected);
    });
  });

  it('me: 정상 완료 사용자 → onboarding.status=completed, next route 없음', async () => {
    prisma.v1User.findUnique.mockResolvedValue(completedUserRow());

    const result = await service.me('user-1');

    expect(result.user.id).toBe('user-1');
    expect(result.onboarding.status).toBe('completed');
    expect(result.onboarding.canResume).toBe(false);
  });

  it('sessionResponse: 이전 필수 이메일 설정을 해제하고 온보딩으로 이어진다', async () => {
    prisma.v1User.findUnique.mockResolvedValue(completedUserRow({
      onboardingStatus: 'signup_done', signupEmailLoginRequired: true, onboardingProgress: { currentStep: 'sport' },
    }));
    const result = await service.sessionResponse('user-1', 'user@teameet.v1');
    expect(result.user.signupEmailLoginRequired).toBe(false);
    expect(prisma.v1User.updateMany).toHaveBeenCalledWith({ where: { id: 'user-1', signupEmailLoginRequired: true }, data: { signupEmailLoginRequired: false } });
    expect(result.next?.route).toBe('/onboarding/sport');
  });

  it('sessionResponse: 가입 후 새 필수 약관이 있으면 온보딩보다 약관을 먼저 안내한다', async () => {
    prisma.v1User.findUnique.mockResolvedValue(completedUserRow({ onboardingStatus: 'signup_done', onboardingProgress: { currentStep: 'sport' } }));
    managedTerms.signupCompliance.mockResolvedValueOnce({ compliant: false, pendingRequiredDocumentIds: ['new-document'], nextRoute: '/terms?mode=renewal' });
    const result = await service.sessionResponse('user-1', 'user@teameet.v1', { social: true });
    expect(result.next?.route).toBe('/terms?mode=renewal');
  });

  it('sessionResponse: 프로필을 미룬 계정은 이메일 설정 없이 계속한다', async () => {
    prisma.v1User.findUnique.mockResolvedValue(completedUserRow({
      onboardingStatus: 'social_profile_deferred', signupEmailLoginRequired: true,
    }));
    const result = await service.sessionResponse('user-1', 'user@teameet.v1');
    expect(result.user.signupEmailLoginRequired).toBe(false);
    expect(result.next).toBeUndefined();
  });
});

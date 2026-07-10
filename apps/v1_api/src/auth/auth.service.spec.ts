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
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { V1AuthProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { hashPassword } from './password-hash';

// ─── helpers ────────────────────────────────────────────────────────────────

const NOW = new Date('2026-06-21T00:00:00.000Z');

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
      delete: jest.fn(),
    },
    v1UserProfile: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    v1AuthIdentity: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    v1TermsDocument: {
      findMany: jest.fn(),
    },
    v1UserOnboardingProgress: {
      upsert: jest.fn(),
    },
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

  beforeEach(async () => {
    prisma = buildPrismaMock();

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── register ────────────────────────────────────────────────────────────

  it('register: requiredTermsAccepted=false → 400 VALIDATION_ERROR (DB에 접근하지 않아야 함)', async () => {
    await expect(
      service.register({
        email: 'new@teameet.v1',
        password: 'Password1!',
        nickname: '신규유저',
        requiredTermsAccepted: false,
      }),
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
      service.register({
        email: 'existing@teameet.v1',
        password: 'Password1!',
        nickname: '신규유저',
        requiredTermsAccepted: true,
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'EMAIL_CONFLICT' },
    });

    // nickname check must NOT be reached after email conflict
    expect(prisma.v1UserProfile.findFirst).not.toHaveBeenCalled();
  });

  it('register: 이미 사용 중인 닉네임 → 409 NICKNAME_CONFLICT', async () => {
    prisma.v1User.findUnique.mockResolvedValue(null);            // email available
    prisma.v1UserProfile.findFirst.mockResolvedValue({ id: 'p-1' }); // nickname taken

    await expect(
      service.register({
        email: 'new@teameet.v1',
        password: 'Password1!',
        nickname: '중복닉네임',
        requiredTermsAccepted: true,
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'NICKNAME_CONFLICT' },
    });
  });

  it('register: 유효하지 않은 생년월일(잘못된 날짜) → 400 VALIDATION_ERROR', async () => {
    // 20001332 → month=13, day=32 → invalid
    await expect(
      service.register({
        email: 'new@teameet.v1',
        password: 'Password1!',
        nickname: '신규',
        requiredTermsAccepted: true,
        birthDate: '20001332',
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'VALIDATION_ERROR' },
    });
  });

  it('register: 게시된 필수 약관 문서가 없어도 동의값이 true면 가입을 진행한다', async () => {
    prisma.v1User.findUnique
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

    const result = await service.register({
      email: 'new@teameet.v1',
      password: 'Password1!',
      nickname: '신규',
      requiredTermsAccepted: true,
    });

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
      .mockResolvedValueOnce(completedUserRow({
        id: 'new-user',
        email: 'new@teameet.v1',
        onboardingStatus: 'signup_done',
        onboardingProgress: { currentStep: 'sport' },
      }));
    prisma.v1UserProfile.findFirst.mockResolvedValue(null);
    prisma.v1TermsDocument.findMany.mockResolvedValue([{ id: 'terms-1' }, { id: 'privacy-1' }]);
    prisma.v1User.create.mockResolvedValue({ id: 'new-user', email: 'new@teameet.v1' });

    await service.register({
      email: 'new@teameet.v1',
      password: 'Password1!',
      nickname: '신규',
      requiredTermsAccepted: true,
    });

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

  // ─── login ────────────────────────────────────────────────────────────────

  it('login: 존재하지 않는 이메일 → 401 UNAUTHENTICATED', async () => {
    prisma.v1AuthIdentity.findUnique.mockResolvedValue(null);

    await expect(
      service.login({ email: 'ghost@teameet.v1', password: 'any' }),
    ).rejects.toMatchObject({
      status: 401,
      response: { code: 'UNAUTHENTICATED' },
    });
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
      service.login({ email: 'user@teameet.v1', password: 'WrongPass999!' }),
    ).rejects.toMatchObject({
      status: 401,
      response: { code: 'UNAUTHENTICATED' },
    });

    // no DB mutation must occur on wrong password
    expect(prisma.$transaction).not.toHaveBeenCalled();
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
      service.login({ email: 'user@teameet.v1', password: 'ValidPass1!' }),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: 'PERMISSION_DENIED' },
    });
  });

  it('login: 이메일 대소문자 정규화 — Upper@Example.com 로 로그인해도 email 키는 소문자로 조회', async () => {
    // identity lookup should be called with the lower-cased email as providerUserKey
    prisma.v1AuthIdentity.findUnique.mockResolvedValue(null);

    await expect(
      service.login({ email: 'UPPER@Example.COM', password: 'any' }),
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
      service.completeSocialTerms('user-1', { requiredTermsAccepted: false }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'VALIDATION_ERROR' },
    });

    expect(prisma.v1User.findUnique).not.toHaveBeenCalled();
  });

  it('completeSocialTerms: 존재하지 않는 userId → 404 NOT_FOUND', async () => {
    prisma.v1User.findUnique.mockResolvedValue(null);

    await expect(
      service.completeSocialTerms('ghost', { requiredTermsAccepted: true }),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'NOT_FOUND' },
    });
  });

  it('completeSocialTerms: 소셜 회원가입 세션 만료(>24h) → 삭제 후 401 SOCIAL_SIGNUP_EXPIRED', async () => {
    const expiredTime = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25시간 전
    const expiredUser = pendingSocialUserRow({
      createdAt: expiredTime,
      updatedAt: expiredTime,
    });
    prisma.v1User.findUnique.mockResolvedValue(expiredUser);
    prisma.v1User.delete.mockResolvedValue(expiredUser);

    await expect(
      service.completeSocialTerms('user-1', { requiredTermsAccepted: true }),
    ).rejects.toMatchObject({
      status: 401,
      response: { code: 'SOCIAL_SIGNUP_EXPIRED' },
    });

    // expired user must be deleted before the error is thrown
    expect(prisma.v1User.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });

  it('completeSocialTerms: 게시된 필수 약관 문서가 없어도 기본 프로필을 만들고 운동 정보 단계로 진행한다', async () => {
    const activeTime = new Date();
    prisma.v1User.findUnique
      .mockResolvedValueOnce(pendingSocialUserRow({
        createdAt: activeTime,
        updatedAt: activeTime,
        onboardingProgress: {
          currentStep: 'terms',
          draftJson: { kakaoNickname: '카카오러너', kakaoProfileImageUrl: 'https://img.example/kakao.png' },
        },
      }))
      .mockResolvedValueOnce(completedUserRow({
        onboardingStatus: 'signup_done',
        onboardingProgress: { currentStep: 'sport' },
        termsConsents: [],
        createdAt: activeTime,
        updatedAt: activeTime,
      }));
    prisma.v1TermsDocument.findMany.mockResolvedValue([]);
    prisma.v1UserProfile.findFirst.mockResolvedValue(null);

    const result = await service.completeSocialTerms('user-1', { requiredTermsAccepted: true });

    expect(result.next).toEqual({ route: '/onboarding/sport' });
    expect(prisma.v1UserProfile.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      update: {
        nickname: '카카오러너',
        displayName: '카카오러너',
        profileImageUrl: 'https://img.example/kakao.png',
        visibility: 'public',
      },
      create: {
        userId: 'user-1',
        nickname: '카카오러너',
        displayName: '카카오러너',
        profileImageUrl: 'https://img.example/kakao.png',
        visibility: 'public',
      },
    });
    expect(prisma.v1User.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { onboardingStatus: 'signup_done' },
    });
    expect(prisma.v1UserTermsConsent.createMany).not.toHaveBeenCalled();
  });

  it('completeSocialTerms: 카카오 기본 닉네임은 14자 이내로 저장한다', async () => {
    const activeTime = new Date();
    prisma.v1User.findUnique
      .mockResolvedValueOnce(pendingSocialUserRow({
        createdAt: activeTime,
        updatedAt: activeTime,
        onboardingProgress: {
          currentStep: 'terms',
          draftJson: { kakaoNickname: 'kakao_1234567890', kakaoProfileImageUrl: null },
        },
      }))
      .mockResolvedValueOnce(completedUserRow({
        onboardingStatus: 'signup_done',
        onboardingProgress: { currentStep: 'sport' },
        termsConsents: [],
      }));
    prisma.v1TermsDocument.findMany.mockResolvedValue([]);
    prisma.v1UserProfile.findFirst.mockResolvedValue(null);

    await service.completeSocialTerms('user-1', { requiredTermsAccepted: true });

    expect(prisma.v1UserProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          nickname: 'kakao_12345678',
          displayName: 'kakao_12345678',
        }),
      }),
    );
  });

  it('completeSocialTerms: 중복 suffix가 붙어도 카카오 기본 닉네임은 14자 이내로 유지한다', async () => {
    const activeTime = new Date();
    prisma.v1User.findUnique
      .mockResolvedValueOnce(pendingSocialUserRow({
        createdAt: activeTime,
        updatedAt: activeTime,
        onboardingProgress: {
          currentStep: 'terms',
          draftJson: { kakaoNickname: 'kakao_1234567890', kakaoProfileImageUrl: null },
        },
      }))
      .mockResolvedValueOnce(completedUserRow({
        onboardingStatus: 'signup_done',
        onboardingProgress: { currentStep: 'sport' },
        termsConsents: [],
      }));
    prisma.v1TermsDocument.findMany.mockResolvedValue([]);
    prisma.v1UserProfile.findFirst
      .mockResolvedValueOnce({ id: 'existing-profile' })
      .mockResolvedValueOnce(null);

    await service.completeSocialTerms('user-1', { requiredTermsAccepted: true });

    expect(prisma.v1UserProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          nickname: 'kakao_12345_1',
          displayName: 'kakao_12345_1',
        }),
      }),
    );
  });

  it('completeSocialTerms: 카카오 ID fallback 닉네임은 k_ prefix로 14자 이내로 저장한다', async () => {
    const activeTime = new Date();
    prisma.v1User.findUnique
      .mockResolvedValueOnce(pendingSocialUserRow({
        createdAt: activeTime,
        updatedAt: activeTime,
        onboardingProgress: {
          currentStep: 'terms',
          draftJson: { kakaoNickname: 'k_123456789012345', kakaoProfileImageUrl: null },
        },
      }))
      .mockResolvedValueOnce(completedUserRow({
        onboardingStatus: 'signup_done',
        onboardingProgress: { currentStep: 'sport' },
        termsConsents: [],
      }));
    prisma.v1TermsDocument.findMany.mockResolvedValue([]);
    prisma.v1UserProfile.findFirst.mockResolvedValue(null);

    await service.completeSocialTerms('user-1', { requiredTermsAccepted: true });

    expect(prisma.v1UserProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          nickname: 'k_123456789012',
          displayName: 'k_123456789012',
        }),
      }),
    );
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
      displayName: '소셜 유저',
    });

    expect(result.next).toEqual({ route: '/onboarding/sport' });
    expect(prisma.v1UserProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        create: expect.objectContaining({ nickname: '소셜유저' }),
      }),
    );
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

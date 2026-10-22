import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';
import { issuePhoneProofToken } from '../verification/phone-proof-token';
import { PhoneVerificationService } from '../verification/phone-verification.service';
import { AppleIdentityService } from './apple-identity.service';
import { AppleTokenService } from './apple-token.service';
import { AuthService } from './auth.service';
import { LoginSecurityService } from './login-security/login-security.service';
import { LoginStepUpService } from './login-security/login-step-up.service';

const PHONE = '01012345678';
const CALLER_ID = 'pending-user';
const HOLDER_ID = 'holder-user';
const IDENTITY_ID = 'identity-1';
const ACCOUNT_PROOF_REQUIRED = 'SOCIAL_LINK_REQUIRES_ACCOUNT_PROOF';

describe('AuthService.linkSocialToPhoneOwner', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof buildPrisma>;
  let savedSecret: string | undefined;

  function buildPrisma() {
    return {
      v1User: { findUnique: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
      v1AuthIdentity: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      v1Inquiry: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      v1UploadAsset: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      v1AdminUser: { findUnique: jest.fn() },
      v1PhoneVerificationChallenge: { deleteMany: jest.fn(), count: jest.fn() },
      v1StatusChangeLog: { create: jest.fn() },
      v1Notification: { create: jest.fn() },
      v1UserOnboardingProgress: { upsert: jest.fn() },
      $transaction: jest.fn(),
    };
  }

  const pendingCaller = (overrides: Record<string, unknown> = {}) => ({
    id: CALLER_ID,
    accountStatus: 'active',
    onboardingStatus: 'social_profile_required',
    createdAt: new Date(),
    updatedAt: new Date(),
    profile: null,
    authIdentities: [{ id: IDENTITY_ID, provider: 'kakao' }],
    ...overrides,
  });
  const holder = (overrides: Record<string, unknown> = {}) => ({
    id: HOLDER_ID,
    email: 'holder@example.com',
    accountStatus: 'active',
    phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  });
  const dto = (overrides: Partial<{ phone: string; proofToken: string }> = {}) => ({
    phone: PHONE,
    proofToken: issuePhoneProofToken(PHONE, 'social_link'),
    ...overrides,
  });
  const noLinkSideEffects = () => {
    for (const operation of [prisma.v1AuthIdentity.update, prisma.v1User.delete,
      prisma.v1Inquiry.updateMany, prisma.v1UploadAsset.updateMany, prisma.v1User.update,
      prisma.v1StatusChangeLog.create, prisma.v1Notification.create, prisma.v1PhoneVerificationChallenge.deleteMany]) {
      expect(operation).not.toHaveBeenCalled();
    }
    expect(service.me).not.toHaveBeenCalled();
  };

  beforeEach(async () => {
    savedSecret = process.env.V1_SESSION_SECRET;
    process.env.V1_SESSION_SECRET = 'x'.repeat(48);
    jest.clearAllMocks();
    prisma = buildPrisma();
    prisma.v1User.findUnique.mockResolvedValue(pendingCaller());
    prisma.v1User.findFirst.mockResolvedValue(holder());
    prisma.v1User.updateMany.mockResolvedValue({ count: 1 });
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);
    prisma.v1AuthIdentity.findFirst.mockResolvedValue(null);
    prisma.v1PhoneVerificationChallenge.deleteMany.mockResolvedValue({ count: 1 });
    prisma.v1PhoneVerificationChallenge.count.mockResolvedValue(1);
    prisma.v1AuthIdentity.findMany.mockResolvedValue([{ provider: 'email', passwordHash: 'hash' }]);
    prisma.$transaction.mockImplementation((action: (tx: typeof prisma) => Promise<unknown>) => action(prisma));

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: ManagedTermsRuntimeService, useValue: {} },
        { provide: PhoneVerificationService, useValue: {} },
        { provide: AppleIdentityService, useValue: {} },
        { provide: AppleTokenService, useValue: {} },
        { provide: LoginSecurityService, useValue: {} },
        { provide: LoginStepUpService, useValue: {} },
      ],
    }).compile();
    service = module.get(AuthService);
    jest.spyOn(service, 'me');
  });

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.V1_SESSION_SECRET;
    else process.env.V1_SESSION_SECRET = savedSecret;
    jest.restoreAllMocks();
  });

  const expectCode = async (promise: Promise<unknown>, code: string) => {
    await expect(promise).rejects.toMatchObject({ response: { code } });
    noLinkSideEffects();
    // Expired signup intentionally resets only the caller's terms step; no account-link writes occur.
    if (code !== 'SOCIAL_SIGNUP_EXPIRED') {
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
      expect(prisma.v1UserOnboardingProgress.upsert).not.toHaveBeenCalled();
    }
  };

  it('requires account proof without transferring identity, inquiries, uploads or a holder session', async () => {
    // Given: a valid current-number proof and a historically verified holder.
    // When / Then: phone possession alone cannot authenticate that holder.
    await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), ACCOUNT_PROOF_REQUIRED);
    expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
    expect(prisma.v1UserOnboardingProgress.upsert).not.toHaveBeenCalled();
  });

  it('keeps an Apple identity and its refresh token untouched when account proof is missing', async () => {
    prisma.v1User.findUnique.mockResolvedValue(pendingCaller({ authIdentities: [{ id: IDENTITY_ID, provider: 'apple' }] }));

    await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), ACCOUNT_PROOF_REQUIRED);
  });

  describe('phone proof', () => {
    it.each([
      ['garbage token', () => dto({ proofToken: 'nope' })],
      ['token for another phone', () => dto({ proofToken: issuePhoneProofToken('01099998888', 'social_link') })],
      ['signup-purpose token', () => dto({ proofToken: issuePhoneProofToken(PHONE, 'signup') })],
      ['password_reset-purpose token', () => dto({ proofToken: issuePhoneProofToken(PHONE, 'password_reset') })],
    ])('rejects a %s before touching the database', async (_label, build) => {
      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, build()), 'PHONE_NOT_VERIFIED');
      expect(prisma.v1User.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a proof whose challenge was already consumed and moves nothing', async () => {
      prisma.v1PhoneVerificationChallenge.count.mockResolvedValue(0);

      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), 'PHONE_NOT_VERIFIED');
      expect(prisma.v1Notification.create).not.toHaveBeenCalled();
    });
  });

  describe('caller must be a pending social signup', () => {
    it.each([
      ['terms step', { onboardingStatus: 'social_terms_required' }],
      ['completed account', { onboardingStatus: 'completed' }],
      ['already has a profile', { profile: { id: 'p1' } }],
      ['two active identities', { authIdentities: [{ id: 'a', provider: 'kakao' }, { id: 'b', provider: 'apple' }] }],
      ['email identity', { authIdentities: [{ id: 'a', provider: 'email' }] }],
      ['no active identity', { authIdentities: [] }],
    ])('rejects %s', async (_label, overrides) => {
      prisma.v1User.findUnique.mockResolvedValue(pendingCaller(overrides));

      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), 'SOCIAL_LINK_NOT_PENDING');
    });

    it('requires account proof for a deferred caller while preserving its auto profile', async () => {
      prisma.v1User.findUnique.mockResolvedValue(
        pendingCaller({ onboardingStatus: 'social_profile_deferred', profile: { id: 'auto-profile' } }),
      );

      await expectCode(service.previewSocialLink(CALLER_ID, dto()), ACCOUNT_PROOF_REQUIRED);
      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), ACCOUNT_PROOF_REQUIRED);
      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
      expect(prisma.v1UserOnboardingProgress.upsert).not.toHaveBeenCalled();
    });

    it('still rejects a completed caller that has a profile', async () => {
      prisma.v1User.findUnique.mockResolvedValue(
        pendingCaller({ onboardingStatus: 'completed', profile: { id: 'p1' } }),
      );

      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), 'SOCIAL_LINK_NOT_PENDING');
      await expectCode(service.previewSocialLink(CALLER_ID, dto()), 'SOCIAL_LINK_NOT_PENDING');
    });

    it('resets an expired signup and answers 401', async () => {
      const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
      prisma.v1User.findUnique.mockResolvedValue(pendingCaller({ createdAt: old, updatedAt: old }));
      prisma.v1UserOnboardingProgress.upsert.mockResolvedValue({});

      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), 'SOCIAL_SIGNUP_EXPIRED');
      expect(prisma.v1User.updateMany).toHaveBeenCalledWith({
        where: { id: CALLER_ID, onboardingStatus: { in: ['social_terms_required', 'social_profile_required'] } },
        data: { onboardingStatus: 'social_terms_required' },
      });
      expect(prisma.v1UserOnboardingProgress.upsert).toHaveBeenCalledWith({
        where: { userId: CALLER_ID }, update: { currentStep: 'terms' },
        create: { userId: CALLER_ID, currentStep: 'terms' },
      });
      expect(prisma.v1User.findFirst).not.toHaveBeenCalled();
    });

    it('rejects a non-active caller', async () => {
      prisma.v1User.findUnique.mockResolvedValue(pendingCaller({ accountStatus: 'suspended' }));

      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), 'PERMISSION_DENIED');
    });
  });

  describe('holder lookup', () => {
    it('404s when no account owns the proven phone', async () => {
      prisma.v1User.findFirst.mockResolvedValue(null);
      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), 'ACCOUNT_NOT_FOUND');
    });

    it('403s a withdrawal-pending holder with its own code', async () => {
      prisma.v1User.findFirst.mockResolvedValue(holder({ accountStatus: 'withdrawal_pending' }));
      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), 'ACCOUNT_WITHDRAWAL_PENDING');
    });

    it('403s a suspended holder', async () => {
      prisma.v1User.findFirst.mockResolvedValue(holder({ accountStatus: 'suspended' }));
      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), 'PERMISSION_DENIED');
    });

    it('409s when the phone belongs to the caller itself', async () => {
      prisma.v1User.findFirst.mockResolvedValue(holder({ id: CALLER_ID }));
      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), 'SOCIAL_LINK_SAME_ACCOUNT');
    });

    it('409s when the holder never verified that phone, and neither links nor previews', async () => {
      prisma.v1User.findFirst.mockResolvedValue(holder({ phoneVerifiedAt: null }));
      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), 'SOCIAL_LINK_PHONE_UNVERIFIED');
      await expectCode(service.previewSocialLink(CALLER_ID, dto()), 'SOCIAL_LINK_PHONE_UNVERIFIED');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('holder with admin access', () => {
    it.each(['active', 'suspended'])('blocks a %s admin', async (status) => {
      prisma.v1AdminUser.findUnique.mockResolvedValue({ status });
      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), 'SOCIAL_LINK_ADMIN_FORBIDDEN');
    });

    it.each([
      ['a revoked admin', { status: 'revoked' }],
      ['a non-admin', null],
    ])('still requires account proof for %s', async (_label, row) => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(row);
      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), ACCOUNT_PROOF_REQUIRED);
    });
  });

  describe('provider already linked on the holder', () => {
    it('blocks an active identity of the same provider', async () => {
      prisma.v1AuthIdentity.findFirst.mockResolvedValue({ id: 'existing' });
      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), 'SOCIAL_LINK_PROVIDER_EXISTS');
    });

    it('checks only active identities of the incoming provider before requiring account proof', async () => {
      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), ACCOUNT_PROOF_REQUIRED);

      expect(prisma.v1AuthIdentity.findFirst).toHaveBeenCalledWith({
        where: { userId: HOLDER_ID, provider: 'kakao', status: 'active' },
        select: { id: true },
      });
    });
  });

  describe('concurrency and failure', () => {
    it('rejects before locking the holder even when a later lock would fail', async () => {
      prisma.v1User.updateMany.mockResolvedValueOnce({ count: 0 });
      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), ACCOUNT_PROOF_REQUIRED);
      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
    });

    it('rejects before a caller state write could race with another signup request', async () => {
      prisma.v1User.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), ACCOUNT_PROOF_REQUIRED);
      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
    });

    it('rejects before deletion even when retained activity would restrict the caller delete', async () => {
      prisma.v1User.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test' }),
      );
      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), ACCOUNT_PROOF_REQUIRED);
    });

    it('rejects before a successful-link notification can be persisted', async () => {
      prisma.v1Notification.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('notification constraint', { code: 'P2003', clientVersion: 'test' }),
      );
      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), ACCOUNT_PROOF_REQUIRED);
      expect(prisma.v1Notification.create).not.toHaveBeenCalled();
    });

    it('rejects repeated valid proof attempts without consuming proof or writing either account', async () => {
      const input = dto();
      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, input), ACCOUNT_PROOF_REQUIRED);
      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, input), ACCOUNT_PROOF_REQUIRED);
      expect(prisma.v1PhoneVerificationChallenge.count).toHaveBeenCalledTimes(2);
      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
    });

    it('rejects parallel valid proof requests without granting either one a session', async () => {
      const input = dto();
      await Promise.all([
        expectCode(service.linkSocialToPhoneOwner(CALLER_ID, input), ACCOUNT_PROOF_REQUIRED),
        expectCode(service.previewSocialLink(CALLER_ID, input), ACCOUNT_PROOF_REQUIRED),
      ]);
      expect(prisma.v1PhoneVerificationChallenge.count).toHaveBeenCalledTimes(2);
      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
    });
  });
  describe('previewSocialLink', () => {
    const noWrites = () => {
      noLinkSideEffects();
      expect(prisma.v1PhoneVerificationChallenge.deleteMany).not.toHaveBeenCalled();
      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.v1Notification.create).not.toHaveBeenCalled();
    };

    it('reveals no holder login metadata or raw email and does not consume the proof', async () => {
      prisma.v1AuthIdentity.findMany.mockResolvedValue([
        { provider: 'email', passwordHash: 'hash' },
        { provider: 'apple', passwordHash: null },
      ]);

      const request = service.previewSocialLink(CALLER_ID, dto());
      await expectCode(request, ACCOUNT_PROOF_REQUIRED);
      const error: unknown = await request.catch((cause: unknown) => cause);
      if (!(error instanceof ConflictException)) throw error;
      expect(error.getResponse()).toEqual({ code: ACCOUNT_PROOF_REQUIRED, message: expect.any(String) });
      expect(JSON.stringify(error.getResponse())).not.toContain('holder@example.com');
      expect(prisma.v1AuthIdentity.findMany).not.toHaveBeenCalled();
      noWrites();
    });

    it('does not reveal a social-only holder without a password or email', async () => {
      prisma.v1User.findFirst.mockResolvedValue(holder({ email: null }));
      prisma.v1AuthIdentity.findMany.mockResolvedValue([{ provider: 'apple', passwordHash: null }]);

      await expectCode(service.previewSocialLink(CALLER_ID, dto()), ACCOUNT_PROOF_REQUIRED);
      expect(prisma.v1AuthIdentity.findMany).not.toHaveBeenCalled();
      noWrites();
    });

    it.each([
      ['garbage token', () => dto({ proofToken: 'nope' }), 'PHONE_NOT_VERIFIED'],
      ['password_reset token', () => dto({ proofToken: issuePhoneProofToken(PHONE, 'password_reset') }), 'PHONE_NOT_VERIFIED'],
    ])('reveals nothing for a %s', async (_label, build, code) => {
      await expectCode(service.previewSocialLink(CALLER_ID, build()), code);
      expect(prisma.v1User.findFirst).not.toHaveBeenCalled();
      expect(prisma.v1AuthIdentity.findMany).not.toHaveBeenCalled();
    });

    it('rejects when the verified challenge no longer exists', async () => {
      prisma.v1PhoneVerificationChallenge.count.mockResolvedValue(0);
      await expectCode(service.previewSocialLink(CALLER_ID, dto()), 'PHONE_NOT_VERIFIED');
      expect(prisma.v1AuthIdentity.findMany).not.toHaveBeenCalled();
    });

    it.each([
      ['not pending', () => prisma.v1User.findUnique.mockResolvedValue(pendingCaller({ onboardingStatus: 'completed' })), 'SOCIAL_LINK_NOT_PENDING'],
      ['holder missing', () => prisma.v1User.findFirst.mockResolvedValue(null), 'ACCOUNT_NOT_FOUND'],
      ['withdrawal pending', () => prisma.v1User.findFirst.mockResolvedValue(holder({ accountStatus: 'withdrawal_pending' })), 'ACCOUNT_WITHDRAWAL_PENDING'],
      ['same account', () => prisma.v1User.findFirst.mockResolvedValue(holder({ id: CALLER_ID })), 'SOCIAL_LINK_SAME_ACCOUNT'],
      ['active admin', () => prisma.v1AdminUser.findUnique.mockResolvedValue({ status: 'active' }), 'SOCIAL_LINK_ADMIN_FORBIDDEN'],
      ['suspended admin', () => prisma.v1AdminUser.findUnique.mockResolvedValue({ status: 'suspended' }), 'SOCIAL_LINK_ADMIN_FORBIDDEN'],
      ['same provider linked', () => prisma.v1AuthIdentity.findFirst.mockResolvedValue({ id: 'existing' }), 'SOCIAL_LINK_PROVIDER_EXISTS'],
    ])('fails like link does for %s', async (_label, arrange, code) => {
      arrange();
      await expectCode(service.previewSocialLink(CALLER_ID, dto()), code);
      expect(prisma.v1AuthIdentity.findMany).not.toHaveBeenCalled();
    });

    it.each([
      ['a revoked admin', () => prisma.v1AdminUser.findUnique.mockResolvedValue({ status: 'revoked' })],
      ['a non-admin', () => prisma.v1AdminUser.findUnique.mockResolvedValue(null)],
    ])('still requires account proof when previewing %s', async (_label, arrange) => {
      arrange();
      await expectCode(service.previewSocialLink(CALLER_ID, dto()), ACCOUNT_PROOF_REQUIRED);
      noWrites();
    });
  });
});

import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';
import { issuePhoneProofToken } from '../verification/phone-proof-token';
import { PhoneVerificationService } from '../verification/phone-verification.service';
import { AppleIdentityService } from './apple-identity.service';
import { AppleTokenService } from './apple-token.service';
import { AuthService } from './auth.service';

const PHONE = '01012345678';
const CALLER_ID = 'pending-user';
const HOLDER_ID = 'holder-user';
const IDENTITY_ID = 'identity-1';

describe('AuthService.linkSocialToPhoneOwner', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof buildPrisma>;
  const notifications = { emitNotification: jest.fn() };
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
  const writes = () =>
    prisma.v1AuthIdentity.update.mock.calls.length +
    prisma.v1User.delete.mock.calls.length +
    prisma.v1StatusChangeLog.create.mock.calls.length;

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
    notifications.emitNotification.mockResolvedValue(undefined);
    (prisma.$transaction as jest.Mock).mockImplementation((arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: typeof prisma) => Promise<unknown>)(prisma) : Promise.all(arg as Promise<unknown>[]));

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: ManagedTermsRuntimeService, useValue: {} },
        { provide: PhoneVerificationService, useValue: {} },
        { provide: AppleIdentityService, useValue: {} },
        { provide: AppleTokenService, useValue: {} },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = module.get(AuthService);
    jest.spyOn(service, 'me').mockResolvedValue({
      user: { id: HOLDER_ID },
      onboarding: { status: 'completed', missing: [] },
    } as unknown as Awaited<ReturnType<AuthService['me']>>);
  });

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.V1_SESSION_SECRET;
    else process.env.V1_SESSION_SECRET = savedSecret;
  });

  const expectCode = async (promise: Promise<unknown>, code: string) => {
    await expect(promise).rejects.toMatchObject({ response: { code } });
    expect(writes()).toBe(0);
  };

  it('moves the identity to the holder, deletes the pending user, audits, notifies, and signs in as the holder', async () => {
    const result = await service.linkSocialToPhoneOwner(CALLER_ID, dto());

    expect(prisma.v1AuthIdentity.update).toHaveBeenCalledWith({
      where: { id: IDENTITY_ID, userId: CALLER_ID },
      data: { userId: HOLDER_ID, lastLoginAt: expect.any(Date) },
    });
    expect(prisma.v1Inquiry.updateMany).toHaveBeenCalledWith({ where: { userId: CALLER_ID }, data: { userId: HOLDER_ID } });
    expect(prisma.v1User.delete).toHaveBeenCalledWith({ where: { id: CALLER_ID } });
    expect(prisma.v1StatusChangeLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetType: 'auth_identity',
        targetId: IDENTITY_ID,
        toStatus: 'linked',
        actorUserId: HOLDER_ID,
        reason: `social_link:kakao; removed_pending_user=${CALLER_ID}`,
      }),
    });
    const audit = JSON.stringify(prisma.v1StatusChangeLog.create.mock.calls);
    expect(audit).not.toContain(PHONE);
    expect(notifications.emitNotification).toHaveBeenCalledWith(
      HOLDER_ID,
      'social_identity_linked',
      null,
      undefined,
      { vars: { name: '카카오' }, businessKey: `social-link:${IDENTITY_ID}` },
    );
    expect(result.session).toEqual({ userId: HOLDER_ID, userEmail: 'holder@example.com' });
  });

  it('never rewrites the Apple refresh token when moving the identity', async () => {
    prisma.v1User.findUnique.mockResolvedValue(pendingCaller({ authIdentities: [{ id: IDENTITY_ID, provider: 'apple' }] }));

    await service.linkSocialToPhoneOwner(CALLER_ID, dto());

    const { data } = prisma.v1AuthIdentity.update.mock.calls[0][0];
    expect(Object.keys(data).sort()).toEqual(['lastLoginAt', 'userId']);
    expect(notifications.emitNotification).toHaveBeenCalledWith(
      HOLDER_ID, 'social_identity_linked', null, undefined, expect.objectContaining({ vars: { name: 'Apple' } }),
    );
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
      prisma.v1PhoneVerificationChallenge.deleteMany.mockResolvedValue({ count: 0 });

      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), 'PHONE_NOT_VERIFIED');
      expect(notifications.emitNotification).not.toHaveBeenCalled();
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

    it('accepts a deferred caller whose auto profile exists, for both link and preview', async () => {
      prisma.v1User.findUnique.mockResolvedValue(
        pendingCaller({ onboardingStatus: 'social_profile_deferred', profile: { id: 'auto-profile' } }),
      );

      await expect(service.previewSocialLink(CALLER_ID, dto())).resolves.toMatchObject({ linkingProvider: 'kakao' });
      await service.linkSocialToPhoneOwner(CALLER_ID, dto());

      expect(prisma.v1User.updateMany).toHaveBeenCalledWith({
        where: { id: CALLER_ID, onboardingStatus: { in: ['social_profile_required', 'social_profile_deferred'] } },
        data: { updatedAt: expect.any(Date) },
      });
      expect(prisma.v1User.delete).toHaveBeenCalledWith({ where: { id: CALLER_ID } });
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
    ])('still links %s', async (_label, row) => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(row);
      await service.linkSocialToPhoneOwner(CALLER_ID, dto());
      expect(prisma.v1AuthIdentity.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('provider already linked on the holder', () => {
    it('blocks an active identity of the same provider', async () => {
      prisma.v1AuthIdentity.findFirst.mockResolvedValue({ id: 'existing' });
      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), 'SOCIAL_LINK_PROVIDER_EXISTS');
    });

    it('queries only active identities of the incoming provider, so other providers and unlinked rows do not block', async () => {
      await service.linkSocialToPhoneOwner(CALLER_ID, dto());

      expect(prisma.v1AuthIdentity.findFirst).toHaveBeenCalledWith({
        where: { userId: HOLDER_ID, provider: 'kakao', status: 'active' },
        select: { id: true },
      });
      expect(prisma.v1AuthIdentity.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('concurrency and failure', () => {
    it('409s when the holder row can no longer be locked', async () => {
      prisma.v1User.updateMany.mockResolvedValueOnce({ count: 0 });
      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), 'SOCIAL_LINK_CONFLICT');
    });

    it('409s when the pending user left the pending state mid-flight', async () => {
      prisma.v1User.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
      await expectCode(service.linkSocialToPhoneOwner(CALLER_ID, dto()), 'SOCIAL_LINK_CONFLICT');
    });

    it('maps a foreign-key failure on delete to SOCIAL_LINK_ACCOUNT_NOT_EMPTY', async () => {
      prisma.v1User.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test' }),
      );
      await expect(service.linkSocialToPhoneOwner(CALLER_ID, dto())).rejects.toMatchObject({
        response: { code: 'SOCIAL_LINK_ACCOUNT_NOT_EMPTY' },
      });
      expect(notifications.emitNotification).not.toHaveBeenCalled();
    });

    it('still succeeds when the notification emit rejects', async () => {
      notifications.emitNotification.mockRejectedValue(new Error('push down'));

      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await expect(service.linkSocialToPhoneOwner(CALLER_ID, dto())).resolves.toMatchObject({
        session: { userId: HOLDER_ID },
      });
      await new Promise((resolve) => setImmediate(resolve));
      expect(warn).toHaveBeenCalledTimes(1);
      const logged = String(warn.mock.calls[0][0]);
      expect(logged).toContain('push down');
      expect(logged).not.toContain(PHONE);
      warn.mockRestore();
    });
  });
  describe('previewSocialLink', () => {
    const noWrites = () => {
      expect(writes()).toBe(0);
      expect(prisma.v1PhoneVerificationChallenge.deleteMany).not.toHaveBeenCalled();
      expect(prisma.v1User.updateMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(notifications.emitNotification).not.toHaveBeenCalled();
    };

    it('returns a masked summary of the holder without consuming the proof', async () => {
      prisma.v1AuthIdentity.findMany.mockResolvedValue([
        { provider: 'email', passwordHash: 'hash' },
        { provider: 'apple', passwordHash: null },
      ]);

      const result = await service.previewSocialLink(CALLER_ID, dto());

      expect(result).toEqual({
        maskedEmail: 'ho***@example.com',
        providers: ['email', 'apple'],
        hasPassword: true,
        linkingProvider: 'kakao',
      });
      expect(JSON.stringify(result)).not.toContain('holder@example.com');
      noWrites();
    });

    it('reports a social-only holder without a password or email', async () => {
      prisma.v1User.findFirst.mockResolvedValue(holder({ email: null }));
      prisma.v1AuthIdentity.findMany.mockResolvedValue([{ provider: 'apple', passwordHash: null }]);

      await expect(service.previewSocialLink(CALLER_ID, dto())).resolves.toMatchObject({
        maskedEmail: null,
        providers: ['apple'],
        hasPassword: false,
      });
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
    ])('still previews %s', async (_label, arrange) => {
      arrange();
      await expect(service.previewSocialLink(CALLER_ID, dto())).resolves.toMatchObject({ linkingProvider: 'kakao' });
    });
  });
});

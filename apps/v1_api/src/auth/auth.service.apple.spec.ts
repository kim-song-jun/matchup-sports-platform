import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { V1AuthProvider } from '@prisma/client';
import { AppleIdentityService } from './apple-identity.service';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';
import { PhoneVerificationService } from '../verification/phone-verification.service';

/**
 * What happens to the *account* once Apple's token has been believed.
 *
 * The token itself is verified in `apple-identity-token.spec.ts`; here it is a stub, so
 * these tests are only about the two questions that decide who the caller becomes: which
 * value the account is keyed on, and when an Apple sign-in is allowed to take over an
 * account that already exists.
 */
describe('AuthService.appleSignIn', () => {
  const SUBJECT = '001234.abcdef.0000';

  let service: AuthService;
  let prisma: ReturnType<typeof buildPrismaMock>;
  const appleIdentity = { verifyIdentityToken: jest.fn(), issueNonce: jest.fn() };

  function buildPrismaMock() {
    return {
      v1User: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      v1AuthIdentity: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      v1UserOnboardingProgress: { upsert: jest.fn() },
      $transaction: jest.fn(),
    };
  }

  const claims = (overrides: Partial<{ subject: string; email: string | null; emailVerified: boolean; isPrivateEmail: boolean }> = {}) => ({
    subject: SUBJECT,
    email: 'zzz@privaterelay.appleid.com',
    emailVerified: true,
    isPrivateEmail: true,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = buildPrismaMock();
    jest.clearAllMocks();
    prisma.v1User.updateMany.mockResolvedValue({ count: 1 });
    (prisma.$transaction as jest.Mock).mockImplementation((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: typeof prisma) => Promise<unknown>)(prisma)
        : Promise.all(arg as Promise<unknown>[]));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ManagedTermsRuntimeService,
          useValue: { signupCompliance: jest.fn().mockResolvedValue({ compliant: true, pendingRequiredDocumentIds: [], nextRoute: null }) },
        },
        { provide: PhoneVerificationService, useValue: { enabled: false } },
        { provide: AppleIdentityService, useValue: appleIdentity },
      ],
    }).compile();

    service = module.get(AuthService);
    // `sessionResponse` reads the user back; the shape only has to be enough to build one.
    jest.spyOn(service, 'me').mockResolvedValue({
      user: { id: 'user-1', email: null },
      onboarding: { status: 'social_terms_required' },
    } as unknown as Awaited<ReturnType<AuthService['me']>>);
  });

  const signIn = () => service.appleSignIn({ identityToken: 'token', nonce: 'nonce' });

  /**
   * The account key. Apple's relay address can be turned off or changed by the reader, and
   * two different people can end up with no email at all — `sub` is the only value Apple
   * promises is stable, so keying on anything else eventually merges two strangers.
   */
  it('finds the account by Apple subject, not by email', async () => {
    appleIdentity.verifyIdentityToken.mockResolvedValue(claims());
    prisma.v1AuthIdentity.findUnique.mockResolvedValue({
      id: 'identity-1',
      status: 'active',
      user: {
        id: 'user-1', email: null, accountStatus: 'active',
        onboardingStatus: 'completed', createdAt: new Date(), updatedAt: new Date(),
      },
    });

    await signIn();

    expect(prisma.v1AuthIdentity.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { provider_providerUserKey: { provider: V1AuthProvider.apple, providerUserKey: SUBJECT } },
      }),
    );
    expect(prisma.v1User.findUnique).not.toHaveBeenCalled();
  });

  it('creates a user whose signup still owes the terms step', async () => {
    appleIdentity.verifyIdentityToken.mockResolvedValue(claims());
    prisma.v1AuthIdentity.findUnique.mockResolvedValue(null);
    prisma.v1User.findUnique.mockResolvedValue(null);
    prisma.v1User.create.mockResolvedValue({ id: 'user-1', email: 'zzz@privaterelay.appleid.com' });

    await service.appleSignIn({ identityToken: 'token', nonce: 'nonce', fullName: '김선준' });

    const created = prisma.v1User.create.mock.calls[0][0];
    expect(created.data).toMatchObject({
      email: 'zzz@privaterelay.appleid.com',
      onboardingStatus: 'social_terms_required',
      authIdentities: { create: expect.objectContaining({ provider: V1AuthProvider.apple, providerUserKey: SUBJECT }) },
    });
    // Apple sends the name once and never again; if it is not written here it is gone.
    expect(created.data.onboardingProgress.create.draftJson).toEqual({ appleName: '김선준' });
  });

  /** A relay address is a real address for our purposes — it just forwards. */
  it('keeps a private relay address as the account email', async () => {
    appleIdentity.verifyIdentityToken.mockResolvedValue(claims());
    prisma.v1AuthIdentity.findUnique.mockResolvedValue(null);
    prisma.v1User.findUnique.mockResolvedValue(null);
    prisma.v1User.create.mockResolvedValue({ id: 'user-1', email: 'zzz@privaterelay.appleid.com' });

    await signIn();

    expect(prisma.v1User.create.mock.calls[0][0].data.email).toBe('zzz@privaterelay.appleid.com');
  });

  it('links to an existing account when Apple vouches for it AND we verified that address ourselves', async () => {
    appleIdentity.verifyIdentityToken.mockResolvedValue(claims({ email: 'Someone@Example.com' }));
    prisma.v1AuthIdentity.findUnique.mockResolvedValue(null);
    prisma.v1User.findUnique.mockResolvedValue({
      id: 'user-9', email: 'someone@example.com', accountStatus: 'active', emailVerifiedAt: new Date('2026-01-01'),
    });

    await signIn();

    expect(prisma.v1User.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'someone@example.com' } }));
    expect(prisma.v1AuthIdentity.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-9', provider: V1AuthProvider.apple }) }),
    );
    expect(prisma.v1User.create).not.toHaveBeenCalled();
  });

  it('does not create an Apple identity when the candidate changes before the transaction re-read', async () => {
    appleIdentity.verifyIdentityToken.mockResolvedValue(claims({ email: 'Someone@Example.com' }));
    prisma.v1AuthIdentity.findUnique.mockResolvedValue(null);
    prisma.v1User.findUnique
      .mockResolvedValueOnce({
        id: 'user-9', email: 'someone@example.com', accountStatus: 'active', emailVerifiedAt: new Date('2026-01-01'),
      })
      .mockResolvedValueOnce({
        id: 'user-9', email: 'changed@example.com', accountStatus: 'active', emailVerifiedAt: new Date('2026-01-01'),
      });

    await expect(signIn()).rejects.toMatchObject({
      response: { code: 'SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL' },
    });
    expect(prisma.v1AuthIdentity.create).not.toHaveBeenCalled();
  });

  it('does not create an Apple identity when the guarded candidate claim affects zero rows', async () => {
    appleIdentity.verifyIdentityToken.mockResolvedValue(claims({ email: 'Someone@Example.com' }));
    prisma.v1AuthIdentity.findUnique.mockResolvedValue(null);
    prisma.v1User.findUnique.mockResolvedValue({
      id: 'user-9', email: 'someone@example.com', accountStatus: 'active', emailVerifiedAt: new Date('2026-01-01'),
    });
    prisma.v1User.updateMany.mockResolvedValue({ count: 0 });

    await expect(signIn()).rejects.toMatchObject({
      response: { code: 'SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL' },
    });
    expect(prisma.v1AuthIdentity.create).not.toHaveBeenCalled();
  });

  /**
   * Account pre-hijacking. Apple's `email_verified` proves the address is theirs, not that the
   * account holding it here is. `PATCH /me/profile` takes an email with no ownership proof and
   * sets emailVerifiedAt to null, so an attacker can park a victim's Apple address on their own
   * account and wait. Without this gate the victim's FIRST Apple sign-in lands in that account.
   */
  it('refuses to link when we never verified that address ourselves', async () => {
    appleIdentity.verifyIdentityToken.mockResolvedValue(claims({ email: 'victim@example.com' }));
    prisma.v1AuthIdentity.findUnique.mockResolvedValue(null);
    prisma.v1User.findUnique.mockResolvedValue({
      id: 'attacker-1', email: 'victim@example.com', accountStatus: 'active', emailVerifiedAt: null,
    });

    await expect(signIn()).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL' }),
    });

    // Neither outcome may happen: no identity attached to the squatting account, and no second
    // account either — V1User.email is unique, so a silent fall-through would be a 500.
    expect(prisma.v1AuthIdentity.create).not.toHaveBeenCalled();
    expect(prisma.v1User.create).not.toHaveBeenCalled();
  });

  /**
   * The takeover this guard exists to stop: an unverified address is a claim, not a proof,
   * and honouring it would hand over whichever account owns that mailbox.
   */
  it('does not link on an unverified address — it makes a separate account', async () => {
    appleIdentity.verifyIdentityToken.mockResolvedValue(claims({ email: 'victim@example.com', emailVerified: false }));
    prisma.v1AuthIdentity.findUnique.mockResolvedValue(null);
    prisma.v1User.create.mockResolvedValue({ id: 'user-new', email: null });

    await signIn();

    expect(prisma.v1User.findUnique).not.toHaveBeenCalled();
    expect(prisma.v1User.create).toHaveBeenCalled();
    expect(prisma.v1User.create.mock.calls[0][0].data.email).toBeNull();
  });

  it('refuses an account that is not active', async () => {
    appleIdentity.verifyIdentityToken.mockResolvedValue(claims());
    prisma.v1AuthIdentity.findUnique.mockResolvedValue({
      id: 'identity-1',
      status: 'active',
      user: {
        id: 'user-1', email: null, accountStatus: 'suspended',
        onboardingStatus: 'completed', createdAt: new Date(), updatedAt: new Date(),
      },
    });

    await expect(signIn()).rejects.toBeInstanceOf(ForbiddenException);
  });

  /** Withdrawal-pending gets its own message, as every other sign-in path does. */
  it('tells a withdrawal-pending account apart from a plain refusal', async () => {
    appleIdentity.verifyIdentityToken.mockResolvedValue(claims());
    prisma.v1AuthIdentity.findUnique.mockResolvedValue({
      id: 'identity-1',
      status: 'active',
      user: {
        id: 'user-1', email: null, accountStatus: 'withdrawal_pending',
        onboardingStatus: 'completed', createdAt: new Date(), updatedAt: new Date(),
      },
    });

    await expect(signIn()).rejects.toMatchObject({
      response: { code: 'ACCOUNT_WITHDRAWAL_PENDING' },
    });
  });

  it('does not touch the database when the token is refused', async () => {
    appleIdentity.verifyIdentityToken.mockRejectedValue(new Error('refused'));

    await expect(signIn()).rejects.toThrow('refused');
    expect(prisma.v1AuthIdentity.findUnique).not.toHaveBeenCalled();
    expect(prisma.v1User.create).not.toHaveBeenCalled();
  });
});

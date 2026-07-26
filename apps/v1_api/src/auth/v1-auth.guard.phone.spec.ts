import { PrismaService } from '../prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';
import { V1AuthGuard } from './v1-auth.guard';

describe('V1AuthGuard phone verification gate', () => {
  const prisma = { v1User: { findFirst: jest.fn() } };
  const managedTerms = {
    signupCompliance: jest.fn().mockResolvedValue({
      compliant: true,
      pendingRequiredDocumentIds: [],
      nextRoute: null,
    }),
  };
  const guard = new V1AuthGuard(
    prisma as unknown as PrismaService,
    managedTerms as unknown as ManagedTermsRuntimeService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    managedTerms.signupCompliance.mockResolvedValue({
      compliant: true,
      pendingRequiredDocumentIds: [],
      nextRoute: null,
    });
    mockUser({ phoneVerifiedAt: null });
  });

  it('blocks a write from an unverified account and hands back the verification route', async () => {
    await expect(
      guard.canActivate(context('POST', '/api/v1/tournaments/t-1/registrations')),
    ).rejects.toMatchObject({
      response: {
        code: 'PHONE_VERIFICATION_REQUIRED',
        details: { next: { route: '/my/phone-verify' } },
      },
    });
  });

  it('still lets the unverified account read', async () => {
    await expect(guard.canActivate(context('GET', '/api/v1/tournaments'))).resolves.toBe(true);
  });

  it('lets a verified account write', async () => {
    mockUser({ phoneVerifiedAt: new Date('2026-07-20T00:00:00.000Z') });

    await expect(
      guard.canActivate(context('POST', '/api/v1/tournaments/t-1/registrations')),
    ).resolves.toBe(true);
  });

  it('does not gate an account that is still finishing social signup', async () => {
    // 소셜 가입 게이트가 이미 흐름을 통제한다 — 여기서 또 막으면 가입을 끝낼 수 없다.
    mockUser({ phoneVerifiedAt: null, onboardingStatus: 'social_profile_required' });

    await expect(guard.canActivate(context('POST', '/api/v1/auth/social-profile'))).resolves.toBe(true);
  });

  it('can be switched off for an emergency with the explicit env opt-out', async () => {
    const original = process.env.V1_PHONE_VERIFICATION_DISABLED;
    process.env.V1_PHONE_VERIFICATION_DISABLED = 'true';
    try {
      await expect(
        guard.canActivate(context('POST', '/api/v1/tournaments/t-1/registrations')),
      ).resolves.toBe(true);
    } finally {
      if (original === undefined) delete process.env.V1_PHONE_VERIFICATION_DISABLED;
      else process.env.V1_PHONE_VERIFICATION_DISABLED = original;
    }
  });

  function mockUser(overrides: {
    phoneVerifiedAt: Date | null;
    onboardingStatus?: string;
  }) {
    prisma.v1User.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'user@teameet.v1',
      accountStatus: 'active',
      onboardingStatus: overrides.onboardingStatus ?? 'completed',
      phoneVerifiedAt: overrides.phoneVerifiedAt,
    });
  }

  function context(method: string, url: string) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          originalUrl: url,
          url,
          headers: { 'x-v1-user-id': 'user-1' },
          header: (name: string) =>
            name.toLowerCase() === 'x-v1-user-id' ? 'user-1' : undefined,
        }),
      }),
    } as never;
  }
});

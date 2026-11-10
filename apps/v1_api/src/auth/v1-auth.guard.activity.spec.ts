import { PrismaService } from '../prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';
import { V1AuthGuard } from './v1-auth.guard';

describe('V1AuthGuard activity profile gate', () => {
  const prisma = {
    v1User: { findFirst: jest.fn() },
    v1UserSportPreference: { count: jest.fn() },
    v1AuthIdentity: { count: jest.fn() },
  };
  const managedTerms = { signupCompliance: jest.fn() };
  const guard = new V1AuthGuard(
    prisma as unknown as PrismaService,
    managedTerms as unknown as ManagedTermsRuntimeService,
  );
  const compliant = { compliant: true, pendingRequiredDocumentIds: [], nextRoute: null };

  beforeEach(() => {
    jest.clearAllMocks();
    managedTerms.signupCompliance.mockResolvedValue(compliant);
    prisma.v1UserSportPreference.count.mockResolvedValue(0);
    prisma.v1AuthIdentity.count.mockResolvedValue(1);
  });

  describe('social_profile_deferred', () => {
    beforeEach(() => mockUser({ onboardingStatus: 'social_profile_deferred' }));

    it.each([
      ['POST', '/api/v1/teams'],
      ['POST', '/api/v1/tournaments/t-1/registrations'],
      ['PATCH', '/api/v1/team-matches/m-1'],
    ])('blocks %s %s with the profile route', async (method, url) => {
      await expect(guard.canActivate(context(method, url))).rejects.toMatchObject({
        response: {
          code: 'ACTIVITY_PROFILE_REQUIRED',
          details: { missing: ['basicProfile', 'interestSport'], next: { route: '/signup/social' } },
        },
      });
    });

    it('lists the phone too when it is unverified, and drops the sport once one is chosen', async () => {
      prisma.v1UserSportPreference.count.mockResolvedValue(2);
      mockUser({ onboardingStatus: 'social_profile_deferred', phoneVerifiedAt: null });

      await expect(guard.canActivate(context('POST', '/api/v1/teams'))).rejects.toMatchObject({
        response: { details: { missing: ['phone', 'basicProfile'], next: { route: '/signup/social' } } },
      });
    });

    it.each([
      ['GET', '/api/v1/tournaments'],
      ['GET', '/api/v1/auth/me'],
      ['POST', '/api/v1/auth/social-profile'],
      ['POST', '/api/v1/auth/check-nickname'],
      ['POST', '/api/v1/verification/phone/confirm'],
      ['POST', '/api/v1/verification/phone/request'],
      ['PATCH', '/api/v1/onboarding/preferences'],
    ])('lets %s %s through', async (method, url) => {
      await expect(guard.canActivate(context(method, url))).resolves.toBe(true);
    });

    it('answers before the phone gate, so the unverified phone is not the reason shown', async () => {
      mockUser({ onboardingStatus: 'social_profile_deferred', phoneVerifiedAt: null });

      await expect(guard.canActivate(context('POST', '/api/v1/teams'))).rejects.toMatchObject({
        response: { code: 'ACTIVITY_PROFILE_REQUIRED' },
      });
    });

    it('asks for the new terms before the profile when reconsent is pending', async () => {
      managedTerms.signupCompliance.mockResolvedValue({
        compliant: false,
        pendingRequiredDocumentIds: ['doc-1'],
        nextRoute: '/terms/reconsent',
      });

      await expect(guard.canActivate(context('POST', '/api/v1/teams'))).rejects.toMatchObject({
        response: { code: 'TERMS_RECONSENT_REQUIRED' },
      });
    });

    it('exempts an active platform admin like the phone gate does', async () => {
      mockUser({ onboardingStatus: 'social_profile_deferred', adminUser: { status: 'active' } });

      await expect(guard.canActivate(context('POST', '/api/v1/teams'))).resolves.toBe(true);
    });

    it('does not exempt a revoked admin', async () => {
      mockUser({ onboardingStatus: 'social_profile_deferred', adminUser: { status: 'revoked' } });

      await expect(guard.canActivate(context('POST', '/api/v1/teams'))).rejects.toMatchObject({
        response: { code: 'ACTIVITY_PROFILE_REQUIRED' },
      });
    });
  });

  describe('deferred (interest sport skipped)', () => {
    it('blocks a social account without a sport and sends it to the sport step', async () => {
      mockUser({ onboardingStatus: 'deferred' });

      await expect(guard.canActivate(context('POST', '/api/v1/teams'))).rejects.toMatchObject({
        response: {
          code: 'ACTIVITY_PROFILE_REQUIRED',
          details: { missing: ['interestSport'], next: { route: '/onboarding/sport' } },
        },
      });
    });

    it('lets it through once a sport exists', async () => {
      prisma.v1UserSportPreference.count.mockResolvedValue(1);
      mockUser({ onboardingStatus: 'deferred' });

      await expect(guard.canActivate(context('POST', '/api/v1/teams'))).resolves.toBe(true);
    });

    it('does not touch an email signup that skipped onboarding', async () => {
      prisma.v1AuthIdentity.count.mockResolvedValue(0);
      mockUser({ onboardingStatus: 'deferred' });

      await expect(guard.canActivate(context('POST', '/api/v1/teams'))).resolves.toBe(true);
    });

    it('keeps the sport step itself reachable', async () => {
      mockUser({ onboardingStatus: 'deferred' });

      await expect(guard.canActivate(context('PATCH', '/api/v1/onboarding/preferences'))).resolves.toBe(true);
      await expect(guard.canActivate(context('GET', '/api/v1/teams'))).resolves.toBe(true);
    });
  });

  describe('control: everyone else is unchanged', () => {
    it('lets legacy email-setup flags continue onboarding without adding another login method', async () => {
      mockUser({ onboardingStatus: 'signup_done', signupEmailLoginRequired: true });
      await expect(guard.canActivate(context('POST', '/api/v1/onboarding/preferences'))).resolves.toBe(true);
    });

    it('allows the email setup endpoints while setup is required', async () => {
      mockUser({ onboardingStatus: 'signup_done', signupEmailLoginRequired: true });
      await expect(guard.canActivate(context('POST', '/api/v1/auth/link/email/request'))).resolves.toBe(true);
    });
    it('lets a completed, verified user write', async () => {
      mockUser({ onboardingStatus: 'completed' });

      await expect(guard.canActivate(context('POST', '/api/v1/teams'))).resolves.toBe(true);
    });

    it('still reports an unverified regular user as PHONE_VERIFICATION_REQUIRED', async () => {
      mockUser({ onboardingStatus: 'completed', phoneVerifiedAt: null });

      await expect(guard.canActivate(context('POST', '/api/v1/teams'))).rejects.toMatchObject({
        response: { code: 'PHONE_VERIFICATION_REQUIRED' },
      });
    });

    it('still reports SIGNUP_INCOMPLETE for social_profile_required', async () => {
      mockUser({ onboardingStatus: 'social_profile_required' });

      await expect(guard.canActivate(context('POST', '/api/v1/teams'))).rejects.toMatchObject({
        response: { code: 'SIGNUP_INCOMPLETE' },
      });
    });

    it('lets social_profile_required reach the defer endpoint', async () => {
      mockUser({ onboardingStatus: 'social_profile_required' });

      await expect(
        guard.canActivate(context('POST', '/api/v1/auth/social-profile/defer')),
      ).resolves.toBe(true);
    });
  });

  function mockUser(overrides: {
    onboardingStatus: string;
    signupEmailLoginRequired?: boolean;
    phoneVerifiedAt?: Date | null;
    adminUser?: { status: string } | null;
  }) {
    prisma.v1User.findFirst.mockResolvedValue({
      id: 'user-1',
      email: null,
      accountStatus: 'active',
      onboardingStatus: overrides.onboardingStatus,
      signupEmailLoginRequired: overrides.signupEmailLoginRequired ?? false,
      phoneVerifiedAt:
        overrides.phoneVerifiedAt === undefined
          ? new Date('2026-07-20T00:00:00.000Z')
          : overrides.phoneVerifiedAt,
      adminUser: overrides.adminUser ?? null,
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

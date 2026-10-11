import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from './integration/integration-app';

const deferringUserId = 'integration-social-defer-user';
const finishedUserId = 'integration-social-defer-finished';
const emailUserId = 'integration-social-defer-email';
const takenNicknameUserId = 'integration-social-defer-taken';
const noAgeUserId = 'integration-social-defer-no-age';
const ids = [deferringUserId, finishedUserId, emailUserId, takenNicknameUserId, noAgeUserId];

/**
 * Social signup that skips the profile form: the state machine plus the V1AuthGuard write gate,
 * against a real DB and real HTTP.
 */
describe('V1 social profile deferral integration', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await cleanupFixtures();

    await prisma.v1User.createMany({
      data: [
        { id: deferringUserId, onboardingStatus: 'social_profile_required' },
        { id: noAgeUserId, onboardingStatus: 'social_profile_required' },
        {
          id: finishedUserId,
          onboardingStatus: 'deferred',
          phone: '01012340001',
          phoneVerifiedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        {
          id: emailUserId,
          email: 'social-defer-email@integration.test',
          onboardingStatus: 'completed',
          phone: '01012340002',
          phoneVerifiedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        { id: takenNicknameUserId, onboardingStatus: 'completed' },
      ],
    });
    await prisma.v1AuthIdentity.createMany({
      data: [
        { userId: deferringUserId, provider: 'kakao', providerUserKey: 'integration-social-defer-kakao', status: 'active' },
        { userId: noAgeUserId, provider: 'kakao', providerUserKey: 'integration-social-defer-no-age', status: 'active' },
      ],
    });
    await prisma.v1UserOnboardingProgress.createMany({
      data: [
        {
          userId: deferringUserId,
          currentStep: 'signup',
          draftJson: { kakaoNickname: '디퍼카카오', ageConfirmedAt: new Date().toISOString() },
        },
        // Accepted terms before the 14+ checkbox existed: no ageConfirmedAt in the draft.
        { userId: noAgeUserId, currentStep: 'signup', draftJson: { kakaoNickname: '나이미확인' } },
      ],
    });
    // The nickname the deferring user would pick is already taken, forcing the numeric suffix.
    await prisma.v1UserProfile.create({
      data: { userId: takenNicknameUserId, nickname: '디퍼카카오', visibility: 'public' },
    });
    await prisma.v1UserProfile.create({
      data: { userId: finishedUserId, nickname: '디퍼완료', visibility: 'public' },
    });

    // Reconsent runs before the activity gate; keep every fixture compliant so only the
    // onboarding status differs between users.
    const termsService = app.get(ManagedTermsRuntimeService);
    const terms = await termsService.currentSignupTerms();
    const required = terms.items
      .filter((item) => item.requirement === 'required')
      .map((item) => item.documentId);
    await Promise.all(
      ids.map((id) => termsService.acceptSignupTerms(id, required)),
    );
  });

  afterAll(async () => {
    await cleanupFixtures();
    await cleanupApp?.();
  });

  async function cleanupFixtures() {
    if (!prisma) return;
    await prisma.v1ManagedTermsConsentEvent.deleteMany({ where: { userId: { in: ids } } });
    await prisma.v1UserTermsConsent.deleteMany({ where: { userId: { in: ids } } });
    await prisma.v1UserOnboardingProgress.deleteMany({ where: { userId: { in: ids } } });
    await prisma.v1AuthIdentity.deleteMany({ where: { userId: { in: ids } } });
    await prisma.v1UserProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.v1User.deleteMany({ where: { id: { in: ids } } });
  }

  it('defers the profile: creates a suffixed nickname and moves to social_profile_deferred', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/social-profile/defer')
      .set('x-v1-user-id', deferringUserId)
      .expect(201);

    const user = await prisma.v1User.findUniqueOrThrow({
      where: { id: deferringUserId },
      select: { onboardingStatus: true, profile: { select: { nickname: true, realName: true } } },
    });
    expect(user.onboardingStatus).toBe('social_profile_deferred');
    expect(user.profile?.nickname).toMatch(/^디퍼카카오\d{2,4}$/);
    expect(user.profile?.realName).toBeNull();
  });

  it('sends an account without the 14+ confirmation back to terms instead of deferring', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/social-profile/defer')
      .set('x-v1-user-id', noAgeUserId)
      .expect(400);

    expect(response.body.code).toBe('TERMS_REQUIRED');
    const user = await prisma.v1User.findUniqueOrThrow({
      where: { id: noAgeUserId },
      select: { onboardingStatus: true, profile: { select: { id: true } } },
    });
    expect(user.onboardingStatus).toBe('social_terms_required');
    expect(user.profile).toBeNull();
  });

  it('cannot defer twice', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/social-profile/defer')
      .set('x-v1-user-id', deferringUserId)
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('lets the deferred account read', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/me/profile')
      .set('x-v1-user-id', deferringUserId)
      .expect(200);
  });

  it('blocks a write that reaches another user, with the profile route', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/teams')
      .set('x-v1-user-id', deferringUserId)
      .send({ name: '디퍼팀', sportId: 'football' })
      .expect(403);

    expect(response.body.code).toBe('ACTIVITY_PROFILE_REQUIRED');
    expect(response.body.details?.next?.route).toBe('/signup/social');
  });

  it('keeps the profile form endpoints reachable while deferred', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/check-nickname')
      .set('x-v1-user-id', deferringUserId)
      .send({ nickname: '디퍼새닉' });

    expect(response.status).not.toBe(403);
  });

  it('does not open the gate through the preference onboarding endpoints', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/onboarding/defer')
      .set('x-v1-user-id', deferringUserId)
      .send({ reason: 'later' });

    const user = await prisma.v1User.findUniqueOrThrow({
      where: { id: deferringUserId },
      select: { onboardingStatus: true },
    });
    expect(user.onboardingStatus).toBe('social_profile_deferred');
  });

  it('control: once the profile is finished the same write is no longer stopped by this gate', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/teams')
      .set('x-v1-user-id', finishedUserId)
      .send({ name: '디퍼완료팀', sportId: 'football' });

    expect(response.body.code).not.toBe('ACTIVITY_PROFILE_REQUIRED');
    expect(response.body.code).not.toBe('PHONE_VERIFICATION_REQUIRED');
  });

  it('control: an email-signup user is unaffected', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/teams')
      .set('x-v1-user-id', emailUserId)
      .send({ name: '디퍼이메일팀', sportId: 'football' });

    expect(response.body.code).not.toBe('ACTIVITY_PROFILE_REQUIRED');
  });
});

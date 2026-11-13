import type { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import request = require('supertest');
import { PrismaService } from '../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from './integration/integration-app';

type KakaoAccount = {
  readonly email?: string; readonly is_email_valid?: boolean; readonly is_email_verified?: boolean;
  readonly phone_number?: string; readonly name?: string; readonly gender?: string;
  readonly birthyear?: string; readonly birthday?: string; readonly birthday_type?: string;
  readonly profile?: { readonly nickname?: string; readonly profile_image_url?: string };
};
class KakaoContactFixtureError extends Error {}

/** Real HTTP, persistence and guards; only the external Kakao server is substituted. */
describe('Kakao confirmed contacts and existing membership', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  const originalFetch = global.fetch;
  const savedAppId = process.env.KAKAO_APP_ID;
  const savedPhoneDisabled = process.env.V1_PHONE_VERIFICATION_DISABLED;
  const savedSessionSecret = process.env.V1_SESSION_SECRET;
  const holderId = 'integration-kakao-contact-holder';
  const otherId = 'integration-kakao-contact-other';
  const email = 'kakao-contact-holder@integration.test';
  const phone = '01055550991';
  const keys = Array.from({ length: 12 }, (_, i) => String(945100001 + i));
  const signupPhone = '01055550996';
  const signupId = {
    profile: 'integration-kakao-contact-signup-profile',
    deferred: 'integration-kakao-contact-signup-deferred',
    operator: 'integration-kakao-contact-signup-operator',
    secondLogin: 'integration-kakao-contact-signup-second-login',
  } as const;
  let sequence = 0;
  let ownedTermsPolicyId: string | undefined;

  beforeAll(async () => {
    process.env.KAKAO_APP_ID = '1604606';
    process.env.V1_PHONE_VERIFICATION_DISABLED = 'false';
    process.env.V1_SESSION_SECRET = 'integration-kakao-contact-session-secret-0123456789';
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await cleanupFixtures();
    if (!(await app.get(ManagedTermsRuntimeService).currentSignupTerms()).ready) {
      const content = '격리된 카카오 계정 연결 테스트 전용 필수 약관입니다.';
      const policy = await prisma.v1ManagedTermsPolicy.create({ data: {
        code: 'integration-kakao-contact-policy', name: '카카오 계정 연결 테스트 약관',
        documents: { create: { version: '1', title: '카카오 계정 연결 테스트 약관', content,
          contentHash: createHash('sha256').update(content).digest('hex'), status: 'published',
          publishedAt: new Date('2026-01-01T00:00:00.000Z'), effectiveAt: new Date('2026-01-01T00:00:00.000Z') } },
        placements: { create: { context: 'signup', requirement: 'required' } },
      } });
      ownedTermsPolicyId = policy.id;
    }
  }, 60_000);
  beforeEach(async () => {
    await cleanupFixtures();
    await prisma.v1User.create({
      data: {
        id: holderId, email, emailVerifiedAt: new Date(), phone, phoneVerifiedAt: new Date(), onboardingStatus: 'completed',
        profile: { create: { nickname: '카카오연결기존회원', realName: '기존 회원', birthDate: '19900101', gender: 'female' } },
        authIdentities: { create: { provider: 'email', providerUserKey: email, status: 'active', passwordHash: 'fixture-not-used-for-login' } },
      },
    });
  });
  afterEach(() => { global.fetch = originalFetch; });
  afterAll(async () => {
    global.fetch = originalFetch;
    await cleanupFixtures();
    if (ownedTermsPolicyId !== undefined) {
      await prisma.v1ManagedTermsPlacement.deleteMany({ where: { policyId: ownedTermsPolicyId } });
      await prisma.v1ManagedTermsDocument.deleteMany({ where: { policyId: ownedTermsPolicyId } });
      await prisma.v1ManagedTermsPolicy.delete({ where: { id: ownedTermsPolicyId } });
    }
    await cleanupApp?.();
    if (savedAppId === undefined) delete process.env.KAKAO_APP_ID; else process.env.KAKAO_APP_ID = savedAppId;
    if (savedPhoneDisabled === undefined) delete process.env.V1_PHONE_VERIFICATION_DISABLED; else process.env.V1_PHONE_VERIFICATION_DISABLED = savedPhoneDisabled;
    if (savedSessionSecret === undefined) delete process.env.V1_SESSION_SECRET; else process.env.V1_SESSION_SECRET = savedSessionSecret;
  });
  async function cleanupFixtures() {
    if (!prisma) return;
    const linked = await prisma.v1AuthIdentity.findMany({ where: { provider: 'kakao', providerUserKey: { in: keys } }, select: { userId: true } });
    const ids = [holderId, otherId, ...Object.values(signupId), ...linked.map((row) => row.userId)];
    await prisma.v1StatusChangeLog.deleteMany({ where: { OR: [{ actorUserId: { in: ids } }, { targetId: { in: ids } }] } });
    await prisma.v1ManagedTermsConsentEvent.deleteMany({ where: { userId: { in: ids } } });
    await prisma.v1User.deleteMany({ where: { id: { in: ids } } });
  }
  function takeKakaoKey() {
    const key = keys[sequence++];
    if (typeof key !== 'string') throw new KakaoContactFixtureError('Kakao fixture keys exhausted');
    return key;
  }
  function kakao(account: KakaoAccount, key = takeKakaoKey()) {
    global.fetch = async (url, init) => {
      if (String(url) === 'https://kapi.kakao.com/v1/user/access_token_info') return new Response(JSON.stringify({ id: key, app_id: 1604606 }));
      if (String(url) === 'https://kapi.kakao.com/v2/user/me') return new Response(JSON.stringify({ id: key, kakao_account: account }));
      return originalFetch(url, init);
    };
    return request(app.getHttpServer()).post('/api/v1/auth/kakao/token').send({ accessToken: 'integration-kakao-contact-token' });
  }
  async function signUpThroughTerms(account: KakaoAccount) {
    const response = await kakao(account).expect(201);
    const id: unknown = response.body.data.session.userId;
    if (typeof id !== 'string') throw new KakaoContactFixtureError('Kakao signup did not issue a user identity');
    const terms = await app.get(ManagedTermsRuntimeService).currentSignupTerms();
    await request(app.getHttpServer()).post('/api/v1/auth/social-terms').set('x-v1-user-id', id).send({
      requiredTermsAccepted: true, ageConfirmed: true,
      acceptedTermsDocumentIds: terms.items.filter((item) => item.requirement === 'required').map((item) => item.documentId),
    }).expect(201);
    return id;
  }
  const draftOf = async (id: string) => (await prisma.v1UserOnboardingProgress.findUniqueOrThrow({ where: { userId: id } })).draftJson;
  const kakaoValues = { kakaoName: '신규 회원', kakaoPhone: '01055550993', kakaoGender: 'female', kakaoBirthDate: '20000229' };
  const kakaoAccount = {
    phone_number: '+82 10-5555-0993', name: '신규 회원', gender: 'female', birthyear: '2000', birthday: '0229', birthday_type: 'SOLAR',
  } as const;

  function memberState() {
    return Promise.all([
      prisma.v1User.findMany({ where: { id: { in: [holderId, otherId] } }, orderBy: { id: 'asc' },
        include: { profile: true, authIdentities: { orderBy: { id: 'asc' } }, inquiries: { orderBy: { id: 'asc' } },
          onboardingProgress: true, notificationPreference: true } }),
      prisma.v1User.count(),
      prisma.v1StatusChangeLog.findMany({ where: { actorUserId: { in: [holderId, otherId] } }, orderBy: { id: 'asc' } }),
      prisma.v1ManagedTermsConsentEvent.findMany({ where: { userId: { in: [holderId, otherId] } }, orderBy: { id: 'asc' } }),
      prisma.v1PhoneVerificationChallenge.findMany({ where: { phone: { in: [phone, '01055550992'] } }, orderBy: { id: 'asc' } }),
    ]);
  }

  it.each(['email', 'both'])('links matching verified %s to the original user and preserves the profile/email identity', async (match) => {
    const account = {
      email, is_email_valid: true, is_email_verified: true,
      ...(match === 'both' ? { phone_number: '+82 10-5555-0991' } : {}),
    };
    const response = await kakao(account).expect(201);
    expect(response.body.data.session.userId).toBe(holderId);
    const stored = await prisma.v1User.findUniqueOrThrow({ where: { id: holderId }, include: { profile: true, authIdentities: true } });
    expect(stored.profile?.nickname).toBe('카카오연결기존회원');
    expect(stored.authIdentities.map((identity) => identity.provider).sort()).toEqual(['email', 'kakao']);
    expect(await prisma.v1User.count({ where: { phone } })).toBe(1);
    expect(await prisma.v1PhoneVerificationChallenge.count({ where: { phone } })).toBe(0);
  });

  it('rejects a phone-only new identity without changing the holder or issuing a session', async () => {
    const before = await memberState();
    const response = await kakao({ phone_number: '+82 10-5555-0991' }).expect(409);
    expect(response.body.code).toBe('SOCIAL_LINK_REQUIRES_ACCOUNT_PROOF');
    expect(response.body.details).toEqual({ next: 'sign_in_then_link', provider: 'kakao', linkToken: expect.any(String), linkTokenExpiresInSeconds: 1800 });
    expect(response.body).not.toHaveProperty('data.session');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await memberState()).toEqual(before);
    expect(await prisma.v1AuthIdentity.count({ where: { provider: 'kakao', providerUserKey: { in: keys } } })).toBe(0);
  });

  it('answers a withdrawal-pending holder with the link token and the date the withdrawal becomes final, attaching nothing', async () => {
    const requestedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await prisma.v1User.update({ where: { id: holderId }, data: { accountStatus: 'withdrawal_pending' } });
    await prisma.v1StatusChangeLog.create({
      data: { targetType: 'user', targetId: holderId, fromStatus: 'active', toStatus: 'withdrawal_pending', actorType: 'user', actorUserId: holderId, createdAt: requestedAt },
    });
    const before = await prisma.v1User.findUniqueOrThrow({ where: { id: holderId }, include: { authIdentities: true } });

    const response = await kakao({ email, is_email_valid: true, is_email_verified: true }).expect(409);

    expect(response.body.code).toBe('SOCIAL_LINK_REQUIRES_ACCOUNT_PROOF');
    expect(response.body.details).toEqual({
      next: 'sign_in_then_link', provider: 'kakao', linkToken: expect.any(String), linkTokenExpiresInSeconds: 1800,
      withdrawalPendingUntil: new Date(requestedAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(response.headers['set-cookie']).toBeUndefined();
    const after = await prisma.v1User.findUniqueOrThrow({ where: { id: holderId }, include: { authIdentities: true } });
    expect(after).toEqual(before);
    expect(await prisma.v1AuthIdentity.count({ where: { provider: 'kakao', providerUserKey: { in: keys } } })).toBe(0);
  });

  /** A Kakao signup parked on `onboardingStatus` that still holds the number it saved along the way. */
  async function seedSignup(id: string, onboardingStatus: 'social_terms_required' | 'social_profile_required' | 'social_profile_deferred') {
    await prisma.v1User.create({ data: { id, phone: signupPhone, phoneVerifiedAt: new Date(), onboardingStatus } });
    await prisma.v1AuthIdentity.create({ data: { id: `${id}-kakao`, userId: id, provider: 'kakao', providerUserKey: `${id}-key`, status: 'active' } });
  }
  const signOut = (id: string) => request(app.getHttpServer()).post('/api/v1/auth/logout').set('x-v1-user-id', id).expect(201);
  const releaseLogs = (id: string) => prisma.v1StatusChangeLog.findMany({ where: { targetType: 'user_phone', targetId: id, toStatus: 'released' } });

  it('frees the number a Kakao signup saved when it quits on the terms step, so another account can take it', async () => {
    const response = await kakao({ phone_number: '+82 10-5555-0994' }).expect(201);
    const id: unknown = response.body.data.session.userId;
    if (typeof id !== 'string') throw new KakaoContactFixtureError('Kakao signup did not issue a user identity');
    expect(await prisma.v1User.count({ where: { phone: '01055550994' } })).toBe(1);

    await signOut(id);

    await expect(prisma.v1User.findUniqueOrThrow({ where: { id } })).resolves.toMatchObject({
      phone: null, phoneVerifiedAt: null, onboardingStatus: 'social_terms_required',
    });
    await prisma.v1User.create({ data: { id: otherId, phone: '01055550994', phoneVerifiedAt: new Date() } });
    expect(await prisma.v1User.count({ where: { phone: '01055550994' } })).toBe(1);
    expect(await releaseLogs(id)).toMatchObject([{ fromStatus: 'signup', actorType: 'user', actorUserId: id, reason: 'abandoned_signup' }]);
  });

  it('frees the number of a signup that quits on the profile step too', async () => {
    const id = signupId.profile;
    await seedSignup(id, 'social_profile_required');

    await signOut(id);

    await expect(prisma.v1User.findUniqueOrThrow({ where: { id } })).resolves.toMatchObject({ phone: null, phoneVerifiedAt: null });
    expect(await releaseLogs(id)).toHaveLength(1);
  });

  it('keeps the number of a finished member when they sign out', async () => {
    await signOut(holderId);

    await expect(prisma.v1User.findUniqueOrThrow({ where: { id: holderId } })).resolves.toMatchObject({ phone });
    expect(await releaseLogs(holderId)).toHaveLength(0);
  });

  it.each([
    ['skipped the profile step and already uses the account', signupId.deferred, 'social_profile_deferred', async () => undefined],
    ['holds an operator role', signupId.operator, 'social_profile_required', (id: string) => prisma.v1AdminUser.create({ data: { userId: id, adminRole: 'ops', status: 'active' } })],
    ['also signs in with an email and password', signupId.secondLogin, 'social_profile_required', (id: string) =>
      prisma.v1AuthIdentity.create({ data: { userId: id, provider: 'email', providerUserKey: `${id}@integration.test`, passwordHash: 'fixture-not-used-for-login', status: 'active' } })],
  ] as const)('keeps the number of a signup that %s when it signs out', async (_name, id, onboardingStatus, makeDifferent) => {
    await seedSignup(id, onboardingStatus);
    await makeDifferent(id);

    await signOut(id);

    await expect(prisma.v1User.findUniqueOrThrow({ where: { id } })).resolves.toMatchObject({ phone: signupPhone, onboardingStatus });
    expect(await releaseLogs(id)).toHaveLength(0);
  });

  it('signs in an established Kakao identity without email consent and preserves the original membership', async () => {
    const key = takeKakaoKey();
    const identity = await prisma.v1AuthIdentity.create({ data: { userId: holderId, provider: 'kakao', providerUserKey: key, status: 'active' } });
    const response = await kakao({ phone_number: '+82 10-5555-0991' }, key).expect(201);
    expect(response.body.data.session.userId).toBe(holderId);
    const stored = await prisma.v1User.findUniqueOrThrow({ where: { id: holderId }, include: { profile: true, authIdentities: true } });
    expect(stored.email).toBe(email);
    expect(stored.profile?.nickname).toBe('카카오연결기존회원');
    expect(stored.authIdentities.map((row) => row.provider).sort()).toEqual(['email', 'kakao']);
    expect(stored.authIdentities.find((row) => row.id === identity.id)?.userId).toBe(holderId);
    expect(await prisma.v1User.count({ where: { phone } })).toBe(1);
    expect(await prisma.v1PhoneVerificationChallenge.count({ where: { phone } })).toBe(0);
  });

  it('rejects email/phone belonging to different members with no identity or account mutation', async () => {
    await prisma.v1User.create({ data: { id: otherId, phone: '01055550992', phoneVerifiedAt: new Date() } });
    const before = await memberState();
    const response = await kakao({ email, is_email_valid: true, is_email_verified: true, phone_number: '+82 10-5555-0992' }).expect(409);
    expect(response.body.code).toBe('SOCIAL_LINK_CONTACT_CONFLICT');
    expect(response.body.details).toEqual({ next: 'sign_in_then_link', provider: 'kakao', linkToken: expect.any(String), linkTokenExpiresInSeconds: 1800 });
    expect(response.body).not.toHaveProperty('data.session');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await memberState()).toEqual(before);
    expect(await prisma.v1AuthIdentity.count({ where: { provider: 'kakao', providerUserKey: { in: keys } } })).toBe(0);
    expect(await prisma.v1User.count({ where: { id: { in: [holderId, otherId] } } })).toBe(2);
  });

  it('completes a new Kakao profile without creating a phone challenge, even with phone verification enforced', async () => {
    const id = await signUpThroughTerms(kakaoAccount);
    await request(app.getHttpServer()).post('/api/v1/auth/social-profile').set('x-v1-user-id', id).send({
      realName: '신규 회원', phone: '01055550993', birthDate: '20000229', gender: 'female',
    }).expect(201);
    const stored = await prisma.v1User.findUniqueOrThrow({ where: { id }, include: { profile: true } });
    expect(stored.phoneVerifiedAt).not.toBeNull();
    expect(stored.profile?.birthDate).toBe('20000229');
    expect(await prisma.v1PhoneVerificationChallenge.count({ where: { phone: '01055550993' } })).toBe(0);
    expect(await prisma.v1StatusChangeLog.count({ where: { actorUserId: id, reason: 'kakao_provided_phone' } })).toBe(1);
  });

  it('keeps only the Kakao values the profile form fills in — never the nickname or the profile photo — across a repeat login', async () => {
    const key = takeKakaoKey();
    const account = { ...kakaoAccount, profile: { nickname: '카카오닉네임', profile_image_url: 'https://img.example/kakao.png' } };
    const response = await kakao(account, key).expect(201);
    const id: string = response.body.data.session.userId;

    expect(await draftOf(id)).toEqual(kakaoValues);
    await kakao(account, key).expect(201);
    expect(await draftOf(id)).toEqual(kakaoValues);
  });

  it('clears the Kakao values once the profile is finished and keeps the rest of the draft', async () => {
    const id = await signUpThroughTerms(kakaoAccount);
    expect(await draftOf(id)).toEqual({ ...kakaoValues, ageConfirmedAt: expect.any(String), autoNickname: expect.any(String) });

    await request(app.getHttpServer()).post('/api/v1/auth/social-profile').set('x-v1-user-id', id).send({
      realName: '신규 회원', phone: '01055550993', birthDate: '20000229', gender: 'female',
    }).expect(201);

    expect(await draftOf(id)).toEqual({ ageConfirmedAt: expect.any(String), autoNickname: expect.any(String) });
  });

  it('keeps the Kakao values while the profile is deferred and clears them when the deferred profile is finished', async () => {
    const id = await signUpThroughTerms(kakaoAccount);
    await request(app.getHttpServer()).post('/api/v1/auth/social-profile/defer').set('x-v1-user-id', id).expect(201);
    expect(await draftOf(id)).toEqual({ ...kakaoValues, ageConfirmedAt: expect.any(String), autoNickname: expect.any(String) });

    await request(app.getHttpServer()).post('/api/v1/auth/social-profile').set('x-v1-user-id', id).send({
      realName: '신규 회원', phone: '01055550993', birthDate: '20000229', gender: 'female',
    }).expect(201);

    expect(await draftOf(id)).toEqual({ ageConfirmedAt: expect.any(String), autoNickname: expect.any(String) });
  });
});

import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from './integration/integration-app';

/** Real HTTP, persistence and guards; only the external Kakao server is substituted. */
describe('Kakao confirmed contacts and existing membership', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  const originalFetch = global.fetch;
  const savedAppId = process.env.KAKAO_APP_ID;
  const savedPhoneDisabled = process.env.V1_PHONE_VERIFICATION_DISABLED;
  const holderId = 'integration-kakao-contact-holder';
  const otherId = 'integration-kakao-contact-other';
  const email = 'kakao-contact-holder@integration.test';
  const phone = '01055550991';
  const keys = Array.from({ length: 8 }, (_, i) => String(945100001 + i));
  let sequence = 0;

  beforeAll(async () => {
    process.env.KAKAO_APP_ID = '1604606';
    process.env.V1_PHONE_VERIFICATION_DISABLED = 'false';
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await cleanupFixtures();
  });
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
    await cleanupApp?.();
    if (savedAppId === undefined) delete process.env.KAKAO_APP_ID; else process.env.KAKAO_APP_ID = savedAppId;
    if (savedPhoneDisabled === undefined) delete process.env.V1_PHONE_VERIFICATION_DISABLED; else process.env.V1_PHONE_VERIFICATION_DISABLED = savedPhoneDisabled;
  });
  async function cleanupFixtures() {
    if (!prisma) return;
    const linked = await prisma.v1AuthIdentity.findMany({ where: { provider: 'kakao', providerUserKey: { in: keys } }, select: { userId: true } });
    const ids = [holderId, otherId, ...linked.map((row) => row.userId)];
    await prisma.v1StatusChangeLog.deleteMany({ where: { actorUserId: { in: ids } } });
    await prisma.v1ManagedTermsConsentEvent.deleteMany({ where: { userId: { in: ids } } });
    await prisma.v1User.deleteMany({ where: { id: { in: ids } } });
  }
  function kakao(account: Record<string, unknown>) {
    const key = keys[sequence++];
    global.fetch = (async (url, init) => {
      if (String(url) === 'https://kapi.kakao.com/v1/user/access_token_info') return new Response(JSON.stringify({ id: key, app_id: 1604606 }));
      if (String(url) === 'https://kapi.kakao.com/v2/user/me') return new Response(JSON.stringify({ id: key, kakao_account: account }));
      return originalFetch(url, init);
    }) as typeof fetch;
    return request(app.getHttpServer()).post('/api/v1/auth/kakao/token').send({ accessToken: 'integration-kakao-contact-token' });
  }

  it.each(['email', 'phone', 'both'])('links matching verified %s to the original user and preserves the profile/email identity', async (match) => {
    const account = {
      ...(match !== 'phone' ? { email, is_email_valid: true, is_email_verified: true } : {}),
      ...(match !== 'email' ? { phone_number: '+82 10-5555-0991' } : {}),
    };
    const response = await kakao(account).expect(201);
    expect(response.body.data.session.userId).toBe(holderId);
    const stored = await prisma.v1User.findUniqueOrThrow({ where: { id: holderId }, include: { profile: true, authIdentities: true } });
    expect(stored.profile?.nickname).toBe('카카오연결기존회원');
    expect(stored.authIdentities.map((identity) => identity.provider).sort()).toEqual(['email', 'kakao']);
    expect(await prisma.v1User.count({ where: { phone } })).toBe(1);
    expect(await prisma.v1PhoneVerificationChallenge.count({ where: { phone } })).toBe(0);
  });

  it('rejects email/phone belonging to different members with no identity or account mutation', async () => {
    await prisma.v1User.create({ data: { id: otherId, phone: '01055550992', phoneVerifiedAt: new Date() } });
    const response = await kakao({ email, is_email_valid: true, is_email_verified: true, phone_number: '+82 10-5555-0992' }).expect(409);
    expect(response.body.code).toBe('SOCIAL_LINK_CONTACT_CONFLICT');
    expect(await prisma.v1AuthIdentity.count({ where: { provider: 'kakao', providerUserKey: { in: keys } } })).toBe(0);
    expect(await prisma.v1User.count({ where: { id: { in: [holderId, otherId] } } })).toBe(2);
  });

  it('completes a new Kakao profile without creating a phone challenge, even with phone verification enforced', async () => {
    const response = await kakao({
      phone_number: '+82 10-5555-0993', name: '신규 회원', gender: 'female', birthyear: '2000', birthday: '0229', birthday_type: 'SOLAR',
    }).expect(201);
    const id = response.body.data.session.userId as string;
    const terms = await app.get(ManagedTermsRuntimeService).currentSignupTerms();
    await request(app.getHttpServer()).post('/api/v1/auth/social-terms').set('x-v1-user-id', id).send({
      requiredTermsAccepted: true, ageConfirmed: true,
      acceptedTermsDocumentIds: terms.items.filter((item) => item.requirement === 'required').map((item) => item.documentId),
    }).expect(201);
    await request(app.getHttpServer()).post('/api/v1/auth/social-profile').set('x-v1-user-id', id).send({
      nickname: '카카오번호자동확인', realName: '신규 회원', phone: '01055550993', birthDate: '20000229', gender: 'female',
    }).expect(201);
    const stored = await prisma.v1User.findUniqueOrThrow({ where: { id }, include: { profile: true } });
    expect(stored.phoneVerifiedAt).not.toBeNull();
    expect(stored.profile?.birthDate).toBe('20000229');
    expect(await prisma.v1PhoneVerificationChallenge.count({ where: { phone: '01055550993' } })).toBe(0);
    expect(await prisma.v1StatusChangeLog.count({ where: { actorUserId: id, reason: 'kakao_provided_phone' } })).toBe(1);
  });
});

import type { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import request = require('supertest');
import { AuthService, type KakaoProfile } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from './integration/integration-app';

const PREFIX = 'integration-email-self';
const MEMBER = `${PREFIX}-member`;
const VERIFIED = `${PREFIX}-verified`;
const USER_IDS = [MEMBER, VERIFIED];
const emailOf = (id: string) => `${id}@integration.test`;
const KAKAO_KEY = `${PREFIX}-kakao-key`;
const ENV_KEYS = ['V1_SESSION_SECRET', 'V1_VERIFICATION_DEV_ECHO', 'SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'SOLAPI_SENDER_NUMBER', 'EMAIL_FROM'] as const;

describe('V1 signed-in email verification integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let cleanupApp: (() => Promise<void>) | undefined;
  let ownedTermsPolicyId: string | undefined;
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeAll(async () => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    process.env.V1_SESSION_SECRET = 'integration-email-self-session-secret-0123456789';
    // The echoed code is how the spec reads the mail sent to an `.test` address.
    process.env.V1_VERIFICATION_DEV_ECHO = 'true';
    delete process.env.SOLAPI_API_KEY;
    delete process.env.SOLAPI_API_SECRET;
    delete process.env.SOLAPI_SENDER_NUMBER;
    delete process.env.EMAIL_FROM;
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    auth = app.get(AuthService);
    const terms = app.get(ManagedTermsRuntimeService);
    if (!(await terms.currentSignupTerms()).ready) {
      const policy = await prisma.v1ManagedTermsPolicy.create({
        data: { code: `${PREFIX}-policy`, name: '이메일 인증 테스트 전용 약관' },
      });
      ownedTermsPolicyId = policy.id;
      const content = '격리된 이메일 인증 검증에만 사용하는 필수 약관입니다.';
      await prisma.v1ManagedTermsDocument.create({
        data: {
          policyId: policy.id, version: '1', title: '이메일 인증 테스트 전용 약관', content,
          contentHash: createHash('sha256').update(content).digest('hex'), status: 'published',
          publishedAt: new Date('2026-01-01T00:00:00.000Z'), effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
      await prisma.v1ManagedTermsPlacement.create({ data: { policyId: policy.id, context: 'signup', requirement: 'required' } });
    }
  }, 60_000);

  async function cleanupFixtures() {
    if (!prisma) return;
    await prisma.v1StatusChangeLog.deleteMany({ where: { actorUserId: { in: USER_IDS } } });
    await prisma.v1Notification.deleteMany({ where: { recipientUserId: { in: USER_IDS } } });
    await prisma.v1VerificationToken.deleteMany({ where: { userId: { in: USER_IDS } } });
    await prisma.v1ManagedTermsConsentEvent.deleteMany({ where: { userId: { in: USER_IDS } } });
    await prisma.v1User.deleteMany({ where: { id: { in: USER_IDS } } });
  }

  /** A finished email signup: an email login with a password, and an address nobody has proven yet. */
  async function seedEmailMember(id: string, emailVerifiedAt: Date | null) {
    await prisma.v1User.create({
      data: { id, email: emailOf(id), emailVerifiedAt, onboardingStatus: 'completed', phoneVerifiedAt: new Date('2026-07-01T00:00:00.000Z') },
    });
    await prisma.v1AuthIdentity.create({
      data: { id: `${id}-email`, userId: id, provider: 'email', providerUserKey: emailOf(id), passwordHash: 'not-a-real-hash', status: 'active' },
    });
    const terms = app.get(ManagedTermsRuntimeService);
    const required = (await terms.currentSignupTerms()).items.filter((item) => item.requirement === 'required').map((item) => item.documentId);
    await terms.acceptSignupTerms(id, required);
  }

  beforeEach(async () => {
    await cleanupFixtures();
    await seedEmailMember(MEMBER, null);
    await seedEmailMember(VERIFIED, new Date('2026-07-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    try {
      await cleanupFixtures();
      if (ownedTermsPolicyId !== undefined) {
        await prisma.v1ManagedTermsPlacement.deleteMany({ where: { policyId: ownedTermsPolicyId } });
        await prisma.v1ManagedTermsDocument.deleteMany({ where: { policyId: ownedTermsPolicyId } });
        await prisma.v1ManagedTermsPolicy.delete({ where: { id: ownedTermsPolicyId } });
      }
      await cleanupApp?.();
    } finally {
      for (const key of ENV_KEYS) {
        const value = savedEnv[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  const as = (userId: string) => ({ 'x-v1-user-id': userId });
  const post = (path: string, userId: string, body: Record<string, unknown> = {}) =>
    request(app.getHttpServer()).post(`/api/v1${path}`).set(as(userId)).send(body);
  const me = (userId: string) => request(app.getHttpServer()).get('/api/v1/auth/me').set(as(userId));
  const kakaoLoginWithVerifiedEmail = () => {
    const profile: KakaoProfile = {
      providerUserKey: KAKAO_KEY, email: emailOf(MEMBER), emailValid: true, emailVerified: true,
      signupPrefill: null,
    };
    jest.spyOn(auth, 'fetchKakaoProfileForToken').mockResolvedValue(profile);
    return request(app.getHttpServer()).post('/api/v1/auth/kakao/token').send({ accessToken: 'native-sdk-token-0123456789' });
  };

  it('mails a code to the account address, and confirming it turns verification.emailVerified on', async () => {
    expect((await me(MEMBER).expect(200)).body.data.verification.emailVerified).toBe(false);

    const requested = await post('/verification/email/request', MEMBER).expect(200);

    expect(requested.body.data).toMatchObject({ sent: true, channel: 'email', target: 'in***@integration.test' });
    expect(Date.parse(requested.body.data.expiresAt)).toBeGreaterThan(Date.now());
    expect(await prisma.v1VerificationToken.findFirstOrThrow({ where: { userId: MEMBER } }))
      .toMatchObject({ channel: 'email', purpose: 'contact', target: emailOf(MEMBER), consumedAt: null });

    const confirmed = await post('/verification/email/confirm', MEMBER, { code: requested.body.data.devCode }).expect(200);

    expect(confirmed.body.data).toMatchObject({ verified: true, channel: 'email', verification: { emailVerified: true } });
    expect((await prisma.v1User.findUniqueOrThrow({ where: { id: MEMBER } })).emailVerifiedAt).not.toBeNull();
    expect((await me(MEMBER).expect(200)).body.data.verification.emailVerified).toBe(true);
  });

  it('keeps the account unverified after a wrong code', async () => {
    const requested = await post('/verification/email/request', MEMBER).expect(200);
    const wrong = requested.body.data.devCode === '000000' ? '000001' : '000000';

    const refused = await post('/verification/email/confirm', MEMBER, { code: wrong });

    expect([refused.status, refused.body.code]).toEqual([400, 'VERIFICATION_CODE_MISMATCH']);
    expect((await prisma.v1User.findUniqueOrThrow({ where: { id: MEMBER } })).emailVerifiedAt).toBeNull();
  });

  it('refuses a second code for the same address inside the resend cooldown and leaves the first one usable', async () => {
    const first = await post('/verification/email/request', MEMBER).expect(200);

    const again = await post('/verification/email/request', MEMBER);

    expect([again.status, again.body.code]).toEqual([400, 'VERIFICATION_RESEND_COOLDOWN']);
    expect(await prisma.v1VerificationToken.count({ where: { userId: MEMBER } })).toBe(1);
    await post('/verification/email/confirm', MEMBER, { code: first.body.data.devCode }).expect(200);
  });

  it('answers alreadyVerified for a verified address without issuing a code', async () => {
    const response = await post('/verification/email/request', VERIFIED).expect(200);

    expect(response.body.data).toEqual({ sent: false, alreadyVerified: true, channel: 'email' });
    expect(await prisma.v1VerificationToken.count({ where: { userId: VERIFIED } })).toBe(0);
  });

  it('turns a same-address Kakao login from refused into linked once the address is verified', async () => {
    const refused = await kakaoLoginWithVerifiedEmail().expect(409);
    expect(refused.body.code).toBe('SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL');
    expect(await prisma.v1AuthIdentity.count({ where: { provider: 'kakao', providerUserKey: KAKAO_KEY } })).toBe(0);

    const requested = await post('/verification/email/request', MEMBER).expect(200);
    await post('/verification/email/confirm', MEMBER, { code: requested.body.data.devCode }).expect(200);
    const linked = await kakaoLoginWithVerifiedEmail().expect(201);

    expect(linked.body.data.session.userId).toBe(MEMBER);
    expect(await prisma.v1AuthIdentity.findUniqueOrThrow({ where: { provider_providerUserKey: { provider: 'kakao', providerUserKey: KAKAO_KEY } } }))
      .toMatchObject({ userId: MEMBER, status: 'active' });
  });
});

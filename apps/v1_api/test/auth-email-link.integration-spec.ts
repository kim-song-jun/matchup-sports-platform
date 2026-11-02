import type { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import request = require('supertest');
import { issueEmailLinkToken } from '../src/auth/email-link-token';
import { verifyPassword } from '../src/auth/password-hash';
import { createV1SessionToken, V1_SESSION_COOKIE_NAME } from '../src/auth/v1-session';
import { PrismaService } from '../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from './integration/integration-app';

const PREFIX = 'integration-email-link';
const CALLER = `${PREFIX}-caller`;
const RIVAL = `${PREFIX}-rival`;
const HOLDER = `${PREFIX}-holder`;
const USER_IDS = [CALLER, RIVAL, HOLDER];
const CALLER_PHONE = '01000000191';
const RIVAL_PHONE = '01000000192';
const HOLDER_PHONE = '01000000193';
const CALLER_CONTACT = `${PREFIX}-caller-contact@integration.test`;
const HOLDER_EMAIL = `${PREFIX}-holder@integration.test`;
const NEW_EMAIL = `${PREFIX}-new@integration.test`;
const PASSWORD = 'email-link-fixture-password';
const RESET_PASSWORD = 'email-link-reset-fixture-password';
const SESSION_SECRET = 'integration-email-link-session-secret-0123456789';
const ENV_KEYS = ['V1_SESSION_SECRET', 'V1_VERIFICATION_DEV_ECHO', 'SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'SOLAPI_SENDER_NUMBER', 'EMAIL_FROM'] as const;

class EmailLinkFixtureError extends Error {}

describe('V1 adding an email login to a social account integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cleanupApp: (() => Promise<void>) | undefined;
  let ownedTermsPolicyId: string | undefined;
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeAll(async () => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    process.env.V1_SESSION_SECRET = SESSION_SECRET;
    // The echoed code is how the spec reads the mail sent to an `.test` address.
    process.env.V1_VERIFICATION_DEV_ECHO = 'true';
    delete process.env.SOLAPI_API_KEY;
    delete process.env.SOLAPI_API_SECRET;
    delete process.env.SOLAPI_SENDER_NUMBER;
    delete process.env.EMAIL_FROM;
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    const terms = app.get(ManagedTermsRuntimeService);
    if (!(await terms.currentSignupTerms()).ready) {
      const policy = await prisma.v1ManagedTermsPolicy.create({
        data: { code: `${PREFIX}-policy`, name: '이메일 로그인 추가 테스트 전용 약관' },
      });
      ownedTermsPolicyId = policy.id;
      const content = '격리된 이메일 로그인 추가 검증에만 사용하는 필수 약관입니다.';
      await prisma.v1ManagedTermsDocument.create({
        data: {
          policyId: policy.id, version: '1', title: '이메일 로그인 추가 테스트 전용 약관', content,
          contentHash: createHash('sha256').update(content).digest('hex'), status: 'published',
          publishedAt: new Date('2026-01-01T00:00:00.000Z'), effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
      await prisma.v1ManagedTermsPlacement.create({ data: { policyId: policy.id, context: 'signup', requirement: 'required' } });
    }
  }, 60_000);

  async function cleanupFixtures() {
    if (!prisma) return;
    await prisma.v1Notification.deleteMany({ where: { recipientUserId: { in: USER_IDS } } });
    await prisma.v1StatusChangeLog.deleteMany({ where: { actorUserId: { in: USER_IDS } } });
    await prisma.v1VerificationToken.deleteMany({ where: { userId: { in: USER_IDS } } });
    await prisma.v1PhoneVerificationChallenge.deleteMany({ where: { phone: { in: [CALLER_PHONE, RIVAL_PHONE, HOLDER_PHONE] } } });
    await prisma.v1EmailVerificationChallenge.deleteMany({ where: { email: { in: [NEW_EMAIL, HOLDER_EMAIL, CALLER_CONTACT] } } });
    await prisma.v1ManagedTermsConsentEvent.deleteMany({ where: { userId: { in: USER_IDS } } });
    await prisma.v1User.deleteMany({ where: { id: { in: USER_IDS } } });
  }

  /** A finished signup that only has a Kakao login: its email is a contact address Kakao reported. */
  async function seedKakaoMember(id: string, phone: string, email: string | null) {
    await prisma.v1User.create({
      data: { id, email, phone, phoneVerifiedAt: new Date('2026-07-01T00:00:00.000Z'), onboardingStatus: 'completed' },
    });
    await prisma.v1AuthIdentity.create({
      data: { id: `${id}-kakao`, userId: id, provider: 'kakao', providerUserKey: `${id}-kakao-key`, status: 'active' },
    });
    await prisma.v1UserProfile.create({ data: { userId: id, nickname: `연결${id.slice(-6)}`, realName: '카카오 계정' } });
    const terms = app.get(ManagedTermsRuntimeService);
    const required = (await terms.currentSignupTerms()).items.filter((item) => item.requirement === 'required').map((item) => item.documentId);
    await terms.acceptSignupTerms(id, required);
  }

  beforeEach(async () => {
    await cleanupFixtures();
    await seedKakaoMember(CALLER, CALLER_PHONE, CALLER_CONTACT);
    await seedKakaoMember(RIVAL, RIVAL_PHONE, null);
    await seedKakaoMember(HOLDER, HOLDER_PHONE, HOLDER_EMAIL);
    await prisma.v1AuthIdentity.create({
      data: { id: `${HOLDER}-email`, userId: HOLDER, provider: 'email', providerUserKey: HOLDER_EMAIL, passwordHash: 'not-a-real-hash', status: 'active' },
    });
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

  const api = (path: string) => `/api/v1${path}`;
  const as = (userId: string) => ({ 'x-v1-user-id': userId });
  const post = (path: string, userId: string, body: Record<string, unknown>) => request(app.getHttpServer()).post(api(path)).set(as(userId)).send(body);

  async function requestCode(userId: string, email: string) {
    const response = await post('/auth/link/email/request', userId, { email }).expect(200);
    const devCode: unknown = response.body.data.devCode;
    if (typeof devCode !== 'string') throw new EmailLinkFixtureError('The request did not echo a code for a test address');
    return { devCode, body: response.body.data };
  }

  async function verifiedToken(userId: string, email: string) {
    const { devCode } = await requestCode(userId, email);
    const verified = await post('/auth/link/email/verify', userId, { code: devCode }).expect(200);
    return verified.body.data.emailLinkToken as string;
  }

  const complete = (userId: string, emailLinkToken: string, password = PASSWORD) =>
    post('/auth/link/email/complete', userId, { emailLinkToken, password, passwordConfirm: password });

  const sessionCookieOf = (response: request.Response) =>
    ([] as string[]).concat(response.headers['set-cookie'] ?? []).find((cookie) => cookie.startsWith(`${V1_SESSION_COOKIE_NAME}=`))?.split(';')[0];

  it('admin capability returned by auth/me matches the link endpoint restriction', async () => {
    await prisma.v1AdminUser.create({ data: { userId: CALLER, adminRole: 'ops', status: 'active' } });
    const me = await request(app.getHttpServer()).get(api('/auth/me')).set(as(CALLER)).expect(200);
    expect(me.body.data.user).toMatchObject({ id: CALLER, canLinkLoginMethods: false, canLinkAfterSignup: false });
    const denied = await post('/auth/link/email/request', CALLER, { email: NEW_EMAIL }).expect(403);
    expect(denied.body.code).toBe('SOCIAL_LINK_ADMIN_FORBIDDEN');
  });

  it('requires email setup across requests and clears the gate only after successful linking', async () => {
    await prisma.v1User.update({ where: { id: CALLER }, data: { onboardingStatus: 'social_profile_deferred', signupEmailLoginRequired: true } });
    const blocked = await request(app.getHttpServer()).get(api('/onboarding')).set(as(CALLER)).expect(403);
    expect(blocked.body.code).toBe('EMAIL_LOGIN_SETUP_REQUIRED');
    const me = await request(app.getHttpServer()).get(api('/auth/me')).set(as(CALLER)).expect(200);
    expect(me.body.data.user.signupEmailLoginRequired).toBe(true);
    const { devCode } = await requestCode(CALLER, NEW_EMAIL);
    const wrongCode = devCode === '000000' ? '111111' : '000000';
    await post('/auth/link/email/verify', CALLER, { code: wrongCode }).expect(400);
    expect((await prisma.v1User.findUniqueOrThrow({ where: { id: CALLER } })).signupEmailLoginRequired).toBe(true);
    const verified = await post('/auth/link/email/verify', CALLER, { code: devCode }).expect(200);
    await complete(CALLER, verified.body.data.emailLinkToken).expect(200);
    expect((await prisma.v1User.findUniqueOrThrow({ where: { id: CALLER } })).signupEmailLoginRequired).toBe(false);
    expect((await request(app.getHttpServer()).get(api('/auth/me')).set(as(CALLER)).expect(200)).body.data.user.signupEmailLoginRequired).toBe(false);
  });

  it('request -> verify -> complete adds the login; email sign-in, password reset and find-account all see it', async () => {
    const { devCode, body } = await requestCode(CALLER, NEW_EMAIL);
    expect(body).toMatchObject({ sent: true, maskedTarget: 'in***@integration.test', expiresInSeconds: 300, resendAvailableInSeconds: 30 });
    const tooSoon = await post('/auth/link/email/request', CALLER, { email: NEW_EMAIL });
    expect([tooSoon.status, tooSoon.body.code]).toEqual([400, 'VERIFICATION_RESEND_COOLDOWN']);
    const verified = await post('/auth/link/email/verify', CALLER, { code: devCode }).expect(200);
    expect(verified.body.data.expiresInSeconds).toBe(600);
    const emailLinkToken: string = verified.body.data.emailLinkToken;

    const completed = await complete(CALLER, emailLinkToken).expect(200);

    expect(completed.body.data).toEqual({ linked: true, email: NEW_EMAIL });
    const identity = await prisma.v1AuthIdentity.findUniqueOrThrow({ where: { provider_providerUserKey: { provider: 'email', providerUserKey: NEW_EMAIL } } });
    expect(identity).toMatchObject({ userId: CALLER, email: NEW_EMAIL, status: 'active' });
    expect(await verifyPassword(PASSWORD, identity.passwordHash)).toBe(true);
    expect(await prisma.v1User.findUniqueOrThrow({ where: { id: CALLER } })).toMatchObject({ email: NEW_EMAIL, emailVerifiedAt: expect.any(Date), phone: CALLER_PHONE });
    expect(await prisma.v1AuthIdentity.count({ where: { userId: CALLER, provider: 'kakao', status: 'active' } })).toBe(1);
    expect(await prisma.v1StatusChangeLog.findFirst({ where: { targetId: identity.id, toStatus: 'linked' } })).toMatchObject({
      targetType: 'auth_identity', actorUserId: CALLER, reason: 'email_login_added',
    });
    // The owner is told the way a social link tells them: a security notice stored with the link.
    expect(await prisma.v1Notification.findFirst({ where: { recipientUserId: CALLER, title: '로그인 수단이 연결됐어요' } })).toMatchObject({
      targetType: 'system',
      deepLink: '/my/settings',
      body: '이메일·비밀번호 로그인이 연결됐어요. 본인이 아니라면 고객센터로 문의해 주세요.',
    });

    // Email sign-in works for this account.
    const wrong = await request(app.getHttpServer()).post(api('/auth/login')).send({ email: NEW_EMAIL, password: RESET_PASSWORD });
    expect(wrong.status).toBe(401);
    const signedIn = await request(app.getHttpServer()).post(api('/auth/login')).send({ email: NEW_EMAIL, password: PASSWORD }).expect(201);
    const cookie = sessionCookieOf(signedIn);
    if (!cookie) throw new EmailLinkFixtureError('Login did not set a session cookie');
    const me = await request(app.getHttpServer()).get(api('/auth/me')).set('Cookie', cookie).expect(200);
    expect(me.body.data.user).toMatchObject({ id: CALLER, email: NEW_EMAIL, canLinkLoginMethods: true });

    // Find-account by phone lists email among the providers.
    const issuedPhone = await request(app.getHttpServer()).post(api('/auth/phone/issue')).send({ phone: CALLER_PHONE }).expect(200);
    const verifiedPhone = await request(app.getHttpServer()).post(api('/auth/phone/verify'))
      .send({ phone: CALLER_PHONE, code: issuedPhone.body.data.devCode, purpose: 'password_reset' }).expect(200);
    const found = await request(app.getHttpServer()).post(api('/auth/recovery/find-account'))
      .send({ phone: CALLER_PHONE, proofToken: verifiedPhone.body.data.proofToken }).expect(200);
    expect([...found.body.data.providers].sort()).toEqual(['email', 'kakao']);
    expect(found.body.data).toMatchObject({ hasPassword: true, maskedEmail: 'in***@integration.test' });

    // Email password reset works, and revokes the cookie issued before it.
    const resetCode = await request(app.getHttpServer()).post(api('/auth/recovery/email/request')).send({ email: NEW_EMAIL }).expect(200);
    const confirmed = await request(app.getHttpServer()).post(api('/auth/recovery/email/confirm'))
      .send({ email: NEW_EMAIL, code: resetCode.body.data.devCode }).expect(200);
    await request(app.getHttpServer()).post(api('/auth/recovery/email/reset-password'))
      .send({ email: NEW_EMAIL, proofToken: confirmed.body.data.proofToken, newPassword: RESET_PASSWORD }).expect(200);
    expect((await request(app.getHttpServer()).get(api('/auth/me')).set('Cookie', cookie)).status).toBe(401);
    await request(app.getHttpServer()).post(api('/auth/login')).send({ email: NEW_EMAIL, password: RESET_PASSWORD }).expect(201);
  });

  it('refuses an address another account holds, as its email or as its email login, without a mail', async () => {
    const contact = `${PREFIX}-rival-contact@integration.test`;
    await prisma.v1User.update({ where: { id: RIVAL }, data: { email: contact } });

    const asEmail = await post('/auth/link/email/request', CALLER, { email: contact });
    const asLoginKey = await post('/auth/link/email/request', CALLER, { email: HOLDER_EMAIL });

    expect([asEmail.status, asEmail.body.code, asEmail.body.message]).toEqual([409, 'EMAIL_CONFLICT', '이미 다른 계정에서 쓰는 이메일이에요.']);
    expect([asLoginKey.status, asLoginKey.body.code]).toEqual([409, 'EMAIL_CONFLICT']);
    expect(await prisma.v1VerificationToken.count({ where: { userId: CALLER } })).toBe(0);
  });

  it('refuses an account that already has an email login', async () => {
    const response = await post('/auth/link/email/request', HOLDER, { email: NEW_EMAIL });

    expect([response.status, response.body.code]).toEqual([409, 'SOCIAL_LINK_PROVIDER_EXISTS']);
  });

  it('refuses a session older than thirty minutes, and takes a fresh one', async () => {
    const cookieIssuedAgo = (seconds: number) =>
      `${V1_SESSION_COOKIE_NAME}=${createV1SessionToken({ userId: CALLER, sessionEpoch: 0, secret: SESSION_SECRET, issuedAtMs: Date.now() - seconds * 1_000 })}`;

    const stale = await request(app.getHttpServer()).post(api('/auth/link/email/request')).set('Cookie', cookieIssuedAgo(31 * 60)).send({ email: NEW_EMAIL });
    const fresh = await request(app.getHttpServer()).post(api('/auth/link/email/request')).set('Cookie', cookieIssuedAgo(5 * 60)).send({ email: NEW_EMAIL });

    expect([stale.status, stale.body.code]).toEqual([403, 'RECENT_LOGIN_REQUIRED']);
    expect(fresh.status).toBe(200);
  });

  describe('codes are bound to their purpose', () => {
    const staleCookie = () =>
      `${V1_SESSION_COOKIE_NAME}=${createV1SessionToken({ userId: CALLER, sessionEpoch: 0, secret: SESSION_SECRET, issuedAtMs: Date.now() - 31 * 60_000 })}`;
    const withStaleSession = (path: string, body: Record<string, unknown>) =>
      request(app.getHttpServer()).post(api(path)).set('Cookie', staleCookie()).send(body);

    it('a session past the recent-login limit cannot mint a link code through /verification/email/request', async () => {
      // The account email is whatever the account says it is (PATCH /me/profile sets it freely): here, an address the caller reads.
      const attackerMailbox = `${PREFIX}-attacker@integration.test`;
      await prisma.v1User.update({ where: { id: CALLER }, data: { email: attackerMailbox } });
      const refused = await withStaleSession('/auth/link/email/request', { email: NEW_EMAIL });
      expect([refused.status, refused.body.code]).toEqual([403, 'RECENT_LOGIN_REQUIRED']);

      const contact = await withStaleSession('/verification/email/request', {}).expect(200);
      const contactCode: string = contact.body.data.devCode;
      expect(contactCode).toMatch(/^\d{6}$/);

      const attempt = await withStaleSession('/auth/link/email/verify', { code: contactCode });
      expect([attempt.status, attempt.body.code]).toEqual([400, 'VERIFICATION_NO_PENDING']);
      expect(attempt.body.data?.emailLinkToken).toBeUndefined();
      expect(await prisma.v1VerificationToken.findFirstOrThrow({ where: { userId: CALLER } })).toMatchObject({
        purpose: 'contact', target: attackerMailbox, consumedAt: null, attemptCount: 0,
      });
      // The refusal is about the purpose: the same code still verifies the contact email.
      const confirmed = await withStaleSession('/verification/email/confirm', { code: contactCode }).expect(200);
      expect(confirmed.body.data).toMatchObject({ verified: true, channel: 'email' });
    });

    it('a link code is refused by /verification/email/confirm and is still good for the link', async () => {
      const { devCode } = await requestCode(CALLER, NEW_EMAIL);

      const confirm = await post('/verification/email/confirm', CALLER, { code: devCode });
      expect([confirm.status, confirm.body.code]).toEqual([400, 'VERIFICATION_NO_PENDING']);
      expect(await prisma.v1VerificationToken.findFirstOrThrow({ where: { userId: CALLER } })).toMatchObject({
        purpose: 'email_login_link', target: NEW_EMAIL, consumedAt: null, attemptCount: 0,
      });
      await post('/auth/link/email/verify', CALLER, { code: devCode }).expect(200);
    });

    it('asking for one flow\'s code leaves the other flow\'s code usable, in either order', async () => {
      const contact = await post('/verification/email/request', CALLER, {}).expect(200);
      const { devCode: linkCode } = await requestCode(CALLER, NEW_EMAIL);
      expect((await prisma.v1VerificationToken.findMany({ where: { userId: CALLER }, orderBy: { createdAt: 'asc' } })).map((token) => [token.purpose, token.consumedAt === null]))
        .toEqual([['contact', true], ['email_login_link', true]]);

      await post('/verification/email/confirm', CALLER, { code: contact.body.data.devCode }).expect(200);
      await post('/auth/link/email/verify', CALLER, { code: linkCode }).expect(200);
    });

    it('a contact code the database gives its default purpose to is not a link code', async () => {
      // A row written without a purpose, as a writer that predates the column would.
      await prisma.v1VerificationToken.create({
        data: { userId: CALLER, channel: 'email', target: NEW_EMAIL, codeHash: 'not-a-real-hash', expiresAt: new Date(Date.now() + 60_000) },
      });

      expect(await prisma.v1VerificationToken.findFirstOrThrow({ where: { userId: CALLER } })).toMatchObject({ purpose: 'contact' });
    });
  });

  it('counts wrong codes and refuses the right one once the attempts are used up', async () => {
    const { devCode } = await requestCode(CALLER, NEW_EMAIL);
    const wrong = devCode === '000000' ? '000001' : '000000';

    const first = await post('/auth/link/email/verify', CALLER, { code: wrong });
    for (let attempt = 0; attempt < 4; attempt += 1) await post('/auth/link/email/verify', CALLER, { code: wrong });
    const exhausted = await post('/auth/link/email/verify', CALLER, { code: devCode });

    expect([first.status, first.body.code]).toEqual([400, 'VERIFICATION_CODE_MISMATCH']);
    expect([exhausted.status, exhausted.body.code]).toEqual([400, 'VERIFICATION_TOO_MANY_ATTEMPTS']);
  });

  it('rejects a token that belongs to another account, and one for an address taken in the meantime', async () => {
    const token = await verifiedToken(CALLER, NEW_EMAIL);

    const stolen = await complete(RIVAL, token);
    await prisma.v1User.update({ where: { id: HOLDER }, data: { email: NEW_EMAIL } });
    const taken = await complete(CALLER, token);

    expect([stolen.status, stolen.body.code]).toEqual([400, 'EMAIL_LINK_TOKEN_INVALID']);
    expect([taken.status, taken.body.code]).toEqual([409, 'EMAIL_CONFLICT']);
    expect(await prisma.v1AuthIdentity.count({ where: { provider: 'email', providerUserKey: NEW_EMAIL } })).toBe(0);
    expect(await prisma.v1User.findUniqueOrThrow({ where: { id: CALLER } })).toMatchObject({ email: CALLER_CONTACT, emailVerifiedAt: null });
  });

  it('two accounts completing the same address at once: one is linked, the other gets EMAIL_CONFLICT, and nothing is half-written', async () => {
    const tokens = [CALLER, RIVAL].map((userId) => issueEmailLinkToken(userId, NEW_EMAIL));

    const [first, second] = await Promise.all([complete(CALLER, tokens[0]), complete(RIVAL, tokens[1], RESET_PASSWORD)]);

    const outcomes = [first, second].map((response) => [response.status, response.body.code ?? 'ok']);
    expect(outcomes).toEqual(expect.arrayContaining([[200, 'ok'], [409, 'EMAIL_CONFLICT']]));
    expect(await prisma.v1AuthIdentity.count({ where: { provider: 'email', providerUserKey: NEW_EMAIL } })).toBe(1);
    expect(await prisma.v1User.count({ where: { email: NEW_EMAIL } })).toBe(1);
    const loser = first.status === 200 ? RIVAL : CALLER;
    expect(await prisma.v1AuthIdentity.count({ where: { userId: loser, provider: 'email' } })).toBe(0);
    expect(await prisma.v1StatusChangeLog.count({ where: { reason: 'email_login_added', actorUserId: { in: [CALLER, RIVAL] } } })).toBe(1);
  });

  it('maps the database unique violation to EMAIL_CONFLICT and writes nothing', async () => {
    // The pre-check looks at other accounts only; the caller's own retired login on the address reaches the unique index.
    await prisma.v1AuthIdentity.create({
      data: { id: `${CALLER}-retired-email`, userId: CALLER, provider: 'email', providerUserKey: NEW_EMAIL, status: 'unlinked', unlinkedAt: new Date() },
    });

    const response = await complete(CALLER, issueEmailLinkToken(CALLER, NEW_EMAIL));

    expect([response.status, response.body.code]).toEqual([409, 'EMAIL_CONFLICT']);
    expect(await prisma.v1AuthIdentity.count({ where: { userId: CALLER, provider: 'email', status: 'active' } })).toBe(0);
    expect(await prisma.v1User.findUniqueOrThrow({ where: { id: CALLER } })).toMatchObject({ email: CALLER_CONTACT, emailVerifiedAt: null });
    expect(await prisma.v1StatusChangeLog.count({ where: { reason: 'email_login_added', actorUserId: CALLER } })).toBe(0);
  });
});

import type { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import request = require('supertest');
import { hashPassword } from '../src/auth/password-hash';
import { createV1SessionToken, V1_SESSION_COOKIE_NAME } from '../src/auth/v1-session';
import { PrismaService } from '../src/prisma/prisma.service';
import { issueEmailChangeToken } from '../src/profile/email-change-token';
import { ManagedTermsRuntimeService } from '../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from './integration/integration-app';
import { tamperSignature } from './helpers/tamper-signature';

const PREFIX = 'integration-email-change';
const EMAIL_LOGIN_USER = `${PREFIX}-mailer`;
const SOCIAL_USER = `${PREFIX}-social`;
const HOLDER = `${PREFIX}-holder`;
const USER_IDS = [EMAIL_LOGIN_USER, SOCIAL_USER, HOLDER];
const EMAIL_LOGIN_PHONE = '01000000291';
const SOCIAL_PHONE = '01000000292';
const HOLDER_PHONE = '01000000293';
const OLD_EMAIL = `${PREFIX}-old@integration.test`;
const NEW_EMAIL = `${PREFIX}-new@integration.test`;
const OTHER_NEW_EMAIL = `${PREFIX}-other-new@integration.test`;
const HOLDER_EMAIL = `${PREFIX}-holder@integration.test`;
const HOLDER_LOGIN_EMAIL = `${PREFIX}-holder-login@integration.test`;
const SOCIAL_CONTACT = `${PREFIX}-social-contact@integration.test`;
const PASSWORD = 'email-change-fixture-password';
const SESSION_SECRET = 'integration-email-change-session-secret-0123456789';
const ENV_KEYS = ['V1_SESSION_SECRET', 'V1_VERIFICATION_DEV_ECHO', 'SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'SOLAPI_SENDER_NUMBER', 'EMAIL_FROM'] as const;

class EmailChangeFixtureError extends Error {}

describe('V1 changing the account email needs a code mailed to the new address integration', () => {
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
        data: { code: `${PREFIX}-policy`, name: '이메일 변경 테스트 전용 약관' },
      });
      ownedTermsPolicyId = policy.id;
      const content = '격리된 이메일 변경 검증에만 사용하는 필수 약관입니다.';
      await prisma.v1ManagedTermsDocument.create({
        data: {
          policyId: policy.id, version: '1', title: '이메일 변경 테스트 전용 약관', content,
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
    await prisma.v1ManagedTermsConsentEvent.deleteMany({ where: { userId: { in: USER_IDS } } });
    await prisma.v1User.deleteMany({ where: { id: { in: USER_IDS } } });
  }

  async function seedMember(id: string, phone: string, email: string | null) {
    await prisma.v1User.create({
      data: { id, email, phone, phoneVerifiedAt: new Date('2026-07-01T00:00:00.000Z'), onboardingStatus: 'completed' },
    });
    await prisma.v1UserProfile.create({ data: { userId: id, nickname: `변경${id.slice(-6)}`, realName: '이메일 변경', gender: 'male' } });
    const terms = app.get(ManagedTermsRuntimeService);
    const required = (await terms.currentSignupTerms()).items.filter((item) => item.requirement === 'required').map((item) => item.documentId);
    await terms.acceptSignupTerms(id, required);
  }

  beforeEach(async () => {
    await cleanupFixtures();
    // A finished email signup: its email is its login ID, and nobody has proven the mailbox yet.
    await seedMember(EMAIL_LOGIN_USER, EMAIL_LOGIN_PHONE, OLD_EMAIL);
    await prisma.v1AuthIdentity.create({
      data: {
        id: `${EMAIL_LOGIN_USER}-email`, userId: EMAIL_LOGIN_USER, provider: 'email', providerUserKey: OLD_EMAIL, email: OLD_EMAIL,
        passwordHash: await hashPassword(PASSWORD), status: 'active',
      },
    });
    // A Kakao-only member: its email is a contact address, not a login.
    await seedMember(SOCIAL_USER, SOCIAL_PHONE, SOCIAL_CONTACT);
    await prisma.v1AuthIdentity.create({
      data: { id: `${SOCIAL_USER}-kakao`, userId: SOCIAL_USER, provider: 'kakao', providerUserKey: `${SOCIAL_USER}-kakao-key`, status: 'active' },
    });
    // Another account with an email login of its own, and a different contact address.
    await seedMember(HOLDER, HOLDER_PHONE, HOLDER_EMAIL);
    await prisma.v1AuthIdentity.create({
      data: { id: `${HOLDER}-email`, userId: HOLDER, provider: 'email', providerUserKey: HOLDER_LOGIN_EMAIL, passwordHash: 'not-a-real-hash', status: 'active' },
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
  const saveProfile = (userId: string, phone: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).patch(api('/me/profile')).set(as(userId)).send({ nickname: `변경${userId.slice(-6)}`, gender: 'male', phone, ...body });
  const cookieIssuedAgo = (userId: string, seconds: number) =>
    `${V1_SESSION_COOKIE_NAME}=${createV1SessionToken({ userId, sessionEpoch: 0, secret: SESSION_SECRET, issuedAtMs: Date.now() - seconds * 1_000 })}`;

  async function requestCode(userId: string, email: string) {
    const response = await post('/me/email-change/request', userId, { email }).expect(200);
    const devCode: unknown = response.body.data.devCode;
    if (typeof devCode !== 'string') throw new EmailChangeFixtureError('The request did not echo a code for a test address');
    return { devCode, body: response.body.data };
  }

  async function verifiedToken(userId: string, email: string) {
    const { devCode } = await requestCode(userId, email);
    const verified = await post('/me/email-change/verify', userId, { code: devCode }).expect(200);
    return verified.body.data.emailChangeToken as string;
  }

  const userRow = (id: string) => prisma.v1User.findUniqueOrThrow({ where: { id } });

  it('refuses to change the email without a token, and saves nothing else either', async () => {
    const response = await saveProfile(EMAIL_LOGIN_USER, EMAIL_LOGIN_PHONE, { email: NEW_EMAIL, realName: '바꾸려던 이름' });

    expect([response.status, response.body.code]).toEqual([400, 'EMAIL_CHANGE_PROOF_REQUIRED']);
    expect(await userRow(EMAIL_LOGIN_USER)).toMatchObject({ email: OLD_EMAIL, emailVerifiedAt: null });
    expect(await prisma.v1UserProfile.findUniqueOrThrow({ where: { userId: EMAIL_LOGIN_USER } })).toMatchObject({ realName: '이메일 변경' });
    expect(await prisma.v1AuthIdentity.count({ where: { userId: EMAIL_LOGIN_USER, provider: 'email', providerUserKey: OLD_EMAIL } })).toBe(1);
  });

  it('request -> verify -> save moves the email and the email login, marks it verified and tells the owner', async () => {
    const { devCode, body } = await requestCode(EMAIL_LOGIN_USER, NEW_EMAIL);
    expect(body).toMatchObject({ sent: true, maskedTarget: 'in***@integration.test', expiresInSeconds: 300, resendAvailableInSeconds: 30 });
    const tooSoon = await post('/me/email-change/request', EMAIL_LOGIN_USER, { email: NEW_EMAIL });
    expect([tooSoon.status, tooSoon.body.code]).toEqual([400, 'VERIFICATION_RESEND_COOLDOWN']);
    const verified = await post('/me/email-change/verify', EMAIL_LOGIN_USER, { code: devCode }).expect(200);
    expect(verified.body.data.expiresInSeconds).toBe(600);
    // The code is spent.
    const replay = await post('/me/email-change/verify', EMAIL_LOGIN_USER, { code: devCode });
    expect([replay.status, replay.body.code]).toEqual([400, 'VERIFICATION_NO_PENDING']);

    const saved = await saveProfile(EMAIL_LOGIN_USER, EMAIL_LOGIN_PHONE, { email: NEW_EMAIL, emailChangeToken: verified.body.data.emailChangeToken }).expect(200);

    expect(saved.body.data.profile.nickname).toBe(`변경${EMAIL_LOGIN_USER.slice(-6)}`);
    expect(saved.body.data).toMatchObject({ email: NEW_EMAIL, phone: EMAIL_LOGIN_PHONE });
    expect(await userRow(EMAIL_LOGIN_USER)).toMatchObject({ email: NEW_EMAIL, emailVerifiedAt: expect.any(Date), phone: EMAIL_LOGIN_PHONE });
    expect(await prisma.v1AuthIdentity.findUniqueOrThrow({ where: { id: `${EMAIL_LOGIN_USER}-email` } })).toMatchObject({
      providerUserKey: NEW_EMAIL, email: NEW_EMAIL, status: 'active',
    });
    expect(await prisma.v1StatusChangeLog.findFirst({ where: { actorUserId: EMAIL_LOGIN_USER, reason: 'email_changed' } })).toMatchObject({
      targetType: 'user', targetId: EMAIL_LOGIN_USER,
    });
    expect(await prisma.v1Notification.findFirst({ where: { recipientUserId: EMAIL_LOGIN_USER, title: '계정 이메일이 바뀌었어요' } })).toMatchObject({
      targetType: 'system',
      deepLink: '/my/settings',
      body: '이메일이 in***@integration.test(으)로 바뀌었어요. 본인이 아니라면 고객센터로 문의해 주세요.',
    });

    // The login ID moved with it.
    await request(app.getHttpServer()).post(api('/auth/login')).send({ email: NEW_EMAIL, password: PASSWORD }).expect(201);
    expect((await request(app.getHttpServer()).post(api('/auth/login')).send({ email: OLD_EMAIL, password: PASSWORD })).status).toBe(401);
  });

  it('a token is good for one address only, and a second save with the same address needs none', async () => {
    const token = await verifiedToken(EMAIL_LOGIN_USER, NEW_EMAIL);

    const other = await saveProfile(EMAIL_LOGIN_USER, EMAIL_LOGIN_PHONE, { email: OTHER_NEW_EMAIL, emailChangeToken: token });
    expect([other.status, other.body.code]).toEqual([400, 'EMAIL_CHANGE_PROOF_REQUIRED']);
    expect((await userRow(EMAIL_LOGIN_USER)).email).toBe(OLD_EMAIL);

    await saveProfile(EMAIL_LOGIN_USER, EMAIL_LOGIN_PHONE, { email: NEW_EMAIL, emailChangeToken: token }).expect(200);
    await saveProfile(EMAIL_LOGIN_USER, EMAIL_LOGIN_PHONE, { email: NEW_EMAIL, realName: '이름만 바꿈' }).expect(200);
    expect(await userRow(EMAIL_LOGIN_USER)).toMatchObject({ email: NEW_EMAIL, emailVerifiedAt: expect.any(Date) });
  });

  it('saving without touching the email needs no token, and leaves what was verified alone', async () => {
    const verifiedAt = new Date('2026-08-01T00:00:00.000Z');
    await prisma.v1User.update({ where: { id: EMAIL_LOGIN_USER }, data: { emailVerifiedAt: verifiedAt } });

    await saveProfile(EMAIL_LOGIN_USER, EMAIL_LOGIN_PHONE, { email: OLD_EMAIL.toUpperCase(), realName: '이름만 바꿈' }).expect(200);
    await saveProfile(EMAIL_LOGIN_USER, EMAIL_LOGIN_PHONE, { realName: '이메일 없이' }).expect(200);

    expect(await userRow(EMAIL_LOGIN_USER)).toMatchObject({ email: OLD_EMAIL, emailVerifiedAt: verifiedAt });
    expect(await prisma.v1StatusChangeLog.count({ where: { actorUserId: EMAIL_LOGIN_USER, reason: 'email_changed' } })).toBe(0);
    expect(await prisma.v1Notification.count({ where: { recipientUserId: EMAIL_LOGIN_USER } })).toBe(0);
  });

  it('a token minted for one account does not work for another', async () => {
    const token = await verifiedToken(EMAIL_LOGIN_USER, NEW_EMAIL);

    const stolen = await saveProfile(SOCIAL_USER, SOCIAL_PHONE, { email: NEW_EMAIL, emailChangeToken: token });

    expect([stolen.status, stolen.body.code]).toEqual([400, 'EMAIL_CHANGE_PROOF_REQUIRED']);
    expect((await userRow(SOCIAL_USER)).email).toBe(SOCIAL_CONTACT);
  });

  it('a social account verifies its new contact email the same way, and gains no email login', async () => {
    const token = await verifiedToken(SOCIAL_USER, NEW_EMAIL);

    await saveProfile(SOCIAL_USER, SOCIAL_PHONE, { email: NEW_EMAIL, emailChangeToken: token }).expect(200);

    expect(await userRow(SOCIAL_USER)).toMatchObject({ email: NEW_EMAIL, emailVerifiedAt: expect.any(Date) });
    expect(await prisma.v1AuthIdentity.count({ where: { userId: SOCIAL_USER, provider: 'email' } })).toBe(0);
    expect(await prisma.v1Notification.count({ where: { recipientUserId: SOCIAL_USER, title: '계정 이메일이 바뀌었어요' } })).toBe(1);
  });

  it('a social account can still clear its contact email without a token', async () => {
    await prisma.v1User.update({ where: { id: SOCIAL_USER }, data: { emailVerifiedAt: new Date() } });

    await saveProfile(SOCIAL_USER, SOCIAL_PHONE, { email: null }).expect(200);

    expect(await userRow(SOCIAL_USER)).toMatchObject({ email: null, emailVerifiedAt: null });
  });

  describe('an address another account holds', () => {
    it.each([
      ['as its email', HOLDER_EMAIL],
      ['as its email login key', HOLDER_LOGIN_EMAIL],
    ])('is refused at request, %s, without a mail', async (_name, email) => {
      const response = await post('/me/email-change/request', EMAIL_LOGIN_USER, { email });

      expect([response.status, response.body.code]).toEqual([409, 'EMAIL_CONFLICT']);
      expect(await prisma.v1VerificationToken.count({ where: { userId: EMAIL_LOGIN_USER } })).toBe(0);
    });

    it('is refused at save when it was taken after the code was checked, and nothing is half-written', async () => {
      const token = await verifiedToken(EMAIL_LOGIN_USER, NEW_EMAIL);
      await prisma.v1User.update({ where: { id: HOLDER }, data: { email: NEW_EMAIL } });

      const response = await saveProfile(EMAIL_LOGIN_USER, EMAIL_LOGIN_PHONE, { email: NEW_EMAIL, emailChangeToken: token, realName: '충돌 이름' });

      expect([response.status, response.body.code]).toEqual([409, 'EMAIL_CONFLICT']);
      expect(await userRow(EMAIL_LOGIN_USER)).toMatchObject({ email: OLD_EMAIL, emailVerifiedAt: null });
      expect(await prisma.v1AuthIdentity.findUniqueOrThrow({ where: { id: `${EMAIL_LOGIN_USER}-email` } })).toMatchObject({ providerUserKey: OLD_EMAIL });
      expect(await prisma.v1UserProfile.findUniqueOrThrow({ where: { userId: EMAIL_LOGIN_USER } })).toMatchObject({ realName: '이메일 변경' });
      expect(await prisma.v1StatusChangeLog.count({ where: { actorUserId: EMAIL_LOGIN_USER, reason: 'email_changed' } })).toBe(0);
    });

    it('does not say who holds it to a caller who has no token', async () => {
      const response = await saveProfile(EMAIL_LOGIN_USER, EMAIL_LOGIN_PHONE, { email: HOLDER_EMAIL });

      expect([response.status, response.body.code]).toEqual([400, 'EMAIL_CHANGE_PROOF_REQUIRED']);
    });
  });

  it('the address the account already has is not mailed a code', async () => {
    const response = await post('/me/email-change/request', EMAIL_LOGIN_USER, { email: OLD_EMAIL });

    expect([response.status, response.body.code]).toEqual([400, 'EMAIL_UNCHANGED']);
    expect(await prisma.v1VerificationToken.count({ where: { userId: EMAIL_LOGIN_USER } })).toBe(0);
  });

  describe('every account needs a recent sign-in to ask for the code', () => {
    const withSession = (userId: string, seconds: number, email: string) =>
      request(app.getHttpServer()).post(api('/me/email-change/request')).set('Cookie', cookieIssuedAgo(userId, seconds)).send({ email });

    it('refuses a session past thirty minutes and takes a fresh one', async () => {
      const stale = await withSession(EMAIL_LOGIN_USER, 31 * 60, NEW_EMAIL);
      const fresh = await withSession(EMAIL_LOGIN_USER, 5 * 60, NEW_EMAIL);

      expect([stale.status, stale.body.code]).toEqual([403, 'RECENT_LOGIN_REQUIRED']);
      expect(fresh.status).toBe(200);
    });

    it('refuses a social account on a stale session too, and mails nothing', async () => {
      const stale = await withSession(SOCIAL_USER, 31 * 60, NEW_EMAIL);
      const fresh = await withSession(SOCIAL_USER, 5 * 60, NEW_EMAIL);

      expect([stale.status, stale.body.code, stale.body.message]).toEqual([403, 'RECENT_LOGIN_REQUIRED', '이메일을 바꾸려면 다시 로그인해 주세요.']);
      expect(fresh.status).toBe(200);
      expect(await prisma.v1VerificationToken.count({ where: { userId: SOCIAL_USER } })).toBe(1);
    });
  });

  describe('codes are bound to their purpose', () => {
    it('a contact verification code does not verify an email change', async () => {
      await prisma.v1User.update({ where: { id: EMAIL_LOGIN_USER }, data: { email: `${PREFIX}-contact@integration.test` } });
      const contact = await post('/verification/email/request', EMAIL_LOGIN_USER, {}).expect(200);
      const contactCode: string = contact.body.data.devCode;

      const attempt = await post('/me/email-change/verify', EMAIL_LOGIN_USER, { code: contactCode });

      expect([attempt.status, attempt.body.code]).toEqual([400, 'VERIFICATION_NO_PENDING']);
      expect(attempt.body.data?.emailChangeToken).toBeUndefined();
      // The refusal is about the purpose: the same code still verifies the contact email.
      await post('/verification/email/confirm', EMAIL_LOGIN_USER, { code: contactCode }).expect(200);
    });

    it('a code mailed to add an email login does not verify an email change', async () => {
      const link = await post('/auth/link/email/request', SOCIAL_USER, { email: NEW_EMAIL }).expect(200);

      const attempt = await post('/me/email-change/verify', SOCIAL_USER, { code: link.body.data.devCode });

      expect([attempt.status, attempt.body.code]).toEqual([400, 'VERIFICATION_NO_PENDING']);
    });

    it('asking for an email change code leaves the contact code usable', async () => {
      await prisma.v1User.update({ where: { id: EMAIL_LOGIN_USER }, data: { email: `${PREFIX}-contact@integration.test` } });
      const contact = await post('/verification/email/request', EMAIL_LOGIN_USER, {}).expect(200);
      await requestCode(EMAIL_LOGIN_USER, NEW_EMAIL);

      await post('/verification/email/confirm', EMAIL_LOGIN_USER, { code: contact.body.data.devCode }).expect(200);
    });

    it('a token cannot be forged from the code alone', async () => {
      const forged = tamperSignature(issueEmailChangeToken(EMAIL_LOGIN_USER, NEW_EMAIL));

      const response = await saveProfile(EMAIL_LOGIN_USER, EMAIL_LOGIN_PHONE, { email: NEW_EMAIL, emailChangeToken: forged });

      expect([response.status, response.body.code]).toEqual([400, 'EMAIL_CHANGE_PROOF_REQUIRED']);
    });
  });
});

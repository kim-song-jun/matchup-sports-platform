import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { hashPassword, verifyPassword } from '../src/auth/password-hash';
import { PrismaService } from '../src/prisma/prisma.service';
import { withdrawalGraceEndsAt } from '../src/users/withdrawal-grace';
import { issuePhoneProofToken } from '../src/verification/phone-proof-token';
import { createV1IntegrationApp } from './integration/integration-app';

const PREFIX = 'integration-recovery-account-proof';
const EMAIL_USER = `${PREFIX}-email-user`;
const SOCIAL_USER = `${PREFIX}-social-user`;
const EMAIL = `${PREFIX}@integration.test`;
const SOCIAL_EMAIL = `${PREFIX}-social@integration.test`;
const EMAIL_PHONE = '01000000133';
const SOCIAL_PHONE = '01000000134';
const USER_IDS = [EMAIL_USER, SOCIAL_USER];
const PHONES = [EMAIL_PHONE, SOCIAL_PHONE];
const EMAILS = [EMAIL, SOCIAL_EMAIL];
const ORIGINAL_PASSWORD = 'recovery-original-fixture-password';
const REPLACEMENT_PASSWORD = 'recovery-replacement-fixture-password';
const ENV_KEYS = ['V1_VERIFICATION_DEV_ECHO', 'SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'SOLAPI_SENDER_NUMBER', 'EMAIL_FROM', 'V1_SESSION_SECRET'] as const;

class RecoveryFixtureError extends Error {}

describe('V1 account recovery requires independent email proof', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cleanupApp: (() => Promise<void>) | undefined;
  let originalHash: string;
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeAll(async () => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    process.env.V1_VERIFICATION_DEV_ECHO = 'true';
    delete process.env.SOLAPI_API_KEY;
    delete process.env.SOLAPI_API_SECRET;
    delete process.env.SOLAPI_SENDER_NUMBER;
    delete process.env.EMAIL_FROM;
    process.env.V1_SESSION_SECRET = 'integration-recovery-account-proof-session-secret-0123456789';
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    originalHash = await hashPassword(ORIGINAL_PASSWORD);
  }, 60_000);

  async function cleanupFixtures() {
    if (!prisma) return;
    await prisma.v1Notification.deleteMany({ where: { recipientUserId: { in: USER_IDS } } });
    await prisma.v1StatusChangeLog.deleteMany({ where: { targetId: { in: [`${PREFIX}-email-identity`, `${PREFIX}-social-identity`, ...USER_IDS] } } });
    await prisma.v1PhoneVerificationChallenge.deleteMany({ where: { phone: { in: PHONES } } });
    await prisma.v1EmailVerificationChallenge.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.v1User.deleteMany({ where: { id: { in: USER_IDS } } });
  }

  beforeEach(async () => {
    await cleanupFixtures();
    await prisma.v1User.createMany({
      data: [
        { id: EMAIL_USER, email: EMAIL, phone: EMAIL_PHONE, phoneVerifiedAt: new Date('2026-07-01T00:00:00.000Z'), onboardingStatus: 'completed' },
        { id: SOCIAL_USER, email: SOCIAL_EMAIL, phone: SOCIAL_PHONE, phoneVerifiedAt: new Date('2026-07-01T00:00:00.000Z'), onboardingStatus: 'completed' },
      ],
    });
    await prisma.v1AuthIdentity.createMany({
      data: [
        { id: `${PREFIX}-email-identity`, userId: EMAIL_USER, provider: 'email', providerUserKey: EMAIL, passwordHash: originalHash, status: 'active' },
        { id: `${PREFIX}-social-identity`, userId: SOCIAL_USER, provider: 'kakao', providerUserKey: `${PREFIX}-kakao-key`, status: 'active' },
      ],
    });
    await prisma.v1UserProfile.createMany({
      data: [
        { userId: EMAIL_USER, nickname: '이메일복구133', realName: '이메일 계정' },
        { userId: SOCIAL_USER, nickname: '소셜복구133', realName: '소셜 계정' },
      ],
    });
  });

  afterAll(async () => {
    try {
      try { await cleanupFixtures(); } finally { await cleanupApp?.(); }
    } finally {
      for (const key of ENV_KEYS) {
        const value = savedEnv[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  function accountState() {
    return Promise.all([
      prisma.v1User.findMany({ where: { id: { in: USER_IDS } }, orderBy: { id: 'asc' } }),
      prisma.v1UserProfile.findMany({ where: { userId: { in: USER_IDS } }, orderBy: { id: 'asc' } }),
      prisma.v1AuthIdentity.findMany({ where: { userId: { in: USER_IDS } }, orderBy: { id: 'asc' } }),
      prisma.v1PhoneVerificationChallenge.findMany({ where: { phone: { in: PHONES } }, orderBy: { id: 'asc' } }),
      prisma.v1EmailVerificationChallenge.findMany({ where: { email: { in: EMAILS } }, orderBy: { id: 'asc' } }),
      prisma.v1Notification.findMany({ where: { recipientUserId: { in: USER_IDS } }, orderBy: { id: 'asc' } }),
      prisma.v1StatusChangeLog.findMany({ where: { targetId: { in: [`${PREFIX}-email-identity`, `${PREFIX}-social-identity`] } }, orderBy: { id: 'asc' } }),
    ]);
  }

  async function proveCurrentPhone(phone: string) {
    const issued = await request(app.getHttpServer()).post('/api/v1/auth/phone/issue').send({ phone }).expect(200);
    const verified = await request(app.getHttpServer()).post('/api/v1/auth/phone/verify')
      .send({ phone, code: issued.body.data.devCode, purpose: 'password_reset' }).expect(200);
    const token: unknown = verified.body.data.proofToken;
    if (typeof token !== 'string') throw new RecoveryFixtureError('Phone verification did not issue a proof token');
    return token;
  }

  it.each([EMAIL_PHONE, SOCIAL_PHONE])('rejects current SMS proof for %s without credential, account, challenge, or session changes', async (phone) => {
    const proofToken = await proveCurrentPhone(phone);
    const before = await accountState();
    const response = await request(app.getHttpServer()).post('/api/v1/auth/recovery/reset-password')
      .send({ phone, proofToken, newPassword: REPLACEMENT_PASSWORD });

    expect({ status: response.status, code: response.body.code }).toEqual({ status: 409, code: 'ACCOUNT_RECOVERY_REQUIRES_EMAIL' });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.body).not.toHaveProperty('data.session');
    expect(await accountState()).toEqual(before);
  });

  it('retains the signup proof-purpose rejection before account lookup or writes', async () => {
    const before = await accountState();
    const response = await request(app.getHttpServer()).post('/api/v1/auth/recovery/reset-password')
      .send({ phone: EMAIL_PHONE, proofToken: issuePhoneProofToken(EMAIL_PHONE, 'signup'), newPassword: REPLACEMENT_PASSWORD });

    expect({ status: response.status, code: response.body.code }).toEqual({ status: 400, code: 'PHONE_NOT_VERIFIED' });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await accountState()).toEqual(before);
  });

  it('revokes every session cookie issued before an email password reset, and the new password signs in again', async () => {
    const sessionCookieOf = (response: request.Response) =>
      ([] as string[]).concat(response.headers['set-cookie'] ?? []).find((cookie) => cookie.startsWith('teameet_v1_session='))?.split(';')[0];
    const signedIn = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: EMAIL, password: ORIGINAL_PASSWORD }).expect(201);
    const oldCookie = sessionCookieOf(signedIn);
    if (!oldCookie) throw new RecoveryFixtureError('Login did not set a session cookie');
    expect((await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', oldCookie)).status).not.toBe(401);

    const issued = await request(app.getHttpServer()).post('/api/v1/auth/recovery/email/request').send({ email: EMAIL }).expect(200);
    const confirmed = await request(app.getHttpServer()).post('/api/v1/auth/recovery/email/confirm')
      .send({ email: EMAIL, code: issued.body.data.devCode }).expect(200);
    await request(app.getHttpServer()).post('/api/v1/auth/recovery/email/reset-password')
      .send({ email: EMAIL, proofToken: confirmed.body.data.proofToken, newPassword: REPLACEMENT_PASSWORD }).expect(200);

    const revoked = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', oldCookie);
    expect({ status: revoked.status, code: revoked.body.code }).toEqual({ status: 401, code: 'UNAUTHENTICATED' });
    const signedInAgain = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: EMAIL, password: REPLACEMENT_PASSWORD }).expect(201);
    const newCookie = sessionCookieOf(signedInAgain);
    if (!newCookie) throw new RecoveryFixtureError('Login after reset did not set a session cookie');
    expect((await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', newCookie)).status).not.toBe(401);
  });

  it.each(['kakao', 'apple'] as const)('finds a %s login only after real email OTP without creating a password', async (provider) => {
    await prisma.v1AuthIdentity.update({ where: { id: `${PREFIX}-social-identity` }, data: { provider } });
    const denied = await request(app.getHttpServer()).post('/api/v1/auth/recovery/email/find-account')
      .send({ email: SOCIAL_EMAIL, proofToken: 'invalid' }).expect(400);
    expect(denied.body.code).toBe('EMAIL_NOT_VERIFIED');
    const issued = await request(app.getHttpServer()).post('/api/v1/auth/recovery/email/request').send({ email: SOCIAL_EMAIL }).expect(200);
    const confirmed = await request(app.getHttpServer()).post('/api/v1/auth/recovery/email/confirm')
      .send({ email: SOCIAL_EMAIL, code: issued.body.data.devCode }).expect(200);
    const found = await request(app.getHttpServer()).post('/api/v1/auth/recovery/email/find-account')
      .send({ email: SOCIAL_EMAIL, proofToken: confirmed.body.data.proofToken }).expect(200);
    expect(found.body.data).toMatchObject({ providers: [provider], hasPassword: false, withdrawalPendingUntil: null });
    const identities = await prisma.v1AuthIdentity.findMany({ where: { userId: SOCIAL_USER } });
    expect(identities).toHaveLength(1);
    expect(identities[0].passwordHash).toBeNull();
  });

  it('preserves the real email OTP request, confirmation, and legitimate password reset', async () => {
    const issued = await request(app.getHttpServer()).post('/api/v1/auth/recovery/email/request').send({ email: EMAIL }).expect(200);
    const confirmed = await request(app.getHttpServer()).post('/api/v1/auth/recovery/email/confirm')
      .send({ email: EMAIL, code: issued.body.data.devCode }).expect(200);
    const proofToken: unknown = confirmed.body.data.proofToken;
    if (typeof proofToken !== 'string') throw new RecoveryFixtureError('Email confirmation did not issue a proof token');
    const socialBefore = await prisma.v1AuthIdentity.findUnique({ where: { id: `${PREFIX}-social-identity` } });

    const response = await request(app.getHttpServer()).post('/api/v1/auth/recovery/email/reset-password')
      .send({ email: EMAIL, proofToken, newPassword: REPLACEMENT_PASSWORD }).expect(200);
    const identity = await prisma.v1AuthIdentity.findUnique({ where: { id: `${PREFIX}-email-identity` } });
    if (!identity?.passwordHash) throw new RecoveryFixtureError('Email identity has no password hash after reset');

    expect(response.body.data).toEqual({ ok: true });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await verifyPassword(REPLACEMENT_PASSWORD, identity.passwordHash)).toBe(true);
    expect(await verifyPassword(ORIGINAL_PASSWORD, identity.passwordHash)).toBe(false);
    expect(await prisma.v1AuthIdentity.findUnique({ where: { id: `${PREFIX}-social-identity` } })).toEqual(socialBefore);
    expect(await prisma.v1AuthIdentity.count({ where: { userId: SOCIAL_USER, provider: 'email' } })).toBe(0);
  });

  it('rejects a phone proof submitted to the email reset route without credential writes', async () => {
    const proofToken = await proveCurrentPhone(EMAIL_PHONE);
    const before = await accountState();
    const response = await request(app.getHttpServer()).post('/api/v1/auth/recovery/email/reset-password')
      .send({ email: EMAIL, proofToken, newPassword: REPLACEMENT_PASSWORD });

    expect({ status: response.status, code: response.body.code }).toEqual({ status: 400, code: 'EMAIL_NOT_VERIFIED' });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await accountState()).toEqual(before);
  });

  async function proveMailbox(email: string) {
    const issued = await request(app.getHttpServer()).post('/api/v1/auth/recovery/email/request').send({ email }).expect(200);
    const confirmed = await request(app.getHttpServer()).post('/api/v1/auth/recovery/email/confirm')
      .send({ email, code: issued.body.data.devCode }).expect(200);
    const token: unknown = confirmed.body.data.proofToken;
    if (typeof token !== 'string') throw new RecoveryFixtureError('Email confirmation did not issue a proof token');
    return token;
  }

  /** The SMS proof is reusable for ten minutes; a second issue for the same number within 30 seconds is refused. */
  function findByPhone(phone: string, proofToken: string, mailbox?: { email: string; emailProofToken: string }) {
    return request(app.getHttpServer()).post('/api/v1/auth/recovery/find-account').send({ phone, proofToken, ...mailbox });
  }

  async function startWithdrawal(userId: string, requestedAt: Date) {
    await prisma.v1User.update({ where: { id: userId }, data: { accountStatus: 'withdrawal_pending' } });
    await prisma.v1StatusChangeLog.create({
      data: { targetType: 'user', targetId: userId, fromStatus: 'active', toStatus: 'withdrawal_pending', actorType: 'user', actorUserId: userId, createdAt: requestedAt },
    });
  }

  describe('a phone lookup does not hand the account\'s email or withdrawal date to whoever holds the number', () => {
    it('answers the SMS proof alone with the login methods and no email hint', async () => {
      const response = await findByPhone(EMAIL_PHONE, await proveCurrentPhone(EMAIL_PHONE));

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({ providers: ['email'], hasPassword: true, withdrawalPending: false, maskedEmail: null, emailProofAvailable: true, withdrawalPendingUntil: null });
      expect(JSON.stringify(response.body)).not.toContain('integration.test');
    });

    it('adds the masked email only for a mailbox proof that belongs to the same account', async () => {
      const phoneProof = await proveCurrentPhone(EMAIL_PHONE);
      const own = await findByPhone(EMAIL_PHONE, phoneProof, { email: EMAIL, emailProofToken: await proveMailbox(EMAIL) });
      expect(own.status).toBe(200);
      expect(own.body.data).toMatchObject({ providers: ['email'], maskedEmail: 'in***@integration.test' });
      expect(JSON.stringify(own.body)).not.toContain(EMAIL);

      // A real, valid mailbox proof — but for the other fixture account.
      const other = await findByPhone(EMAIL_PHONE, phoneProof, { email: SOCIAL_EMAIL, emailProofToken: await proveMailbox(SOCIAL_EMAIL) });
      expect(other.status).toBe(200);
      expect(other.body.data).toEqual({ providers: ['email'], hasPassword: true, withdrawalPending: false, maskedEmail: null, emailProofAvailable: true, withdrawalPendingUntil: null });
    });

    it('tells a number holder whose account has no email that there is no mailbox to prove', async () => {
      await prisma.v1User.update({ where: { id: SOCIAL_USER }, data: { email: null } });

      const response = await findByPhone(SOCIAL_PHONE, await proveCurrentPhone(SOCIAL_PHONE));

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({ providers: ['kakao'], hasPassword: false, withdrawalPending: false, maskedEmail: null, emailProofAvailable: false, withdrawalPendingUntil: null });
    });

    it('refuses a forged mailbox proof and a proof sent without its address', async () => {
      const phoneProof = await proveCurrentPhone(EMAIL_PHONE);
      const forged = await findByPhone(EMAIL_PHONE, phoneProof, { email: EMAIL, emailProofToken: 'forged' });
      expect({ status: forged.status, code: forged.body.code }).toEqual({ status: 400, code: 'EMAIL_NOT_VERIFIED' });

      const half = await request(app.getHttpServer()).post('/api/v1/auth/recovery/find-account')
        .send({ phone: EMAIL_PHONE, proofToken: phoneProof, emailProofToken: await proveMailbox(EMAIL) });
      expect({ status: half.status, code: half.body.code }).toEqual({ status: 400, code: 'VALIDATION_ERROR' });
    });
  });

  describe('an account waiting out its withdrawal grace', () => {
    const REQUESTED_AT = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const GRACE_ENDS_AT = withdrawalGraceEndsAt(REQUESTED_AT).toISOString();

    it('is found through the mailbox with its end date, because the code is mailed to it too', async () => {
      await startWithdrawal(EMAIL_USER, REQUESTED_AT);
      const proofToken = await proveMailbox(EMAIL);

      const found = await request(app.getHttpServer()).post('/api/v1/auth/recovery/email/find-account').send({ email: EMAIL, proofToken });

      expect(found.status).toBe(200);
      expect(found.body.data).toEqual({
        providers: ['email'], hasPassword: true, withdrawalPending: true, maskedEmail: 'in***@integration.test', emailProofAvailable: true, withdrawalPendingUntil: GRACE_ENDS_AT,
      });
    });

    it('tells the number holder it is pending but not when, until the same mailbox is proven', async () => {
      await startWithdrawal(EMAIL_USER, REQUESTED_AT);
      const phoneProof = await proveCurrentPhone(EMAIL_PHONE);

      const smsOnly = await findByPhone(EMAIL_PHONE, phoneProof);
      expect(smsOnly.body.data).toEqual({ providers: ['email'], hasPassword: true, withdrawalPending: true, maskedEmail: null, emailProofAvailable: true, withdrawalPendingUntil: null });

      const withMailbox = await findByPhone(EMAIL_PHONE, phoneProof, { email: EMAIL, emailProofToken: await proveMailbox(EMAIL) });
      expect(withMailbox.body.data).toMatchObject({ withdrawalPending: true, maskedEmail: 'in***@integration.test', withdrawalPendingUntil: GRACE_ENDS_AT });
    });

    it('cannot have its password reset by email, and is told it is withdrawing along with the end date', async () => {
      await startWithdrawal(EMAIL_USER, REQUESTED_AT);
      const proofToken = await proveMailbox(EMAIL);
      const before = await accountState();

      const response = await request(app.getHttpServer()).post('/api/v1/auth/recovery/email/reset-password')
        .send({ email: EMAIL, proofToken, newPassword: REPLACEMENT_PASSWORD });

      expect({ status: response.status, code: response.body.code, details: response.body.details }).toEqual({
        status: 403, code: 'ACCOUNT_WITHDRAWAL_PENDING', details: { withdrawalPendingUntil: GRACE_ENDS_AT },
      });
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(await accountState()).toEqual(before);
    });
  });

  describe('common passwords', () => {
    it('are refused on an email reset with their own code, and nothing is written', async () => {
      const proofToken = await proveMailbox(EMAIL);
      const before = await accountState();

      const response = await request(app.getHttpServer()).post('/api/v1/auth/recovery/email/reset-password')
        .send({ email: EMAIL, proofToken, newPassword: 'Qwer1234' });

      expect({ status: response.status, code: response.body.code, message: response.body.message }).toEqual({
        status: 400, code: 'PASSWORD_TOO_COMMON', message: '너무 흔한 비밀번호예요. 다른 비밀번호를 정해 주세요.',
      });
      expect(response.headers['set-cookie']).toBeUndefined();
      // The mailbox proof is not consumed by a refused password, so the same proof can set a good one.
      expect(await accountState()).toEqual(before);
      await request(app.getHttpServer()).post('/api/v1/auth/recovery/email/reset-password')
        .send({ email: EMAIL, proofToken, newPassword: REPLACEMENT_PASSWORD }).expect(200);
    });

    // A complete body, so the only thing wrong is the password; the code tells that apart from any other 400.
    it('are refused on signup before any account is created', async () => {
      const signupEmail = `${PREFIX}-signup@integration.test`;
      const response = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
        nickname: '흔한비번가입', email: signupEmail, password: 'Password123', displayName: '홍길동', phone: '01000000135',
        birthDate: '20000229', gender: 'male', requiredTermsAccepted: true,
        acceptedTermsDocumentIds: ['11111111-1111-4111-8111-111111111111'],
      });

      expect({ status: response.status, code: response.body.code }).toEqual({ status: 400, code: 'PASSWORD_TOO_COMMON' });
      expect(await prisma.v1User.count({ where: { email: signupEmail } })).toBe(0);
    });
  });
});

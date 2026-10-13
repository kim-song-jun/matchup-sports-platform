import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { hashPassword, verifyPassword } from '../src/auth/password-hash';
import { PrismaService } from '../src/prisma/prisma.service';
import { issuePhoneProofToken } from '../src/verification/phone-proof-token';
import { createV1IntegrationApp } from './integration/integration-app';

const PREFIX = 'integration-recovery-account-proof';
const EMAIL_USER = `${PREFIX}-email-user`;
const SOCIAL_USER = `${PREFIX}-social-user`;
const EMAIL = `${PREFIX}@integration.test`;
const SOCIAL_EMAIL = `${PREFIX}-social@integration.test`;
const EMAIL_PHONE = '01055550133';
const SOCIAL_PHONE = '01055550134';
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
    await prisma.v1StatusChangeLog.deleteMany({ where: { targetId: { in: [`${PREFIX}-email-identity`, `${PREFIX}-social-identity`] } } });
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

  it.each(['signup', 'social_link'] as const)('retains the %s proof-purpose rejection before account lookup or writes', async (purpose) => {
    const before = await accountState();
    const response = await request(app.getHttpServer()).post('/api/v1/auth/recovery/reset-password')
      .send({ phone: EMAIL_PHONE, proofToken: issuePhoneProofToken(EMAIL_PHONE, purpose), newPassword: REPLACEMENT_PASSWORD });

    expect({ status: response.status, code: response.body.code }).toEqual({ status: 400, code: 'PHONE_NOT_VERIFIED' });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await accountState()).toEqual(before);
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
});

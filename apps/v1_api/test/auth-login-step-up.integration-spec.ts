import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { AdminOpsService } from '../src/admin/admin-ops.service';
import { loginEmailKey, SECURITY_LOGIN_ANOMALY_TYPE } from '../src/auth/login-security/login-security.policy';
import { LoginSecurityService } from '../src/auth/login-security/login-security.service';
import { hashPassword } from '../src/auth/password-hash';
import { purgeLoginSecurityRecords } from '../src/jobs/login-security-retention/login-security-retention.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createV1IntegrationApp } from './integration/integration-app';

const PREFIX = 'integration-login-step-up';
const USER_ID = `${PREFIX}-user`;
const EMAIL = `${PREFIX}@integration.test`;
const GHOST_EMAIL = `${PREFIX}-ghost@integration.test`;
const PASSWORD = 'login-step-up-fixture-password';
const WRONG = 'login-step-up-wrong-password';
const ENV_KEYS = ['V1_VERIFICATION_DEV_ECHO', 'SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'SOLAPI_SENDER_NUMBER', 'EMAIL_FROM', 'V1_SESSION_SECRET'] as const;

describe('V1 email login step-up', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let loginSecurity: LoginSecurityService;
  let cleanupApp: (() => Promise<void>) | undefined;
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeAll(async () => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    process.env.V1_VERIFICATION_DEV_ECHO = 'true';
    delete process.env.SOLAPI_API_KEY;
    delete process.env.SOLAPI_API_SECRET;
    delete process.env.SOLAPI_SENDER_NUMBER;
    delete process.env.EMAIL_FROM;
    process.env.V1_SESSION_SECRET = 'integration-login-step-up-session-secret-0123456789';
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    loginSecurity = app.get(LoginSecurityService, { strict: false });
  }, 60_000);

  /**
   * Attempts, challenges and anomalies are global state: a leftover anomaly would force step-up onto every
   * later spec's email login, and a leftover alert would be claimed (and poisoned) by the outbox drainers.
   */
  async function cleanup() {
    if (!prisma) return;
    await prisma.v1LoginAttempt.deleteMany({});
    await prisma.v1LoginStepUpChallenge.deleteMany({});
    await prisma.v1SecurityAnomaly.deleteMany({});
    await prisma.v1OutboxEvent.deleteMany({ where: { type: SECURITY_LOGIN_ANOMALY_TYPE } });
    await prisma.v1User.deleteMany({ where: { id: USER_ID } });
  }

  beforeEach(async () => {
    await cleanup();
    await prisma.v1User.create({
      data: { id: USER_ID, email: EMAIL, onboardingStatus: 'completed', emailVerifiedAt: new Date('2026-07-01T00:00:00.000Z') },
    });
    await prisma.v1AuthIdentity.create({
      data: { id: `${PREFIX}-identity`, userId: USER_ID, provider: 'email', providerUserKey: EMAIL, passwordHash: await hashPassword(PASSWORD), status: 'active' },
    });
    await prisma.v1UserProfile.create({ data: { userId: USER_ID, nickname: '추가인증테스트', realName: '추가 인증' } });
  });

  afterAll(async () => {
    try {
      try { await cleanup(); } finally { await cleanupApp?.(); }
    } finally {
      for (const key of ENV_KEYS) {
        const value = savedEnv[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });

  async function missThreeTimes(email: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const res = await login(email, WRONG).expect(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    }
  }

  it('walks three misses, the right password, the mailed code and a session, then logs in plainly again', async () => {
    await missThreeTimes(EMAIL);

    const challenged = await login(EMAIL, PASSWORD).expect(200);
    expect(challenged.headers['set-cookie']).toBeUndefined();
    expect(challenged.body.data).not.toHaveProperty('session');
    const { challengeToken, devCode, maskedEmail } = challenged.body.data.stepUp;
    expect(maskedEmail).toBe(`${EMAIL.slice(0, 2)}***@integration.test`);
    expect(devCode).toMatch(/^\d{6}$/);

    const wrong = await request(app.getHttpServer())
      .post('/api/v1/auth/login/step-up/verify')
      .send({ challengeToken, code: devCode === '000000' ? '111111' : '000000' })
      .expect(400);
    expect(wrong.body.code).toBe('STEP_UP_CODE_INVALID');

    const verified = await request(app.getHttpServer())
      .post('/api/v1/auth/login/step-up/verify')
      .send({ challengeToken, code: devCode })
      .expect(200);
    expect(String(verified.headers['set-cookie'])).toContain('teameet_v1_session=');
    expect(verified.body.data.session).toMatchObject({ userId: USER_ID, userEmail: EMAIL });

    await request(app.getHttpServer())
      .post('/api/v1/auth/login/step-up/verify')
      .send({ challengeToken, code: devCode })
      .expect(410);

    const plain = await login(EMAIL, PASSWORD).expect(201);
    expect(plain.body.data.session.userId).toBe(USER_ID);
    expect((await prisma.v1LoginAttempt.findMany({ orderBy: { createdAt: 'asc' } })).map((row) => row.result)).toEqual([
      'failed', 'failed', 'failed', 'step_up_issued', 'success', 'success',
    ]);
  });

  it('stores no raw email or IP and removes challenges together with their user', async () => {
    await missThreeTimes(EMAIL);
    const challenged = await login(EMAIL, PASSWORD).expect(200);

    const attempts = await prisma.v1LoginAttempt.findMany();
    expect(JSON.stringify(attempts)).not.toContain(EMAIL);
    expect(attempts.every((row) => row.emailKey === loginEmailKey(EMAIL))).toBe(true);
    const challenge = await prisma.v1LoginStepUpChallenge.findFirstOrThrow();
    expect(challenge.tokenHash).not.toBe(challenged.body.data.stepUp.challengeToken);
    expect(challenge.userId).toBe(USER_ID);

    await prisma.v1User.delete({ where: { id: USER_ID } });
    expect(await prisma.v1LoginStepUpChallenge.count()).toBe(0);
  });

  it('answers an unknown email exactly like a known one: same shape, a decoy that can never log in, 429 on the fifth wrong code', async () => {
    await missThreeTimes(GHOST_EMAIL);

    const challenged = await login(GHOST_EMAIL, PASSWORD).expect(200);
    const { challengeToken, ...rest } = challenged.body.data.stepUp;
    // The key set (devCode included in this echo environment) is pinned against a real challenge in its own test below.
    expect(Object.keys(rest).sort()).toEqual(expect.arrayContaining(['expiresAt', 'maskedEmail', 'resendAvailableAt']));
    expect(rest.maskedEmail).toBe(`${GHOST_EMAIL.slice(0, 2)}***@integration.test`);
    expect(await prisma.v1LoginStepUpChallenge.count({ where: { userId: null } })).toBe(1);

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login/step-up/verify')
        .send({ challengeToken, code: '123456' })
        .expect(400);
      expect(res.body.code).toBe('STEP_UP_CODE_INVALID');
    }
    const locked = await request(app.getHttpServer())
      .post('/api/v1/auth/login/step-up/verify')
      .send({ challengeToken, code: '123456' })
      .expect(429);
    expect(locked.body.code).toBe('STEP_UP_TOO_MANY_ATTEMPTS');

    await prisma.v1LoginStepUpChallenge.updateMany({ data: { lastSentAt: new Date(Date.now() - 31_000) } });
    const resend = await request(app.getHttpServer())
      .post('/api/v1/auth/login/step-up/resend')
      .send({ challengeToken })
      .expect(200);
    expect(Object.keys(resend.body.data).sort()).toEqual(['devCode', 'expiresAt', 'resendAvailableAt']);
  });

  it('refuses a second resend inside the cooldown with STEP_UP_RESEND_COOLDOWN', async () => {
    await missThreeTimes(EMAIL);
    const { challengeToken } = (await login(EMAIL, PASSWORD).expect(200)).body.data.stepUp;

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login/step-up/resend')
      .send({ challengeToken })
      .expect(429);

    expect(res.body.code).toBe('STEP_UP_RESEND_COOLDOWN');
    expect(res.body.details.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('gives a decoy the same key set as a real challenge in an echo environment, devCode included', async () => {
    await missThreeTimes(EMAIL);
    await missThreeTimes(GHOST_EMAIL);

    const real = (await login(EMAIL, PASSWORD).expect(200)).body.data.stepUp;
    const wrong = (await login(EMAIL, WRONG).expect(200)).body.data.stepUp;
    const ghost = (await login(GHOST_EMAIL, WRONG).expect(200)).body.data.stepUp;

    for (const stepUp of [real, wrong, ghost]) {
      expect(Object.keys(stepUp).sort()).toEqual(['challengeToken', 'devCode', 'expiresAt', 'maskedEmail', 'resendAvailableAt']);
      expect(stepUp.devCode).toMatch(/^\d{6}$/);
    }
  });

  it('holds the daily cap under parallel requests, and wrong passwords reach it exactly like right ones', async () => {
    await missThreeTimes(EMAIL);
    const parallel = await Promise.all(
      Array.from({ length: 7 }, (_, index) => login(EMAIL, index % 2 === 0 ? PASSWORD : WRONG)),
    );
    const statuses = parallel.map((res) => res.status).sort();
    expect(statuses.filter((status) => status === 200)).toHaveLength(5);
    expect(parallel.filter((res) => res.status === 429).every((res) => res.body.code === 'STEP_UP_SEND_LIMIT')).toBe(true);
    expect(statuses.filter((status) => status === 429)).toHaveLength(2);
  });

  it('lets the owner back in with a new password right after the daily send cap was burned', async () => {
    await missThreeTimes(EMAIL);
    for (let attempt = 0; attempt < 5; attempt += 1) await login(EMAIL, PASSWORD).expect(200);
    const capped = await login(EMAIL, PASSWORD).expect(429);
    expect(capped.body.code).toBe('STEP_UP_SEND_LIMIT');

    const requested = await request(app.getHttpServer()).post('/api/v1/auth/recovery/email/request').send({ email: EMAIL }).expect(200);
    const confirmed = await request(app.getHttpServer())
      .post('/api/v1/auth/recovery/email/confirm')
      .send({ email: EMAIL, code: requested.body.data.devCode })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/recovery/email/reset-password')
      .send({ email: EMAIL, proofToken: confirmed.body.data.proofToken, newPassword: 'login-step-up-new-password' })
      .expect(200);

    const res = await login(EMAIL, 'login-step-up-new-password').expect(201);
    expect(res.body.data.session.userId).toBe(USER_ID);
    expect(await prisma.v1LoginStepUpChallenge.count({ where: { emailKey: loginEmailKey(EMAIL) } })).toBe(0);
  });

  it('opens exactly one anomaly and one alert when detections race, then keeps refreshing the same anomaly', async () => {
    const now = new Date();
    await prisma.v1LoginAttempt.createMany({
      data: Array.from({ length: 30 }, (_, index) => ({
        emailKey: loginEmailKey(`${PREFIX}-victim-${index % 10}@integration.test`),
        ipKey: `ip-${index % 5}`,
        result: 'failed' as const,
        createdAt: new Date(now.getTime() - 60_000),
      })),
    });

    const outcomes = await Promise.all([loginSecurity.detectSpray(), loginSecurity.detectSpray(), loginSecurity.detectSpray()]);

    expect(outcomes.filter((outcome) => outcome.opened)).toHaveLength(1);
    expect(await prisma.v1SecurityAnomaly.count()).toBe(1);
    const alerts = await prisma.v1OutboxEvent.findMany({ where: { type: SECURITY_LOGIN_ANOMALY_TYPE } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].payload).toMatchObject({ failedCount: 30, accountCount: 10, ipCount: 5, windowMinutes: 10 });

    expect(await loginSecurity.detectSpray()).toEqual({ detected: true, opened: false });
    expect(await prisma.v1SecurityAnomaly.count()).toBe(1);
    expect(await prisma.v1OutboxEvent.count({ where: { type: SECURITY_LOGIN_ANOMALY_TYPE } })).toBe(1);
  });

  it('makes every email login step up during the attack, and the admin hub signal reports it', async () => {
    await prisma.v1LoginAttempt.createMany({
      data: Array.from({ length: 30 }, (_, index) => ({
        emailKey: loginEmailKey(`${PREFIX}-victim-${index % 12}@integration.test`),
        result: 'failed' as const,
        createdAt: new Date(Date.now() - 30_000),
      })),
    });
    await loginSecurity.detectSpray();

    const res = await login(EMAIL, PASSWORD).expect(200);
    expect(res.body.data).toHaveProperty('stepUp');
    expect(await prisma.v1LoginAttempt.count({ where: { result: 'success' } })).toBe(0);

    const summary = await app.get(AdminOpsService, { strict: false }).monitoringSummary();
    expect(summary.loginAnomalies.last24hCount).toBe(1);
    expect(summary.loginAnomalies.latest).toMatchObject({ failedCount: 30, accountCount: 12, active: true });
  });

  it('purges old attempts and long-expired challenges and keeps the rest', async () => {
    const now = new Date();
    const days = (count: number) => new Date(now.getTime() - count * 24 * 60 * 60_000);
    await prisma.v1LoginAttempt.createMany({
      data: [
        { emailKey: 'old', result: 'failed', createdAt: days(31) },
        { emailKey: 'new', result: 'failed', createdAt: days(29) },
      ],
    });
    const challengeBase = { emailKey: 'k', codeHash: 'scrypt:a:b', lastSentAt: now };
    await prisma.v1LoginStepUpChallenge.createMany({
      data: [
        { ...challengeBase, tokenHash: 'expired-long', expiresAt: days(8) },
        { ...challengeBase, tokenHash: 'expired-recent', expiresAt: days(6) },
      ],
    });

    const purged = await prisma.$transaction((tx) => purgeLoginSecurityRecords(tx, now));

    expect(purged).toEqual({ attempts: 1, challenges: 1 });
    expect((await prisma.v1LoginAttempt.findMany()).map((row) => row.emailKey)).toEqual(['new']);
    expect((await prisma.v1LoginStepUpChallenge.findMany()).map((row) => row.tokenHash)).toEqual(['expired-recent']);
  });
});

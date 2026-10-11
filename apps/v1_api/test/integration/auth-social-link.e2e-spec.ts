import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { readV1SessionUserId } from '../../src/auth/v1-session';
import { createV1IntegrationApp } from './integration-app';

const HOLDER_ID = 'integration-social-link-holder';
const HOLDER_PHONE = '01055550126';
const KEY_PREFIX = 'integration-social-link-key';

/**
 * 소셜 가입 대기 계정 → 휴대폰 OTP 증명 → 기존 계정 연결(MD-QA #126) — 실 DB + 실 HTTP end-to-end.
 * 카카오 로그인 자체는 외부 호출이라 대기 계정과 신원 행을 직접 심는다.
 */
describe('V1 social link to phone owner integration', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let pendingSeq = 0;

  const ENV_KEYS = ['V1_VERIFICATION_DEV_ECHO', 'SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'SOLAPI_SENDER_NUMBER', 'V1_SESSION_SECRET'] as const;
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeAll(async () => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    process.env.V1_VERIFICATION_DEV_ECHO = 'true';
    delete process.env.SOLAPI_API_KEY;
    delete process.env.SOLAPI_API_SECRET;
    delete process.env.SOLAPI_SENDER_NUMBER;
    process.env.V1_SESSION_SECRET = process.env.V1_SESSION_SECRET ?? 'integration-social-link-session-secret-0123456789';
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await cleanupFixtures();
    await prisma.v1User.create({
      data: {
        id: HOLDER_ID,
        email: 'social-link-holder@integration.test',
        onboardingStatus: 'completed',
        phone: HOLDER_PHONE,
        phoneVerifiedAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    });
  });

  afterAll(async () => {
    await cleanupFixtures();
    await cleanupApp?.();
    for (const key of ENV_KEYS) {
      const value = savedEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function cleanupFixtures() {
    if (!prisma) return;
    const pendings = await prisma.v1User.findMany({ where: { id: { startsWith: 'integration-social-link-pending' } }, select: { id: true } });
    const ids = [HOLDER_ID, ...pendings.map((user) => user.id)];
    await resetHolder();
    await prisma.v1ManagedTermsConsentEvent.deleteMany({ where: { userId: { in: ids } } });
    await prisma.v1AuthIdentity.deleteMany({ where: { providerUserKey: { startsWith: KEY_PREFIX } } });
    await prisma.v1User.deleteMany({ where: { id: { in: ids } } });
  }

  // Each test starts from a holder without social identities, notifications, audit rows, admin role or proofs.
  async function resetHolder() {
    await prisma.v1Notification.deleteMany({ where: { recipientUserId: HOLDER_ID } });
    await prisma.v1StatusChangeLog.deleteMany({ where: { actorUserId: HOLDER_ID, targetType: 'auth_identity' } });
    await prisma.v1PhoneVerificationChallenge.deleteMany({ where: { phone: HOLDER_PHONE } });
    await prisma.v1AdminUser.deleteMany({ where: { userId: HOLDER_ID } });
    await prisma.v1AuthIdentity.deleteMany({ where: { userId: HOLDER_ID, providerUserKey: { startsWith: KEY_PREFIX } } });
  }

  beforeEach(resetHolder);

  async function seedPending(provider: 'kakao' | 'apple' = 'kakao', onboardingStatus: 'social_profile_required' | 'completed' = 'social_profile_required') {
    pendingSeq += 1;
    const id = `integration-social-link-pending-${pendingSeq}`;
    await prisma.v1User.create({
      data: { id, email: `social-link-pending-${pendingSeq}@integration.test`, onboardingStatus },
    });
    await prisma.v1AuthIdentity.create({
      data: { id: `${id}-identity`, userId: id, provider, providerUserKey: `${KEY_PREFIX}-${provider}-${pendingSeq}`, status: 'active' },
    });
    if (onboardingStatus === 'completed') return id;
    const termsService = app.get(ManagedTermsRuntimeService);
    const required = (await termsService.currentSignupTerms()).items
      .filter((item) => item.requirement === 'required')
      .map((item) => item.documentId);
    await termsService.acceptSignupTerms(id, required);
    return id;
  }

  async function expectUntouched(callerId: string) {
    expect((await prisma.v1User.findUnique({ where: { id: callerId } }))?.id).toBe(callerId);
    expect((await prisma.v1AuthIdentity.findUnique({ where: { id: `${callerId}-identity` } }))?.userId).toBe(callerId);
    expect(await prisma.v1StatusChangeLog.count({ where: { targetType: 'auth_identity', targetId: `${callerId}-identity` } })).toBe(0);
  }

  async function waitForCount(count: () => Promise<number>, expected: number) {
    let actual = await count();
    for (let attempt = 0; attempt < 40 && actual !== expected; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      actual = await count();
    }
    return actual;
  }

  async function proveHolderPhone() {
    const issued = await request(app.getHttpServer()).post('/api/v1/auth/phone/issue').send({ phone: HOLDER_PHONE }).expect(200);
    const verified = await request(app.getHttpServer())
      .post('/api/v1/auth/phone/verify')
      .send({ phone: HOLDER_PHONE, code: issued.body.data.devCode, purpose: 'social_link' })
      .expect(200);
    return verified.body.data.proofToken as string;
  }

  const link = (callerId: string, proofToken: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/social-link')
      .set('x-v1-user-id', callerId)
      .send({ phone: HOLDER_PHONE, proofToken });

  it('moves the identity to the holder, removes the pending user, keeps the consent audit, and signs in as the holder', async () => {
    const callerId = await seedPending();
    const consentEventsBefore = await prisma.v1ManagedTermsConsentEvent.count({ where: { userId: callerId } });
    expect(consentEventsBefore).toBeGreaterThan(0);

    const response = await link(callerId, await proveHolderPhone());
    expect({ status: response.status, code: response.body.code }).toEqual({ status: 200, code: undefined });

    expect(response.body.data.session.userId).toBe(HOLDER_ID);
    const cookie = (response.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
    expect(readV1SessionUserId(cookie, { secret: process.env.V1_SESSION_SECRET as string })).toBe(HOLDER_ID);

    const identity = await prisma.v1AuthIdentity.findUnique({ where: { id: `${callerId}-identity` } });
    expect(identity?.userId).toBe(HOLDER_ID);
    expect(await prisma.v1User.findUnique({ where: { id: callerId } })).toBeNull();
    expect(await prisma.v1ManagedTermsConsentEvent.count({ where: { userId: callerId } })).toBe(consentEventsBefore);
    expect(await prisma.v1StatusChangeLog.count({ where: { targetType: 'auth_identity', targetId: `${callerId}-identity`, actorUserId: HOLDER_ID } })).toBe(1);

    const notified = await waitForCount(() => prisma.v1Notification.count({ where: { recipientUserId: HOLDER_ID, targetType: 'system' } }), 1);
    expect(notified).toBe(1);
  });

  it('previews the holder without consuming the proof, so the link still succeeds afterwards', async () => {
    const callerId = await seedPending();
    const proof = await proveHolderPhone();

    const preview = await request(app.getHttpServer())
      .post('/api/v1/auth/social-link/preview')
      .set('x-v1-user-id', callerId)
      .send({ phone: HOLDER_PHONE, proofToken: proof })
      .expect(200);

    expect(preview.body.data.linkingProvider).toBe('kakao');
    expect(preview.body.data.maskedEmail).toBe('so***@integration.test');
    expect(JSON.stringify(preview.body.data)).not.toContain('social-link-holder');
    await expectUntouched(callerId);

    await link(callerId, proof).expect(200);
  });

  it('answers a preview for a bad proof without revealing the holder', async () => {
    const callerId = await seedPending();
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/social-link/preview')
      .set('x-v1-user-id', callerId)
      .send({ phone: HOLDER_PHONE, proofToken: 'nope' })
      .expect(400);

    expect(response.body.code).toBe('PHONE_NOT_VERIFIED');
    await expectUntouched(callerId);
  });

  it('rejects replaying the same proof token for another pending account', async () => {
    const proof = await proveHolderPhone();
    const first = await seedPending('kakao');
    await link(first, proof).expect(200);

    // Apple: the holder has no apple identity, so only proof consumption can reject this call.
    const second = await seedPending('apple');
    const response = await link(second, proof).expect(400);

    expect(response.body.code).toBe('PHONE_NOT_VERIFIED');
    await expectUntouched(second);
  });

  it('lets exactly one of two parallel requests with the same proof succeed', async () => {
    const proof = await proveHolderPhone();
    const [a, b] = [await seedPending('kakao'), await seedPending('apple')];

    const results = await Promise.all([link(a, proof), link(b, proof)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    const loser = results.findIndex((r) => r.status === 400) === 0 ? a : b;
    expect(results.find((r) => r.status === 400)?.body.code).toBe('PHONE_NOT_VERIFIED');
    await expectUntouched(loser);
    expect(await prisma.v1User.count({ where: { id: { in: [a, b] } } })).toBe(1);
  });

  it('rejects a proof issued for another purpose and leaves the pending account untouched', async () => {
    const issued = await request(app.getHttpServer()).post('/api/v1/auth/phone/issue').send({ phone: HOLDER_PHONE }).expect(200);
    const signupProof = await request(app.getHttpServer())
      .post('/api/v1/auth/phone/verify')
      .send({ phone: HOLDER_PHONE, code: issued.body.data.devCode })
      .expect(200);
    const callerId = await seedPending();

    const response = await link(callerId, signupProof.body.data.proofToken).expect(400);

    expect(response.body.code).toBe('PHONE_NOT_VERIFIED');
    await expectUntouched(callerId);
  });

  it('rejects a tampered proof token without consuming the real proof', async () => {
    const proof = await proveHolderPhone();
    const callerId = await seedPending();

    const rejected = await link(callerId, `${proof}x`).expect(400);

    expect(rejected.body.code).toBe('PHONE_NOT_VERIFIED');
    await expectUntouched(callerId);
    await link(callerId, proof).expect(200);
  });

  it('rejects a holder that already has an active identity of the same provider, then links the other provider', async () => {
    await prisma.v1AuthIdentity.create({
      data: { id: 'integration-social-link-holder-kakao', userId: HOLDER_ID, provider: 'kakao', providerUserKey: `${KEY_PREFIX}-holder-kakao`, status: 'active' },
    });
    const proof = await proveHolderPhone();
    const kakaoCaller = await seedPending('kakao');

    const rejected = await link(kakaoCaller, proof).expect(409);

    expect(rejected.body.code).toBe('SOCIAL_LINK_PROVIDER_EXISTS');
    await expectUntouched(kakaoCaller);
    const appleCaller = await seedPending('apple');
    await link(appleCaller, proof).expect(200);
  });

  it('refuses to attach a social login to an operator account, then succeeds once the role is revoked', async () => {
    await prisma.v1AdminUser.create({ data: { userId: HOLDER_ID, adminRole: 'ops', status: 'active' } });
    const proof = await proveHolderPhone();
    const callerId = await seedPending();

    const rejected = await link(callerId, proof).expect(409);

    expect(rejected.body.code).toBe('SOCIAL_LINK_ADMIN_FORBIDDEN');
    await expectUntouched(callerId);
    await prisma.v1AdminUser.update({ where: { userId: HOLDER_ID }, data: { status: 'revoked' } });
    await link(callerId, proof).expect(200);
  });

  it('rejects a caller that is not a pending social signup and leaves it untouched', async () => {
    const proof = await proveHolderPhone();
    const completed = await seedPending('kakao', 'completed');

    const response = await link(completed, proof).expect(409);

    expect(response.body.code).toBe('SOCIAL_LINK_NOT_PENDING');
    await expectUntouched(completed);
    await link(await seedPending(), proof).expect(200);
  });
});

import type { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from './integration-app';

const HOLDER_ID = 'integration-social-link-holder';
const HOLDER_PHONE = '01055550126';
const KEY_PREFIX = 'integration-social-link-key';
const PENDING_PREFIX = 'integration-social-link-pending';
class SocialLinkFixtureError extends Error {}

/**
 * 휴대폰 OTP만으로 기존 계정에 연결할 수 없음(MD-QA #125/#133) — 실 DB + 실 HTTP.
 * 카카오 로그인 자체는 외부 호출이라 대기 계정과 신원 행을 직접 심는다.
 */
describe('V1 social link to phone owner integration', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let pendingSeq = 0;
  let ownedTermsPolicyId: string | undefined;

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
    if (!(await app.get(ManagedTermsRuntimeService).currentSignupTerms()).ready) {
      const content = '격리된 계정 연결 거부 테스트 전용 필수 약관입니다.';
      const policy = await prisma.v1ManagedTermsPolicy.create({ data: {
        code: `${KEY_PREFIX}-policy`, name: '계정 연결 거부 테스트 약관',
        documents: { create: { version: '1', title: '계정 연결 거부 테스트 약관', content,
          contentHash: createHash('sha256').update(content).digest('hex'), status: 'published',
          publishedAt: new Date('2026-01-01T00:00:00.000Z'), effectiveAt: new Date('2026-01-01T00:00:00.000Z') } },
        placements: { create: { context: 'signup', requirement: 'required' } },
      } });
      ownedTermsPolicyId = policy.id;
    }
    await prisma.v1User.create({
      data: {
        id: HOLDER_ID,
        email: 'social-link-holder@integration.test',
        onboardingStatus: 'completed',
        phone: HOLDER_PHONE,
        phoneVerifiedAt: new Date('2026-07-01T00:00:00.000Z'),
        profile: { create: { nickname: '기존회원보존', realName: '기존 회원', bio: '기존 소개' } },
      },
    });
  }, 60_000);

  afterAll(async () => {
    await cleanupFixtures();
    if (ownedTermsPolicyId !== undefined) {
      await prisma.v1ManagedTermsPlacement.deleteMany({ where: { policyId: ownedTermsPolicyId } });
      await prisma.v1ManagedTermsDocument.deleteMany({ where: { policyId: ownedTermsPolicyId } });
      await prisma.v1ManagedTermsPolicy.delete({ where: { id: ownedTermsPolicyId } });
    }
    await cleanupApp?.();
    for (const key of ENV_KEYS) {
      const value = savedEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function cleanupFixtures() {
    if (!prisma) return;
    const pendings = await prisma.v1User.findMany({ where: { id: { startsWith: PENDING_PREFIX } }, select: { id: true } });
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
    const id = `${PENDING_PREFIX}-${pendingSeq}`;
    await prisma.v1User.create({
      data: { id, email: `social-link-pending-${pendingSeq}@integration.test`, onboardingStatus,
        inquiries: { create: { category: 'account', title: '연결 문의', body: '계정 보존 검증' } } },
    });
    await prisma.v1AuthIdentity.create({
      data: { id: `${id}-identity`, userId: id, provider, providerUserKey: `${KEY_PREFIX}-${provider}-${pendingSeq}`, status: 'active' },
    });
    // Completed callers need the consents too, or V1AuthGuard stops them (reconsent 403) before the service check.
    const termsService = app.get(ManagedTermsRuntimeService);
    const required = (await termsService.currentSignupTerms()).items
      .filter((item) => item.requirement === 'required')
      .map((item) => item.documentId);
    await termsService.acceptSignupTerms(id, required);
    return id;
  }

  function accountState() {
    return Promise.all([
      prisma.v1User.findMany({ where: { OR: [{ id: HOLDER_ID }, { id: { startsWith: PENDING_PREFIX } }] }, orderBy: { id: 'asc' },
        include: { profile: true, authIdentities: { orderBy: { id: 'asc' } }, inquiries: { orderBy: { id: 'asc' } },
          notifications: { orderBy: { id: 'asc' } }, onboardingProgress: true, notificationPreference: true, adminUser: true } }),
      prisma.v1User.count(),
      prisma.v1ManagedTermsConsentEvent.findMany({ where: { userId: { startsWith: PENDING_PREFIX } }, orderBy: { id: 'asc' } }),
      prisma.v1PhoneVerificationChallenge.findMany({ where: { phone: HOLDER_PHONE }, orderBy: { id: 'asc' } }),
      prisma.v1StatusChangeLog.findMany({ where: { OR: [{ actorUserId: HOLDER_ID }, { actorUserId: { startsWith: PENDING_PREFIX } },
        { targetId: { startsWith: PENDING_PREFIX } }] }, orderBy: { id: 'asc' } }),
    ]);
  }

  async function expectUntouched(before: Awaited<ReturnType<typeof accountState>>) {
    expect(await accountState()).toEqual(before);
  }

  function expectRejected(response: request.Response, code = 'SOCIAL_LINK_REQUIRES_ACCOUNT_PROOF', status = 409) {
    expect({ status: response.status, code: response.body.code }).toEqual({ status, code });
    expect(response.headers['set-cookie']).toBeUndefined();
    for (const field of ['session', 'maskedEmail', 'providers', 'hasPassword']) expect(response.body).not.toHaveProperty(`data.${field}`);
  }

  async function proveHolderPhone() {
    const issued = await request(app.getHttpServer()).post('/api/v1/auth/phone/issue').send({ phone: HOLDER_PHONE }).expect(200);
    const verified = await request(app.getHttpServer())
      .post('/api/v1/auth/phone/verify')
      .send({ phone: HOLDER_PHONE, code: issued.body.data.devCode, purpose: 'social_link' })
      .expect(200);
    const proofToken: unknown = verified.body.data.proofToken;
    if (typeof proofToken !== 'string') throw new SocialLinkFixtureError('Phone verification did not issue a proof token');
    expect(await prisma.v1PhoneVerificationChallenge.count({ where: { phone: HOLDER_PHONE, verifiedAt: { not: null } } })).toBe(1);
    return proofToken;
  }

  const link = (callerId: string, proofToken: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/social-link')
      .set('x-v1-user-id', callerId)
      .send({ phone: HOLDER_PHONE, proofToken });

  it('rejects phone-only linking without changing the caller, holder profile, identities, inquiries, consent audit or proof', async () => {
    const callerId = await seedPending();
    const consentEventsBefore = await prisma.v1ManagedTermsConsentEvent.count({ where: { userId: callerId } });
    expect(consentEventsBefore).toBeGreaterThan(0);

    const proof = await proveHolderPhone();
    const before = await accountState();
    expectRejected(await link(callerId, proof));
    await expectUntouched(before);
  });

  it('rejects preview and subsequent linking without disclosing holder metadata or consuming the proof', async () => {
    const callerId = await seedPending();
    const proof = await proveHolderPhone();

    const before = await accountState();
    const preview = await request(app.getHttpServer())
      .post('/api/v1/auth/social-link/preview')
      .set('x-v1-user-id', callerId)
      .send({ phone: HOLDER_PHONE, proofToken: proof })
      .expect(409);
    expectRejected(preview);
    await expectUntouched(before);
    expectRejected(await link(callerId, proof));
    await expectUntouched(before);
  });

  it('answers a preview for a bad proof without revealing the holder', async () => {
    const callerId = await seedPending();
    const before = await accountState();
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/social-link/preview')
      .set('x-v1-user-id', callerId)
      .send({ phone: HOLDER_PHONE, proofToken: 'nope' })
      .expect(400);

    expectRejected(response, 'PHONE_NOT_VERIFIED', 400);
    await expectUntouched(before);
  });

  it('keeps rejecting the same proof for the same caller and another provider without consuming or moving it', async () => {
    const proof = await proveHolderPhone();
    const first = await seedPending('kakao');
    const second = await seedPending('apple');
    const before = await accountState();
    for (const callerId of [first, first, second]) expectRejected(await link(callerId, proof));
    await expectUntouched(before);
  });

  it('rejects both parallel link requests using the same proof and preserves both callers', async () => {
    const proof = await proveHolderPhone();
    const [a, b] = [await seedPending('kakao'), await seedPending('apple')];

    const before = await accountState();
    const results = await Promise.all([link(a, proof), link(b, proof)]);
    results.forEach((response) => expectRejected(response));
    await expectUntouched(before);
    expect(await prisma.v1User.count({ where: { id: { in: [a, b] } } })).toBe(2);
  });

  it('rejects a proof issued for another purpose and leaves the pending account untouched', async () => {
    const issued = await request(app.getHttpServer()).post('/api/v1/auth/phone/issue').send({ phone: HOLDER_PHONE }).expect(200);
    const signupProof = await request(app.getHttpServer())
      .post('/api/v1/auth/phone/verify')
      .send({ phone: HOLDER_PHONE, code: issued.body.data.devCode })
      .expect(200);
    const callerId = await seedPending();
    const before = await accountState();

    const response = await link(callerId, signupProof.body.data.proofToken).expect(400);

    expectRejected(response, 'PHONE_NOT_VERIFIED', 400);
    await expectUntouched(before);
  });

  it('rejects a tampered proof token without consuming the real proof', async () => {
    const proof = await proveHolderPhone();
    const callerId = await seedPending();
    const before = await accountState();

    const rejected = await link(callerId, `${proof}x`).expect(400);

    expectRejected(rejected, 'PHONE_NOT_VERIFIED', 400);
    await expectUntouched(before);
    expectRejected(await link(callerId, proof));
    await expectUntouched(before);
  });

  it('preserves the same-provider conflict gate and still requires account proof for the other provider', async () => {
    await prisma.v1AuthIdentity.create({
      data: { id: 'integration-social-link-holder-kakao', userId: HOLDER_ID, provider: 'kakao', providerUserKey: `${KEY_PREFIX}-holder-kakao`, status: 'active' },
    });
    const proof = await proveHolderPhone();
    const kakaoCaller = await seedPending('kakao');
    const before = await accountState();

    const rejected = await link(kakaoCaller, proof).expect(409);

    expectRejected(rejected, 'SOCIAL_LINK_PROVIDER_EXISTS');
    await expectUntouched(before);
    const appleCaller = await seedPending('apple');
    const withApple = await accountState();
    expectRejected(await link(appleCaller, proof));
    await expectUntouched(withApple);
  });

  it('preserves the operator-account gate and still requires account proof after revocation', async () => {
    await prisma.v1AdminUser.create({ data: { userId: HOLDER_ID, adminRole: 'ops', status: 'active' } });
    const proof = await proveHolderPhone();
    const callerId = await seedPending();
    const before = await accountState();

    const rejected = await link(callerId, proof).expect(409);

    expectRejected(rejected, 'SOCIAL_LINK_ADMIN_FORBIDDEN');
    await expectUntouched(before);
    await prisma.v1AdminUser.update({ where: { userId: HOLDER_ID }, data: { status: 'revoked' } });
    const revoked = await accountState();
    expectRejected(await link(callerId, proof));
    await expectUntouched(revoked);
  });

  it('rejects a caller that is not a pending social signup and leaves it untouched', async () => {
    const proof = await proveHolderPhone();
    const completed = await seedPending('kakao', 'completed');
    const before = await accountState();

    const response = await link(completed, proof).expect(409);

    expectRejected(response, 'SOCIAL_LINK_NOT_PENDING');
    await expectUntouched(before);
    const pending = await seedPending();
    const withPending = await accountState();
    expectRejected(await link(pending, proof));
    await expectUntouched(withPending);
  });
});

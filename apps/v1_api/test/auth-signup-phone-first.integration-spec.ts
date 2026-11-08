import type { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import request = require('supertest');
import { PrismaService } from '../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../src/terms/managed-terms-runtime.service';
import { issuePhoneProofToken } from '../src/verification/phone-proof-token';
import { createV1IntegrationApp } from './integration/integration-app';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Phone verification is the first signup step, so the answer to "does this number already belong to an account?" and the
 * rules for a number held by a signup nobody finished are exercised over real HTTP and a real database.
 */
describe('Signup with phone verification first', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let ownedTermsPolicyId: string | undefined;
  const ENV_KEYS = ['V1_PHONE_VERIFICATION_DISABLED', 'V1_VERIFICATION_DEV_ECHO', 'V1_SESSION_SECRET', 'SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'SOLAPI_SENDER_NUMBER'] as const;
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  const phones = {
    active: '01055560001',
    withdrawing: '01055560002',
    expiredSignup: '01055560003',
    freshSignup: '01055560004',
    free: '01055560005',
    expiredSignupForRegister: '01055560006',
    expiredSignupWithoutProof: '01055560007',
  } as const;
  const ids = {
    active: 'integration-phone-first-active',
    withdrawing: 'integration-phone-first-withdrawing',
    expiredSignup: 'integration-phone-first-expired-signup',
    freshSignup: 'integration-phone-first-fresh-signup',
    expiredSignupForRegister: 'integration-phone-first-expired-signup-register',
    expiredSignupWithoutProof: 'integration-phone-first-expired-signup-no-proof',
  } as const;
  const newEmail = 'phone-first-new@integration.test';
  const allIds = Object.values(ids);

  beforeAll(async () => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    process.env.V1_PHONE_VERIFICATION_DISABLED = 'false';
    process.env.V1_VERIFICATION_DEV_ECHO = 'true';
    delete process.env.SOLAPI_API_KEY;
    delete process.env.SOLAPI_API_SECRET;
    delete process.env.SOLAPI_SENDER_NUMBER;
    process.env.V1_SESSION_SECRET = 'integration-phone-first-session-secret-0123456789';
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await cleanupFixtures();
    if (!(await app.get(ManagedTermsRuntimeService).currentSignupTerms()).ready) {
      const content = '격리된 번호 우선 가입 테스트 전용 필수 약관입니다.';
      const policy = await prisma.v1ManagedTermsPolicy.create({ data: {
        code: 'integration-phone-first-policy', name: '번호 우선 가입 테스트 약관',
        documents: { create: { version: '1', title: '번호 우선 가입 테스트 약관', content,
          contentHash: createHash('sha256').update(content).digest('hex'), status: 'published',
          publishedAt: new Date('2026-01-01T00:00:00.000Z'), effectiveAt: new Date('2026-01-01T00:00:00.000Z') } },
        placements: { create: { context: 'signup', requirement: 'required' } },
      } });
      ownedTermsPolicyId = policy.id;
    }
  }, 60_000);

  beforeEach(async () => {
    await cleanupFixtures();
    const profile = (nickname: string) => ({ create: { nickname, realName: nickname, birthDate: '19900101', gender: 'female' as const } });
    await prisma.v1User.create({ data: {
      id: ids.active, email: 'phone-first-active@integration.test', phone: phones.active, phoneVerifiedAt: new Date(), onboardingStatus: 'completed',
      profile: profile('번호우선기존회원'),
      authIdentities: { create: { provider: 'email', providerUserKey: 'phone-first-active@integration.test', status: 'active', passwordHash: 'fixture-not-used-for-login' } },
    } });
    const withdrawing = await prisma.v1User.create({ data: {
      id: ids.withdrawing, email: 'phone-first-withdrawing@integration.test', phone: phones.withdrawing, phoneVerifiedAt: new Date(), onboardingStatus: 'completed', accountStatus: 'withdrawal_pending',
      profile: profile('번호우선탈퇴대기'),
      authIdentities: { create: { provider: 'email', providerUserKey: 'phone-first-withdrawing@integration.test', status: 'active', passwordHash: 'fixture-not-used-for-login' } },
    } });
    await prisma.v1StatusChangeLog.create({ data: {
      targetType: 'user', targetId: withdrawing.id, fromStatus: 'active', toStatus: 'withdrawal_pending', actorType: 'user', actorUserId: withdrawing.id,
      createdAt: new Date(Date.now() - 2 * DAY_MS),
    } });
    for (const [key, idle] of [
      ['expiredSignup', 2 * DAY_MS], ['freshSignup', 60_000], ['expiredSignupForRegister', 2 * DAY_MS], ['expiredSignupWithoutProof', 2 * DAY_MS],
    ] as const) {
      const at = new Date(Date.now() - idle);
      await prisma.v1User.create({ data: {
        id: ids[key], phone: phones[key], phoneVerifiedAt: at, onboardingStatus: 'social_profile_required', createdAt: at, updatedAt: at,
        authIdentities: { create: { provider: 'kakao', providerUserKey: `phone-first-${key}`, status: 'active' } },
      } });
    }
  });

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
    const created = await prisma.v1User.findMany({ where: { email: newEmail }, select: { id: true } });
    const every = [...allIds, ...created.map((row) => row.id)];
    await prisma.v1StatusChangeLog.deleteMany({ where: { OR: [{ actorUserId: { in: every } }, { targetId: { in: every } }] } });
    await prisma.v1ManagedTermsConsentEvent.deleteMany({ where: { userId: { in: every } } });
    await prisma.v1User.deleteMany({ where: { id: { in: every } } });
    await prisma.v1PhoneVerificationChallenge.deleteMany({ where: { phone: { in: Object.values(phones) } } });
  }

  /** The real flow a signup screen runs: ask for a code, then confirm it. */
  async function verifyPhone(phone: string) {
    const issued = await request(app.getHttpServer()).post('/api/v1/auth/phone/issue').send({ phone }).expect(200);
    const response = await request(app.getHttpServer()).post('/api/v1/auth/phone/verify').send({ phone, code: issued.body.data.devCode }).expect(200);
    return { issued: issued.body.data as Record<string, unknown>, verified: response.body.data as Record<string, unknown> };
  }

  async function register(phone: string, phoneProofToken?: string) {
    const terms = await app.get(ManagedTermsRuntimeService).currentSignupTerms();
    return request(app.getHttpServer()).post('/api/v1/auth/register').send({
      email: newEmail, password: 'Sunny-ride-4', nickname: '번호우선신규', realName: '번호 우선 신규', displayName: '번호 우선 신규', phone, birthDate: '19950115', gender: 'male',
      requiredTermsAccepted: true,
      acceptedTermsDocumentIds: terms.items.filter((item) => item.requirement === 'required').map((item) => item.documentId),
      ...(phoneProofToken ? { phoneProofToken } : {}),
    });
  }

  const holderPhone = async (id: string) => (await prisma.v1User.findUniqueOrThrow({ where: { id }, select: { phone: true } })).phone;

  it('says nothing about who holds a number before the code is confirmed', async () => {
    const held = await request(app.getHttpServer()).post('/api/v1/auth/phone/issue').send({ phone: phones.active }).expect(200);
    const free = await request(app.getHttpServer()).post('/api/v1/auth/phone/issue').send({ phone: phones.free }).expect(200);

    expect(Object.keys(held.body.data).sort()).toEqual(Object.keys(free.body.data).sort());
    expect(JSON.stringify(held.body)).not.toMatch(/registered|withdrawalPendingUntil|proofToken/);
  });

  it('reports an active holder as registered right after the code, and states how long the proof lasts', async () => {
    const { verified } = await verifyPhone(phones.active);

    expect(verified).toMatchObject({ verified: true, registered: true, withdrawalPendingUntil: null, proofExpiresInSeconds: 600 });
    expect(typeof verified.proofToken).toBe('string');
    expect(await holderPhone(ids.active)).toBe(phones.active);
  });

  it('reports a withdrawal-pending holder as registered and tells when its grace period ends', async () => {
    const { verified } = await verifyPhone(phones.withdrawing);

    expect(verified).toMatchObject({ registered: true });
    expect(typeof verified.withdrawalPendingUntil).toBe('string');
    expect(await holderPhone(ids.withdrawing)).toBe(phones.withdrawing);
  });

  it('keeps a signup that is still inside its 24h window registered', async () => {
    const { verified } = await verifyPhone(phones.freshSignup);

    expect(verified).toMatchObject({ registered: true });
    expect(await holderPhone(ids.freshSignup)).toBe(phones.freshSignup);
  });

  it('releases the number of an expired, abandoned signup once the code proved it, and logs the release', async () => {
    const { verified } = await verifyPhone(phones.expiredSignup);

    expect(verified).toMatchObject({ verified: true, registered: false });
    expect(await holderPhone(ids.expiredSignup)).toBeNull();
    const logs = await prisma.v1StatusChangeLog.findMany({ where: { targetType: 'user_phone', targetId: ids.expiredSignup } });
    expect(logs).toEqual([expect.objectContaining({ fromStatus: 'signup', toStatus: 'released', actorType: 'system', reason: 'expired_signup_lazy' })]);
  });

  it('registers with the proof of a number an expired signup was holding', async () => {
    const { verified } = await verifyPhone(phones.expiredSignupForRegister);

    const response = await register(phones.expiredSignupForRegister, verified.proofToken as string);

    expect(response.status).toBe(201);
    const created = await prisma.v1User.findUniqueOrThrow({ where: { email: newEmail }, select: { phone: true, phoneVerifiedAt: true } });
    expect(created.phone).toBe(phones.expiredSignupForRegister);
    expect(created.phoneVerifiedAt).not.toBeNull();
    expect(await holderPhone(ids.expiredSignupForRegister)).toBeNull();
  });

  it('rejects a register call whose proof has run out, without creating the account', async () => {
    const expiredProof = issuePhoneProofToken(phones.free, 'signup', Date.now() - 11 * 60 * 1000);

    const response = await register(phones.free, expiredProof);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('PHONE_NOT_VERIFIED');
    expect(await prisma.v1User.count({ where: { email: newEmail } })).toBe(0);
  });

  it('never releases a number for a register call that carries no valid proof', async () => {
    const withoutProof = await register(phones.expiredSignupWithoutProof);
    const withExpiredProof = await register(
      phones.expiredSignupWithoutProof,
      issuePhoneProofToken(phones.expiredSignupWithoutProof, 'signup', Date.now() - 11 * 60 * 1000),
    );

    expect([withoutProof.status, withoutProof.body.code]).toEqual([409, 'PHONE_CONFLICT']);
    expect([withExpiredProof.status, withExpiredProof.body.code]).toEqual([409, 'PHONE_CONFLICT']);
    expect(await holderPhone(ids.expiredSignupWithoutProof)).toBe(phones.expiredSignupWithoutProof);
    expect(await prisma.v1User.count({ where: { email: newEmail } })).toBe(0);
  });
});

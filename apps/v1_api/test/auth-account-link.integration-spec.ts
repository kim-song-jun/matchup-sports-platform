import type { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import request = require('supertest');
import { AuthService, type KakaoProfile } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from './integration/integration-app';

const PREFIX = 'integration-account-link';
const CALLER = `${PREFIX}-caller`;
const OTHER_CALLER = `${PREFIX}-other-caller`;
const EMPTY = `${PREFIX}-empty-signup`;
const REAL_OWNER = `${PREFIX}-real-owner`;
const NEWCOMER = `${PREFIX}-newcomer`;
const USER_IDS = [CALLER, OTHER_CALLER, EMPTY, REAL_OWNER, NEWCOMER];
const KAKAO_KEY = `${PREFIX}-kakao-key`;
const EMPTY_EMAIL = 'account-link-empty@integration.test';
const EMPTY_PHONE = '01000000186';
const EMPTY_IDENTITY = `${PREFIX}-identity-empty`;
const ENV_KEYS = ['V1_SESSION_SECRET'] as const;

describe('V1 signed-in social account link integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let cleanupApp: (() => Promise<void>) | undefined;
  let ownedTermsPolicyId: string | undefined;
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  const kakaoProfile = (providerUserKey = KAKAO_KEY): KakaoProfile => ({
    providerUserKey, email: null, emailValid: false, emailVerified: false, profileImageUrl: null, nickname: null, signupPrefill: null,
  });

  beforeAll(async () => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    process.env.V1_SESSION_SECRET = 'integration-account-link-session-secret-0123456789';
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    auth = app.get(AuthService);
    const terms = app.get(ManagedTermsRuntimeService);
    if (!(await terms.currentSignupTerms()).ready) {
      const policy = await prisma.v1ManagedTermsPolicy.create({
        data: { code: `${PREFIX}-policy`, name: '계정 연결 테스트 전용 약관' },
      });
      ownedTermsPolicyId = policy.id;
      const content = '격리된 계정 연결 검증에만 사용하는 필수 약관입니다.';
      await prisma.v1ManagedTermsDocument.create({
        data: {
          policyId: policy.id, version: '1', title: '계정 연결 테스트 전용 약관', content,
          contentHash: createHash('sha256').update(content).digest('hex'), status: 'published',
          publishedAt: new Date('2026-01-01T00:00:00.000Z'), effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
      await prisma.v1ManagedTermsPlacement.create({ data: { policyId: policy.id, context: 'signup', requirement: 'required' } });
    }
  }, 60_000);

  async function cleanupFixtures() {
    if (!prisma) return;
    await prisma.v1StatusChangeLog.deleteMany({
      where: { OR: [{ actorUserId: { in: USER_IDS } }, { targetId: { in: [...USER_IDS, EMPTY_IDENTITY] } }] },
    });
    await prisma.v1Notification.deleteMany({ where: { recipientUserId: { in: USER_IDS } } });
    await prisma.v1UploadAsset.deleteMany({ where: { ownerUserId: { in: USER_IDS } } });
    await prisma.v1ManagedTermsConsentEvent.deleteMany({ where: { userId: { in: USER_IDS } } });
    await prisma.v1User.deleteMany({ where: { id: { in: USER_IDS } } });
  }

  async function seedMember(id: string) {
    await prisma.v1User.create({
      data: { id, email: `${id}@integration.test`, onboardingStatus: 'completed', phoneVerifiedAt: new Date('2026-07-01T00:00:00.000Z') },
    });
    await prisma.v1AuthIdentity.create({
      data: { id: `${id}-email`, userId: id, provider: 'email', providerUserKey: `${id}@integration.test`, passwordHash: 'not-a-real-hash', status: 'active' },
    });
    const terms = app.get(ManagedTermsRuntimeService);
    const required = (await terms.currentSignupTerms()).items.filter((item) => item.requirement === 'required').map((item) => item.documentId);
    await terms.acceptSignupTerms(id, required);
  }

  /** An abandoned Kakao signup: it owns the identity, a number, an email, a profile, an inquiry and an upload. */
  async function seedEmptySignup(onboardingStatus: 'social_terms_required' | 'social_profile_required' | 'social_profile_deferred' = 'social_profile_required') {
    await prisma.v1User.create({
      data: { id: EMPTY, email: EMPTY_EMAIL, phone: EMPTY_PHONE, phoneVerifiedAt: new Date(), onboardingStatus },
    });
    await prisma.v1AuthIdentity.create({
      data: { id: EMPTY_IDENTITY, userId: EMPTY, provider: 'kakao', providerUserKey: KAKAO_KEY, status: 'active' },
    });
    await prisma.v1UserProfile.create({ data: { userId: EMPTY, nickname: '연결임시186', realName: '임시 이름' } });
    await prisma.v1Inquiry.create({ data: { id: `${PREFIX}-inquiry`, userId: EMPTY, category: 'account', title: '문의', body: '내용' } });
    await prisma.v1UploadAsset.create({
      data: { id: `${PREFIX}-upload`, ownerUserId: EMPTY, kind: 'image', mimeType: 'image/png', byteSize: 1n, url: `/uploads/${PREFIX}.png`, storagePath: `${PREFIX}/a.png` },
    });
  }

  beforeEach(async () => {
    await cleanupFixtures();
    await seedMember(CALLER);
    jest.spyOn(auth, 'fetchKakaoProfileForToken').mockImplementation(async () => kakaoProfile());
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

  const linkKakao = (callerId: string) =>
    request(app.getHttpServer()).post('/api/v1/auth/link/kakao').set('x-v1-user-id', callerId).send({ accessToken: 'native-sdk-token-0123456789' });

  async function waitForNotification(recipientUserId: string) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const row = await prisma.v1Notification.findFirst({ where: { recipientUserId, title: '로그인 수단이 연결됐어요' } });
      if (row) return row;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  }

  it('attaches a Kakao login nobody holds, logs it and tells the account', async () => {
    const response = await linkKakao(CALLER).expect(200);

    expect(response.body.data).toEqual({ provider: 'kakao', alreadyLinked: false, mergedPendingAccount: false, authProviders: ['email', 'kakao'] });
    const stored = await prisma.v1AuthIdentity.findUniqueOrThrow({ where: { provider_providerUserKey: { provider: 'kakao', providerUserKey: KAKAO_KEY } } });
    expect(stored).toMatchObject({ userId: CALLER, status: 'active' });
    expect(await prisma.v1StatusChangeLog.findFirst({ where: { targetId: stored.id, toStatus: 'linked' } })).toMatchObject({
      targetType: 'auth_identity', actorUserId: CALLER, reason: 'account_link:kakao',
    });
    expect(await waitForNotification(CALLER)).toMatchObject({ targetType: 'system', deepLink: '/my/settings' });
  });

  it('answers a repeat as already linked without a second row or notification', async () => {
    await linkKakao(CALLER).expect(200);
    await waitForNotification(CALLER);

    const repeat = await linkKakao(CALLER).expect(200);

    expect(repeat.body.data).toMatchObject({ alreadyLinked: true, mergedPendingAccount: false });
    expect(await prisma.v1AuthIdentity.count({ where: { userId: CALLER, provider: 'kakao' } })).toBe(1);
    expect(await prisma.v1Notification.count({ where: { recipientUserId: CALLER, title: '로그인 수단이 연결됐어요' } })).toBe(1);
  });

  it('refuses a second, different Kakao account on the same login', async () => {
    await prisma.v1AuthIdentity.create({ data: { userId: CALLER, provider: 'kakao', providerUserKey: `${KAKAO_KEY}-first`, status: 'active' } });

    const response = await linkKakao(CALLER).expect(409);

    expect(response.body.code).toBe('SOCIAL_LINK_PROVIDER_EXISTS');
    expect(await prisma.v1AuthIdentity.count({ where: { userId: CALLER, provider: 'kakao' } })).toBe(1);
  });

  it('moves the Kakao login off an abandoned signup, frees its email and number, and keeps what it left', async () => {
    await seedEmptySignup();

    const response = await linkKakao(CALLER).expect(200);

    expect(response.body.data).toEqual({ provider: 'kakao', alreadyLinked: false, mergedPendingAccount: true, authProviders: ['email', 'kakao'] });
    expect(await prisma.v1AuthIdentity.findUniqueOrThrow({ where: { id: EMPTY_IDENTITY } })).toMatchObject({ userId: CALLER, status: 'active' });
    expect(await prisma.v1User.findUniqueOrThrow({ where: { id: EMPTY } })).toMatchObject({ accountStatus: 'deleted', deletedAt: expect.any(Date) });
    expect(await prisma.v1Inquiry.findUniqueOrThrow({ where: { id: `${PREFIX}-inquiry` } })).toMatchObject({ userId: CALLER });
    expect(await prisma.v1UploadAsset.findUniqueOrThrow({ where: { id: `${PREFIX}-upload` } })).toMatchObject({ ownerUserId: CALLER });
    expect(await prisma.v1StatusChangeLog.findFirst({ where: { targetId: EMPTY_IDENTITY, toStatus: 'linked' } })).toMatchObject({
      reason: 'account_link:kakao;merged_pending_user',
    });

    // The unique email and phone really are free: their owner can sign up again with them.
    await expect(
      prisma.v1User.create({ data: { id: NEWCOMER, email: EMPTY_EMAIL, phone: EMPTY_PHONE, onboardingStatus: 'completed' } }),
    ).resolves.toMatchObject({ id: NEWCOMER });
  });

  it.each(['social_terms_required', 'social_profile_deferred'] as const)('treats a %s signup as abandoned too', async (status) => {
    await seedEmptySignup(status);

    const response = await linkKakao(CALLER).expect(200);

    expect(response.body.data.mergedPendingAccount).toBe(true);
  });

  it('leaves a Kakao login on a real account where it is and says so', async () => {
    await seedEmptySignup();
    await prisma.v1User.update({ where: { id: EMPTY }, data: { onboardingStatus: 'completed' } });

    const response = await linkKakao(CALLER).expect(409);

    expect(response.body.code).toBe('SOCIAL_LINK_PROVIDER_IN_USE');
    expect(await prisma.v1AuthIdentity.findUniqueOrThrow({ where: { id: EMPTY_IDENTITY } })).toMatchObject({ userId: EMPTY });
    expect(await prisma.v1User.findUniqueOrThrow({ where: { id: EMPTY } })).toMatchObject({ accountStatus: 'active', email: EMPTY_EMAIL });
    expect(await prisma.v1Inquiry.findUniqueOrThrow({ where: { id: `${PREFIX}-inquiry` } })).toMatchObject({ userId: EMPTY });
  });

  it('lets exactly one of two accounts claim the same abandoned signup at once', async () => {
    await seedMember(OTHER_CALLER);
    await seedEmptySignup();

    const [first, second] = await Promise.all([linkKakao(CALLER), linkKakao(OTHER_CALLER)]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const loser = first.status === 409 ? first : second;
    expect(loser.body.code).toBe('SOCIAL_LINK_PROVIDER_IN_USE');
    const winner = first.status === 200 ? CALLER : OTHER_CALLER;
    expect(await prisma.v1AuthIdentity.findMany({ where: { provider: 'kakao', providerUserKey: KAKAO_KEY } })).toEqual([
      expect.objectContaining({ userId: winner }),
    ]);
    expect(await prisma.v1Inquiry.findUniqueOrThrow({ where: { id: `${PREFIX}-inquiry` } })).toMatchObject({ userId: winner });
    expect(await prisma.v1StatusChangeLog.count({ where: { targetId: EMPTY_IDENTITY, toStatus: 'linked' } })).toBe(1);
  });

  it('lets exactly one of two accounts claim the same Kakao login nobody holds at once', async () => {
    await seedMember(OTHER_CALLER);

    const [first, second] = await Promise.all([linkKakao(CALLER), linkKakao(OTHER_CALLER)]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(await prisma.v1AuthIdentity.count({ where: { provider: 'kakao', providerUserKey: KAKAO_KEY } })).toBe(1);
  });

  it('keeps one Kakao identity when the same account links two different Kakao logins at once', async () => {
    jest.spyOn(auth, 'fetchKakaoProfileForToken')
      .mockResolvedValueOnce(kakaoProfile(`${KAKAO_KEY}-a`))
      .mockResolvedValueOnce(kakaoProfile(`${KAKAO_KEY}-b`));

    const [first, second] = await Promise.all([linkKakao(CALLER), linkKakao(CALLER)]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect((first.status === 409 ? first : second).body.code).toBe('SOCIAL_LINK_PROVIDER_EXISTS');
    expect(await prisma.v1AuthIdentity.count({ where: { userId: CALLER, provider: 'kakao' } })).toBe(1);
  });

  it.each(['social_terms_required', 'social_profile_required'] as const)('keeps a caller whose own signup is %s out', async (status) => {
    await prisma.v1User.update({ where: { id: CALLER }, data: { onboardingStatus: status } });

    const response = await linkKakao(CALLER).expect(403);

    expect(response.body.code).toBe('SIGNUP_INCOMPLETE');
    expect(await prisma.v1AuthIdentity.count({ where: { provider: 'kakao', providerUserKey: KAKAO_KEY } })).toBe(0);
  });

  it('keeps a caller who skipped the profile step out, with the route to finish it', async () => {
    await prisma.v1User.update({ where: { id: CALLER }, data: { onboardingStatus: 'social_profile_deferred' } });

    const response = await linkKakao(CALLER).expect(403);

    expect(response.body).toMatchObject({ code: 'SIGNUP_INCOMPLETE', details: { next: { route: '/signup/social' } } });
  });

  it('needs a session', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/link/kakao').send({ accessToken: 'native-sdk-token-0123456789' }).expect(401);
  });
});

import type { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import request = require('supertest');
import { hashPassword, verifyPassword } from '../src/auth/password-hash';
import { issueSocialLinkToken, type SocialLinkClaims } from '../src/auth/social-link-token';
import { createV1SessionToken, readV1Session, readV1SessionAgeSeconds, V1_SESSION_COOKIE_NAME } from '../src/auth/v1-session';
import { PrismaService } from '../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from './integration/integration-app';

const PREFIX = 'integration-login-method';
const MEMBER = `${PREFIX}-member`;
const KAKAO_ONLY = `${PREFIX}-kakao-only`;
const OPERATOR = `${PREFIX}-operator`;
const OTHER = `${PREFIX}-other`;
const USER_IDS = [MEMBER, KAKAO_ONLY, OPERATOR, OTHER];
const PHONES: Record<string, string> = { [MEMBER]: '01000000231', [KAKAO_ONLY]: '01000000232', [OPERATOR]: '01000000233', [OTHER]: '01000000234' };
const MEMBER_EMAIL = `${PREFIX}-member@integration.test`;
const KAKAO_KEY = `${PREFIX}-kakao-key`;
const PASSWORD = 'login-method-fixture-password';
const NEW_PASSWORD = 'login-method-new-fixture-password';
const SESSION_SECRET = 'integration-login-method-session-secret-0123456789';
const ENV_KEYS = ['V1_SESSION_SECRET', 'V1_VERIFICATION_DEV_ECHO', 'SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'SOLAPI_SENDER_NUMBER', 'EMAIL_FROM'] as const;

class LoginMethodFixtureError extends Error {}

describe('V1 removing a login method and signing out other devices integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cleanupApp: (() => Promise<void>) | undefined;
  let ownedTermsPolicyId: string | undefined;
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeAll(async () => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    process.env.V1_SESSION_SECRET = SESSION_SECRET;
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
        data: { code: `${PREFIX}-policy`, name: '로그인 수단 해제 테스트 전용 약관' },
      });
      ownedTermsPolicyId = policy.id;
      const content = '격리된 로그인 수단 해제 검증에만 사용하는 필수 약관입니다.';
      await prisma.v1ManagedTermsDocument.create({
        data: {
          policyId: policy.id, version: '1', title: '로그인 수단 해제 테스트 전용 약관', content,
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
    await prisma.v1EmailVerificationChallenge.deleteMany({ where: { email: MEMBER_EMAIL } });
    await prisma.v1AdminUser.deleteMany({ where: { userId: { in: USER_IDS } } });
    await prisma.v1ManagedTermsConsentEvent.deleteMany({ where: { userId: { in: USER_IDS } } });
    await prisma.v1User.deleteMany({ where: { id: { in: USER_IDS } } });
  }

  async function seedMember(id: string, options: { email: boolean; kakaoKey?: string }) {
    await prisma.v1User.create({
      data: {
        id,
        email: options.email ? `${id}@integration.test` : null,
        emailVerifiedAt: options.email ? new Date('2026-07-01T00:00:00.000Z') : null,
        phone: PHONES[id],
        phoneVerifiedAt: new Date('2026-07-01T00:00:00.000Z'),
        onboardingStatus: 'completed',
      },
    });
    if (options.kakaoKey !== undefined) {
      await prisma.v1AuthIdentity.create({
        data: { id: `${id}-kakao`, userId: id, provider: 'kakao', providerUserKey: options.kakaoKey, status: 'active' },
      });
    }
    if (options.email) {
      await prisma.v1AuthIdentity.create({
        data: {
          id: `${id}-email`, userId: id, provider: 'email', providerUserKey: `${id}@integration.test`,
          email: `${id}@integration.test`, passwordHash: await hashPassword(PASSWORD), status: 'active',
        },
      });
    }
    await prisma.v1UserProfile.create({ data: { userId: id, nickname: `수단${id.slice(-6)}`, realName: '로그인 수단' } });
    const terms = app.get(ManagedTermsRuntimeService);
    const required = (await terms.currentSignupTerms()).items.filter((item) => item.requirement === 'required').map((item) => item.documentId);
    await terms.acceptSignupTerms(id, required);
  }

  beforeEach(async () => {
    await cleanupFixtures();
    await seedMember(MEMBER, { email: true, kakaoKey: KAKAO_KEY });
    await seedMember(KAKAO_ONLY, { email: false, kakaoKey: `${PREFIX}-kakao-only-key` });
    await seedMember(OPERATOR, { email: true, kakaoKey: `${PREFIX}-operator-key` });
    // No Kakao login of its own, so a link attempt reaches the removed row instead of the one-per-provider rule.
    await seedMember(OTHER, { email: true });
    await prisma.v1AdminUser.create({ data: { userId: OPERATOR, adminRole: 'ops', status: 'active' } });
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
  const cookieIssuedAgo = (userId: string, seconds: number, sessionEpoch = 0) =>
    `${V1_SESSION_COOKIE_NAME}=${createV1SessionToken({ userId, sessionEpoch, secret: SESSION_SECRET, issuedAtMs: Date.now() - seconds * 1_000 })}`;
  const withCookie = (path: string, cookie: string, body: Record<string, unknown> = {}) => request(app.getHttpServer()).post(api(path)).set('Cookie', cookie).send(body);
  const withHeader = (path: string, userId: string, body: Record<string, unknown> = {}) =>
    request(app.getHttpServer()).post(api(path)).set('x-v1-user-id', userId).send(body);
  const me = (cookie: string) => request(app.getHttpServer()).get(api('/auth/me')).set('Cookie', cookie);
  const unlink = (cookie: string, provider: string) => withCookie('/auth/identities/unlink', cookie, { provider });

  function sessionCookieOf(response: request.Response): string {
    const cookie = ([] as string[]).concat(response.headers['set-cookie'] ?? []).find((entry) => entry.startsWith(`${V1_SESSION_COOKIE_NAME}=`));
    if (!cookie) throw new LoginMethodFixtureError('The response set no session cookie');
    return cookie.split(';')[0];
  }

  describe('POST /auth/identities/unlink', () => {
    it('removes Kakao: row unlinked with its key kept, others signed out, this device kept signed in with its own age, one notice', async () => {
      const here = cookieIssuedAgo(MEMBER, 5 * 60);
      const elsewhere = cookieIssuedAgo(MEMBER, 60);

      const response = await unlink(here, 'kakao').expect(200);

      expect(response.body.data).toEqual({ provider: 'kakao', authProviders: ['email'] });
      expect(await prisma.v1AuthIdentity.findUniqueOrThrow({ where: { id: `${MEMBER}-kakao` } })).toMatchObject({
        status: 'unlinked', providerUserKey: KAKAO_KEY, unlinkedAt: expect.any(Date),
      });
      expect((await prisma.v1User.findUniqueOrThrow({ where: { id: MEMBER } })).sessionEpoch).toBe(1);

      const reissued = sessionCookieOf(response);
      expect(readV1Session(reissued, { secret: SESSION_SECRET })).toEqual({ userId: MEMBER, sessionEpoch: 1 });
      expect(readV1SessionAgeSeconds(reissued, { secret: SESSION_SECRET })).toBeGreaterThanOrEqual(5 * 60);
      await me(reissued).expect(200);
      expect((await me(here)).status).toBe(401);
      expect((await me(elsewhere)).status).toBe(401);

      expect(await prisma.v1StatusChangeLog.findFirst({ where: { targetId: `${MEMBER}-kakao`, toStatus: 'unlinked' } })).toMatchObject({
        targetType: 'auth_identity', fromStatus: 'linked', actorType: 'user', actorUserId: MEMBER, reason: 'login_method_removed',
      });
      const notices = await prisma.v1Notification.findMany({ where: { recipientUserId: MEMBER } });
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({
        targetType: 'system',
        deepLink: '/my/settings',
        title: '로그인 수단이 해제됐어요',
        body: '카카오 로그인이 해제됐어요. 다른 기기는 로그아웃됐어요. 본인이 아니라면 고객센터로 문의해 주세요.',
      });
    });

    it('removes the email login: password gone, the address freed from the login key, the account email kept, password sign-in refused', async () => {
      const response = await unlink(cookieIssuedAgo(MEMBER, 60), 'email').expect(200);

      expect(response.body.data).toEqual({ provider: 'email', authProviders: ['kakao'] });
      const row = await prisma.v1AuthIdentity.findUniqueOrThrow({ where: { id: `${MEMBER}-email` } });
      expect(row).toMatchObject({ status: 'unlinked', passwordHash: null, email: null, providerUserKey: `deleted:${MEMBER}:${MEMBER}-email` });
      expect(await prisma.v1User.findUniqueOrThrow({ where: { id: MEMBER } })).toMatchObject({ email: `${MEMBER}@integration.test` });
      const login = await request(app.getHttpServer()).post(api('/auth/login')).send({ email: `${MEMBER}@integration.test`, password: PASSWORD });
      expect(login.status).toBe(401);
    });

    it('refuses the last remaining login method and changes nothing', async () => {
      const cookie = cookieIssuedAgo(KAKAO_ONLY, 60);

      const refused = await unlink(cookie, 'kakao');

      expect([refused.status, refused.body.code]).toEqual([409, 'LAST_LOGIN_METHOD']);
      expect(await prisma.v1AuthIdentity.findUniqueOrThrow({ where: { id: `${KAKAO_ONLY}-kakao` } })).toMatchObject({ status: 'active', unlinkedAt: null });
      expect((await prisma.v1User.findUniqueOrThrow({ where: { id: KAKAO_ONLY } })).sessionEpoch).toBe(0);
      await me(cookie).expect(200);
    });

    it('answers 404 for a method the account does not have', async () => {
      const refused = await unlink(cookieIssuedAgo(KAKAO_ONLY, 60), 'apple');

      expect([refused.status, refused.body.code]).toEqual([404, 'LOGIN_METHOD_NOT_FOUND']);
    });

    it('refuses a session older than 30 minutes, and an operator account', async () => {
      const stale = await unlink(cookieIssuedAgo(MEMBER, 31 * 60), 'kakao');
      const operator = await unlink(cookieIssuedAgo(OPERATOR, 60), 'kakao');

      expect([stale.status, stale.body.code]).toEqual([403, 'RECENT_LOGIN_REQUIRED']);
      expect([operator.status, operator.body.code]).toEqual([403, 'SOCIAL_LINK_ADMIN_FORBIDDEN']);
      expect(await prisma.v1AuthIdentity.count({ where: { userId: { in: [MEMBER, OPERATOR] }, status: 'unlinked' } })).toBe(0);
    });

    it('two removals racing on a Kakao + email account leave exactly one method, never none', async () => {
      // Header identities carry no cookie epoch, so only the row lock decides which removal goes first.
      const [first, second] = await Promise.all([
        withHeader('/auth/identities/unlink', MEMBER, { provider: 'kakao' }),
        withHeader('/auth/identities/unlink', MEMBER, { provider: 'email' }),
      ]);

      expect([first.status, second.status].sort()).toEqual([200, 409]);
      expect([first, second].find((response) => response.status === 409)?.body.code).toBe('LAST_LOGIN_METHOD');
      expect(await prisma.v1AuthIdentity.count({ where: { userId: MEMBER, status: 'active' } })).toBe(1);
      expect((await prisma.v1User.findUniqueOrThrow({ where: { id: MEMBER } })).sessionEpoch).toBe(1);
    });

    it('two removals with the same cookie: one goes through, the other is told the session ended', async () => {
      const cookie = cookieIssuedAgo(MEMBER, 60);

      const [first, second] = await Promise.all([unlink(cookie, 'kakao'), unlink(cookie, 'email')]);

      expect([first.status, second.status].sort()).toEqual([200, 401]);
      expect(await prisma.v1AuthIdentity.count({ where: { userId: MEMBER, status: 'active' } })).toBe(1);
      expect((await prisma.v1User.findUniqueOrThrow({ where: { id: MEMBER } })).sessionEpoch).toBe(1);
    });

    describe('linking again', () => {
      const kakaoClaims: SocialLinkClaims = { kind: 'verified_identity', provider: 'kakao', providerUserKey: KAKAO_KEY, email: null };

      it('brings the same Kakao row back through a link token, and tells the owner each time', async () => {
        const removed = await unlink(cookieIssuedAgo(MEMBER, 60), 'kakao').expect(200);
        const cookie = sessionCookieOf(removed);

        const relinked = await withCookie('/auth/link/pending', cookie, { linkToken: issueSocialLinkToken(kakaoClaims, [MEMBER]) }).expect(200);

        expect(relinked.body.data).toMatchObject({ provider: 'kakao', alreadyLinked: false, authProviders: expect.arrayContaining(['kakao', 'email']) });
        expect(await prisma.v1AuthIdentity.count({ where: { userId: MEMBER, provider: 'kakao' } })).toBe(1);
        expect(await prisma.v1AuthIdentity.findUniqueOrThrow({ where: { id: `${MEMBER}-kakao` } })).toMatchObject({ status: 'active', unlinkedAt: null, providerUserKey: KAKAO_KEY });
        // A second round: the row id repeats, and the notice of each removal and link still lands.
        const again = await unlink(cookie, 'kakao').expect(200);
        await withCookie('/auth/link/pending', sessionCookieOf(again), { linkToken: issueSocialLinkToken(kakaoClaims, [MEMBER]) }).expect(200);
        const titles = (await prisma.v1Notification.findMany({ where: { recipientUserId: MEMBER }, orderBy: { createdAt: 'asc' } })).map((notice) => notice.title);
        expect(titles).toEqual(['로그인 수단이 해제됐어요', '로그인 수단이 연결됐어요', '로그인 수단이 해제됐어요', '로그인 수단이 연결됐어요']);
      });

      it('keeps a removed Kakao login reserved: another account cannot take it', async () => {
        await unlink(cookieIssuedAgo(MEMBER, 60), 'kakao').expect(200);

        const refused = await withCookie('/auth/link/pending', cookieIssuedAgo(OTHER, 60), { linkToken: issueSocialLinkToken(kakaoClaims, [OTHER]) });

        expect([refused.status, refused.body.code]).toEqual([409, 'SOCIAL_LINK_PROVIDER_IN_USE']);
        expect(await prisma.v1AuthIdentity.findUniqueOrThrow({ where: { id: `${MEMBER}-kakao` } })).toMatchObject({ userId: MEMBER, status: 'unlinked' });
      });

      it('brings the same email row back through the mail flow, with the new password', async () => {
        const removed = await unlink(cookieIssuedAgo(MEMBER, 60), 'email').expect(200);
        const cookie = sessionCookieOf(removed);
        const address = `${MEMBER}@integration.test`;

        const requested = await withCookie('/auth/link/email/request', cookie, { email: address }).expect(200);
        const verified = await withCookie('/auth/link/email/verify', cookie, { code: requested.body.data.devCode }).expect(200);
        await withCookie('/auth/link/email/complete', cookie, {
          emailLinkToken: verified.body.data.emailLinkToken, password: NEW_PASSWORD, passwordConfirm: NEW_PASSWORD,
        }).expect(200);

        const rows = await prisma.v1AuthIdentity.findMany({ where: { userId: MEMBER, provider: 'email' } });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ id: `${MEMBER}-email`, providerUserKey: address, status: 'active', unlinkedAt: null });
        expect(await verifyPassword(NEW_PASSWORD, rows[0].passwordHash)).toBe(true);
        await request(app.getHttpServer()).post(api('/auth/login')).send({ email: address, password: NEW_PASSWORD }).expect(201);
        expect((await request(app.getHttpServer()).post(api('/auth/login')).send({ email: address, password: PASSWORD })).status).toBe(401);
      });
    });
  });

  describe('POST /auth/sessions/revoke-others', () => {
    it('signs every other device out and keeps this one signed in', async () => {
      const here = cookieIssuedAgo(MEMBER, 60);
      const phone = cookieIssuedAgo(MEMBER, 3_600);
      const laptop = cookieIssuedAgo(MEMBER, 2 * 24 * 3_600);

      const response = await withCookie('/auth/sessions/revoke-others', here).expect(200);

      expect(response.body.data).toEqual({ revoked: true });
      expect((await prisma.v1User.findUniqueOrThrow({ where: { id: MEMBER } })).sessionEpoch).toBe(1);
      await me(sessionCookieOf(response)).expect(200);
      expect((await me(here)).status).toBe(401);
      expect((await me(phone)).status).toBe(401);
      expect((await me(laptop)).status).toBe(401);
      expect(await prisma.v1StatusChangeLog.findFirst({ where: { targetId: MEMBER, reason: 'sessions_revoked' } })).toMatchObject({
        targetType: 'user_session', actorType: 'user', actorUserId: MEMBER,
      });
      expect(await prisma.v1AuthIdentity.count({ where: { userId: MEMBER, status: 'active' } })).toBe(2);
      expect(await prisma.v1Notification.count({ where: { recipientUserId: MEMBER } })).toBe(0);
    });

    it('does not make an old session look recently signed in: the re-signed cookie is still refused where a recent login is required', async () => {
      const response = await withCookie('/auth/sessions/revoke-others', cookieIssuedAgo(MEMBER, 2 * 24 * 3_600)).expect(200);
      const reissued = sessionCookieOf(response);

      expect(readV1SessionAgeSeconds(reissued, { secret: SESSION_SECRET })).toBeGreaterThanOrEqual(2 * 24 * 3_600);
      const refused = await unlink(reissued, 'kakao');
      expect([refused.status, refused.body.code]).toEqual([403, 'RECENT_LOGIN_REQUIRED']);
      expect(await prisma.v1AuthIdentity.count({ where: { userId: MEMBER, status: 'active' } })).toBe(2);
    });

    it('lets an operator sign out their own other devices', async () => {
      await withCookie('/auth/sessions/revoke-others', cookieIssuedAgo(OPERATOR, 60)).expect(200);

      expect((await prisma.v1User.findUniqueOrThrow({ where: { id: OPERATOR } })).sessionEpoch).toBe(1);
    });

    it('lets one of two simultaneous requests with the same cookie win the epoch; the other is told the session ended', async () => {
      const cookie = cookieIssuedAgo(MEMBER, 60);

      const [first, second] = await Promise.all([withCookie('/auth/sessions/revoke-others', cookie), withCookie('/auth/sessions/revoke-others', cookie)]);

      expect([first.status, second.status].sort()).toEqual([200, 401]);
      expect((await prisma.v1User.findUniqueOrThrow({ where: { id: MEMBER } })).sessionEpoch).toBe(1);
      expect(await prisma.v1StatusChangeLog.count({ where: { reason: 'sessions_revoked', actorUserId: MEMBER } })).toBe(1);
    });

    it('needs a session', async () => {
      await request(app.getHttpServer()).post(api('/auth/sessions/revoke-others')).expect(401);
    });
  });
});

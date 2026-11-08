import type { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import request = require('supertest');
import { PrismaService } from '../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from './integration/integration-app';

const PREFIX = 'integration-identity-unique';
const MEMBER = `${PREFIX}-member`;
const OTHER = `${PREFIX}-other`;
const OPERATOR = `${PREFIX}-operator`;
const USER_IDS = [MEMBER, OTHER, OPERATOR];
const KAKAO_APP_ID = 1604606;
const INDEX_NAME = 'v1_auth_identities_user_provider_active_key';
const kakaoKey = (n: number) => String(946100000 + n);
const emailOf = (id: string) => `${id}@integration.test`;

/** Real database and HTTP stack; only the external Kakao server is substituted. */
describe('One active login per provider on an account', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let ownedTermsPolicyId: string | undefined;
  const originalFetch = global.fetch;
  const savedEnv = {
    KAKAO_APP_ID: process.env.KAKAO_APP_ID,
    V1_SESSION_SECRET: process.env.V1_SESSION_SECRET,
    V1_PHONE_VERIFICATION_DISABLED: process.env.V1_PHONE_VERIFICATION_DISABLED,
  };

  beforeAll(async () => {
    process.env.KAKAO_APP_ID = String(KAKAO_APP_ID);
    process.env.V1_SESSION_SECRET = 'integration-identity-unique-session-secret-0123456789';
    process.env.V1_PHONE_VERIFICATION_DISABLED = 'false';
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await cleanupFixtures();
    if (!(await app.get(ManagedTermsRuntimeService).currentSignupTerms()).ready) {
      const content = '격리된 로그인 수단 유일성 검증에만 사용하는 필수 약관입니다.';
      const policy = await prisma.v1ManagedTermsPolicy.create({
        data: {
          code: `${PREFIX}-policy`, name: '로그인 수단 유일성 테스트 약관',
          documents: {
            create: {
              version: '1', title: '로그인 수단 유일성 테스트 약관', content,
              contentHash: createHash('sha256').update(content).digest('hex'), status: 'published',
              publishedAt: new Date('2026-01-01T00:00:00.000Z'), effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
            },
          },
          placements: { create: { context: 'signup', requirement: 'required' } },
        },
      });
      ownedTermsPolicyId = policy.id;
    }
  }, 60_000);

  async function cleanupFixtures() {
    if (!prisma) return;
    await prisma.v1StatusChangeLog.deleteMany({ where: { actorUserId: { in: USER_IDS } } });
    await prisma.v1Notification.deleteMany({ where: { recipientUserId: { in: USER_IDS } } });
    await prisma.v1ManagedTermsConsentEvent.deleteMany({ where: { userId: { in: USER_IDS } } });
    await prisma.v1User.deleteMany({ where: { id: { in: USER_IDS } } });
  }

  /** A completed member whose address we verified, holding an email login (and a Kakao login when `kakaoKeyHeld` is given). */
  async function seedMember(id: string, kakaoKeyHeld?: string) {
    await prisma.v1User.create({
      data: {
        id, email: emailOf(id), emailVerifiedAt: new Date(), onboardingStatus: 'completed',
        profile: { create: { nickname: `유일성${id.length}${id.slice(-4)}`, realName: '기존 회원', birthDate: '19900101', gender: 'female' } },
        authIdentities: {
          create: [
            { provider: 'email', providerUserKey: emailOf(id), status: 'active', passwordHash: 'fixture-not-used-for-login' },
            ...(kakaoKeyHeld === undefined ? [] : [{ provider: 'kakao' as const, providerUserKey: kakaoKeyHeld, status: 'active' as const }]),
          ],
        },
      },
    });
  }

  function kakaoLogin(key: string, account: { email: string }) {
    global.fetch = async (url, init) => {
      if (String(url) === 'https://kapi.kakao.com/v1/user/access_token_info') return new Response(JSON.stringify({ id: key, app_id: KAKAO_APP_ID }));
      if (String(url) === 'https://kapi.kakao.com/v2/user/me') {
        return new Response(JSON.stringify({ id: key, kakao_account: { ...account, is_email_valid: true, is_email_verified: true } }));
      }
      return originalFetch(url, init);
    };
    return request(app.getHttpServer()).post('/api/v1/auth/kakao/token').send({ accessToken: 'integration-identity-unique-token' });
  }

  const identitiesOf = (userId: string) => prisma.v1AuthIdentity.findMany({ where: { userId } });
  const keysOf = async (userId: string) => (await identitiesOf(userId)).map((row) => row.providerUserKey).sort();
  const providersOf = async (userId: string) => (await identitiesOf(userId)).map((row) => row.provider).sort();
  const noticesOf = (userId: string) => prisma.v1Notification.findMany({ where: { recipientUserId: userId } });

  beforeEach(async () => {
    await cleanupFixtures();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    await cleanupFixtures();
    if (ownedTermsPolicyId !== undefined) {
      await prisma.v1ManagedTermsPlacement.deleteMany({ where: { policyId: ownedTermsPolicyId } });
      await prisma.v1ManagedTermsDocument.deleteMany({ where: { policyId: ownedTermsPolicyId } });
      await prisma.v1ManagedTermsPolicy.delete({ where: { id: ownedTermsPolicyId } });
    }
    await cleanupApp?.();
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });

  describe('database constraint', () => {
    it('is a unique index limited to active rows', async () => {
      const rows = await prisma.$queryRaw<Array<{ indexdef: string }>>`
        SELECT indexdef FROM pg_indexes WHERE indexname = ${INDEX_NAME}
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0].indexdef).toMatch(/CREATE UNIQUE INDEX/);
      expect(rows[0].indexdef).toMatch(/\(user_id, provider\)/);
      expect(rows[0].indexdef).toMatch(/WHERE .*status.* = 'active'/);
    });

    it('rejects a second active identity of the same provider on one account', async () => {
      await seedMember(MEMBER, kakaoKey(1));

      const second = prisma.v1AuthIdentity.create({
        data: { userId: MEMBER, provider: 'kakao', providerUserKey: kakaoKey(2), status: 'active' },
      });

      await expect(second).rejects.toMatchObject({ code: 'P2002' });
      expect(await keysOf(MEMBER)).toEqual([kakaoKey(1), emailOf(MEMBER)].sort());
    });

    it('lets different accounts each hold an active identity of the provider, and one account hold different providers', async () => {
      await seedMember(MEMBER, kakaoKey(1));
      await seedMember(OTHER, kakaoKey(2));

      await prisma.v1AuthIdentity.create({ data: { userId: MEMBER, provider: 'apple', providerUserKey: `${PREFIX}-apple`, status: 'active' } });

      expect(await providersOf(MEMBER)).toEqual(['apple', 'email', 'kakao']);
      expect(await providersOf(OTHER)).toEqual(['email', 'kakao']);
    });

    it('keeps unlinked history: several unlinked rows of a provider sit next to the one active row', async () => {
      await seedMember(MEMBER, kakaoKey(1));

      await prisma.v1AuthIdentity.createMany({
        data: [
          { userId: MEMBER, provider: 'kakao', providerUserKey: kakaoKey(2), status: 'unlinked', unlinkedAt: new Date() },
          { userId: MEMBER, provider: 'kakao', providerUserKey: kakaoKey(3), status: 'unlinked', unlinkedAt: new Date() },
        ],
      });

      const kakao = (await identitiesOf(MEMBER)).filter((row) => row.provider === 'kakao');
      expect(kakao.map((row) => row.status).sort()).toEqual(['active', 'unlinked', 'unlinked']);
    });

    it('refuses to reactivate an unlinked identity while another of that provider is active, and allows it once that one is unlinked', async () => {
      await seedMember(MEMBER, kakaoKey(1));
      await prisma.v1AuthIdentity.create({
        data: { userId: MEMBER, provider: 'kakao', providerUserKey: kakaoKey(2), status: 'unlinked', unlinkedAt: new Date() },
      });
      const reactivate = () => prisma.v1AuthIdentity.update({
        where: { provider_providerUserKey: { provider: 'kakao', providerUserKey: kakaoKey(2) } },
        data: { status: 'active', unlinkedAt: null },
      });

      await expect(reactivate()).rejects.toMatchObject({ code: 'P2002' });

      await prisma.v1AuthIdentity.update({
        where: { provider_providerUserKey: { provider: 'kakao', providerUserKey: kakaoKey(1) } },
        data: { status: 'unlinked', unlinkedAt: new Date() },
      });
      await expect(reactivate()).resolves.toMatchObject({ status: 'active' });
    });
  });

  describe('sign-in that matches an existing account by its verified email', () => {
    it('attaches the Kakao login, leaves a security notice and a status log', async () => {
      await seedMember(MEMBER);

      const response = await kakaoLogin(kakaoKey(1), { email: emailOf(MEMBER) }).expect(201);

      expect(response.body.data.session.userId).toBe(MEMBER);
      expect(await providersOf(MEMBER)).toEqual(['email', 'kakao']);
      const linked = (await identitiesOf(MEMBER)).find((row) => row.provider === 'kakao');
      const notices = await noticesOf(MEMBER);
      expect(notices).toHaveLength(1);
      expect(notices[0].businessKey).toBe(`social-link:${linked?.id}:${MEMBER}`);
      expect(notices[0].body).toContain('카카오 로그인이 연결됐어요');
      const logs = await prisma.v1StatusChangeLog.findMany({ where: { targetType: 'auth_identity', targetId: linked?.id } });
      expect(logs.map((log) => log.reason)).toEqual(['kakao_verified_contact:email']);
    });

    it('does not attach a second Kakao login to an account that already has one', async () => {
      await seedMember(MEMBER, kakaoKey(1));

      const response = await kakaoLogin(kakaoKey(2), { email: emailOf(MEMBER) }).expect(409);

      expect(response.body.code).toBe('SOCIAL_LINK_PROVIDER_EXISTS');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(await keysOf(MEMBER)).toEqual([kakaoKey(1), emailOf(MEMBER)].sort());
      expect(await prisma.v1AuthIdentity.count({ where: { provider: 'kakao', providerUserKey: kakaoKey(2) } })).toBe(0);
      expect(await noticesOf(MEMBER)).toHaveLength(0);
    });

    it('does not attach a Kakao login to an operator account', async () => {
      await seedMember(OPERATOR);
      await prisma.v1AdminUser.create({ data: { userId: OPERATOR, adminRole: 'ops', status: 'active' } });

      const response = await kakaoLogin(kakaoKey(3), { email: emailOf(OPERATOR) }).expect(403);

      expect(response.body.code).toBe('SOCIAL_LINK_ADMIN_FORBIDDEN');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(await providersOf(OPERATOR)).toEqual(['email']);
      expect(await noticesOf(OPERATOR)).toHaveLength(0);
    });
  });
});

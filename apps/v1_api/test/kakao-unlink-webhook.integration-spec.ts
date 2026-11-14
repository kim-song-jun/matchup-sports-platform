import type { INestApplication } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import request = require('supertest');
import { KAKAO_ADMIN_KEY_ENV } from '../src/auth/kakao-unlink.service';
import { KAKAO_APP_ID_ENV } from '../src/auth/kakao-webhook.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createV1IntegrationApp } from './integration/integration-app';

class KakaoWebhookFixtureError extends Error {}

const ROUTE = '/api/v1/webhooks/kakao/unlink';
const ADMIN_KEY = 'integration-kakao-webhook-admin-key';
const APP_ID = '2468013';
const SESSION_SECRET = 'integration-kakao-webhook-session-secret-0123456789';
const ENV_KEYS = [KAKAO_ADMIN_KEY_ENV, KAKAO_APP_ID_ENV, 'V1_SESSION_SECRET'] as const;
const KAKAO_DRAFT = { kakaoName: '홍길동', kakaoPhone: '01012345678', kakaoGender: 'female', kakaoBirthDate: '20000229' };
const OTHER_DRAFT = { appleName: '김애플', ageConfirmedAt: '2026-10-11T00:00:00.000Z', autoNickname: '씩씩한수달3' };

/** Real HTTP, body parsing, global pipe and filter, and the database; only Kakao's own servers are absent. */
describe('Kakao unlink webhook (PostgreSQL)', () => {
  const prefix = `kakao-webhook-${randomUUID().slice(0, 8)}`;
  const userIds: string[] = [];
  const identityIds: string[] = [];
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
  const originalFetch = global.fetch;
  let seq = 0;
  let app: INestApplication;
  let prisma: PrismaService;
  let cleanupApp: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    process.env[KAKAO_ADMIN_KEY_ENV] = ADMIN_KEY;
    process.env[KAKAO_APP_ID_ENV] = APP_ID;
    process.env.V1_SESSION_SECRET = SESSION_SECRET;
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await clearErrorLogs();
  }, 60_000);

  beforeEach(() => {
    process.env[KAKAO_ADMIN_KEY_ENV] = ADMIN_KEY;
    process.env[KAKAO_APP_ID_ENV] = APP_ID;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    try {
      if (prisma) {
        await clearErrorLogs();
        await prisma.v1StatusChangeLog.deleteMany({ where: { targetId: { in: [...userIds, ...identityIds] } } });
        await prisma.v1User.deleteMany({ where: { id: { in: userIds } } });
      }
      await cleanupApp?.();
    } finally {
      for (const key of ENV_KEYS) {
        if (savedEnv[key] === undefined) delete process.env[key];
        else process.env[key] = savedEnv[key];
      }
    }
  });

  const clearErrorLogs = () => prisma.v1ErrorLog.deleteMany({ where: { route: { contains: 'webhooks/kakao/unlink' } } });

  /** A completed member with a Kakao login (and an email one), holding a signup draft that still has Kakao values. */
  async function member(options: { identityStatus?: 'active' | 'unlinked' } = {}) {
    seq += 1;
    // Invented member number: it never matches a real Kakao account.
    const memberNumber = `9${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`;
    const email = `${prefix}-${seq}@example.test`;
    const row = await prisma.v1User.create({
      data: {
        email,
        phone: `010${String(randomInt(0, 100_000_000)).padStart(8, '0')}`,
        emailVerifiedAt: new Date('2026-09-01T00:00:00Z'),
        phoneVerifiedAt: new Date('2026-09-01T00:00:00Z'),
        onboardingStatus: 'completed',
        profile: { create: { nickname: `${prefix}-${seq}` } },
        onboardingProgress: { create: { currentStep: 'sport', draftJson: { ...KAKAO_DRAFT, ...OTHER_DRAFT } } },
        authIdentities: {
          create: [
            { provider: 'kakao', providerUserKey: memberNumber, status: options.identityStatus ?? 'active' },
            { provider: 'email', providerUserKey: email, email, passwordHash: 'hash' },
          ],
        },
      },
      include: { authIdentities: true },
    });
    const kakao = row.authIdentities.find((identity) => identity.provider === 'kakao');
    if (!kakao) throw new KakaoWebhookFixtureError('The Kakao login row was not created');
    userIds.push(row.id);
    identityIds.push(...row.authIdentities.map((identity) => identity.id));
    return { id: row.id, memberNumber, kakaoIdentityId: kakao.id };
  }

  const notify = (fields: Record<string, string>, authorization: string | null = `KakaoAK ${ADMIN_KEY}`) => {
    const call = request(app.getHttpServer()).post(ROUTE).type('form');
    return (authorization === null ? call : call.set('Authorization', authorization)).send(fields);
  };
  const notice = (memberNumber: string, referrerType = 'UNLINK_FROM_APPS') => ({
    app_id: APP_ID,
    user_id: memberNumber,
    referrer_type: referrerType,
    group_user_token: 'group-token-never-stored',
  });
  const records = (identityId: string) => prisma.v1StatusChangeLog.findMany({ where: { targetId: identityId, toStatus: 'provider_unlinked' } });
  const draftOf = async (userId: string) => (await prisma.v1UserOnboardingProgress.findUniqueOrThrow({ where: { userId } })).draftJson;

  async function errorRow(statusCode: number) {
    const deadline = Date.now() + 5_000;
    for (;;) {
      const row = await prisma.v1ErrorLog.findFirst({ where: { route: { contains: 'webhooks/kakao/unlink' }, statusCode } });
      if (row) return row;
      if (Date.now() > deadline) throw new KakaoWebhookFixtureError(`No ${statusCode} error log row for the webhook`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  function kakaoLogin(memberNumber: string) {
    global.fetch = async (url, init) => {
      if (String(url) === 'https://kapi.kakao.com/v1/user/access_token_info') return new Response(JSON.stringify({ id: memberNumber, app_id: Number(APP_ID) }));
      if (String(url) === 'https://kapi.kakao.com/v2/user/me') return new Response(JSON.stringify({ id: memberNumber, kakao_account: {} }));
      return originalFetch(url, init);
    };
    return request(app.getHttpServer()).post('/api/v1/auth/kakao/token').send({ accessToken: 'integration-kakao-webhook-token' });
  }

  describe('a notification in the form Kakao sends', () => {
    it('answers 200 (not 201), records one row, and drops only the Kakao values from the draft', async () => {
      const target = await member();
      const bystander = await member();

      await notify(notice(target.memberNumber, 'ACCOUNT_DELETE')).expect(200);

      expect(await records(target.kakaoIdentityId)).toEqual([
        expect.objectContaining({
          targetType: 'auth_identity',
          fromStatus: 'active',
          toStatus: 'provider_unlinked',
          actorType: 'system',
          reason: 'kakao_unlink_webhook:ACCOUNT_DELETE',
        }),
      ]);
      expect(await draftOf(target.id)).toEqual(OTHER_DRAFT);
      expect(await records(bystander.kakaoIdentityId)).toEqual([]);
      expect(await draftOf(bystander.id)).toEqual({ ...KAKAO_DRAFT, ...OTHER_DRAFT });
    });

    it('leaves the login rows, the account and the profile exactly as they were', async () => {
      const target = await member();
      const readState = async () => {
        const id = target.id;
        return {
          user: await prisma.v1User.findUniqueOrThrow({ where: { id } }),
          identities: await prisma.v1AuthIdentity.findMany({ where: { userId: id }, orderBy: { id: 'asc' } }),
          profile: await prisma.v1UserProfile.findUniqueOrThrow({ where: { userId: id } }),
          progress: await prisma.v1UserOnboardingProgress.findUniqueOrThrow({ where: { userId: id }, select: { currentStep: true, completedAt: true } }),
        };
      };
      const before = await readState();

      await notify(notice(target.memberNumber)).expect(200);

      expect(await readState()).toEqual(before);
      expect(before.identities.find((row) => row.id === target.kakaoIdentityId)).toMatchObject({ status: 'active', unlinkedAt: null, providerUserKey: target.memberNumber });
    });

    it('does not stop the same member from signing in with Kakao afterwards', async () => {
      const target = await member();
      await notify(notice(target.memberNumber)).expect(200);

      const login = await kakaoLogin(target.memberNumber).expect(201);

      expect(login.body.data.session.userId).toBe(target.id);
    });

    it('gives the same end state for a repeated notification: one more row, the same draft', async () => {
      const target = await member();

      await notify(notice(target.memberNumber)).expect(200);
      const draftAfterFirst = await draftOf(target.id);
      await notify(notice(target.memberNumber)).expect(200);

      expect(await draftOf(target.id)).toEqual(draftAfterFirst);
      expect(await records(target.kakaoIdentityId)).toHaveLength(2);
    });

    it('records the notification for a login method the member had already removed, and leaves the row unlinked', async () => {
      const target = await member({ identityStatus: 'unlinked' });

      await notify(notice(target.memberNumber)).expect(200);

      expect(await records(target.kakaoIdentityId)).toEqual([expect.objectContaining({ fromStatus: 'unlinked' })]);
      expect(await prisma.v1AuthIdentity.findUniqueOrThrow({ where: { id: target.kakaoIdentityId } })).toMatchObject({ status: 'unlinked' });
    });

    it('folds an unknown referrer_type into "other" and stores the received text nowhere', async () => {
      const target = await member();

      await notify(notice(target.memberNumber, 'attacker-controlled-text')).expect(200);

      const [row] = await records(target.kakaoIdentityId);
      expect(row.reason).toBe('kakao_unlink_webhook:other');
      expect(JSON.stringify(row)).not.toContain('attacker-controlled-text');
    });

    it('answers 200 and changes nothing for a member number it does not know', async () => {
      const bystander = await member();

      await notify(notice('9999999999')).expect(200);

      expect(await records(bystander.kakaoIdentityId)).toEqual([]);
      expect(await draftOf(bystander.id)).toEqual({ ...KAKAO_DRAFT, ...OTHER_DRAFT });
    });

    it('answers 200 and changes nothing for another Kakao app\'s notification', async () => {
      const target = await member();

      await notify({ ...notice(target.memberNumber), app_id: '1357924' }).expect(200);

      expect(await records(target.kakaoIdentityId)).toEqual([]);
      expect(await draftOf(target.id)).toEqual({ ...KAKAO_DRAFT, ...OTHER_DRAFT });
    });
  });

  describe('a request the service refuses', () => {
    beforeEach(clearErrorLogs);

    it.each([
      ['a wrong key', 'KakaoAK not-the-admin-key-of-this-server'],
      ['no Authorization header', null],
    ])('answers 401 for %s, writes nothing, and keeps the member number out of the error log', async (_label, authorization) => {
      const target = await member();

      await notify(notice(target.memberNumber), authorization).expect(401);

      expect(await records(target.kakaoIdentityId)).toEqual([]);
      expect(await draftOf(target.id)).toEqual({ ...KAKAO_DRAFT, ...OTHER_DRAFT });
      const row = await errorRow(401);
      expect(row.requestBody).toBeNull();
      expect(JSON.stringify(row)).not.toContain(target.memberNumber);
      expect(JSON.stringify(row)).not.toContain(ADMIN_KEY);
      expect(JSON.stringify(row.requestHeaders ?? {})).not.toContain('not-the-admin-key-of-this-server');
    });

    it.each([
      ['the admin key', KAKAO_ADMIN_KEY_ENV],
      ['the app id', KAKAO_APP_ID_ENV],
    ])('answers 503 when %s is not set, writes nothing, and keeps the member number out of the error log', async (_label, envKey) => {
      const target = await member();
      delete process.env[envKey];

      await notify(notice(target.memberNumber)).expect(503).expect((response) => {
        expect(response.body.code).toBe('KAKAO_WEBHOOK_NOT_CONFIGURED');
      });

      expect(await records(target.kakaoIdentityId)).toEqual([]);
      expect(await draftOf(target.id)).toEqual({ ...KAKAO_DRAFT, ...OTHER_DRAFT });
      const row = await errorRow(503);
      expect(row.requestBody).toBeNull();
      expect(JSON.stringify(row)).not.toContain(target.memberNumber);
    });

    it('answers 400 for a body that is not the unlink form, and keeps it out of the error log', async () => {
      await notify({ app_id: APP_ID, user_id: 'not-a-number-9000000042' }).expect(400);

      const row = await errorRow(400);
      expect(row.requestBody).toBeNull();
      expect(JSON.stringify(row)).not.toContain('9000000042');
    });

    it('has no GET route: a GET answers 404 and writes nothing', async () => {
      const target = await member();

      await request(app.getHttpServer())
        .get(ROUTE)
        .query({ app_id: APP_ID, user_id: target.memberNumber, referrer_type: 'UNLINK_FROM_APPS' })
        .set('Authorization', `KakaoAK ${ADMIN_KEY}`)
        .expect(404);

      expect(await records(target.kakaoIdentityId)).toEqual([]);
    });
  });
});

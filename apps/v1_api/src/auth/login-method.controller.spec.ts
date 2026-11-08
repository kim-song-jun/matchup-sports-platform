import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { createGlobalValidationPipe } from '../common/global-validation-pipe';
import { PrismaService } from '../prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';
import { LoginMethodController } from './login-method.controller';
import { LoginMethodService } from './login-method.service';
import { createV1SessionToken, readV1Session, readV1SessionAgeSeconds, V1_SESSION_COOKIE_NAME } from './v1-session';

const SESSION_SECRET = 'login-method-controller-session-secret-0123456789';
const savedSecret = process.env.V1_SESSION_SECRET;
beforeAll(() => {
  process.env.V1_SESSION_SECRET = SESSION_SECRET;
});
afterAll(() => {
  if (savedSecret === undefined) delete process.env.V1_SESSION_SECRET;
  else process.env.V1_SESSION_SECRET = savedSecret;
});

const cookieIssuedAgo = (seconds: number, sessionEpoch = 3) =>
  `${V1_SESSION_COOKIE_NAME}=${createV1SessionToken({
    userId: 'user-1',
    sessionEpoch,
    secret: SESSION_SECRET,
    issuedAtMs: Date.now() - seconds * 1_000,
  })}`;

/** The cookie a response sets, as a request would send it back. */
function cookieSetBy(response: request.Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const sessionCookie = header?.find((entry) => entry.startsWith(`${V1_SESSION_COOKIE_NAME}=`));
  if (!sessionCookie) throw new Error('the response set no session cookie');
  return sessionCookie.split(';')[0];
}

async function buildApp() {
  const loginMethods = {
    unlink: jest.fn().mockResolvedValue({ provider: 'kakao', authProviders: ['email'], sessionEpoch: 4 }),
    revokeOtherSessions: jest.fn().mockResolvedValue({ sessionEpoch: 4 }),
  };
  const prisma = {
    v1User: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        accountStatus: 'active',
        onboardingStatus: 'completed',
        phoneVerifiedAt: new Date(),
        adminUser: null,
      }),
    },
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [LoginMethodController],
    providers: [
      { provide: LoginMethodService, useValue: loginMethods },
      { provide: PrismaService, useValue: prisma },
      { provide: ManagedTermsRuntimeService, useValue: { signupCompliance: jest.fn().mockResolvedValue({ compliant: true }) } },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(createGlobalValidationPipe());
  await app.init();
  return { app, loginMethods };
}

describe('login method HTTP contract', () => {
  describe('POST /auth/identities/unlink', () => {
    it('hands the user, the provider and what the cookie proves to the service, and answers 200 without the epoch', async () => {
      const { app, loginMethods } = await buildApp();

      const res = await request(app.getHttpServer())
        .post('/auth/identities/unlink')
        .set('Cookie', cookieIssuedAgo(20 * 60, 3))
        .send({ provider: 'kakao' })
        .expect(200);

      expect(res.body).toEqual({ provider: 'kakao', authProviders: ['email'] });
      const [userId, provider, proof] = loginMethods.unlink.mock.calls[0];
      expect([userId, provider]).toEqual(['user-1', 'kakao']);
      expect(proof.sessionEpoch).toBe(3);
      expect(proof.ageSeconds).toBeGreaterThanOrEqual(1_200);
      expect(proof.ageSeconds).toBeLessThan(1_260);
      await app.close();
    });

    it('re-signs this device’s cookie under the new epoch and keeps its age, so the removal cannot be used to look recently signed in', async () => {
      const { app } = await buildApp();

      const res = await request(app.getHttpServer())
        .post('/auth/identities/unlink')
        .set('Cookie', cookieIssuedAgo(20 * 60, 3))
        .send({ provider: 'kakao' })
        .expect(200);

      const reissued = cookieSetBy(res);
      expect(readV1Session(reissued, { secret: SESSION_SECRET })).toEqual({ userId: 'user-1', sessionEpoch: 4 });
      const age = readV1SessionAgeSeconds(reissued, { secret: SESSION_SECRET }) ?? -1;
      expect(age).toBeGreaterThanOrEqual(1_200);
      expect(age).toBeLessThan(1_260);
      await app.close();
    });

    it('sets no cookie when the service refuses', async () => {
      const { app, loginMethods } = await buildApp();
      loginMethods.unlink.mockRejectedValueOnce(new ForbiddenException({ code: 'RECENT_LOGIN_REQUIRED', message: '다시 로그인해 주세요.' }));

      const res = await request(app.getHttpServer())
        .post('/auth/identities/unlink')
        .set('Cookie', cookieIssuedAgo(40 * 60))
        .send({ provider: 'email' })
        .expect(403);

      expect(res.body.code).toBe('RECENT_LOGIN_REQUIRED');
      expect(res.headers['set-cookie']).toBeUndefined();
      await app.close();
    });

    it('serves a header identity (non-production) with no cookie proof, and sets no cookie', async () => {
      const { app, loginMethods } = await buildApp();

      const res = await request(app.getHttpServer()).post('/auth/identities/unlink').set('x-v1-user-id', 'user-1').send({ provider: 'apple' }).expect(200);

      expect(loginMethods.unlink).toHaveBeenCalledWith('user-1', 'apple', null);
      expect(res.headers['set-cookie']).toBeUndefined();
      await app.close();
    });

    it.each([
      { name: 'a provider that cannot be removed', body: { provider: 'naver' } },
      { name: 'no provider', body: {} },
      { name: 'a provider that is not a string', body: { provider: ['kakao'] } },
      { name: 'a field outside the contract', body: { provider: 'kakao', userId: 'someone-else' } },
    ])('rejects $name with 400 before the service', async ({ body }) => {
      const { app, loginMethods } = await buildApp();

      const res = await request(app.getHttpServer()).post('/auth/identities/unlink').set('Cookie', cookieIssuedAgo(5)).send(body).expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(loginMethods.unlink).not.toHaveBeenCalled();
      await app.close();
    });

    it('needs a session', async () => {
      const { app, loginMethods } = await buildApp();

      await request(app.getHttpServer()).post('/auth/identities/unlink').send({ provider: 'kakao' }).expect(401);

      expect(loginMethods.unlink).not.toHaveBeenCalled();
      await app.close();
    });
  });

  describe('POST /auth/sessions/revoke-others', () => {
    it('signs the others out, answers 200, and re-signs this device’s cookie under the new epoch with its own age', async () => {
      const { app, loginMethods } = await buildApp();

      const res = await request(app.getHttpServer())
        .post('/auth/sessions/revoke-others')
        .set('Cookie', cookieIssuedAgo(3 * 24 * 60 * 60, 3))
        .expect(200);

      expect(res.body).toEqual({ revoked: true });
      const [userId, proof] = loginMethods.revokeOtherSessions.mock.calls[0];
      expect(userId).toBe('user-1');
      expect(proof.sessionEpoch).toBe(3);
      const reissued = cookieSetBy(res);
      expect(readV1Session(reissued, { secret: SESSION_SECRET })).toEqual({ userId: 'user-1', sessionEpoch: 4 });
      expect(readV1SessionAgeSeconds(reissued, { secret: SESSION_SECRET })).toBeGreaterThanOrEqual(3 * 24 * 60 * 60);
      await app.close();
    });

    it('needs a session', async () => {
      const { app, loginMethods } = await buildApp();

      await request(app.getHttpServer()).post('/auth/sessions/revoke-others').expect(401);

      expect(loginMethods.revokeOtherSessions).not.toHaveBeenCalled();
      await app.close();
    });
  });
});

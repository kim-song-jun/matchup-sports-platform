import { Test } from '@nestjs/testing';
import request = require('supertest');
import { createGlobalValidationPipe } from '../common/global-validation-pipe';
import { PrismaService } from '../prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';
import { EmailLinkController } from './email-link.controller';
import { EmailLinkService } from './email-link.service';
import { createV1SessionToken, V1_SESSION_COOKIE_NAME } from './v1-session';

const SESSION_SECRET = 'email-link-controller-session-secret-0123456789';
const savedSecret = process.env.V1_SESSION_SECRET;
beforeAll(() => {
  process.env.V1_SESSION_SECRET = SESSION_SECRET;
});
afterAll(() => {
  if (savedSecret === undefined) delete process.env.V1_SESSION_SECRET;
  else process.env.V1_SESSION_SECRET = savedSecret;
});

const REQUESTED = { sent: true, maskedTarget: 'ru***@example.com', expiresInSeconds: 300, resendAvailableInSeconds: 30 };
const VERIFIED = { emailLinkToken: 'signed.token', expiresInSeconds: 600 };
const LINKED = { linked: true, email: 'runner@example.com' };
const COMPLETE_BODY = { emailLinkToken: 't'.repeat(40), password: 'password123', passwordConfirm: 'password123' };

const cookieIssuedAgo = (seconds: number) =>
  `${V1_SESSION_COOKIE_NAME}=${createV1SessionToken({
    userId: 'user-1',
    sessionEpoch: 0,
    secret: SESSION_SECRET,
    issuedAtMs: Date.now() - seconds * 1_000,
  })}`;

async function buildApp(onboardingStatus = 'completed') {
  const emailLink = {
    requestCode: jest.fn().mockResolvedValue(REQUESTED),
    verifyCode: jest.fn().mockResolvedValue(VERIFIED),
    complete: jest.fn().mockResolvedValue(LINKED),
  };
  const prisma = {
    v1User: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        accountStatus: 'active',
        onboardingStatus,
        phoneVerifiedAt: new Date(),
        adminUser: null,
      }),
    },
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [EmailLinkController],
    providers: [
      { provide: EmailLinkService, useValue: emailLink },
      { provide: PrismaService, useValue: prisma },
      { provide: ManagedTermsRuntimeService, useValue: { signupCompliance: jest.fn().mockResolvedValue({ compliant: true }) } },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(createGlobalValidationPipe());
  await app.init();
  return { app, emailLink };
}

describe('email login link HTTP contract', () => {
  it('hands the signed-in user, the body and the session age to request, and answers 200', async () => {
    const { app, emailLink } = await buildApp();

    const res = await request(app.getHttpServer())
      .post('/auth/link/email/request')
      .set('Cookie', cookieIssuedAgo(40 * 60))
      .send({ email: 'Runner@Example.com' })
      .expect(200);

    expect(res.body).toEqual(REQUESTED);
    const [userId, dto, age] = emailLink.requestCode.mock.calls[0];
    expect([userId, dto]).toEqual(['user-1', { email: 'Runner@Example.com' }]);
    expect(age).toBeGreaterThanOrEqual(2_400);
    expect(age).toBeLessThan(2_460);
    await app.close();
  });

  it('hands verify and complete the signed-in user and the body, without a session age', async () => {
    const { app, emailLink } = await buildApp();

    const verified = await request(app.getHttpServer()).post('/auth/link/email/verify').set('Cookie', cookieIssuedAgo(5)).send({ code: '012345' }).expect(200);
    const completed = await request(app.getHttpServer()).post('/auth/link/email/complete').set('Cookie', cookieIssuedAgo(5)).send(COMPLETE_BODY).expect(200);

    expect(verified.body).toEqual(VERIFIED);
    expect(emailLink.verifyCode).toHaveBeenCalledWith('user-1', { code: '012345' });
    expect(completed.body).toEqual(LINKED);
    expect(emailLink.complete).toHaveBeenCalledWith('user-1', COMPLETE_BODY);
    await app.close();
  });

  it.each([
    { route: 'request', name: 'an address that is not one', body: { email: 'nope' } },
    { route: 'request', name: 'a field outside the contract', body: { email: 'runner@example.com', userId: 'someone-else' } },
    { route: 'verify', name: 'a code of five digits', body: { code: '12345' } },
    { route: 'complete', name: 'a password pair that differs', body: { ...COMPLETE_BODY, passwordConfirm: 'password124' } },
    { route: 'complete', name: 'a password that is too short', body: { ...COMPLETE_BODY, password: 'short', passwordConfirm: 'short' } },
    { route: 'complete', name: 'a field outside the contract', body: { ...COMPLETE_BODY, email: 'victim@example.com' } },
  ])('rejects $name on $route with 400 before the service', async ({ route, body }) => {
    const { app, emailLink } = await buildApp();

    const res = await request(app.getHttpServer()).post(`/auth/link/email/${route}`).set('Cookie', cookieIssuedAgo(5)).send(body).expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(emailLink.requestCode).not.toHaveBeenCalled();
    expect(emailLink.verifyCode).not.toHaveBeenCalled();
    expect(emailLink.complete).not.toHaveBeenCalled();
    await app.close();
  });

  it('never echoes a password back in a validation error', async () => {
    const { app } = await buildApp();

    const res = await request(app.getHttpServer())
      .post('/auth/link/email/complete')
      .set('Cookie', cookieIssuedAgo(5))
      .send({ ...COMPLETE_BODY, password: 'pw-secret-1', passwordConfirm: 'pw-secret-2' })
      .expect(400);

    expect(JSON.stringify(res.body)).not.toContain('pw-secret');
    await app.close();
  });

  it('needs a session on every step', async () => {
    const { app, emailLink } = await buildApp();

    await request(app.getHttpServer()).post('/auth/link/email/request').send({ email: 'runner@example.com' }).expect(401);
    await request(app.getHttpServer()).post('/auth/link/email/verify').send({ code: '012345' }).expect(401);
    await request(app.getHttpServer()).post('/auth/link/email/complete').send(COMPLETE_BODY).expect(401);

    expect(emailLink.requestCode).not.toHaveBeenCalled();
    expect(emailLink.verifyCode).not.toHaveBeenCalled();
    expect(emailLink.complete).not.toHaveBeenCalled();
    await app.close();
  });

  it('keeps a caller whose signup has not finished out of every step with 403 SIGNUP_INCOMPLETE', async () => {
    const { app, emailLink } = await buildApp('social_profile_required');

    for (const [route, body] of [['request', { email: 'runner@example.com' }], ['verify', { code: '012345' }], ['complete', COMPLETE_BODY]] as const) {
      const res = await request(app.getHttpServer()).post(`/auth/link/email/${route}`).set('Cookie', cookieIssuedAgo(5)).send(body).expect(403);
      expect(res.body).toMatchObject({ code: 'SIGNUP_INCOMPLETE' });
    }

    expect(emailLink.requestCode).not.toHaveBeenCalled();
    expect(emailLink.complete).not.toHaveBeenCalled();
    await app.close();
  });
});

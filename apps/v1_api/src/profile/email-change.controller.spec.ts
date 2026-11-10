import { Test } from '@nestjs/testing';
import request = require('supertest');
import { createV1SessionToken, V1_SESSION_COOKIE_NAME } from '../auth/v1-session';
import { createGlobalValidationPipe } from '../common/global-validation-pipe';
import { PrismaService } from '../prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';
import { EmailChangeController } from './email-change.controller';
import { EmailChangeService } from './email-change.service';

const SESSION_SECRET = 'email-change-controller-session-secret-0123456789';
const savedSecret = process.env.V1_SESSION_SECRET;
beforeAll(() => {
  process.env.V1_SESSION_SECRET = SESSION_SECRET;
});
afterAll(() => {
  if (savedSecret === undefined) delete process.env.V1_SESSION_SECRET;
  else process.env.V1_SESSION_SECRET = savedSecret;
});

const REQUESTED = { sent: true, maskedTarget: 'ru***@example.com', expiresInSeconds: 300, resendAvailableInSeconds: 30 };
const VERIFIED = { emailChangeToken: 'signed.token', expiresInSeconds: 600 };

const cookieIssuedAgo = (seconds: number) =>
  `${V1_SESSION_COOKIE_NAME}=${createV1SessionToken({
    userId: 'user-1',
    sessionEpoch: 0,
    secret: SESSION_SECRET,
    issuedAtMs: Date.now() - seconds * 1_000,
  })}`;

async function buildApp() {
  const emailChange = {
    requestCode: jest.fn().mockResolvedValue(REQUESTED),
    verifyCode: jest.fn().mockResolvedValue(VERIFIED),
  };
  const authUser = { id: 'user-1', email: 'user@example.com', accountStatus: 'active', onboardingStatus: 'completed', phoneVerifiedAt: new Date(), adminUser: null };
  const moduleRef = await Test.createTestingModule({
    controllers: [EmailChangeController],
    providers: [
      { provide: EmailChangeService, useValue: emailChange },
      { provide: PrismaService, useValue: { v1User: { findFirst: jest.fn().mockResolvedValue(authUser) } } },
      { provide: ManagedTermsRuntimeService, useValue: { signupCompliance: jest.fn().mockResolvedValue({ compliant: true }) } },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(createGlobalValidationPipe());
  await app.init();
  return { app, emailChange };
}

describe('email change HTTP contract', () => {
  it('hands the signed-in user, the body and the session age to request, and answers 200', async () => {
    const { app, emailChange } = await buildApp();

    const res = await request(app.getHttpServer())
      .post('/me/email-change/request')
      .set('Cookie', cookieIssuedAgo(40 * 60))
      .send({ email: 'Runner@Example.com' })
      .expect(200);

    expect(res.body).toEqual(REQUESTED);
    const [user, dto, age] = emailChange.requestCode.mock.calls[0];
    expect([user.id, dto]).toEqual(['user-1', { email: 'Runner@Example.com' }]);
    expect(age).toBeGreaterThanOrEqual(2_400);
    expect(age).toBeLessThan(2_460);
    await app.close();
  });

  it('hands verify the signed-in user id and the body, without a session age', async () => {
    const { app, emailChange } = await buildApp();

    const res = await request(app.getHttpServer()).post('/me/email-change/verify').set('Cookie', cookieIssuedAgo(5)).send({ code: '012345' }).expect(200);

    expect(res.body).toEqual(VERIFIED);
    expect(emailChange.verifyCode).toHaveBeenCalledWith('user-1', { code: '012345' });
    await app.close();
  });

  it.each([
    { route: 'request', name: 'an address that is not one', body: { email: 'nope' } },
    { route: 'request', name: 'a field outside the contract', body: { email: 'runner@example.com', userId: 'someone-else' } },
    { route: 'verify', name: 'a code of five digits', body: { code: '12345' } },
    { route: 'verify', name: 'a field outside the contract', body: { code: '012345', email: 'victim@example.com' } },
  ])('rejects $name on $route with 400 before the service', async ({ route, body }) => {
    const { app, emailChange } = await buildApp();

    const res = await request(app.getHttpServer()).post(`/me/email-change/${route}`).set('Cookie', cookieIssuedAgo(5)).send(body).expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(emailChange.requestCode).not.toHaveBeenCalled();
    expect(emailChange.verifyCode).not.toHaveBeenCalled();
    await app.close();
  });

  it('needs a session on both steps', async () => {
    const { app, emailChange } = await buildApp();

    await request(app.getHttpServer()).post('/me/email-change/request').send({ email: 'runner@example.com' }).expect(401);
    await request(app.getHttpServer()).post('/me/email-change/verify').send({ code: '012345' }).expect(401);

    expect(emailChange.requestCode).not.toHaveBeenCalled();
    expect(emailChange.verifyCode).not.toHaveBeenCalled();
    await app.close();
  });
});

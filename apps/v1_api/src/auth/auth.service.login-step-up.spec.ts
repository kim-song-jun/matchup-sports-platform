/**
 * Email login with step-up, end to end through AuthService with the real LoginSecurityService and
 * LoginStepUpService over an in-memory database and real scrypt. Only the mail transport, the account
 * snapshot and the unrelated collaborators are stand-ins.
 */
import { Test } from '@nestjs/testing';
import * as crypto from 'crypto';
import { createLoginSecurityFakePrisma } from '../../test/helpers/login-security-fake-prisma';
import { PrismaService } from '../prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';
import { VerificationDispatcherService } from '../verification/verification-dispatcher.service';
import { PhoneVerificationService } from '../verification/phone-verification.service';
import { AppleIdentityService } from './apple-identity.service';
import { AppleTokenService } from './apple-token.service';
import { AuthService } from './auth.service';
import { loginEmailKey } from './login-security/login-security.policy';
import { LoginSecurityService } from './login-security/login-security.service';
import { LoginStepUpService } from './login-security/login-step-up.service';
import { hashPassword } from './password-hash';

jest.mock('crypto', () => {
  const actual = jest.requireActual<typeof import('crypto')>('crypto');
  return { ...actual, scrypt: jest.fn(actual.scrypt) };
});

const T0 = new Date('2026-10-21T12:00:00.000Z');
const EMAIL = 'runner@example.com';
const PASSWORD = 'Correct-horse-1!';
const CLIENT = { ip: '203.0.113.9' };

const stepUpOf = (result: unknown) => (result as { stepUp: Record<string, unknown> }).stepUp;
const scryptCalls = () => (crypto.scrypt as unknown as jest.Mock).mock.calls.length;

async function build(options: { accountStatus?: string } = {}) {
  const { prisma, state } = createLoginSecurityFakePrisma();
  state.identities.push({
    id: 'identity-1',
    userId: 'user-1',
    provider: 'email',
    providerUserKey: EMAIL,
    passwordHash: await hashPassword(PASSWORD),
    status: 'active',
    user: {
      id: 'user-1',
      email: EMAIL,
      accountStatus: options.accountStatus ?? 'active',
      onboardingStatus: 'completed',
      createdAt: T0,
      updatedAt: T0,
    },
  });
  const dispatcher = { send: jest.fn().mockResolvedValue(undefined), devEchoActive: false };
  const moduleRef = await Test.createTestingModule({
    providers: [
      AuthService,
      LoginSecurityService,
      LoginStepUpService,
      { provide: PrismaService, useValue: prisma },
      { provide: VerificationDispatcherService, useValue: dispatcher },
      { provide: ManagedTermsRuntimeService, useValue: {} },
      { provide: PhoneVerificationService, useValue: {} },
      { provide: AppleIdentityService, useValue: {} },
      { provide: AppleTokenService, useValue: {} },
    ],
  }).compile();
  const service = moduleRef.get(AuthService);
  jest.spyOn(service, 'me').mockResolvedValue({
    user: { id: 'user-1', email: EMAIL },
    onboarding: { status: 'completed', missing: [] },
  } as unknown as Awaited<ReturnType<AuthService['me']>>);
  const flush = async () => {
    await moduleRef.get(LoginStepUpService).onApplicationShutdown();
    await moduleRef.get(LoginSecurityService).onApplicationShutdown();
  };
  return { service, state, dispatcher, flush, moduleRef };
}

const seedFailures = (state: { attempts: Array<Record<string, unknown>> }, email: string, count: number) => {
  for (let index = 0; index < count; index += 1) {
    state.attempts.push({
      id: `seed-${email}-${index}`,
      emailKey: loginEmailKey(email),
      ipKey: null,
      result: 'failed',
      createdAt: new Date(Date.now() - (index + 1) * 1_000),
    });
  }
};

beforeEach(() => {
  jest.useFakeTimers({
    now: T0,
    doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'clearImmediate', 'queueMicrotask', 'performance', 'hrtime'],
  });
});
afterEach(() => jest.useRealTimers());

describe('AuthService.login while no step-up applies', () => {
  it('keeps the plain behaviour: 401 for a wrong password, a session for the right one, no challenge, no mail', async () => {
    const { service, dispatcher, state, flush } = await build();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(service.login({ email: EMAIL, password: 'wrong-password-1' }, CLIENT)).rejects.toMatchObject({
        status: 401,
        response: { code: 'UNAUTHENTICATED' },
      });
    }
    const result = await service.login({ email: EMAIL, password: PASSWORD }, CLIENT);
    await flush();

    expect(result).toMatchObject({ session: { userId: 'user-1' } });
    expect(result).not.toHaveProperty('stepUp');
    expect(dispatcher.send).not.toHaveBeenCalled();
    expect(state.challenges).toHaveLength(0);
    expect(state.attempts.map((row) => row.result)).toEqual(['failed', 'failed', 'success']);
  });
});

describe('AuthService.login once step-up applies', () => {
  it('answers right password, wrong password and unknown email with the same shape and the same scrypt work, mailing only the first', async () => {
    const { service, state, dispatcher, flush } = await build();
    seedFailures(state, EMAIL, 3);
    seedFailures(state, 'ghost@example.com', 3);

    const outcomes: Array<{ result: Awaited<ReturnType<AuthService['login']>>; scrypt: number }> = [];
    for (const input of [
      { email: EMAIL, password: PASSWORD },
      { email: EMAIL, password: 'wrong-password-1' },
      { email: 'ghost@example.com', password: 'wrong-password-1' },
    ]) {
      const before = scryptCalls();
      const result = await service.login(input, CLIENT);
      outcomes.push({ result, scrypt: scryptCalls() - before });
    }
    await flush();

    for (const { result } of outcomes) {
      expect(Object.keys(result)).toEqual(['stepUp']);
      expect(Object.keys(stepUpOf(result))).toEqual(['challengeToken', 'maskedEmail', 'expiresAt', 'resendAvailableAt']);
    }
    expect(outcomes.map((outcome) => outcome.scrypt)).toEqual([2, 2, 2]);
    expect(outcomes.map((outcome) => stepUpOf(outcome.result).maskedEmail)).toEqual([
      'ru***@example.com',
      'ru***@example.com',
      'gh***@example.com',
    ]);
    expect(dispatcher.send).toHaveBeenCalledTimes(1);
    expect(dispatcher.send).toHaveBeenCalledWith('email', EMAIL, expect.stringMatching(/^\d{6}$/), 'login_step_up');
    expect(state.challenges.map((row) => row.userId)).toEqual(['user-1', null, null]);
  });

  it('counts the same email in any case or spacing as one account', async () => {
    const { service, state, flush } = await build();
    for (const email of ['RUNNER@Example.com', ' runner@example.com ', 'Runner@example.COM']) {
      await expect(service.login({ email, password: 'wrong-password-1' }, CLIENT)).rejects.toMatchObject({ status: 401 });
    }

    const result = await service.login({ email: 'runner@EXAMPLE.com', password: PASSWORD }, CLIENT);
    await flush();

    expect(result).toHaveProperty('stepUp');
    expect(new Set(state.attempts.map((row) => row.emailKey)).size).toBe(1);
  });

  it('walks the whole path: three misses, right password, mailed code, session, then plain logins again', async () => {
    const { service, dispatcher, state, flush } = await build();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(service.login({ email: EMAIL, password: 'wrong-password-1' }, CLIENT)).rejects.toMatchObject({ status: 401 });
    }

    const challenged = (await service.login({ email: EMAIL, password: PASSWORD }, CLIENT)) as unknown as { stepUp: { challengeToken: string } };
    await flush();
    const code = dispatcher.send.mock.calls[0][2] as string;

    const session = await service.verifyLoginStepUp({ challengeToken: challenged.stepUp.challengeToken, code }, CLIENT);
    expect(session).toMatchObject({ session: { userId: 'user-1', userEmail: EMAIL } });

    const again = await service.login({ email: EMAIL, password: PASSWORD }, CLIENT);
    expect(again).toMatchObject({ session: { userId: 'user-1' } });
    expect(state.attempts.map((row) => row.result)).toEqual(['failed', 'failed', 'failed', 'step_up_issued', 'success', 'success']);
  });

  it('refuses the session after a correct code when the account cannot sign in', async () => {
    const { service, state, dispatcher, flush } = await build({ accountStatus: 'suspended' });
    seedFailures(state, EMAIL, 3);

    const challenged = (await service.login({ email: EMAIL, password: PASSWORD }, CLIENT)) as unknown as { stepUp: { challengeToken: string } };
    await flush();
    const code = dispatcher.send.mock.calls[0][2] as string;

    await expect(
      service.verifyLoginStepUp({ challengeToken: challenged.stepUp.challengeToken, code }, CLIENT),
    ).rejects.toMatchObject({ status: 403, response: { code: 'PERMISSION_DENIED' } });
    expect(state.attempts.some((row) => row.result === 'success')).toBe(false);
  });
});

describe('AuthService.login during a spray attack', () => {
  it('turns a failed login into a detection, and the next fresh account must step up for 30 minutes', async () => {
    const { service, state, dispatcher, flush } = await build();
    for (let index = 0; index < 29; index += 1) {
      state.attempts.push({
        id: `spray-${index}`,
        emailKey: `spray-email-${index % 10}`,
        ipKey: `spray-ip-${index % 3}`,
        result: 'failed',
        createdAt: new Date(Date.now() - 60_000),
      });
    }

    await expect(service.login({ email: 'victim@example.com', password: 'wrong-password-1' }, CLIENT)).rejects.toMatchObject({ status: 401 });
    await flush();
    expect(state.anomalies).toHaveLength(1);
    expect(state.outbox).toHaveLength(1);

    const during = await service.login({ email: EMAIL, password: PASSWORD }, CLIENT);
    await flush();
    expect(during).toHaveProperty('stepUp');
    expect(dispatcher.send).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date(T0.getTime() + 31 * 60_000));
    const after = await service.login({ email: EMAIL, password: PASSWORD }, CLIENT);
    expect(after).toMatchObject({ session: { userId: 'user-1' } });
  });
});

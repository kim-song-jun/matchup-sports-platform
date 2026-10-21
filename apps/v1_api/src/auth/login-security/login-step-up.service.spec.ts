import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { createLoginSecurityFakePrisma } from '../../../test/helpers/login-security-fake-prisma';
import { hashPassword } from '../password-hash';
import { LoginStepUpService } from './login-step-up.service';

const T0 = new Date('2026-10-21T12:00:00.000Z');
const EMAIL = 'runner@example.com';
const USER_ID = 'user-1';

function setup(options: { devEcho?: boolean; deliverable?: boolean } = {}) {
  const { prisma, state } = createLoginSecurityFakePrisma();
  state.identities.push({ id: 'identity-1', userId: USER_ID, provider: 'email', providerUserKey: EMAIL });
  const dispatcher = {
    send: jest.fn().mockResolvedValue(undefined),
    devEchoActive: options.devEcho ?? false,
    emailDeliverable: options.deliverable ?? true,
  };
  const service = new LoginStepUpService(prisma as never, dispatcher as never);
  return { prisma, state, dispatcher, service };
}

function advance(ms: number) {
  jest.setSystemTime(new Date(Date.now() + ms));
}

/** The mailed code, taken from what the dispatcher was asked to send. */
function lastMailedCode(dispatcher: { send: jest.Mock }): string {
  const calls = dispatcher.send.mock.calls;
  return calls[calls.length - 1][2] as string;
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const body = (error as { getResponse?: () => unknown }).getResponse?.() as { code?: string; details?: unknown } | undefined;
    return { status: (error as { getStatus?: () => number }).getStatus?.(), code: body?.code, details: body?.details, error };
  }
  throw new Error('expected the call to reject');
}

beforeEach(() => {
  jest.useFakeTimers({
    now: T0,
    doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'clearImmediate', 'queueMicrotask', 'performance', 'hrtime'],
  });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('LoginStepUpService.start', () => {
  it('mails a code only for a deliverable challenge and stores token and code as hashes', async () => {
    const { service, state, dispatcher } = setup();
    const view = await service.start({ email: EMAIL, emailKey: 'key-a', userId: USER_ID });
    await service.onApplicationShutdown();

    expect(dispatcher.send).toHaveBeenCalledTimes(1);
    expect(dispatcher.send).toHaveBeenCalledWith('email', EMAIL, expect.stringMatching(/^\d{6}$/), 'login_step_up');
    expect(view).toEqual({
      challengeToken: expect.any(String),
      maskedEmail: 'ru***@example.com',
      expiresAt: '2026-10-21T12:05:00.000Z',
      resendAvailableAt: '2026-10-21T12:00:30.000Z',
    });
    const [row] = state.challenges;
    expect(row.tokenHash).not.toBe(view.challengeToken);
    expect(row.codeHash).toMatch(/^scrypt:/);
    expect(row).toMatchObject({ userId: USER_ID, emailKey: 'key-a', sentCount: 1 });
  });

  it('answers a decoy with the same fields and sends nothing', async () => {
    const real = setup();
    const realView = await real.service.start({ email: EMAIL, emailKey: 'key-a', userId: USER_ID });
    await real.service.onApplicationShutdown();

    const decoy = setup();
    const decoyView = await decoy.service.start({ email: 'ghost@example.com', emailKey: 'key-ghost', userId: null });
    await decoy.service.onApplicationShutdown();

    expect(Object.keys(decoyView)).toEqual(Object.keys(realView));
    expect(decoyView.expiresAt).toBe(realView.expiresAt);
    expect(decoyView.resendAvailableAt).toBe(realView.resendAvailableAt);
    expect(decoyView.maskedEmail).toBe('gh***@example.com');
    expect(decoy.dispatcher.send).not.toHaveBeenCalled();
    expect(decoy.state.challenges[0]).toMatchObject({ userId: null, sentCount: 1 });
  });

  it('in an echo environment carries a six-digit devCode on a decoy as well, and the decoy code never verifies', async () => {
    const { service, dispatcher } = setup({ devEcho: true });
    const real = await service.start({ email: EMAIL, emailKey: 'key-a', userId: USER_ID });
    const decoy = await service.start({ email: 'ghost@example.com', emailKey: 'key-ghost', userId: null });
    await service.onApplicationShutdown();

    expect(real.devCode).toBe(lastMailedCode(dispatcher));
    expect(decoy.devCode).toMatch(/^\d{6}$/);
    expect(Object.keys(decoy)).toEqual(Object.keys(real));
    expect(await rejection(service.verify(decoy.challengeToken, decoy.devCode as string))).toMatchObject({
      status: 400,
      code: 'STEP_UP_CODE_INVALID',
    });
  });

  it('sends no devCode to anyone when echo is off', async () => {
    const { service } = setup({ devEcho: false });
    const real = await service.start({ email: EMAIL, emailKey: 'key-a', userId: USER_ID });
    const decoy = await service.start({ email: 'ghost@example.com', emailKey: 'key-ghost', userId: null });
    await service.onApplicationShutdown();

    expect(real).not.toHaveProperty('devCode');
    expect(decoy).not.toHaveProperty('devCode');
  });
});

describe('LoginStepUpService.verify', () => {
  it('logs in once with the mailed code and rejects reuse', async () => {
    const { service, dispatcher } = setup();
    const { challengeToken } = await service.start({ email: EMAIL, emailKey: 'key-a', userId: USER_ID });
    await service.onApplicationShutdown();
    const code = lastMailedCode(dispatcher);

    await expect(service.verify(challengeToken, code)).resolves.toEqual({ userId: USER_ID, emailKey: 'key-a' });
    expect(await rejection(service.verify(challengeToken, code))).toMatchObject({ status: 410, code: 'STEP_UP_EXPIRED' });
  });

  it('answers 400 for four wrong codes and 429 on the fifth, after which even the right code is refused', async () => {
    const { service, dispatcher } = setup();
    const { challengeToken } = await service.start({ email: EMAIL, emailKey: 'key-a', userId: USER_ID });
    await service.onApplicationShutdown();
    const code = lastMailedCode(dispatcher);
    const wrong = code === '000000' ? '111111' : '000000';

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      expect(await rejection(service.verify(challengeToken, wrong))).toMatchObject({ status: 400, code: 'STEP_UP_CODE_INVALID' });
    }
    expect(await rejection(service.verify(challengeToken, wrong))).toMatchObject({ status: 429, code: 'STEP_UP_TOO_MANY_ATTEMPTS' });
    expect(await rejection(service.verify(challengeToken, code))).toMatchObject({ status: 429, code: 'STEP_UP_TOO_MANY_ATTEMPTS' });
  });

  it('still accepts the right code on the fifth attempt', async () => {
    const { service, dispatcher } = setup();
    const { challengeToken } = await service.start({ email: EMAIL, emailKey: 'key-a', userId: USER_ID });
    await service.onApplicationShutdown();
    const code = lastMailedCode(dispatcher);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let attempt = 1; attempt <= 4; attempt += 1) await rejection(service.verify(challengeToken, wrong));

    await expect(service.verify(challengeToken, code)).resolves.toMatchObject({ userId: USER_ID });
  });

  it('treats a decoy exactly like a deliverable challenge with wrong codes, and it can never verify', async () => {
    const { service, state } = setup();
    const { challengeToken } = await service.start({ email: 'ghost@example.com', emailKey: 'key-ghost', userId: null });
    // Even a guess that matches the stored hash must not log anyone in.
    state.challenges[0].codeHash = await hashPassword('123456');

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      expect(await rejection(service.verify(challengeToken, '123456'))).toMatchObject({ status: 400, code: 'STEP_UP_CODE_INVALID' });
    }
    expect(await rejection(service.verify(challengeToken, '999999'))).toMatchObject({ status: 400, code: 'STEP_UP_CODE_INVALID' });
    expect(await rejection(service.verify(challengeToken, '123456'))).toMatchObject({ status: 429, code: 'STEP_UP_TOO_MANY_ATTEMPTS' });
  });

  it('gives 410 for an unknown token, an expired code, and a challenge past its 30-minute life', async () => {
    const { service, dispatcher } = setup();
    expect(await rejection(service.verify('x'.repeat(43), '123456'))).toMatchObject({ status: 410, code: 'STEP_UP_EXPIRED' });

    const { challengeToken } = await service.start({ email: EMAIL, emailKey: 'key-a', userId: USER_ID });
    await service.onApplicationShutdown();
    const code = lastMailedCode(dispatcher);
    advance(5 * 60_000 + 1_000);
    expect(await rejection(service.verify(challengeToken, code))).toMatchObject({ status: 410, code: 'STEP_UP_EXPIRED' });
  });
});

describe('LoginStepUpService.resend', () => {
  it('refuses inside the 30-second cooldown, then replaces the code and resets attempts', async () => {
    const { service, dispatcher } = setup();
    const { challengeToken } = await service.start({ email: EMAIL, emailKey: 'key-a', userId: USER_ID });
    await service.onApplicationShutdown();
    const firstCode = lastMailedCode(dispatcher);

    advance(29_000);
    const early = await rejection(service.resend(challengeToken));
    expect(early).toMatchObject({ status: 429, code: 'STEP_UP_RESEND_COOLDOWN', details: { retryAfterSeconds: 1 } });
    expect(dispatcher.send).toHaveBeenCalledTimes(1);

    advance(2_000);
    const resent = await service.resend(challengeToken);
    await service.onApplicationShutdown();
    expect(resent).toEqual({ expiresAt: '2026-10-21T12:05:31.000Z', resendAvailableAt: '2026-10-21T12:01:01.000Z' });
    expect(dispatcher.send).toHaveBeenCalledTimes(2);
    const secondCode = lastMailedCode(dispatcher);

    if (secondCode !== firstCode) {
      expect(await rejection(service.verify(challengeToken, firstCode))).toMatchObject({ code: 'STEP_UP_CODE_INVALID' });
    }
    await expect(service.verify(challengeToken, secondCode)).resolves.toMatchObject({ userId: USER_ID });
  });

  it('in an echo environment a decoy resend carries a devCode like a real one', async () => {
    const { service } = setup({ devEcho: true });
    const real = await service.start({ email: EMAIL, emailKey: 'key-a', userId: USER_ID });
    const decoy = await service.start({ email: 'ghost@example.com', emailKey: 'key-ghost', userId: null });
    advance(31_000);

    const realResend = await service.resend(real.challengeToken);
    const decoyResend = await service.resend(decoy.challengeToken);
    await service.onApplicationShutdown();

    expect(Object.keys(decoyResend)).toEqual(Object.keys(realResend));
    expect(decoyResend.devCode).toMatch(/^\d{6}$/);
  });

  it('answers a decoy with the same 200 body shape and mails nothing', async () => {
    const { service, dispatcher } = setup();
    const { challengeToken } = await service.start({ email: 'ghost@example.com', emailKey: 'key-ghost', userId: null });
    advance(31_000);

    const resent = await service.resend(challengeToken);
    await service.onApplicationShutdown();

    expect(Object.keys(resent)).toEqual(['expiresAt', 'resendAvailableAt']);
    expect(dispatcher.send).not.toHaveBeenCalled();
    advance(5_000);
    expect(await rejection(service.resend(challengeToken))).toMatchObject({ status: 429, code: 'STEP_UP_RESEND_COOLDOWN' });
  });

  it('allows a resend after the code expired but refuses once the challenge is 30 minutes old', async () => {
    const { service } = setup();
    const { challengeToken } = await service.start({ email: EMAIL, emailKey: 'key-a', userId: USER_ID });
    advance(10 * 60_000);
    await expect(service.resend(challengeToken)).resolves.toHaveProperty('expiresAt');

    advance(21 * 60_000);
    expect(await rejection(service.resend(challengeToken))).toMatchObject({ status: 410, code: 'STEP_UP_EXPIRED' });
  });

  it('caps real mails at 5 per email per 24 hours across logins and resends, then releases the cap', async () => {
    const { service, dispatcher } = setup();
    const { challengeToken } = await service.start({ email: EMAIL, emailKey: 'key-a', userId: USER_ID });
    for (let resend = 1; resend <= 4; resend += 1) {
      advance(31_000);
      await service.resend(challengeToken);
    }
    await service.onApplicationShutdown();
    expect(dispatcher.send).toHaveBeenCalledTimes(5);

    advance(31_000);
    expect(await rejection(service.resend(challengeToken))).toMatchObject({ status: 429, code: 'STEP_UP_SEND_LIMIT' });
    expect(await rejection(service.start({ email: EMAIL, emailKey: 'key-a', userId: USER_ID }))).toMatchObject({
      status: 429,
      code: 'STEP_UP_SEND_LIMIT',
    });
    expect(dispatcher.send).toHaveBeenCalledTimes(5);

    advance(24 * 60 * 60_000);
    await expect(service.start({ email: EMAIL, emailKey: 'key-a', userId: USER_ID })).resolves.toHaveProperty('challengeToken');
  });

  it('counts decoys toward the same cap, so reaching it says nothing about whether the password was right', async () => {
    const wrongPassword = setup();
    const rightPassword = setup();
    for (let index = 0; index < 5; index += 1) {
      await wrongPassword.service.start({ email: EMAIL, emailKey: 'key-a', userId: null });
      await rightPassword.service.start({ email: EMAIL, emailKey: 'key-a', userId: USER_ID });
    }
    await rightPassword.service.onApplicationShutdown();

    const decoySixth = await rejection(wrongPassword.service.start({ email: EMAIL, emailKey: 'key-a', userId: null }));
    const realSixth = await rejection(rightPassword.service.start({ email: EMAIL, emailKey: 'key-a', userId: USER_ID }));
    expect(decoySixth).toMatchObject({ status: 429, code: 'STEP_UP_SEND_LIMIT' });
    expect(realSixth).toMatchObject({ status: decoySixth.status, code: decoySixth.code, details: decoySixth.details });
  });

  it('answers a failed delivery exactly like a sent one: logged and stamped, and resend still waits the cooldown', async () => {
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { service, dispatcher, state } = setup();
    dispatcher.send.mockRejectedValue(new ServiceUnavailableException({ code: 'EMAIL_SEND_FAILED' }));
    const view = await service.start({ email: EMAIL, emailKey: 'key-a', userId: USER_ID });
    await service.onApplicationShutdown();
    expect(Object.keys(view).sort()).toEqual(['challengeToken', 'expiresAt', 'maskedEmail', 'resendAvailableAt']);
    expect(state.challenges[0].sendFailedAt).toEqual(T0);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('login step-up mail failed'));

    expect(await rejection(service.resend(view.challengeToken))).toMatchObject({ status: 429, code: 'STEP_UP_RESEND_COOLDOWN' });
    advance(31_000);
    await expect(service.resend(view.challengeToken)).resolves.toHaveProperty('expiresAt');
    await service.onApplicationShutdown();
  });

  it('refuses every caller with the same 503 when no mail transport (and no echo) is available, storing nothing', async () => {
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { service, dispatcher, state } = setup({ deliverable: false });
    const real = await rejection(service.start({ email: EMAIL, emailKey: 'key-a', userId: USER_ID }));
    const decoy = await rejection(service.start({ email: 'ghost@example.com', emailKey: 'key-ghost', userId: null }));
    expect(real).toMatchObject({ status: 503, code: 'STEP_UP_UNAVAILABLE' });
    expect(decoy).toMatchObject({ status: real.status, code: real.code });
    expect(state.challenges).toHaveLength(0);
    expect(dispatcher.send).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('email delivery is not configured'));
  });
});

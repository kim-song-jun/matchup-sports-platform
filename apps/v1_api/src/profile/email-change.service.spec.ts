/**
 * Proving a new account email, through the real VerificationService and EmailChangeService over an in-memory token table
 * and real scrypt. Only the mail transport and the user lookups are stand-ins.
 */
import { ServiceUnavailableException } from '@nestjs/common';
import { RECENT_LOGIN_MAX_AGE_SECONDS } from '../auth/link-caller-guards';
import type { V1AuthUser } from '../auth/v1-auth-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { SmsEventLogService } from '../verification/sms-event-log.service';
import type { VerificationDispatcherService } from '../verification/verification-dispatcher.service';
import { VerificationService } from '../verification/verification.service';
import { EMAIL_CHANGE_TOKEN_TTL_SECONDS, readEmailChangeToken } from './email-change-token';
import { EmailChangeService } from './email-change.service';
import { readEmailLinkToken } from '../auth/email-link-token';

const savedSessionSecret = process.env.V1_SESSION_SECRET;
beforeAll(() => {
  process.env.V1_SESSION_SECRET = 'x'.repeat(48);
});
afterAll(() => {
  if (savedSessionSecret === undefined) delete process.env.V1_SESSION_SECRET;
  else process.env.V1_SESSION_SECRET = savedSessionSecret;
});

type Row = Record<string, any>;

const CALLER = 'user-caller';
const NEW_EMAIL = 'new@example.com';
const FRESH = 60;
const STALE = RECENT_LOGIN_MAX_AGE_SECONDS + 1;

const caller = (overrides: Partial<V1AuthUser> = {}): V1AuthUser => ({
  id: CALLER,
  email: 'old@example.com',
  accountStatus: 'active',
  onboardingStatus: 'completed',
  ...overrides,
});

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];
    if (condition !== null && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('gt' in condition) return value > condition.gt;
      if ('gte' in condition) return value >= condition.gte;
      if ('lt' in condition) return value < condition.lt;
      throw new Error(`unsupported condition on ${key}`);
    }
    return value === condition;
  });
}

function harness(seed: { users: Row[]; identities?: Row[] }) {
  const users = seed.users;
  const identities = seed.identities ?? [];
  const tokens: Row[] = [];
  const mails: { target: string; code: string; emailPurpose: string }[] = [];
  let nextId = 1;

  const identitiesOf = (userId: string) => identities.filter((identity) => identity.userId === userId && identity.status === 'active');
  const prisma = {
    v1User: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const row = users.find((candidate) => candidate.id === where.id);
        return row ? { ...row, authIdentities: identitiesOf(row.id) } : null;
      }),
      // assertEmailFree: another account holding the address as its email or as its email login key.
      findFirst: jest.fn(async ({ where }: { where: { id: { not: string }; OR: Row[] } }) => {
        const holder = users.find(
          (row) =>
            row.id !== where.id.not &&
            where.OR.some((alternative) =>
              'email' in alternative
                ? row.email === alternative.email
                : identities.some(
                    (identity) =>
                      identity.userId === row.id &&
                      identity.provider === alternative.authIdentities.some.provider &&
                      identity.providerUserKey === alternative.authIdentities.some.providerUserKey,
                  ),
            ),
        );
        return holder ? { id: holder.id } : null;
      }),
    },
    v1VerificationToken: {
      findFirst: jest.fn(async ({ where }: { where: Row }) =>
        [...tokens].reverse().find((row) => matches(row, where)) ?? null,
      ),
      count: jest.fn(async ({ where }: { where: Row }) => tokens.filter((row) => matches(row, where)).length),
      create: jest.fn(async ({ data }: { data: Row }) => {
        const row = { id: `token-${nextId++}`, consumedAt: null, attemptCount: 0, createdAt: new Date(), ...data };
        tokens.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const row = tokens.find((candidate) => matches(candidate, where));
        if (!row) throw new Error('no row');
        row.attemptCount += data.attemptCount.increment;
        return { attemptCount: row.attemptCount };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const hit = tokens.filter((row) => matches(row, where));
        for (const row of hit) Object.assign(row, data);
        return { count: hit.length };
      }),
      deleteMany: jest.fn(async ({ where }: { where: Row }) => {
        const hit = tokens.filter((row) => matches(row, where));
        for (const row of hit) tokens.splice(tokens.indexOf(row), 1);
        return { count: hit.length };
      }),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prisma));
  const dispatcher = {
    emailDeliverable: true,
    assertDeliveryAvailable: jest.fn(() => {
      if (!dispatcher.emailDeliverable) throw new ServiceUnavailableException({ code: 'EMAIL_SEND_UNAVAILABLE', message: '지금은 인증 메일을 보낼 수 없어요.' });
    }),
    send: jest.fn(async (_channel: string, target: string, code: string, emailPurpose: string) => {
      mails.push({ target, code, emailPurpose });
    }),
    mayEchoCode: jest.fn().mockResolvedValue(false),
  };
  const smsEventLog = { record: jest.fn().mockResolvedValue(undefined) };

  const verification = new VerificationService(
    prisma as unknown as PrismaService,
    dispatcher as unknown as VerificationDispatcherService,
    smsEventLog as unknown as SmsEventLogService,
  );
  const service = new EmailChangeService(prisma as unknown as PrismaService, verification);
  const lastCode = () => {
    const mail = mails.at(-1);
    if (!mail) throw new Error('no mail was sent');
    return mail.code;
  };
  return { service, verification, tokens, mails, dispatcher, lastCode };
}

const passwordAccount = (overrides: Row = {}) => ({
  users: [{ id: CALLER, email: 'old@example.com', ...overrides }, { id: 'user-other', email: 'taken@example.com' }],
  identities: [
    { userId: CALLER, provider: 'email', providerUserKey: 'old@example.com', passwordHash: 'hash', status: 'active' },
    { userId: 'user-other', provider: 'email', providerUserKey: 'login-key@example.com', passwordHash: 'hash', status: 'active' },
  ],
});
const socialAccount = (overrides: Row = {}) => ({
  users: [{ id: CALLER, email: null, ...overrides }, { id: 'user-other', email: 'taken@example.com' }],
  identities: [{ userId: CALLER, provider: 'kakao', providerUserKey: 'kakao-1', passwordHash: null, status: 'active' }],
});

describe('EmailChangeService', () => {
  it('mails a code to the new address, and the code buys a token for that address and this account only', async () => {
    const { service, mails, lastCode } = harness(passwordAccount());

    const requested = await service.requestCode(caller(), { email: 'New@Example.com' }, FRESH);
    const verified = await service.verifyCode(CALLER, { code: lastCode() });

    expect(requested).toMatchObject({ sent: true, maskedTarget: 'ne***@example.com', expiresInSeconds: 300, resendAvailableInSeconds: 30 });
    expect(mails).toEqual([{ target: NEW_EMAIL, code: expect.stringMatching(/^\d{6}$/), emailPurpose: 'email_change' }]);
    expect(verified.expiresInSeconds).toBe(EMAIL_CHANGE_TOKEN_TTL_SECONDS);
    expect(readEmailChangeToken(verified.emailChangeToken, CALLER)).toBe(NEW_EMAIL);
    expect(readEmailChangeToken(verified.emailChangeToken, 'user-other')).toBeNull();
    // It is not the proof that adds an email login.
    expect(readEmailLinkToken(verified.emailChangeToken, CALLER)).toBeNull();
  });

  it('spends the code: a second verify with the same code gets no token', async () => {
    const { service, lastCode } = harness(passwordAccount());
    await service.requestCode(caller(), { email: NEW_EMAIL }, FRESH);
    const code = lastCode();
    await service.verifyCode(CALLER, { code });

    await expect(service.verifyCode(CALLER, { code })).rejects.toMatchObject({ response: { code: 'VERIFICATION_NO_PENDING' } });
  });

  it('refuses a wrong code', async () => {
    const { service, lastCode } = harness(passwordAccount());
    await service.requestCode(caller(), { email: NEW_EMAIL }, FRESH);
    const wrong = lastCode() === '000000' ? '000001' : '000000';

    await expect(service.verifyCode(CALLER, { code: wrong })).rejects.toMatchObject({ response: { code: 'VERIFICATION_CODE_MISMATCH' } });
  });

  describe('codes are bound to their purpose', () => {
    it('a code mailed to verify the account contact cannot mint an email change token', async () => {
      const { service, verification, mails } = harness({
        users: [{ id: CALLER, email: 'old@example.com', emailVerifiedAt: null }],
        identities: [],
      });
      await verification.requestEmail(caller());
      expect(mails).toEqual([{ target: 'old@example.com', code: expect.any(String), emailPurpose: 'verify' }]);

      await expect(service.verifyCode(CALLER, { code: mails[0].code })).rejects.toMatchObject({
        response: { code: 'VERIFICATION_NO_PENDING' },
      });
    });

    it('a code mailed to add an email login cannot mint an email change token, nor the other way round', async () => {
      const { service, verification, mails } = harness(socialAccount());
      await verification.requestEmailLinkCode(CALLER, NEW_EMAIL);

      await expect(service.verifyCode(CALLER, { code: mails[0].code })).rejects.toMatchObject({
        response: { code: 'VERIFICATION_NO_PENDING' },
      });

      await service.requestCode(caller({ email: null }), { email: 'other-new@example.com' }, FRESH);
      await expect(verification.consumeEmailLinkCode(CALLER, mails[1].code)).rejects.toMatchObject({
        response: { code: 'VERIFICATION_CODE_MISMATCH' },
      });
    });

    it('asking for an email change code does not retire the contact verification code', async () => {
      const { service, verification, tokens } = harness({
        users: [{ id: CALLER, email: 'old@example.com', emailVerifiedAt: null }],
        identities: [],
      });
      await verification.requestEmail(caller());
      await service.requestCode(caller(), { email: NEW_EMAIL }, FRESH);

      const open = tokens.filter((row) => row.consumedAt === null).map((row) => row.purpose);

      expect(open.sort()).toEqual(['contact', 'email_change']);
    });
  });

  describe('request is refused before anything is mailed', () => {
    it.each([
      ['an address another account holds as its email', 'taken@example.com'],
      ['an address another account holds as its email login key', 'login-key@example.com'],
    ])('%s', async (_name, email) => {
      const { service, mails, tokens } = harness(passwordAccount());

      await expect(service.requestCode(caller(), { email }, FRESH)).rejects.toMatchObject({
        response: { code: 'EMAIL_CONFLICT' },
        status: 409,
      });
      expect([mails.length, tokens.length]).toEqual([0, 0]);
    });

    it('the address the account already has, however it is written', async () => {
      const { service, mails } = harness(passwordAccount());

      await expect(service.requestCode(caller(), { email: 'OLD@example.com' }, FRESH)).rejects.toMatchObject({
        response: { code: 'EMAIL_UNCHANGED' },
        status: 400,
      });
      expect(mails).toEqual([]);
    });

    it('the address the account has stored in another letter case', async () => {
      const { service, mails } = harness(passwordAccount({ email: 'Old@Example.com' }));

      await expect(service.requestCode(caller(), { email: 'old@example.com' }, FRESH)).rejects.toMatchObject({
        response: { code: 'EMAIL_UNCHANGED' },
      });
      expect(mails).toEqual([]);
    });

    it('an inactive account', async () => {
      const { service, mails } = harness(passwordAccount());

      await expect(service.requestCode(caller({ accountStatus: 'suspended' }), { email: NEW_EMAIL }, FRESH)).rejects.toMatchObject({
        response: { code: 'PERMISSION_DENIED' },
      });
      expect(mails).toEqual([]);
    });

    it('when the mail cannot be sent at all', async () => {
      const { service, dispatcher, tokens } = harness(passwordAccount());
      dispatcher.emailDeliverable = false;

      await expect(service.requestCode(caller(), { email: NEW_EMAIL }, FRESH)).rejects.toMatchObject({
        response: { code: 'EMAIL_SEND_UNAVAILABLE' },
        status: 503,
      });
      expect(tokens).toEqual([]);
    });

    it('a second request inside the resend cooldown', async () => {
      const { service, mails } = harness(passwordAccount());
      await service.requestCode(caller(), { email: NEW_EMAIL }, FRESH);

      await expect(service.requestCode(caller(), { email: NEW_EMAIL }, FRESH)).rejects.toMatchObject({
        response: { code: 'VERIFICATION_RESEND_COOLDOWN' },
      });
      expect(mails).toHaveLength(1);
    });
  });

  describe('every account needs a recent sign-in, so a stolen old session cannot point the account at the thief\'s mailbox', () => {
    it.each([
      ['a password account', () => passwordAccount(), caller()],
      ['a social account', () => socialAccount(), caller({ email: null })],
    ])('refuses %s on a session older than the limit, before the address is looked at or mailed', async (_name, seed, user) => {
      const { service, mails, tokens } = harness(seed());

      await expect(service.requestCode(user, { email: 'taken@example.com' }, STALE)).rejects.toMatchObject({
        response: {
          code: 'RECENT_LOGIN_REQUIRED',
          message: '이메일을 바꾸려면 다시 로그인해 주세요.',
          details: { maxAgeSeconds: RECENT_LOGIN_MAX_AGE_SECONDS },
        },
        status: 403,
      });
      expect([mails, tokens]).toEqual([[], []]);
    });

    it('refuses a request that carries no cookie session in production, and takes it elsewhere', async () => {
      const savedEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        await expect(harness(socialAccount()).service.requestCode(caller({ email: null }), { email: NEW_EMAIL }, null)).rejects.toMatchObject({
          response: { code: 'RECENT_LOGIN_REQUIRED' },
        });
        process.env.NODE_ENV = 'test';
        await expect(harness(socialAccount()).service.requestCode(caller({ email: null }), { email: NEW_EMAIL }, null)).resolves.toMatchObject({ sent: true });
      } finally {
        process.env.NODE_ENV = savedEnv;
      }
    });

    it('takes a session right at the limit', async () => {
      const { service } = harness(passwordAccount());

      await expect(service.requestCode(caller(), { email: NEW_EMAIL }, RECENT_LOGIN_MAX_AGE_SECONDS)).resolves.toMatchObject({ sent: true });
    });

    it('takes a fresh session for a social account', async () => {
      const { service } = harness(socialAccount());

      await expect(service.requestCode(caller({ email: null }), { email: NEW_EMAIL }, FRESH)).resolves.toMatchObject({ sent: true });
    });
  });
});

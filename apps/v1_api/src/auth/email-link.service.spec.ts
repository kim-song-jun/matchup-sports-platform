/**
 * Adding an email login to a social account, end to end through the real VerificationService, EmailLinkService,
 * AuthService.login and AccountRecoveryService over an in-memory database and real scrypt. Only the mail transport and
 * the collaborators unrelated to these routes are stand-ins.
 */
import { Prisma } from '@prisma/client';
import { issuePhoneProofToken } from '../verification/phone-proof-token';
import { issueEmailProofToken } from '../verification/email-proof-token';
import { VerificationService } from '../verification/verification.service';
import { AccountRecoveryService } from './account-recovery.service';
import { AuthService } from './auth.service';
import { issueEmailLinkToken } from './email-link-token';
import { EmailLinkService } from './email-link.service';
import { RECENT_LOGIN_MAX_AGE_SECONDS } from './link-caller-guards';
import { hashPassword, verifyPassword } from './password-hash';

const savedSessionSecret = process.env.V1_SESSION_SECRET;
beforeAll(() => {
  process.env.V1_SESSION_SECRET = 'x'.repeat(48);
});
afterAll(() => {
  if (savedSessionSecret === undefined) delete process.env.V1_SESSION_SECRET;
  else process.env.V1_SESSION_SECRET = savedSessionSecret;
});

type Row = Record<string, any>;

const CALLER = 'user-kakao';
const OTHER = 'user-other';
const PHONE = '01055550001';
const NEW_EMAIL = 'runner@example.com';
const NEW_PASSWORD = 'Brand-new-pass-1';
const AGE = 60;

const user = (id: string, overrides: Row = {}): Row => ({
  id,
  email: null,
  phone: null,
  accountStatus: 'active',
  onboardingStatus: 'completed',
  deletedAt: null,
  emailVerifiedAt: null,
  phoneVerifiedAt: null,
  sessionEpoch: 0,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  adminUser: null,
  ...overrides,
});
const identity = (id: string, userId: string, provider: string, key: string, overrides: Row = {}): Row => ({
  id,
  userId,
  provider,
  providerUserKey: key,
  email: null,
  passwordHash: null,
  status: 'active',
  lastLoginAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const uniqueViolation = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
const notFound = () => new Prisma.PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: 'test' });

/** Just enough of the tables these flows touch: real rows, the unique indexes, rollback of a failed transaction. */
function createDatabase(seed: { users: Row[]; identities: Row[] }) {
  const state = { users: seed.users, identities: seed.identities, tokens: [] as Row[], logs: [] as Row[] };
  let nextId = 1;
  let queue: Promise<void> = Promise.resolve();

  const matches = (row: Row, where: Row): boolean =>
    Object.entries(where).every(([key, condition]) => {
      if (key === 'OR') return (condition as Row[]).some((alternative) => matches(row, alternative));
      if (key === 'authIdentities') return state.identities.some((held) => held.userId === row.id && matches(held, condition.some));
      const value = row[key];
      if (condition !== null && typeof condition === 'object' && !(condition instanceof Date)) {
        if ('not' in condition) return value !== condition.not;
        if ('in' in condition) return condition.in.includes(value);
        if ('gt' in condition) return value > condition.gt;
        if ('gte' in condition) return value >= condition.gte;
        if ('lt' in condition) return value < condition.lt;
        throw new Error(`condition not modelled: ${JSON.stringify(condition)}`);
      }
      return value === condition;
    });
  const apply = (row: Row, data: Row) => {
    for (const [key, value] of Object.entries(data)) {
      row[key] = value !== null && typeof value === 'object' && 'increment' in value ? row[key] + value.increment : value;
    }
  };
  const withRelations = (row: Row, select?: Row) => ({
    ...row,
    authIdentities: state.identities.filter(
      (held) => held.userId === row.id && (select?.authIdentities?.where ? matches(held, select.authIdentities.where) : true),
    ),
  });
  const assertEmailUnique = (userId: string, email: unknown) => {
    if (email && state.users.some((other) => other.id !== userId && other.email === email)) throw uniqueViolation();
  };

  const prisma: Row = {
    v1User: {
      findUnique: jest.fn(async ({ where, select }: Row) => {
        const found = state.users.find((row) => row.id === where.id);
        return found ? withRelations(found, select) : null;
      }),
      findFirst: jest.fn(async ({ where, select }: Row) => {
        const found = state.users.find((row) => matches(row, where));
        return found ? withRelations(found, select) : null;
      }),
      update: jest.fn(async ({ where, data }: Row) => {
        const found = state.users.find((row) => row.id === where.id);
        if (!found) throw notFound();
        assertEmailUnique(found.id, data.email);
        apply(found, data);
        return found;
      }),
    },
    v1AuthIdentity: {
      findUnique: jest.fn(async ({ where }: Row) => {
        const key = where.provider_providerUserKey;
        const found = state.identities.find((row) => row.provider === key.provider && row.providerUserKey === key.providerUserKey);
        return found ? { ...found, user: state.users.find((row) => row.id === found.userId) } : null;
      }),
      create: jest.fn(async ({ data }: Row) => {
        if (state.identities.some((row) => row.provider === data.provider && row.providerUserKey === data.providerUserKey)) throw uniqueViolation();
        const created = identity(`identity-${nextId++}`, data.userId, data.provider, data.providerUserKey, data);
        state.identities.push(created);
        return { id: created.id };
      }),
      update: jest.fn(async ({ where, data }: Row) => {
        const found = state.identities.find((row) => row.id === where.id);
        if (!found) throw notFound();
        apply(found, data);
        return found;
      }),
      updateMany: jest.fn(async ({ where, data }: Row) => {
        const rows = state.identities.filter((row) => matches(row, where));
        rows.forEach((row) => apply(row, data));
        return { count: rows.length };
      }),
    },
    v1VerificationToken: {
      create: jest.fn(async ({ data }: Row) => {
        const created = { id: `token-${nextId++}`, consumedAt: null, attemptCount: 0, createdAt: new Date(), ...data };
        state.tokens.push(created);
        return created;
      }),
      findFirst: jest.fn(async ({ where }: Row) => {
        const rows = state.tokens.filter((row) => matches(row, where));
        return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
      }),
      update: jest.fn(async ({ where, data }: Row) => {
        const found = state.tokens.find((row) => matches(row, where));
        if (!found) throw notFound();
        apply(found, data);
        return found;
      }),
      updateMany: jest.fn(async ({ where, data }: Row) => {
        const rows = state.tokens.filter((row) => matches(row, where));
        rows.forEach((row) => apply(row, data));
        return { count: rows.length };
      }),
      count: jest.fn(async ({ where }: Row) => state.tokens.filter((row) => matches(row, where)).length),
      deleteMany: jest.fn(async ({ where }: Row) => {
        const doomed = state.tokens.filter((row) => matches(row, where));
        state.tokens = state.tokens.filter((row) => !doomed.includes(row));
        return { count: doomed.length };
      }),
    },
    v1StatusChangeLog: {
      create: jest.fn(async ({ data }: Row) => {
        state.logs.push(data);
        return data;
      }),
    },
    $executeRaw: jest.fn(async () => 1),
    $queryRaw: jest.fn(async () => []),
    // One transaction at a time, standing in for the advisory locks; one that throws leaves the tables as it found them.
    $transaction: jest.fn(async (work: ((tx: Row) => Promise<unknown>) | Promise<unknown>[]) => {
      if (Array.isArray(work)) return Promise.all(work);
      const turn = queue.then(async () => {
        const before = structuredClone({ users: state.users, identities: state.identities, tokens: state.tokens, logs: state.logs });
        try {
          return await work(prisma);
        } catch (error) {
          Object.assign(state, before);
          throw error;
        }
      });
      queue = turn.then(() => undefined, () => undefined);
      return turn;
    }),
  };
  return { prisma, state };
}

type Seed = { users: Row[]; identities: Row[] };

/** A Kakao-only account that signed up with a phone number, plus whatever else the case needs. */
const kakaoCaller = (callerOverrides: Row = {}): Seed => ({
  users: [user(CALLER, { email: 'contact@kakao-mail.example', phone: PHONE, ...callerOverrides })],
  identities: [identity('kakao-1', CALLER, 'kakao', 'kakao-key-1', { email: 'contact@kakao-mail.example' })],
});

async function build(seed: Seed, options: { echo?: boolean; sendFails?: boolean } = {}) {
  const db = createDatabase(seed);
  const sent: { channel: string; target: string; code: string }[] = [];
  const dispatcher = {
    send: jest.fn(async (channel: string, target: string, code: string) => {
      if (options.sendFails) throw new Error('mail transport down');
      sent.push({ channel, target, code });
    }),
    mayEchoCode: jest.fn(async () => options.echo ?? false),
  };
  const smsEventLog = { record: jest.fn().mockResolvedValue(undefined) };
  const verification = new VerificationService(db.prisma as never, dispatcher as never, smsEventLog as never);
  const service = new EmailLinkService(db.prisma as never, verification);

  const loginSecurity = {
    isStepUpRequired: jest.fn().mockResolvedValue(false),
    record: jest.fn().mockResolvedValue(undefined),
    scheduleSprayDetection: jest.fn(),
    forgetEmail: jest.fn().mockResolvedValue(undefined),
  };
  const auth = new AuthService({} as never, db.prisma as never, {} as never, {} as never, {} as never, loginSecurity as never, {} as never);
  jest.spyOn(auth, 'me').mockResolvedValue({ onboarding: { status: 'completed', missing: [] } } as never);
  const recovery = new AccountRecoveryService(db.prisma as never, {} as never, loginSecurity as never, { forceDisconnectUser: jest.fn() });

  const lastCode = () => sent[sent.length - 1].code;
  /** The three steps of the happy path, returning the token `complete` takes. */
  const verified = async (email = NEW_EMAIL, callerId = CALLER) => {
    await service.requestCode(callerId, { email }, AGE);
    return (await service.verifyCode(callerId, { code: lastCode() })).emailLinkToken;
  };
  const complete = (emailLinkToken: string, callerId = CALLER, password = NEW_PASSWORD) =>
    service.complete(callerId, { emailLinkToken, password, passwordConfirm: password });
  return { service, verification, auth, recovery, dispatcher, smsEventLog, sent, lastCode, verified, complete, ...db };
}

async function failure(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error('expected the call to be refused');
    },
    (error: { getResponse(): { code: string; details?: unknown }; getStatus(): number }) => ({ ...error.getResponse(), status: error.getStatus() }),
  );
}

describe('EmailLinkService.requestCode', () => {
  it('mails a code to the normalized address and answers with the countdowns, not the code', async () => {
    const { service, sent, state } = await build(kakaoCaller());

    const result = await service.requestCode(CALLER, { email: '  Runner@Example.com ' }, AGE);

    expect(result).toEqual({ sent: true, maskedTarget: 'ru***@example.com', expiresInSeconds: 300, resendAvailableInSeconds: 30 });
    expect(sent).toEqual([{ channel: 'email', target: NEW_EMAIL, code: expect.stringMatching(/^\d{6}$/) }]);
    expect(state.tokens).toEqual([expect.objectContaining({ userId: CALLER, channel: 'email', target: NEW_EMAIL, attemptCount: 0, consumedAt: null })]);
    expect(await verifyPassword(sent[0].code, state.tokens[0].codeHash)).toBe(true);
    expect(state.tokens[0].codeHash).not.toContain(sent[0].code);
  });

  it('echoes the code only where the dispatcher allows it (test addresses on dev-echo environments)', async () => {
    const echoing = await build(kakaoCaller(), { echo: true });

    const result = await echoing.service.requestCode(CALLER, { email: NEW_EMAIL }, AGE);

    expect(result).toMatchObject({ devCode: echoing.sent[0].code });
  });

  it('lets the account use the contact email it already carries', async () => {
    const { service, sent } = await build(kakaoCaller());

    await service.requestCode(CALLER, { email: 'contact@kakao-mail.example' }, AGE);

    expect(sent).toHaveLength(1);
  });

  it('refuses a session older than the recent-login limit before reading or sending anything', async () => {
    const { service, sent, prisma, state } = await build(kakaoCaller());

    expect(await failure(service.requestCode(CALLER, { email: NEW_EMAIL }, RECENT_LOGIN_MAX_AGE_SECONDS + 1))).toMatchObject({
      code: 'RECENT_LOGIN_REQUIRED',
      status: 403,
      details: { maxAgeSeconds: RECENT_LOGIN_MAX_AGE_SECONDS },
    });
    expect(sent).toHaveLength(0);
    expect(state.tokens).toHaveLength(0);
    expect(prisma.v1User.findUnique).not.toHaveBeenCalled();
    await expect(service.requestCode(CALLER, { email: NEW_EMAIL }, RECENT_LOGIN_MAX_AGE_SECONDS)).resolves.toMatchObject({ sent: true });
  });

  it('refuses an account that already has an active email login, and mails nothing', async () => {
    const seed = kakaoCaller();
    seed.identities.push(identity('email-1', CALLER, 'email', 'old@example.com', { passwordHash: 'hash' }));
    const { service, sent } = await build(seed);

    expect(await failure(service.requestCode(CALLER, { email: NEW_EMAIL }, AGE))).toMatchObject({ code: 'SOCIAL_LINK_PROVIDER_EXISTS', status: 409 });
    expect(sent).toHaveLength(0);
  });

  it('refuses an address another account holds as its email, or as its email login key, saying nothing else about it', async () => {
    const byEmail = await build({
      users: [...kakaoCaller().users, user(OTHER, { email: NEW_EMAIL })],
      identities: kakaoCaller().identities,
    });
    const byKey = await build({
      users: [...kakaoCaller().users, user(OTHER, { email: 'other-contact@example.com' })],
      identities: [...kakaoCaller().identities, identity('email-other', OTHER, 'email', NEW_EMAIL, { passwordHash: 'hash' })],
    });

    for (const { service, sent, state } of [byEmail, byKey]) {
      const refused = await failure(service.requestCode(CALLER, { email: NEW_EMAIL }, AGE));
      expect(refused).toEqual({ code: 'EMAIL_CONFLICT', message: '이미 다른 계정에서 쓰는 이메일이에요.', status: 409 });
      expect(sent).toHaveLength(0);
      expect(state.tokens).toHaveLength(0);
    }
  });

  it('refuses an operator account', async () => {
    const { service, sent } = await build(kakaoCaller({ adminUser: { status: 'active' } }));

    expect(await failure(service.requestCode(CALLER, { email: NEW_EMAIL }, AGE))).toMatchObject({ code: 'SOCIAL_LINK_ADMIN_FORBIDDEN', status: 403 });
    expect(sent).toHaveLength(0);
  });

  it('lets an account whose admin role was revoked through', async () => {
    const { service } = await build(kakaoCaller({ adminUser: { status: 'revoked' } }));

    await expect(service.requestCode(CALLER, { email: NEW_EMAIL }, AGE)).resolves.toMatchObject({ sent: true });
  });

  it.each([
    ['a suspended account', { accountStatus: 'suspended' }, 'PERMISSION_DENIED'],
    ['a deleted account', { deletedAt: new Date() }, 'PERMISSION_DENIED'],
    ['a social signup that has not finished', { onboardingStatus: 'social_profile_required' }, 'SIGNUP_INCOMPLETE'],
  ])('refuses %s', async (_name, overrides, code) => {
    const { service, sent } = await build(kakaoCaller(overrides));

    expect(await failure(service.requestCode(CALLER, { email: NEW_EMAIL }, AGE))).toMatchObject({ code, status: 403 });
    expect(sent).toHaveLength(0);
  });

  it('answers 404 for an account that does not exist', async () => {
    const { service } = await build({ users: [], identities: [] });

    expect(await failure(service.requestCode(CALLER, { email: NEW_EMAIL }, AGE))).toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('holds a second request for the same address back for the resend cooldown, then lets it through', async () => {
    const { service, sent, state } = await build(kakaoCaller());
    await service.requestCode(CALLER, { email: NEW_EMAIL }, AGE);

    expect(await failure(service.requestCode(CALLER, { email: NEW_EMAIL }, AGE))).toMatchObject({ code: 'VERIFICATION_RESEND_COOLDOWN', status: 400 });
    expect(sent).toHaveLength(1);

    state.tokens[0].createdAt = new Date(Date.now() - 31_000);
    await service.requestCode(CALLER, { email: NEW_EMAIL }, AGE);

    expect(sent).toHaveLength(2);
    // The newer code replaces the older one: only one stays usable.
    expect(state.tokens.filter((token) => token.consumedAt === null)).toHaveLength(1);
  });

  it('stops after five mails to one address in 24 hours, and ten from one account', async () => {
    const perTarget = await build(kakaoCaller());
    for (let sendNumber = 0; sendNumber < 5; sendNumber += 1) {
      perTarget.state.tokens.push({ id: `old-${sendNumber}`, userId: OTHER, channel: 'email', target: NEW_EMAIL, consumedAt: null, attemptCount: 0, createdAt: new Date(Date.now() - 60_000 * (sendNumber + 1)) });
    }
    const perUser = await build(kakaoCaller());
    for (let sendNumber = 0; sendNumber < 10; sendNumber += 1) {
      perUser.state.tokens.push({ id: `old-${sendNumber}`, userId: CALLER, channel: 'email', target: `other-${sendNumber}@example.com`, consumedAt: null, attemptCount: 0, createdAt: new Date(Date.now() - 60_000 * (sendNumber + 1)) });
    }

    expect(await failure(perTarget.service.requestCode(CALLER, { email: NEW_EMAIL }, AGE))).toMatchObject({ code: 'VERIFICATION_SEND_QUOTA_EXCEEDED', status: 429 });
    expect(await failure(perUser.service.requestCode(CALLER, { email: NEW_EMAIL }, AGE))).toMatchObject({ code: 'VERIFICATION_SEND_QUOTA_EXCEEDED', status: 429 });
    expect(perTarget.sent).toHaveLength(0);
    expect(perUser.sent).toHaveLength(0);
  });

  it('drops the code it could not mail, so the person can ask again at once', async () => {
    const { service, state } = await build(kakaoCaller(), { sendFails: true });

    await expect(service.requestCode(CALLER, { email: NEW_EMAIL }, AGE)).rejects.toThrow('mail transport down');

    expect(state.tokens).toHaveLength(0);
  });
});

describe('EmailLinkService.verifyCode', () => {
  it('spends the code and returns a ten-minute token for this account and address', async () => {
    const { service, state, lastCode } = await build(kakaoCaller());
    await service.requestCode(CALLER, { email: NEW_EMAIL }, AGE);
    const code = lastCode();

    const result = await service.verifyCode(CALLER, { code });

    expect(result).toEqual({ emailLinkToken: expect.stringMatching(/\./), expiresInSeconds: 600 });
    expect(state.tokens[0].consumedAt).toBeInstanceOf(Date);
    expect(await failure(service.verifyCode(CALLER, { code }))).toMatchObject({ code: 'VERIFICATION_NO_PENDING' });
  });

  it('counts a wrong code against the attempts and refuses the right one once they are used up', async () => {
    const { service, state, lastCode, smsEventLog } = await build(kakaoCaller());
    await service.requestCode(CALLER, { email: NEW_EMAIL }, AGE);
    const right = lastCode();
    const wrong = right === '000000' ? '000001' : '000000';

    expect(await failure(service.verifyCode(CALLER, { code: wrong }))).toMatchObject({ code: 'VERIFICATION_CODE_MISMATCH', status: 400 });
    expect(state.tokens[0].attemptCount).toBe(1);
    expect(smsEventLog.record).toHaveBeenCalledWith(expect.objectContaining({ detail: 'channel=email 인증 시도 1/5' }));
    for (let attempt = 0; attempt < 4; attempt += 1) await failure(service.verifyCode(CALLER, { code: wrong }));

    expect(await failure(service.verifyCode(CALLER, { code: right }))).toMatchObject({ code: 'VERIFICATION_TOO_MANY_ATTEMPTS', status: 400 });
    expect(state.tokens[0].consumedAt).toBeNull();
  });

  it('treats an expired code as no pending request', async () => {
    const { service, state, lastCode } = await build(kakaoCaller());
    await service.requestCode(CALLER, { email: NEW_EMAIL }, AGE);
    state.tokens[0].expiresAt = new Date(Date.now() - 1000);

    expect(await failure(service.verifyCode(CALLER, { code: lastCode() }))).toMatchObject({ code: 'VERIFICATION_NO_PENDING', status: 400 });
  });

  it('does not let another account use a code it was not sent for', async () => {
    const seed = kakaoCaller();
    seed.users.push(user(OTHER));
    const { service, lastCode } = await build(seed);
    await service.requestCode(CALLER, { email: NEW_EMAIL }, AGE);

    expect(await failure(service.verifyCode(OTHER, { code: lastCode() }))).toMatchObject({ code: 'VERIFICATION_NO_PENDING' });
  });

  it('only keeps the newest code usable: asking again retires the earlier one', async () => {
    const { service, state, lastCode } = await build(kakaoCaller());
    await service.requestCode(CALLER, { email: NEW_EMAIL }, AGE);
    state.tokens[0].createdAt = new Date(Date.now() - 60_000);
    await service.requestCode(CALLER, { email: 'second@example.com' }, AGE);

    expect(state.tokens.map((token) => token.consumedAt !== null)).toEqual([true, false]);
    const verified = await service.verifyCode(CALLER, { code: lastCode() });
    expect(verified.emailLinkToken).toEqual(expect.any(String));
  });
});

describe('EmailLinkService.complete', () => {
  it('adds the email login, makes the address the account email, and records it', async () => {
    const { verified, complete, state } = await build(kakaoCaller());
    const token = await verified();

    const result = await complete(token);

    expect(result).toEqual({ linked: true, email: NEW_EMAIL });
    const added = state.identities.find((row) => row.provider === 'email');
    expect(added).toMatchObject({ userId: CALLER, providerUserKey: NEW_EMAIL, email: NEW_EMAIL, status: 'active' });
    expect(await verifyPassword(NEW_PASSWORD, added?.passwordHash)).toBe(true);
    expect(added?.passwordHash).not.toContain(NEW_PASSWORD);
    expect(state.users[0]).toMatchObject({ email: NEW_EMAIL, phone: PHONE });
    expect(state.users[0].emailVerifiedAt).toBeInstanceOf(Date);
    expect(state.identities.find((row) => row.provider === 'kakao')).toMatchObject({ userId: CALLER, status: 'active' });
    expect(state.logs).toEqual([
      expect.objectContaining({ targetType: 'auth_identity', targetId: added?.id, toStatus: 'linked', actorType: 'user', actorUserId: CALLER, reason: 'email_login_added' }),
    ]);
  });

  describe('afterwards', () => {
    it('email login works with the new password, and not with another', async () => {
      const { verified, complete, auth } = await build(kakaoCaller());
      await expect(auth.login({ email: NEW_EMAIL, password: NEW_PASSWORD }, {})).rejects.toMatchObject({ status: 401 });
      await complete(await verified());

      await expect(auth.login({ email: ` ${NEW_EMAIL.toUpperCase()} `, password: NEW_PASSWORD }, {})).resolves.toMatchObject({ session: { userId: CALLER, userEmail: NEW_EMAIL } });
      await expect(auth.login({ email: NEW_EMAIL, password: 'Another-pass-1' }, {})).rejects.toMatchObject({ status: 401 });
    });

    it('email password reset works: refused before (social-only), accepted after, and the new password logs in', async () => {
      const { verified, complete, recovery, auth } = await build(kakaoCaller());
      const reset = (newPassword: string) =>
        recovery.resetPasswordByEmail({ email: NEW_EMAIL, proofToken: issueEmailProofToken(NEW_EMAIL, 'password_reset'), newPassword });
      // Before: the address is nobody's, so there is nothing to reset.
      expect(await failure(reset('Reset-pass-123'))).toMatchObject({ code: 'ACCOUNT_NOT_FOUND' });
      await complete(await verified());

      await expect(reset('Reset-pass-123')).resolves.toEqual({ ok: true });

      await expect(auth.login({ email: NEW_EMAIL, password: 'Reset-pass-123' }, {})).resolves.toMatchObject({ session: { userId: CALLER } });
      await expect(auth.login({ email: NEW_EMAIL, password: NEW_PASSWORD }, {})).rejects.toMatchObject({ status: 401 });
    });

    it('a Kakao-only account asking to reset a password is still turned away when its contact email is the address', async () => {
      const { recovery } = await build(kakaoCaller());
      const attempt = recovery.resetPasswordByEmail({
        email: 'contact@kakao-mail.example',
        proofToken: issueEmailProofToken('contact@kakao-mail.example', 'password_reset'),
        newPassword: 'Reset-pass-123',
      });

      expect(await failure(attempt)).toMatchObject({ code: 'PASSWORD_LOGIN_UNAVAILABLE', details: { providers: ['kakao'] } });
    });

    it('find-account by phone lists email among the providers and reports a password', async () => {
      const { verified, complete, recovery } = await build(kakaoCaller());
      const find = () => recovery.findAccountByPhone({ phone: PHONE, proofToken: issuePhoneProofToken(PHONE, 'password_reset') });
      expect(await find()).toEqual({ maskedEmail: 'co***@kakao-mail.example', providers: ['kakao'], hasPassword: false });
      await complete(await verified());

      expect(await find()).toEqual({ maskedEmail: 'ru***@example.com', providers: ['kakao', 'email'], hasPassword: true });
    });
  });

  it('rejects a token issued to another account, another address, or too long ago', async () => {
    const seed = kakaoCaller();
    seed.users.push(user(OTHER));
    const { service, complete, verified, state } = await build(seed);
    const mine = await verified();

    expect(await failure(complete(mine, OTHER))).toMatchObject({ code: 'EMAIL_LINK_TOKEN_INVALID', status: 400 });
    expect(await failure(complete(issueEmailLinkToken(CALLER, NEW_EMAIL, Date.now() - 11 * 60_000)))).toMatchObject({ code: 'EMAIL_LINK_TOKEN_INVALID' });
    const [payload, signature] = mine.split('.');
    const swapped = Buffer.from(Buffer.from(payload, 'base64url').toString('utf8').replace(NEW_EMAIL, 'victim@example.com')).toString('base64url');
    expect(await failure(complete(`${swapped}.${signature}`))).toMatchObject({ code: 'EMAIL_LINK_TOKEN_INVALID' });
    expect(await failure(complete('x'.repeat(60)))).toMatchObject({ code: 'EMAIL_LINK_TOKEN_INVALID' });
    expect(state.identities.filter((row) => row.provider === 'email')).toHaveLength(0);
    await expect(service.complete(CALLER, { emailLinkToken: mine, password: NEW_PASSWORD, passwordConfirm: NEW_PASSWORD })).resolves.toMatchObject({ linked: true });
  });

  it('is not refused for the age of the session: the token is what bounds this step', async () => {
    const { verified, complete } = await build(kakaoCaller());
    const token = await verified();

    await expect(complete(token)).resolves.toEqual({ linked: true, email: NEW_EMAIL });
  });

  it('refuses when another account took the address after the code was checked, and changes nothing', async () => {
    const { verified, complete, state } = await build(kakaoCaller());
    const token = await verified();
    state.users.push(user(OTHER, { email: NEW_EMAIL }));

    expect(await failure(complete(token))).toMatchObject({ code: 'EMAIL_CONFLICT', status: 409 });
    expect(state.identities.filter((row) => row.provider === 'email')).toHaveLength(0);
    expect(state.users[0]).toMatchObject({ email: 'contact@kakao-mail.example', emailVerifiedAt: null });
    expect(state.logs).toHaveLength(0);
  });

  it('turns a unique-index failure on the identity into EMAIL_CONFLICT (a signup took the address in the same instant)', async () => {
    const { verified, complete, prisma, state } = await build(kakaoCaller());
    const token = await verified();
    prisma.v1AuthIdentity.create.mockRejectedValueOnce(uniqueViolation());

    expect(await failure(complete(token))).toMatchObject({ code: 'EMAIL_CONFLICT', status: 409 });
    expect(state.identities.filter((row) => row.provider === 'email')).toHaveLength(0);
  });

  it('turns a unique-index failure on the account email into EMAIL_CONFLICT and takes the new identity back out', async () => {
    const { verified, complete, prisma, state } = await build(kakaoCaller());
    const token = await verified();
    prisma.v1User.update.mockRejectedValueOnce(uniqueViolation());

    expect(await failure(complete(token))).toMatchObject({ code: 'EMAIL_CONFLICT', status: 409 });
    expect(state.identities.filter((row) => row.provider === 'email')).toHaveLength(0);
    expect(state.logs).toHaveLength(0);
  });

  it('does not hide other database failures behind EMAIL_CONFLICT', async () => {
    const { verified, complete, prisma } = await build(kakaoCaller());
    const token = await verified();
    prisma.v1AuthIdentity.create.mockRejectedValueOnce(new Error('connection lost'));

    await expect(complete(token)).rejects.toThrow('connection lost');
  });

  it('two accounts claiming one address at once: one succeeds, the other is told EMAIL_CONFLICT', async () => {
    const seed = kakaoCaller();
    seed.users.push(user(OTHER, { phone: '01055550002' }));
    seed.identities.push(identity('kakao-2', OTHER, 'kakao', 'kakao-key-2'));
    const { verified, complete, state } = await build(seed);
    const tokenOfCaller = await verified(NEW_EMAIL, CALLER);
    state.tokens.forEach((token) => (token.createdAt = new Date(Date.now() - 60_000)));
    const tokenOfOther = await verified(NEW_EMAIL, OTHER);

    const outcomes = await Promise.allSettled([complete(tokenOfCaller, CALLER), complete(tokenOfOther, OTHER)]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const refused = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
    expect(refused?.reason.getResponse()).toMatchObject({ code: 'EMAIL_CONFLICT' });
    expect(state.identities.filter((row) => row.provider === 'email' && row.providerUserKey === NEW_EMAIL)).toHaveLength(1);
  });

  it('refuses an account that got an email login in the meantime', async () => {
    const { verified, complete, state } = await build(kakaoCaller());
    const token = await verified();
    state.identities.push(identity('email-late', CALLER, 'email', 'late@example.com', { passwordHash: await hashPassword('Late-pass-123') }));

    expect(await failure(complete(token))).toMatchObject({ code: 'SOCIAL_LINK_PROVIDER_EXISTS', status: 409 });
    expect(state.users[0].email).toBe('contact@kakao-mail.example');
  });

  it('refuses an account that was suspended or made an operator after the code was checked', async () => {
    const suspended = await build(kakaoCaller());
    const suspendedToken = await suspended.verified();
    suspended.state.users[0].accountStatus = 'suspended';
    const operator = await build(kakaoCaller());
    const operatorToken = await operator.verified();
    operator.state.users[0].adminUser = { status: 'active' };

    expect(await failure(suspended.complete(suspendedToken))).toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(await failure(operator.complete(operatorToken))).toMatchObject({ code: 'SOCIAL_LINK_ADMIN_FORBIDDEN' });
    expect(suspended.state.identities.filter((row) => row.provider === 'email')).toHaveLength(0);
    expect(operator.state.identities.filter((row) => row.provider === 'email')).toHaveLength(0);
  });
});

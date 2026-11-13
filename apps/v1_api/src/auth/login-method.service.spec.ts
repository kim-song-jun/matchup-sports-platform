/**
 * Removing a login method and signing out every other device, over an in-memory copy of the tables these routes
 * touch: real rows, the row lock on the caller, rollback of a failed transaction. Specs assert on the rows that
 * result, not on which calls were made.
 */
import { Test } from '@nestjs/testing';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AppleTokenService } from './apple-token.service';
import { KakaoUnlinkService } from './kakao-unlink.service';
import { LoginMethodService } from './login-method.service';
import { RECENT_LOGIN_MAX_AGE_SECONDS } from './link-caller-guards';
import type { V1SessionProof } from './v1-session';

type Row = Record<string, any>;

const CALLER = 'user-1';
const OTHER = 'user-2';

const user = (id: string, overrides: Row = {}): Row => ({
  id,
  email: `${id}@example.test`,
  accountStatus: 'active',
  deletedAt: null,
  onboardingStatus: 'completed',
  adminUser: null,
  sessionEpoch: 0,
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
  unlinkedAt: null,
  providerRefreshTokenCiphertext: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});
const kakao = (userId = CALLER) => identity(`kakao-${userId}`, userId, 'kakao', `kakao-key-${userId}`, { email: 'provider@example.test' });
const apple = (userId = CALLER) => identity(`apple-${userId}`, userId, 'apple', `apple-sub-${userId}`);
const emailLogin = (userId = CALLER) => identity(`email-${userId}`, userId, 'email', `${userId}@example.test`, { email: `${userId}@example.test`, passwordHash: 'scrypt$hash' });

const proofOf = (overrides: Partial<V1SessionProof> = {}): V1SessionProof => ({ ageSeconds: 60, sessionEpoch: 0, ...overrides });

function createDatabase(seed: { users: Row[]; identities: Row[] }) {
  const state = { users: seed.users, identities: seed.identities, logs: [] as Row[] };
  const locks = new Map<string, Promise<void>>();

  const activeOf = (userId: string, where?: Row) =>
    state.identities
      .filter((row) => row.userId === userId && (where?.status === undefined || row.status === where.status))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((row) => ({ ...row }));

  function transaction(): { tx: Row; settle: (failed: boolean) => void } {
    const undo: Array<() => void> = [];
    const held: Array<() => void> = [];
    const write = (row: Row, data: Row) => {
      const before = { ...row };
      undo.push(() => Object.assign(row, before));
      for (const [key, value] of Object.entries(data)) {
        row[key] = value !== null && typeof value === 'object' && 'increment' in value ? row[key] + value.increment : value;
      }
    };
    const tx: Row = {
      // `SELECT session_epoch FROM v1_users WHERE id = $1 FOR UPDATE`: the next transaction on this user waits for this one to end.
      $queryRaw: jest.fn(async (_strings: TemplateStringsArray, userId: string) => {
        const previous = locks.get(userId) ?? Promise.resolve();
        let release!: () => void;
        locks.set(userId, previous.then(() => new Promise<void>((resolve) => (release = resolve))));
        held.push(() => release());
        await previous;
        const found = state.users.find((row) => row.id === userId);
        return found ? [{ session_epoch: found.sessionEpoch }] : [];
      }),
      v1User: {
        findUnique: jest.fn(async ({ where, select }: Row) => {
          const found = state.users.find((row) => row.id === where.id);
          if (!found) return null;
          return { ...found, authIdentities: activeOf(found.id, select.authIdentities.where) };
        }),
        update: jest.fn(async ({ where, data }: Row) => {
          const found = state.users.find((row) => row.id === where.id);
          write(found as Row, data);
          return { sessionEpoch: found?.sessionEpoch };
        }),
      },
      v1AuthIdentity: {
        update: jest.fn(async ({ where, data }: Row) => {
          const found = state.identities.find((row) => row.id === where.id);
          write(found as Row, data);
          return found;
        }),
      },
      v1StatusChangeLog: {
        create: jest.fn(async ({ data }: Row) => {
          state.logs.push(data);
          undo.push(() => state.logs.splice(state.logs.indexOf(data), 1));
          return data;
        }),
      },
    };
    return {
      tx,
      settle: (failed) => {
        if (failed) undo.reverse().forEach((revert) => revert());
        held.forEach((release) => release());
      },
    };
  }

  const prisma = {
    $transaction: jest.fn(async (run: (tx: Row) => Promise<unknown>) => {
      const { tx, settle } = transaction();
      try {
        const result = await run(tx);
        settle(false);
        return result;
      } catch (error) {
        settle(true);
        throw error;
      }
    }),
  };
  return { prisma, state };
}

function build(seed: { users: Row[]; identities: Row[] }) {
  const db = createDatabase(seed);
  const notice = { id: 'notice-1', targetType: 'system', targetId: null, title: '로그인 수단이 해제됐어요', body: null, deepLink: '/my/settings' };
  const notifications = { createInTransaction: jest.fn().mockResolvedValue(notice), deliverCreated: jest.fn() };
  const appleTokens = { revokeForUser: jest.fn().mockResolvedValue(undefined) };
  const kakaoUnlink = { unlinkAllForUser: jest.fn().mockResolvedValue(undefined) };
  const realtime = { forceDisconnectUser: jest.fn() };
  const service = new LoginMethodService(db.prisma as never, notifications as never, appleTokens as never, kakaoUnlink as never, realtime);
  return { service, notifications, appleTokens, kakaoUnlink, realtime, ...db };
}

const kakaoAndEmail = () => ({ users: [user(CALLER, { email: `${CALLER}@example.test` })], identities: [kakao(), emailLogin()] });

async function failure(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error('expected the call to be refused');
    },
    (error: { getResponse(): { code: string; details?: unknown }; getStatus(): number }) => ({ ...error.getResponse(), status: error.getStatus() }),
  );
}

const rowOf = (state: { identities: Row[] }, id: string) => state.identities.find((row) => row.id === id);

describe('LoginMethodService.unlink', () => {
  it('removes a social login, keeps its key reserved, signs the other devices out and records it', async () => {
    const { service, state } = build(kakaoAndEmail());

    const result = await service.unlink(CALLER, 'kakao', proofOf());

    expect(result).toEqual({ provider: 'kakao', authProviders: ['email'], sessionEpoch: 1 });
    expect(rowOf(state, 'kakao-user-1')).toMatchObject({ status: 'unlinked', providerUserKey: 'kakao-key-user-1', userId: CALLER });
    expect(rowOf(state, 'kakao-user-1')?.unlinkedAt).toBeInstanceOf(Date);
    expect(rowOf(state, 'email-user-1')).toMatchObject({ status: 'active', passwordHash: 'scrypt$hash' });
    expect(state.users[0].sessionEpoch).toBe(1);
    expect(state.logs).toEqual([
      expect.objectContaining({
        targetType: 'auth_identity',
        targetId: 'kakao-user-1',
        fromStatus: 'linked',
        toStatus: 'unlinked',
        actorType: 'user',
        actorUserId: CALLER,
        reason: 'login_method_removed',
      }),
    ]);
  });

  describe('open sockets', () => {
    it('closes every socket of the account once the removal committed, so the other devices must pass the handshake again', async () => {
      const { service, realtime } = build(kakaoAndEmail());

      await service.unlink(CALLER, 'kakao', proofOf());

      expect(realtime.forceDisconnectUser).toHaveBeenCalledTimes(1);
      expect(realtime.forceDisconnectUser).toHaveBeenCalledWith(CALLER);
    });

    it.each([
      ['the last login method', () => build({ users: [user(CALLER)], identities: [kakao()] }), proofOf()],
      ['a cookie another bump already revoked', () => build({ users: [user(CALLER, { sessionEpoch: 5 })], identities: [kakao(), emailLogin()] }), proofOf({ sessionEpoch: 4 })],
      ['a method the account does not have', () => build({ users: [user(CALLER)], identities: [emailLogin()] }), proofOf()],
    ])('leaves the sockets alone when the removal is refused: %s', async (_label, setup, proof) => {
      const { service, realtime } = setup();

      await failure(service.unlink(CALLER, 'kakao', proof));

      expect(realtime.forceDisconnectUser).not.toHaveBeenCalled();
    });

    it('leaves the sockets alone when the removal was rolled back', async () => {
      const { service, notifications, realtime } = build(kakaoAndEmail());
      notifications.createInTransaction.mockRejectedValueOnce(new Error('inbox down'));

      await expect(service.unlink(CALLER, 'kakao', proofOf())).rejects.toThrow('inbox down');

      expect(realtime.forceDisconnectUser).not.toHaveBeenCalled();
    });

    it('still answers the removal when the gateway cannot close them', async () => {
      const { service, realtime, state } = build(kakaoAndEmail());
      realtime.forceDisconnectUser.mockImplementation(() => {
        throw new Error('gateway not ready');
      });

      await expect(service.unlink(CALLER, 'kakao', proofOf())).resolves.toMatchObject({ sessionEpoch: 1 });
      expect(rowOf(state, 'kakao-user-1')?.status).toBe('unlinked');
    });
  });

  it('removes the email login: password gone, address freed from the login key, the account keeps its contact email', async () => {
    const { service, state } = build(kakaoAndEmail());

    const result = await service.unlink(CALLER, 'email', proofOf());

    expect(result).toMatchObject({ provider: 'email', authProviders: ['kakao'], sessionEpoch: 1 });
    expect(rowOf(state, 'email-user-1')).toMatchObject({
      status: 'unlinked',
      passwordHash: null,
      email: null,
      providerUserKey: 'deleted:user-1:email-user-1',
    });
    expect(state.users[0].email).toBe('user-1@example.test');
    expect(rowOf(state, 'kakao-user-1')?.status).toBe('active');
  });

  it('stores the security notice with the removal and delivers it once the removal committed', async () => {
    const { service, notifications } = build(kakaoAndEmail());

    await service.unlink(CALLER, 'kakao', proofOf());

    expect(notifications.createInTransaction).toHaveBeenCalledWith(expect.objectContaining({ $queryRaw: expect.any(Function) }), CALLER, 'social_identity_unlinked', {
      vars: { name: '카카오' },
      businessKey: 'login-method-removed:kakao-user-1:1',
    });
    expect(notifications.deliverCreated).toHaveBeenCalledTimes(1);
    expect(notifications.deliverCreated).toHaveBeenCalledWith(CALLER, 'social_identity_unlinked', expect.objectContaining({ id: 'notice-1' }));
  });

  it('names the email login the way the link notice does', async () => {
    const { service, notifications } = build(kakaoAndEmail());

    await service.unlink(CALLER, 'email', proofOf());

    expect(notifications.createInTransaction).toHaveBeenCalledWith(expect.anything(), CALLER, 'social_identity_unlinked', expect.objectContaining({ vars: { name: '이메일·비밀번호' } }));
  });

  it('undoes the removal and the epoch bump when the notice cannot be stored, and delivers nothing', async () => {
    const { service, state, notifications } = build(kakaoAndEmail());
    notifications.createInTransaction.mockRejectedValueOnce(new Error('inbox down'));

    await expect(service.unlink(CALLER, 'kakao', proofOf())).rejects.toThrow('inbox down');

    expect(rowOf(state, 'kakao-user-1')).toMatchObject({ status: 'active', unlinkedAt: null });
    expect(state.users[0].sessionEpoch).toBe(0);
    expect(state.logs).toHaveLength(0);
    expect(notifications.deliverCreated).not.toHaveBeenCalled();
  });

  describe('the last login method', () => {
    it('is refused with 409 LAST_LOGIN_METHOD, and nothing changes', async () => {
      const { service, state, notifications } = build({ users: [user(CALLER)], identities: [kakao()] });

      expect(await failure(service.unlink(CALLER, 'kakao', proofOf()))).toMatchObject({ status: 409, code: 'LAST_LOGIN_METHOD' });

      expect(rowOf(state, 'kakao-user-1')?.status).toBe('active');
      expect(state.users[0].sessionEpoch).toBe(0);
      expect(state.logs).toHaveLength(0);
      expect(notifications.deliverCreated).not.toHaveBeenCalled();
    });

    it('does not count an email login that has no password as a method that stays', async () => {
      const { service, state } = build({ users: [user(CALLER)], identities: [kakao(), { ...emailLogin(), passwordHash: null }] });

      expect(await failure(service.unlink(CALLER, 'kakao', proofOf()))).toMatchObject({ code: 'LAST_LOGIN_METHOD' });
      expect(rowOf(state, 'kakao-user-1')?.status).toBe('active');
    });

    it('does not count a Naver login, which has no way to sign in', async () => {
      const naver = identity('naver-user-1', CALLER, 'naver', 'naver-key-user-1');
      const { service, state, realtime } = build({ users: [user(CALLER)], identities: [kakao(), naver] });

      expect(await failure(service.unlink(CALLER, 'kakao', proofOf()))).toMatchObject({ status: 409, code: 'LAST_LOGIN_METHOD' });

      expect(rowOf(state, 'kakao-user-1')?.status).toBe('active');
      expect(realtime.forceDisconnectUser).not.toHaveBeenCalled();
    });

    it('still lets a login go when another real one stays next to a Naver login', async () => {
      const naver = identity('naver-user-1', CALLER, 'naver', 'naver-key-user-1');
      const { service, state } = build({ users: [user(CALLER)], identities: [kakao(), emailLogin(), naver] });

      await expect(service.unlink(CALLER, 'kakao', proofOf())).resolves.toMatchObject({ authProviders: ['email', 'naver'] });
      expect(rowOf(state, 'kakao-user-1')?.status).toBe('unlinked');
    });

    it('does not count a login that was removed earlier', async () => {
      const removed = { ...apple(), status: 'unlinked' };
      const { service } = build({ users: [user(CALLER)], identities: [kakao(), removed] });

      expect(await failure(service.unlink(CALLER, 'kakao', proofOf()))).toMatchObject({ code: 'LAST_LOGIN_METHOD' });
    });

    it('is decided on the other removal’s result: two removals racing never leave the account without a login', async () => {
      const { service, state } = build(kakaoAndEmail());

      // Header identities carry no cookie epoch, so only the row lock stands between the two.
      const settled = await Promise.allSettled([service.unlink(CALLER, 'kakao', null), service.unlink(CALLER, 'email', null)]);

      expect(settled.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      const refused = settled.find((outcome) => outcome.status === 'rejected') as PromiseRejectedResult;
      expect(refused.reason.getResponse()).toMatchObject({ code: 'LAST_LOGIN_METHOD' });
      expect(state.identities.filter((row) => row.status === 'active')).toHaveLength(1);
    });
  });

  it('answers 404 LOGIN_METHOD_NOT_FOUND for a method the account does not have, or already removed', async () => {
    const { service, state } = build({ users: [user(CALLER)], identities: [emailLogin(), { ...kakao(), status: 'unlinked' }] });

    expect(await failure(service.unlink(CALLER, 'apple', proofOf()))).toMatchObject({ status: 404, code: 'LOGIN_METHOD_NOT_FOUND' });
    expect(await failure(service.unlink(CALLER, 'kakao', proofOf()))).toMatchObject({ status: 404, code: 'LOGIN_METHOD_NOT_FOUND' });
    expect(state.users[0].sessionEpoch).toBe(0);
  });

  describe('Apple', () => {
    it('revokes the stored Apple grant after the removal', async () => {
      const { service, appleTokens } = build({ users: [user(CALLER)], identities: [apple(), emailLogin()] });

      await service.unlink(CALLER, 'apple', proofOf());

      expect(appleTokens.revokeForUser).toHaveBeenCalledWith(CALLER);
    });

    it('leaves the Apple grant alone when another login is removed, or when the removal is refused', async () => {
      const removeKakao = build({ users: [user(CALLER)], identities: [kakao(), apple(), emailLogin()] });
      await removeKakao.service.unlink(CALLER, 'kakao', proofOf());
      expect(removeKakao.appleTokens.revokeForUser).not.toHaveBeenCalled();

      const refused = build({ users: [user(CALLER)], identities: [apple()] });
      await failure(refused.service.unlink(CALLER, 'apple', proofOf()));
      expect(refused.appleTokens.revokeForUser).not.toHaveBeenCalled();
    });
  });

  describe('Kakao', () => {
    it('asks Kakao to drop the app connection once the removal has committed', async () => {
      const { service, kakaoUnlink, state } = build(kakaoAndEmail());
      const rowWhenAsked: Row[] = [];
      kakaoUnlink.unlinkAllForUser.mockImplementation(async () => {
        rowWhenAsked.push({ ...rowOf(state, 'kakao-user-1') });
      });

      await service.unlink(CALLER, 'kakao', proofOf());

      expect(kakaoUnlink.unlinkAllForUser).toHaveBeenCalledTimes(1);
      expect(kakaoUnlink.unlinkAllForUser).toHaveBeenCalledWith(CALLER, 'login_method_removed');
      expect(rowWhenAsked).toEqual([expect.objectContaining({ status: 'unlinked', providerUserKey: 'kakao-key-user-1' })]);
    });

    it('does not wait for Kakao: the removal is answered even if the request never ends', async () => {
      const { service, kakaoUnlink } = build(kakaoAndEmail());
      kakaoUnlink.unlinkAllForUser.mockReturnValue(new Promise<void>(() => undefined));

      const outcome = await Promise.race([service.unlink(CALLER, 'kakao', proofOf()), new Promise((resolve) => setTimeout(() => resolve('waited'), 100))]);

      expect(outcome).toEqual({ provider: 'kakao', authProviders: ['email'], sessionEpoch: 1 });
    });

    it('leaves Kakao alone when an email or Apple login is removed, or when the removal is refused', async () => {
      const removeEmail = build({ users: [user(CALLER)], identities: [kakao(), emailLogin()] });
      await removeEmail.service.unlink(CALLER, 'email', proofOf());
      const removeApple = build({ users: [user(CALLER)], identities: [kakao(), apple()] });
      await removeApple.service.unlink(CALLER, 'apple', proofOf());
      const refused = build({ users: [user(CALLER)], identities: [kakao()] });
      await failure(refused.service.unlink(CALLER, 'kakao', proofOf()));

      expect(removeEmail.kakaoUnlink.unlinkAllForUser).not.toHaveBeenCalled();
      expect(removeApple.kakaoUnlink.unlinkAllForUser).not.toHaveBeenCalled();
      expect(refused.kakaoUnlink.unlinkAllForUser).not.toHaveBeenCalled();
    });
  });

  describe('who may call', () => {
    it('refuses a session older than 30 minutes before touching the database', async () => {
      const { service, prisma } = build(kakaoAndEmail());

      expect(await failure(service.unlink(CALLER, 'kakao', proofOf({ ageSeconds: RECENT_LOGIN_MAX_AGE_SECONDS + 1 })))).toMatchObject({
        status: 403,
        code: 'RECENT_LOGIN_REQUIRED',
        message: '보안을 위해 다시 로그인한 뒤 해제해 주세요.',
        details: { maxAgeSeconds: RECENT_LOGIN_MAX_AGE_SECONDS },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('accepts a session exactly at the limit', async () => {
      const { service } = build(kakaoAndEmail());

      await expect(service.unlink(CALLER, 'kakao', proofOf({ ageSeconds: RECENT_LOGIN_MAX_AGE_SECONDS }))).resolves.toMatchObject({ provider: 'kakao' });
    });

    it('refuses a request without a cookie session in production, and accepts a header identity elsewhere', async () => {
      const saved = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const production = build(kakaoAndEmail());
        expect(await failure(production.service.unlink(CALLER, 'kakao', null))).toMatchObject({ code: 'RECENT_LOGIN_REQUIRED' });
        expect(production.state.users[0].sessionEpoch).toBe(0);

        process.env.NODE_ENV = 'test';
        const development = build(kakaoAndEmail());
        await expect(development.service.unlink(CALLER, 'kakao', null)).resolves.toMatchObject({ provider: 'kakao' });
      } finally {
        process.env.NODE_ENV = saved;
      }
    });

    it('refuses an operator account with SOCIAL_LINK_ADMIN_FORBIDDEN, but lets a revoked operator through', async () => {
      const operator = build({ users: [user(CALLER, { adminUser: { status: 'active' } })], identities: [kakao(), emailLogin()] });
      expect(await failure(operator.service.unlink(CALLER, 'kakao', proofOf()))).toMatchObject({ status: 403, code: 'SOCIAL_LINK_ADMIN_FORBIDDEN' });
      expect(rowOf(operator.state, 'kakao-user-1')?.status).toBe('active');
      expect(operator.state.users[0].sessionEpoch).toBe(0);

      const revoked = build({ users: [user(CALLER, { adminUser: { status: 'revoked' } })], identities: [kakao(), emailLogin()] });
      await expect(revoked.service.unlink(CALLER, 'kakao', proofOf())).resolves.toMatchObject({ provider: 'kakao' });
    });

    it.each([
      { name: 'a restricted account', overrides: { accountStatus: 'suspended' }, code: 'PERMISSION_DENIED' },
      { name: 'a deleted account', overrides: { deletedAt: new Date() }, code: 'PERMISSION_DENIED' },
      { name: 'a social signup that is not finished', overrides: { onboardingStatus: 'social_profile_required' }, code: 'SIGNUP_INCOMPLETE' },
    ])('refuses $name', async ({ overrides, code }) => {
      const { service, state } = build({ users: [user(CALLER, overrides)], identities: [kakao(), emailLogin()] });

      expect(await failure(service.unlink(CALLER, 'kakao', proofOf()))).toMatchObject({ status: 403, code });
      expect(rowOf(state, 'kakao-user-1')?.status).toBe('active');
    });

    it('answers 404 for an account that does not exist', async () => {
      const { service } = build({ users: [], identities: [] });

      expect(await failure(service.unlink(CALLER, 'kakao', proofOf()))).toMatchObject({ status: 404 });
    });
  });

  describe('a cookie that was revoked in the meantime', () => {
    it('is refused with 401 and changes nothing, instead of minting a fresh cookie from a stale one', async () => {
      const { service, state } = build({ users: [user(CALLER, { sessionEpoch: 5 })], identities: [kakao(), emailLogin()] });

      expect(await failure(service.unlink(CALLER, 'kakao', proofOf({ sessionEpoch: 4 })))).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });

      expect(rowOf(state, 'kakao-user-1')?.status).toBe('active');
      expect(state.users[0].sessionEpoch).toBe(5);
    });

    it('lets exactly one of two requests that carry the same cookie through', async () => {
      const { service, state } = build(kakaoAndEmail());

      const settled = await Promise.allSettled([service.unlink(CALLER, 'kakao', proofOf()), service.unlink(CALLER, 'email', proofOf())]);

      expect(settled.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      expect(state.users[0].sessionEpoch).toBe(1);
      expect(state.identities.filter((row) => row.status === 'active')).toHaveLength(1);
    });
  });

  it('touches nothing of another account', async () => {
    const { service, state } = build({
      users: [user(CALLER), user(OTHER)],
      identities: [kakao(CALLER), emailLogin(CALLER), kakao(OTHER), emailLogin(OTHER)],
    });

    await service.unlink(CALLER, 'kakao', proofOf());

    expect(state.users.find((row) => row.id === OTHER)?.sessionEpoch).toBe(0);
    expect(state.identities.filter((row) => row.userId === OTHER).map((row) => row.status)).toEqual(['active', 'active']);
  });
});

describe('LoginMethodService wiring', () => {
  it('is built by Nest with the real gateway token, so the sockets are closed in the running app and not only in a hand-built service', async () => {
    const { prisma } = createDatabase({ users: [user(CALLER)], identities: [emailLogin()] });
    const gateway = { forceDisconnectUser: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        LoginMethodService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: {} },
        { provide: AppleTokenService, useValue: {} },
        { provide: KakaoUnlinkService, useValue: {} },
        { provide: RealtimeGateway, useValue: gateway },
      ],
    }).compile();

    await moduleRef.get(LoginMethodService).revokeOtherSessions(CALLER, proofOf());

    expect(gateway.forceDisconnectUser).toHaveBeenCalledWith(CALLER);
  });
});

describe('LoginMethodService.revokeOtherSessions', () => {
  it('raises the session epoch once and records it, leaving the login methods alone', async () => {
    const { service, state, notifications } = build(kakaoAndEmail());

    await expect(service.revokeOtherSessions(CALLER, proofOf())).resolves.toEqual({ sessionEpoch: 1 });

    expect(state.users[0].sessionEpoch).toBe(1);
    expect(state.identities.map((row) => row.status)).toEqual(['active', 'active']);
    expect(state.logs).toEqual([
      expect.objectContaining({ targetType: 'user_session', targetId: CALLER, actorType: 'user', actorUserId: CALLER, reason: 'sessions_revoked' }),
    ]);
    expect(notifications.createInTransaction).not.toHaveBeenCalled();
  });

  it('closes every socket of the account once the epoch is raised', async () => {
    const { service, realtime } = build(kakaoAndEmail());

    await service.revokeOtherSessions(CALLER, proofOf());

    expect(realtime.forceDisconnectUser).toHaveBeenCalledTimes(1);
    expect(realtime.forceDisconnectUser).toHaveBeenCalledWith(CALLER);
  });

  it('leaves the sockets alone when the request is refused, and answers even if the gateway cannot close them', async () => {
    const refused = build({ users: [user(CALLER, { sessionEpoch: 3 })], identities: [emailLogin()] });
    await failure(refused.service.revokeOtherSessions(CALLER, proofOf({ sessionEpoch: 2 })));
    expect(refused.realtime.forceDisconnectUser).not.toHaveBeenCalled();

    const broken = build(kakaoAndEmail());
    broken.realtime.forceDisconnectUser.mockImplementation(() => {
      throw new Error('gateway not ready');
    });
    await expect(broken.service.revokeOtherSessions(CALLER, proofOf())).resolves.toEqual({ sessionEpoch: 1 });
  });

  it('needs no recent sign-in: a week-old session may sign the others out', async () => {
    const { service } = build(kakaoAndEmail());

    await expect(service.revokeOtherSessions(CALLER, proofOf({ ageSeconds: 6 * 24 * 60 * 60 }))).resolves.toEqual({ sessionEpoch: 1 });
  });

  it('is open to an operator’s own account, since it only narrows who can act as it', async () => {
    const { service } = build({ users: [user(CALLER, { adminUser: { status: 'active' } })], identities: [emailLogin()] });

    await expect(service.revokeOtherSessions(CALLER, proofOf())).resolves.toEqual({ sessionEpoch: 1 });
  });

  it('refuses a cookie another bump already revoked, so the stale holder cannot take the new epoch for itself', async () => {
    const { service, state } = build({ users: [user(CALLER, { sessionEpoch: 3 })], identities: [emailLogin()] });

    expect(await failure(service.revokeOtherSessions(CALLER, proofOf({ sessionEpoch: 2 })))).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });

    expect(state.users[0].sessionEpoch).toBe(3);
    expect(state.logs).toHaveLength(0);
  });

  it('lets exactly one of two requests with the same cookie win the epoch', async () => {
    const { service, state } = build(kakaoAndEmail());

    const settled = await Promise.allSettled([service.revokeOtherSessions(CALLER, proofOf()), service.revokeOtherSessions(CALLER, proofOf())]);

    expect(settled.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(state.users[0].sessionEpoch).toBe(1);
    expect(state.logs).toHaveLength(1);
  });

  it('answers 404 for an account that does not exist', async () => {
    const { service } = build({ users: [], identities: [] });

    expect(await failure(service.revokeOtherSessions(CALLER, proofOf()))).toMatchObject({ status: 404 });
  });
});

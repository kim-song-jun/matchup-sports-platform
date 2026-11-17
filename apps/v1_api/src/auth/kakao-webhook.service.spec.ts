import { BadRequestException, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { KAKAO_ADMIN_KEY_ENV } from './kakao-unlink.service';
import { KAKAO_APP_ID_ENV, KakaoWebhookService } from './kakao-webhook.service';

// Invented values: they never match a real Kakao app or member.
const ADMIN_KEY = 'unit-test-admin-key-5f3a';
const APP_ID = '1234567';
const MEMBER_NUMBER = '9000000001';
const USER_ID = 'user-1';
const IDENTITY_ID = 'identity-1';
const AUTHORIZATION = `KakaoAK ${ADMIN_KEY}`;
const GROUP_USER_TOKEN = 'group-token-never-stored';

type IdentityRow = { id: string; userId: string; provider: string; providerUserKey: string; status: string };
type LogRow = Record<string, unknown>;

const validBody = (overrides: Record<string, unknown> = {}) => ({
  app_id: APP_ID,
  user_id: MEMBER_NUMBER,
  referrer_type: 'UNLINK_FROM_APPS',
  ...overrides,
});

/**
 * In-memory stand-in for the three tables the webhook touches. The identity table has no write method on purpose:
 * a service that tried to change a login row would fail here. A transaction that throws rolls its writes back.
 */
function createStore(options: { identity?: Partial<IdentityRow>; draft?: unknown; progress?: boolean } = {}) {
  const identity: IdentityRow = {
    id: IDENTITY_ID,
    userId: USER_ID,
    provider: 'kakao',
    providerUserKey: MEMBER_NUMBER,
    status: 'active',
    ...options.identity,
  };
  const state = {
    logs: [] as LogRow[],
    draft: options.draft as unknown,
    hasProgress: options.progress ?? true,
    progressWrites: 0,
    failNextProgressWrite: false,
  };

  // Writes exist only on the transaction client: a write made outside the transaction has nothing to call.
  const transaction = {
    v1StatusChangeLog: {
      create: jest.fn(async ({ data }: { data: LogRow }) => {
        state.logs.push(data);
        return data;
      }),
    },
    v1UserOnboardingProgress: {
      findUnique: jest.fn(async ({ where }: { where: { userId: string } }) =>
        state.hasProgress && where.userId === USER_ID ? { draftJson: state.draft ?? null } : null,
      ),
      update: jest.fn(async ({ data }: { data: { draftJson: unknown } }) => {
        if (state.failNextProgressWrite) throw new Error(`write failed for member ${MEMBER_NUMBER} using ${ADMIN_KEY}`);
        state.progressWrites += 1;
        state.draft = data.draftJson;
        return {};
      }),
    },
  };
  const client = {
    v1AuthIdentity: {
      findUnique: jest.fn(async ({ where }: { where: { provider_providerUserKey: { provider: string; providerUserKey: string } } }) => {
        const key = where.provider_providerUserKey;
        return key.provider === identity.provider && key.providerUserKey === identity.providerUserKey ? { ...identity } : null;
      }),
    },
    $transaction: jest.fn(async (run: (tx: typeof transaction) => Promise<unknown>) => {
      const snapshot = { logs: [...state.logs], draft: state.draft };
      try {
        return await run(transaction);
      } catch (error) {
        state.logs = snapshot.logs;
        state.draft = snapshot.draft;
        throw error;
      }
    }),
  };

  return { client, state };
}

describe('KakaoWebhookService', () => {
  const savedEnv = { ...process.env };
  let logged: Record<'log' | 'warn' | 'error', string[]>;

  const capture = (level: 'log' | 'warn' | 'error') => (message: unknown, ...rest: unknown[]) => {
    logged[level].push([message, ...rest].map(String).join(' '));
  };
  const allLogged = () => [...logged.log, ...logged.warn, ...logged.error].join('\n');
  const serviceFor = (store: ReturnType<typeof createStore>) => new KakaoWebhookService(store.client as never);

  beforeEach(() => {
    process.env[KAKAO_ADMIN_KEY_ENV] = ADMIN_KEY;
    process.env[KAKAO_APP_ID_ENV] = APP_ID;
    logged = { log: [], warn: [], error: [] };
    jest.spyOn(Logger.prototype, 'log').mockImplementation(capture('log'));
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(capture('warn'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(capture('error'));
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(capture('log'));
    jest.spyOn(Logger.prototype, 'verbose').mockImplementation(capture('log'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...savedEnv };
  });

  describe('a valid notification', () => {
    const draftWithKakaoValues = {
      kakaoName: '홍길동',
      kakaoPhone: '01012345678',
      kakaoGender: 'female',
      kakaoBirthDate: '20000229',
      appleName: '김애플',
      ageConfirmedAt: '2026-10-11T00:00:00.000Z',
      autoNickname: '씩씩한수달3',
    };

    it('records one status-change row and drops only the Kakao values from the signup draft', async () => {
      const store = createStore({ draft: draftWithKakaoValues });

      await serviceFor(store).receiveUnlink(AUTHORIZATION, validBody());

      expect(store.state.logs).toEqual([
        {
          targetType: 'auth_identity',
          targetId: IDENTITY_ID,
          fromStatus: 'active',
          toStatus: 'provider_unlinked',
          actorType: 'system',
          reason: 'kakao_unlink_webhook:UNLINK_FROM_APPS',
        },
      ]);
      expect(store.state.draft).toEqual({
        appleName: '김애플',
        ageConfirmedAt: '2026-10-11T00:00:00.000Z',
        autoNickname: '씩씩한수달3',
      });
      expect(logged.error).toEqual([]);
    });

    it('records the row\'s current status when the member had already removed Kakao as a login method', async () => {
      const store = createStore({ identity: { status: 'unlinked' }, draft: draftWithKakaoValues });

      await serviceFor(store).receiveUnlink(AUTHORIZATION, validBody());

      expect(store.state.logs[0]).toMatchObject({ targetId: IDENTITY_ID, fromStatus: 'unlinked', toStatus: 'provider_unlinked' });
    });

    it('leaves a draft without Kakao values byte for byte alone and does not write it', async () => {
      const draft = { appleName: '김애플', ageConfirmedAt: '2026-10-11T00:00:00.000Z' };
      const store = createStore({ draft });

      await serviceFor(store).receiveUnlink(AUTHORIZATION, validBody());

      expect(store.state.logs).toHaveLength(1);
      expect(store.state.progressWrites).toBe(0);
      expect(store.state.draft).toBe(draft);
    });

    it.each([
      ['a member with no signup progress row', { progress: false }],
      ['a progress row whose draft is empty', { draft: null }],
    ])('still records the notification for %s', async (_label, options) => {
      const store = createStore(options);

      await serviceFor(store).receiveUnlink(AUTHORIZATION, validBody());

      expect(store.state.logs).toHaveLength(1);
      expect(store.state.progressWrites).toBe(0);
    });

    it('gives the same end state when Kakao delivers the same notification twice (one more record, same draft)', async () => {
      const store = createStore({ draft: draftWithKakaoValues });
      const service = serviceFor(store);

      await service.receiveUnlink(AUTHORIZATION, validBody());
      const draftAfterFirst = store.state.draft;
      await service.receiveUnlink(AUTHORIZATION, validBody());

      expect(store.state.draft).toEqual(draftAfterFirst);
      expect(store.state.progressWrites).toBe(1);
      expect(store.state.logs).toHaveLength(2);
    });

    it.each(['ACCOUNT_DELETE', 'FORCED_ACCOUNT_DELETE', 'UNLINK_FROM_ADMIN', 'UNLINK_FROM_APPS', 'INCOMPLETE_SIGN_UP'])(
      'keeps the known referrer_type %s in the reason',
      async (referrerType) => {
        const store = createStore();

        await serviceFor(store).receiveUnlink(AUTHORIZATION, validBody({ referrer_type: referrerType }));

        expect(store.state.logs[0]).toMatchObject({ reason: `kakao_unlink_webhook:${referrerType}` });
      },
    );

    it.each([
      ['an unknown value', 'SOMETHING_NEW'],
      ['markup', '<script>alert(1)</script>'],
      ['a lowercase known value', 'unlink_from_apps'],
      ['an empty value', ''],
      ['a missing value', undefined],
      ['a repeated field', ['UNLINK_FROM_APPS', 'ACCOUNT_DELETE']],
    ])('folds %s into "other" and writes the received text nowhere', async (_label, referrerType) => {
      const store = createStore();

      await serviceFor(store).receiveUnlink(AUTHORIZATION, validBody({ referrer_type: referrerType }));

      expect(store.state.logs[0]).toMatchObject({ reason: 'kakao_unlink_webhook:other' });
      const everything = JSON.stringify(store.state.logs) + allLogged();
      for (const text of [referrerType].flat()) {
        if (typeof text === 'string' && text !== '') expect(everything).not.toContain(text);
      }
    });

    it('ignores group_user_token and any other field', async () => {
      const store = createStore();

      await serviceFor(store).receiveUnlink(
        AUTHORIZATION,
        validBody({ group_user_token: GROUP_USER_TOKEN, unexpected: { nested: true } }),
      );

      expect(store.state.logs).toHaveLength(1);
      expect(JSON.stringify(store.state.logs) + allLogged()).not.toContain(GROUP_USER_TOKEN);
    });

    it('logs the internal user id and the result, never the Kakao member number or the key', async () => {
      const store = createStore({ draft: draftWithKakaoValues });

      await serviceFor(store).receiveUnlink(AUTHORIZATION, validBody());

      expect(logged.log.join('\n')).toContain(`user=${USER_ID}`);
      expect(logged.log.join('\n')).toContain('result=recorded');
      expect(allLogged()).not.toContain(MEMBER_NUMBER);
      expect(allLogged()).not.toContain(ADMIN_KEY);
    });
  });

  describe('authentication', () => {
    const rejected = [
      ['a wrong key', `KakaoAK ${ADMIN_KEY}x`],
      ['a key one character short', `KakaoAK ${ADMIN_KEY.slice(0, -1)}`],
      ['the key without the KakaoAK prefix', ADMIN_KEY],
      ['the wrong scheme', `Bearer ${ADMIN_KEY}`],
      ['a lowercase scheme', `kakaoak ${ADMIN_KEY}`],
      ['no header', undefined],
      ['an empty header', ''],
    ] as const;

    it.each(rejected)('answers 401 UNAUTHENTICATED for %s and writes nothing', async (_label, header) => {
      const store = createStore({ draft: { kakaoName: '홍길동' } });

      const failure = await serviceFor(store).receiveUnlink(header, validBody()).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(UnauthorizedException);
      expect((failure as UnauthorizedException).getResponse()).toMatchObject({ code: 'UNAUTHENTICATED' });
      expect(store.client.$transaction).not.toHaveBeenCalled();
      expect(store.state.logs).toEqual([]);
      expect(store.state.draft).toEqual({ kakaoName: '홍길동' });
      expect(allLogged()).not.toContain(MEMBER_NUMBER);
    });

    it('authenticates before it reads the body, so an unauthenticated caller learns nothing about the shape', async () => {
      const store = createStore();

      await expect(serviceFor(store).receiveUnlink(undefined, { garbage: true })).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('when the webhook is off', () => {
    const offCases = [
      ['KAKAO_ADMIN_KEY is unset', () => delete process.env[KAKAO_ADMIN_KEY_ENV]],
      ['KAKAO_ADMIN_KEY is blank', () => { process.env[KAKAO_ADMIN_KEY_ENV] = '   '; }],
      ['KAKAO_APP_ID is unset although the key is set', () => delete process.env[KAKAO_APP_ID_ENV]],
      ['KAKAO_APP_ID is blank although the key is set', () => { process.env[KAKAO_APP_ID_ENV] = ''; }],
    ] as const;

    it.each(offCases)('answers 503 KAKAO_WEBHOOK_NOT_CONFIGURED and writes nothing when %s', async (_label, switchOff) => {
      switchOff();
      const store = createStore({ draft: { kakaoName: '홍길동' } });

      const failure = await serviceFor(store).receiveUnlink(AUTHORIZATION, validBody()).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      expect((failure as ServiceUnavailableException).getResponse()).toMatchObject({ code: 'KAKAO_WEBHOOK_NOT_CONFIGURED' });
      expect(store.client.$transaction).not.toHaveBeenCalled();
      expect(store.state.logs).toEqual([]);
      expect(store.state.draft).toEqual({ kakaoName: '홍길동' });
    });

    it('answers 503 rather than 401 when nothing can be compared, whatever the header says', async () => {
      delete process.env[KAKAO_ADMIN_KEY_ENV];
      const store = createStore();

      await expect(serviceFor(store).receiveUnlink(undefined, validBody())).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('warns once per process, not once per request', async () => {
      delete process.env[KAKAO_APP_ID_ENV];
      const service = serviceFor(createStore());

      for (let attempt = 0; attempt < 3; attempt += 1) {
        await expect(service.receiveUnlink(AUTHORIZATION, validBody())).rejects.toBeInstanceOf(ServiceUnavailableException);
      }

      expect(logged.warn.filter((line) => line.includes(KAKAO_APP_ID_ENV) || line.includes(KAKAO_ADMIN_KEY_ENV))).toHaveLength(1);
    });
  });

  describe('a notification the service does not act on', () => {
    it('answers normally for a member number it does not know and writes nothing', async () => {
      const store = createStore({ draft: { kakaoName: '홍길동' } });

      await expect(serviceFor(store).receiveUnlink(AUTHORIZATION, validBody({ user_id: '9000000099' }))).resolves.toBeUndefined();

      expect(store.state.logs).toEqual([]);
      expect(store.state.draft).toEqual({ kakaoName: '홍길동' });
      expect(logged.log.join('\n')).toContain('result=unknown_user');
      expect(allLogged()).not.toContain('9000000099');
    });

    it('answers normally for another Kakao app\'s notification, writes nothing and warns', async () => {
      const store = createStore({ draft: { kakaoName: '홍길동' } });

      await expect(serviceFor(store).receiveUnlink(AUTHORIZATION, validBody({ app_id: '7654321' }))).resolves.toBeUndefined();

      expect(store.state.logs).toEqual([]);
      expect(store.state.draft).toEqual({ kakaoName: '홍길동' });
      expect(store.client.v1AuthIdentity.findUnique).not.toHaveBeenCalled();
      expect(logged.warn.join('\n')).toContain('result=app_mismatch');
      expect(allLogged()).not.toContain('7654321');
    });

    it('looks up Kakao rows only: a member number held by another provider is not the member', async () => {
      const store = createStore({ identity: { provider: 'apple' } });

      await serviceFor(store).receiveUnlink(AUTHORIZATION, validBody());

      expect(store.state.logs).toEqual([]);
    });
  });

  describe('a body that is not Kakao\'s form', () => {
    it.each([
      ['no body', undefined],
      ['a string body', 'user_id=9000000001'],
      ['an array body', [{ app_id: APP_ID, user_id: MEMBER_NUMBER }]],
      ['a missing user_id', { app_id: APP_ID }],
      ['a missing app_id', { user_id: MEMBER_NUMBER }],
      ['a non-numeric user_id', validBody({ user_id: '9000000001; DROP TABLE' })],
      ['a non-numeric app_id', validBody({ app_id: 'abc' })],
      ['a repeated user_id', validBody({ user_id: [MEMBER_NUMBER, '9000000002'] })],
      ['a bracketed user_id object', validBody({ user_id: { $ne: '' } })],
      ['a numeric (non-string) user_id', validBody({ user_id: 9000000001 })],
      ['an absurdly long user_id', validBody({ user_id: '9'.repeat(40) })],
    ])('answers 400 for %s after authenticating, and writes nothing', async (_label, body) => {
      const store = createStore({ draft: { kakaoName: '홍길동' } });

      const failure = await serviceFor(store).receiveUnlink(AUTHORIZATION, body).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(BadRequestException);
      expect((failure as BadRequestException).getResponse()).toMatchObject({ code: 'KAKAO_WEBHOOK_INVALID_BODY' });
      expect(store.client.$transaction).not.toHaveBeenCalled();
      expect(store.state.logs).toEqual([]);
      expect(allLogged()).not.toContain('DROP TABLE');
    });
  });

  describe('when processing fails', () => {
    it('answers normally, logs an error, and keeps the member number and key out of every line', async () => {
      const store = createStore({ draft: { kakaoName: '홍길동', appleName: '김애플' } });
      store.state.failNextProgressWrite = true;

      await expect(serviceFor(store).receiveUnlink(AUTHORIZATION, validBody())).resolves.toBeUndefined();

      expect(logged.error).toHaveLength(1);
      expect(logged.error[0]).toContain('Error');
      expect(allLogged()).not.toContain(MEMBER_NUMBER);
      expect(allLogged()).not.toContain(ADMIN_KEY);
    });

    it('rolls the status-change row back together with the draft write', async () => {
      const store = createStore({ draft: { kakaoName: '홍길동', appleName: '김애플' } });
      store.state.failNextProgressWrite = true;

      await serviceFor(store).receiveUnlink(AUTHORIZATION, validBody());

      expect(store.state.logs).toEqual([]);
      expect(store.state.draft).toEqual({ kakaoName: '홍길동', appleName: '김애플' });
    });

    it('also answers normally when the member lookup itself throws', async () => {
      const store = createStore();
      store.client.v1AuthIdentity.findUnique.mockRejectedValueOnce(
        Object.assign(new Error(`Invalid findUnique() invocation: providerUserKey: "${MEMBER_NUMBER}"`), { code: 'P1001' }),
      );

      await expect(serviceFor(store).receiveUnlink(AUTHORIZATION, validBody())).resolves.toBeUndefined();

      expect(logged.error).toHaveLength(1);
      expect(logged.error[0]).toContain('P1001');
      expect(allLogged()).not.toContain(MEMBER_NUMBER);
    });
  });
});

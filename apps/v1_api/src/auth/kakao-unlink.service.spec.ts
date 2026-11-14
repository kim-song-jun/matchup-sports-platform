import { Logger } from '@nestjs/common';
import {
  KAKAO_ADMIN_KEY_ENV,
  KAKAO_UNLINK_URL,
  KakaoUnlinkService,
  toKakaoUnlinkTargets,
} from './kakao-unlink.service';

// Invented values: the member numbers and the key never match a real Kakao account or app.
const ADMIN_KEY = 'unit-test-admin-key-5f3a';
const MEMBER_A = '9000000001';
const MEMBER_B = '9000000002';
const USER = 'user-1';

const kakaoRow = (id: string, providerUserKey: string, status = 'active') => ({ id, providerUserKey, status });

function kakaoReply(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('KakaoUnlinkService', () => {
  const savedEnv = { ...process.env };
  const prisma = {
    v1AuthIdentity: { findMany: jest.fn(), findUnique: jest.fn() },
    v1StatusChangeLog: { create: jest.fn() },
  };
  let fetchSpy: jest.SpyInstance;
  let logged: string[];

  const service = () => new KakaoUnlinkService(prisma as never);
  const failureRecords = () => prisma.v1StatusChangeLog.create.mock.calls.map(([arg]) => arg.data);

  beforeEach(() => {
    jest.resetAllMocks();
    process.env[KAKAO_ADMIN_KEY_ENV] = ADMIN_KEY;
    prisma.v1AuthIdentity.findMany.mockResolvedValue([kakaoRow('identity-a', MEMBER_A)]);
    prisma.v1AuthIdentity.findUnique.mockResolvedValue({ status: 'unlinked' });
    prisma.v1StatusChangeLog.create.mockResolvedValue({});
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => kakaoReply(200, { id: Number(MEMBER_A) }));
    logged = [];
    for (const level of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((message: unknown, ...rest: unknown[]) => {
        logged.push([message, ...rest].map(String).join(' '));
      });
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...savedEnv };
  });

  describe('request', () => {
    it('asks Kakao to unlink each member number once, with the admin key and a form body', async () => {
      prisma.v1AuthIdentity.findMany.mockResolvedValue([kakaoRow('identity-a', MEMBER_A), kakaoRow('identity-b', MEMBER_B, 'unlinked')]);

      await service().unlinkAllForUser(USER, 'withdrawal_request');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const sent = fetchSpy.mock.calls.map(([url, init]) => ({
        url,
        method: init.method,
        authorization: new Headers(init.headers).get('authorization'),
        contentType: new Headers(init.headers).get('content-type'),
        body: String(init.body),
        hasDeadline: init.signal instanceof AbortSignal,
      }));
      expect(sent).toEqual(
        [MEMBER_A, MEMBER_B].map((member) => ({
          url: KAKAO_UNLINK_URL,
          method: 'POST',
          authorization: `KakaoAK ${ADMIN_KEY}`,
          contentType: 'application/x-www-form-urlencoded;charset=utf-8',
          body: `target_id_type=user_id&target_id=${member}`,
          hasDeadline: true,
        })),
      );
    });

    it('reads the user\'s Kakao login rows whatever their status, and never another provider\'s', async () => {
      await service().unlinkAllForUser(USER, 'withdrawal_request');

      expect(prisma.v1AuthIdentity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER, provider: 'kakao' } }),
      );
    });

    it('calls with the targets it is given and does not read the login rows again', async () => {
      await service().unlinkKeys(USER, [{ identityId: 'identity-a', memberNumber: MEMBER_A }], 'account_deleted');

      expect(prisma.v1AuthIdentity.findMany).not.toHaveBeenCalled();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(String(fetchSpy.mock.calls[0][1].body)).toBe(`target_id_type=user_id&target_id=${MEMBER_A}`);
    });

    it('skips keys that are not a Kakao member number, including the placeholder a deleted account leaves', async () => {
      prisma.v1AuthIdentity.findMany.mockResolvedValue([
        kakaoRow('identity-a', MEMBER_A),
        kakaoRow('identity-b', `deleted:${USER}:identity-b`, 'unlinked'),
        kakaoRow('identity-c', 'not-a-number'),
        kakaoRow('identity-d', `${MEMBER_B}&target_id_type=email`),
      ]);

      await service().unlinkAllForUser(USER, 'login_method_removed');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(String(fetchSpy.mock.calls[0][1].body)).toContain(`target_id=${MEMBER_A}`);
    });

    it('sends nothing for a user with no Kakao login', async () => {
      prisma.v1AuthIdentity.findMany.mockResolvedValue([]);

      await service().unlinkAllForUser(USER, 'withdrawal_request');

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(logged.filter((line) => line.includes('Kakao unlink'))).toEqual([]);
    });
  });

  describe('toKakaoUnlinkTargets', () => {
    it('keeps digit-only keys with their login row id and drops everything else', () => {
      expect(
        toKakaoUnlinkTargets([
          { id: 'a', providerUserKey: MEMBER_A },
          { id: 'b', providerUserKey: `deleted:${USER}:b` },
          { id: 'c', providerUserKey: '' },
          { id: 'd', providerUserKey: '12 34' },
        ]),
      ).toEqual([{ identityId: 'a', memberNumber: MEMBER_A }]);
    });
  });

  describe('without the admin key', () => {
    it.each([['unset', undefined], ['blank', '   ']])('sends nothing and warns once for the setting and once per skipped call (%s)', async (_label, value) => {
      if (value === undefined) delete process.env[KAKAO_ADMIN_KEY_ENV];
      else process.env[KAKAO_ADMIN_KEY_ENV] = value;
      const unlink = service();

      await unlink.unlinkAllForUser(USER, 'withdrawal_request');
      await unlink.unlinkAllForUser('user-2', 'login_method_removed');

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(logged.filter((line) => line.includes('Kakao unlink disabled'))).toEqual([
        expect.stringContaining(KAKAO_ADMIN_KEY_ENV),
      ]);
      const skipped = logged.filter((line) => line.includes('skipped_disabled'));
      expect(skipped).toEqual([
        expect.stringContaining(`user=${USER} reason=withdrawal_request`),
        expect.stringContaining('user=user-2 reason=login_method_removed'),
      ]);
      expect(prisma.v1StatusChangeLog.create).not.toHaveBeenCalled();
    });
  });

  describe('Kakao answers', () => {
    it('counts a 200 as done and records nothing', async () => {
      await service().unlinkAllForUser(USER, 'withdrawal_request');

      expect(logged).toEqual([expect.stringContaining(`result=ok`)]);
      expect(failureRecords()).toEqual([]);
    });

    it.each([
      ['-101 not connected to the app', 400, -101],
      ['-103 dormant or missing Kakao account', 400, -103],
    ])('counts %s as already unlinked, not as a failure', async (_label, status, code) => {
      fetchSpy.mockImplementation(async () => kakaoReply(status, { msg: 'no connection to unlink', code }));

      await service().unlinkAllForUser(USER, 'login_method_removed');

      expect(logged).toEqual([expect.stringContaining('result=already_unlinked')]);
      expect(failureRecords()).toEqual([]);
    });

    it.each([
      ['another 4xx code', 400, { msg: 'invalid parameter', code: -2 }, 'status=400 code=-2'],
      ['a rejected admin key', 401, { msg: 'invalid admin key', code: -401 }, 'status=401 code=-401'],
      ['a 4xx with no body', 403, null, 'status=403 code=none'],
    ])('records %s as refused', async (_label, status, body, shown) => {
      fetchSpy.mockImplementation(async () => (body === null ? new Response(null, { status }) : kakaoReply(status, body)));

      await service().unlinkAllForUser(USER, 'login_method_removed');

      expect(logged).toEqual([expect.stringContaining(`result=refused ${shown}`)]);
      expect(failureRecords()).toEqual([
        {
          targetType: 'auth_identity',
          targetId: 'identity-a',
          fromStatus: 'unlinked',
          toStatus: 'provider_unlink_failed',
          actorType: 'system',
          reason: 'login_method_removed:refused',
        },
      ]);
    });

    it.each([
      ['a 5xx', async () => kakaoReply(503, { msg: 'unavailable', code: -9 })],
      ['a network error', async () => { throw new TypeError('fetch failed'); }],
      ['a timeout', async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); }],
    ])('ends without throwing and records %s as failed', async (_label, reply) => {
      fetchSpy.mockImplementation(reply);

      await expect(service().unlinkAllForUser(USER, 'withdrawal_request')).resolves.toBeUndefined();

      expect(logged).toEqual([expect.stringContaining('result=failed')]);
      expect(failureRecords()).toEqual([
        expect.objectContaining({ targetId: 'identity-a', toStatus: 'provider_unlink_failed', reason: 'withdrawal_request:failed' }),
      ]);
    });

    it('goes on to the next member number after one fails, and records only the failed one', async () => {
      prisma.v1AuthIdentity.findMany.mockResolvedValue([kakaoRow('identity-a', MEMBER_A), kakaoRow('identity-b', MEMBER_B)]);
      fetchSpy.mockImplementationOnce(async () => kakaoReply(500)).mockImplementationOnce(async () => kakaoReply(200, {}));

      await service().unlinkAllForUser(USER, 'withdrawal_request');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(failureRecords().map((record) => record.targetId)).toEqual(['identity-a']);
    });

    it('records the failure for the login row id it was given when the row is already tombstoned', async () => {
      fetchSpy.mockImplementation(async () => kakaoReply(500));

      await service().unlinkKeys(USER, [{ identityId: 'identity-z', memberNumber: MEMBER_A }], 'account_deleted');

      expect(prisma.v1AuthIdentity.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'identity-z' } }));
      expect(failureRecords()).toEqual([
        expect.objectContaining({ targetId: 'identity-z', fromStatus: 'unlinked', reason: 'account_deleted:failed' }),
      ]);
    });
  });

  describe('never throws', () => {
    it('ends quietly when reading the login rows is rejected', async () => {
      prisma.v1AuthIdentity.findMany.mockRejectedValue(new Error('connection terminated'));

      await expect(service().unlinkAllForUser(USER, 'withdrawal_request')).resolves.toBeUndefined();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(logged).toEqual([expect.stringContaining(`user=${USER} reason=withdrawal_request`)]);
    });

    it('ends quietly when the failure record cannot be written, and still logs the Kakao outcome', async () => {
      fetchSpy.mockImplementation(async () => kakaoReply(500));
      prisma.v1StatusChangeLog.create.mockRejectedValue(new Error('disk full'));

      await expect(service().unlinkAllForUser(USER, 'withdrawal_request')).resolves.toBeUndefined();

      expect(logged.some((line) => line.includes('result=failed'))).toBe(true);
      expect(logged.some((line) => line.includes('could not be recorded'))).toBe(true);
    });

    it('ends quietly when the login row behind a failure cannot be read', async () => {
      fetchSpy.mockImplementation(async () => kakaoReply(500));
      prisma.v1AuthIdentity.findUnique.mockRejectedValue(new Error('connection terminated'));

      await expect(service().unlinkAllForUser(USER, 'withdrawal_request')).resolves.toBeUndefined();

      expect(prisma.v1StatusChangeLog.create).not.toHaveBeenCalled();
      expect(logged.some((line) => line.includes('could not be recorded'))).toBe(true);
    });
  });

  describe('what the logs and records may contain', () => {
    it.each([
      ['ok', async () => kakaoReply(200, { id: Number(MEMBER_A) })],
      ['already unlinked', async () => kakaoReply(400, { msg: `${MEMBER_A} is not linked`, code: -101 })],
      ['refused', async () => kakaoReply(401, { msg: `KakaoAK ${ADMIN_KEY} rejected for ${MEMBER_A}`, code: -401 })],
      ['failed 5xx', async () => kakaoReply(500, { msg: `target ${MEMBER_A}` })],
      ['network error', async () => { throw new TypeError(`fetch failed for target_id=${MEMBER_A} using KakaoAK ${ADMIN_KEY}`); }],
    ])('carries neither the member number nor the key: %s', async (_label, reply) => {
      fetchSpy.mockImplementation(reply);

      await service().unlinkAllForUser(USER, 'withdrawal_request');

      const everything = JSON.stringify([logged, failureRecords()]);
      expect(everything).not.toContain(MEMBER_A);
      expect(everything).not.toContain(ADMIN_KEY);
      expect(everything).not.toContain('KakaoAK');
    });

    it('carries neither when a database error quotes them', async () => {
      prisma.v1AuthIdentity.findMany.mockRejectedValue(new Error(`bad row ${MEMBER_A} ${ADMIN_KEY}`));
      await service().unlinkAllForUser(USER, 'withdrawal_request');

      fetchSpy.mockImplementation(async () => kakaoReply(500));
      prisma.v1AuthIdentity.findMany.mockResolvedValue([kakaoRow('identity-a', MEMBER_A)]);
      prisma.v1StatusChangeLog.create.mockRejectedValue(new Error(`cannot store ${MEMBER_A} ${ADMIN_KEY}`));
      await service().unlinkAllForUser(USER, 'withdrawal_request');

      const everything = JSON.stringify(logged);
      expect(everything).not.toContain(MEMBER_A);
      expect(everything).not.toContain(ADMIN_KEY);
    });
  });
});

import { Logger } from '@nestjs/common';
import { createSign, generateKeyPairSync, KeyObject, randomBytes, verify as verifySignature } from 'node:crypto';
import type { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { APPLE_ISSUER } from './apple-identity-token';
import { APPLE_AUDIENCES_VARIABLE, AppleIdentityService } from './apple-identity.service';
import { openAppleToken, sealAppleToken } from './apple-token-cipher';
import { APPLE_REVOKE_URL, APPLE_TOKEN_ENV, APPLE_TOKEN_URL, AppleTokenService } from './apple-token.service';

describe('AppleTokenService', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  const encryptionKey = randomBytes(32);
  const CLIENT_ID = 'kr.co.teameet.alpha';
  const SUBJECT = '001234.abc';

  // Apple's id_token signing key, as in apple-identity-token.spec.ts.
  const appleSigning = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const impostor = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const APPLE_KID = 'apple-key-1';
  const appleJwk = appleSigning.publicKey.export({ format: 'jwk' }) as { kty: string; n: string; e: string };

  /** The real verifier; only Apple's key endpoint is replaced. */
  class KeyedAppleIdentityService extends AppleIdentityService {
    protected override fetchKeys(): Promise<Response> {
      return Promise.resolve(new Response(JSON.stringify({
        keys: [{ kid: APPLE_KID, kty: appleJwk.kty, n: appleJwk.n, e: appleJwk.e, alg: 'RS256', use: 'sig' }],
      })));
    }
  }

  function appleIdToken(payload: Record<string, unknown> = {}, key: KeyObject = appleSigning.privateKey) {
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const body = `${encode({ alg: 'RS256', kid: APPLE_KID })}.${encode({
      iss: APPLE_ISSUER, aud: CLIENT_ID, sub: SUBJECT, iat: now - 5, exp: now + 600, ...payload,
    })}`;
    return `${body}.${createSign('RSA-SHA256').update(body).sign(key).toString('base64url')}`;
  }

  let prisma: {
    v1AuthIdentity: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
  };
  let fetchSpy: jest.SpyInstance;
  const savedEnv = { ...process.env };

  function configure() {
    process.env[APPLE_TOKEN_ENV.keyId] = 'ABC123DEFG';
    process.env[APPLE_TOKEN_ENV.teamId] = 'TEAM123456';
    // Deployment passes the PEM as one line with literal `\n`.
    process.env[APPLE_TOKEN_ENV.privateKey] = privateKeyPem.replace(/\n/g, '\\n');
    process.env[APPLE_TOKEN_ENV.encryptionKey] = encryptionKey.toString('base64');
  }

  function service() {
    const pino = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
    return new AppleTokenService(
      prisma as unknown as PrismaService,
      new KeyedAppleIdentityService(pino as unknown as PinoLogger),
    );
  }

  function jsonResponse(status: number, body: unknown) {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }

  function sentRequest(callIndex = 0) {
    const [url, init] = fetchSpy.mock.calls[callIndex] as [string, RequestInit];
    return { url, init, form: new URLSearchParams(init.body as string) };
  }

  /** Decodes the client secret and checks it against the public half of the key it claims. */
  function readClientSecret(jwt: string) {
    const [header, claims, signature] = jwt.split('.');
    const signatureValid = verifySignature(
      'sha256',
      Buffer.from(`${header}.${claims}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature, 'base64url'),
    );
    return {
      header: JSON.parse(Buffer.from(header, 'base64url').toString('utf8')),
      claims: JSON.parse(Buffer.from(claims, 'base64url').toString('utf8')),
      signatureValid,
    };
  }

  beforeEach(() => {
    for (const name of Object.values(APPLE_TOKEN_ENV)) delete process.env[name];
    process.env[APPLE_AUDIENCES_VARIABLE] = CLIENT_ID;
    prisma = {
      v1AuthIdentity: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    };
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...savedEnv };
  });

  describe('without the Sign in with Apple key', () => {
    it('stores nothing, calls nobody, and says so once', async () => {
      const apple = service();

      await apple.storeFromAuthorizationCode({ subject: 's', clientId: CLIENT_ID, authorizationCode: 'code-123456' });
      await apple.storeFromAuthorizationCode({ subject: 's', clientId: CLIENT_ID, authorizationCode: 'code-123456' });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(prisma.v1AuthIdentity.update).not.toHaveBeenCalled();
      expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
      expect((Logger.prototype.warn as jest.Mock).mock.calls[0][0]).toContain(APPLE_TOKEN_ENV.privateKey);
    });

    it('treats a key that is not 32 bytes as unconfigured rather than failing later', async () => {
      configure();
      process.env[APPLE_TOKEN_ENV.encryptionKey] = randomBytes(16).toString('base64');

      await service().storeFromAuthorizationCode({ subject: 's', clientId: CLIENT_ID, authorizationCode: 'code-123456' });

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('keeps a stored token for a later attempt when revoke cannot be signed', async () => {
      prisma.v1AuthIdentity.findMany.mockResolvedValue([
        { id: 'identity-1', providerRefreshTokenCiphertext: 'v1.a.b.c' },
      ]);

      await expect(service().revokeForUser('user-1')).resolves.toBeUndefined();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(prisma.v1AuthIdentity.update).not.toHaveBeenCalled();
      expect(Logger.prototype.error).toHaveBeenCalled();
    });
  });

  describe('code exchange at sign-in', () => {
    beforeEach(() => {
      configure();
      prisma.v1AuthIdentity.findUnique.mockResolvedValue({ id: 'identity-1' });
    });

    it('posts the code to Apple with a signed client secret and seals the refresh token', async () => {
      fetchSpy.mockResolvedValue(jsonResponse(200, {
        refresh_token: 'r.apple.token', access_token: 'a', id_token: appleIdToken(),
      }));

      await service().storeFromAuthorizationCode({
        subject: SUBJECT,
        clientId: CLIENT_ID,
        authorizationCode: 'code-123456',
      });

      const { url, init, form } = sentRequest();
      expect(url).toBe(APPLE_TOKEN_URL);
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['content-type']).toBe('application/x-www-form-urlencoded');
      expect(form.get('client_id')).toBe(CLIENT_ID);
      expect(form.get('code')).toBe('code-123456');
      expect(form.get('grant_type')).toBe('authorization_code');

      const secret = readClientSecret(form.get('client_secret') as string);
      expect(secret.signatureValid).toBe(true);
      expect(secret.header).toEqual({ alg: 'ES256', kid: 'ABC123DEFG' });
      expect(secret.claims).toMatchObject({ iss: 'TEAM123456', aud: 'https://appleid.apple.com', sub: CLIENT_ID });
      expect(secret.claims.exp - secret.claims.iat).toBe(300);

      expect(prisma.v1AuthIdentity.findUnique).toHaveBeenCalledWith(expect.objectContaining({
        where: { provider_providerUserKey: { provider: 'apple', providerUserKey: SUBJECT } },
      }));
      const [{ where, data }] = prisma.v1AuthIdentity.update.mock.calls[0];
      expect(where).toEqual({ id: 'identity-1' });
      expect(data.providerRefreshTokenCiphertext).not.toContain('r.apple.token');
      expect(openAppleToken(encryptionKey, 'identity-1', data.providerRefreshTokenCiphertext)).toEqual({
        clientId: CLIENT_ID,
        refreshToken: 'r.apple.token',
      });
    });

    /**
     * The code and the identity token come in one request but are independent values: a code
     * from another Apple account must not put that account's token on this row, or this
     * user's withdrawal would revoke the other person's Teameet link.
     */
    it.each([
      ['a different Apple account', () => appleIdToken({ sub: '009999.other' })],
      ['a different app', () => appleIdToken({ aud: 'kr.co.teameet' })],
      ['a forged id_token', () => appleIdToken({}, impostor.privateKey)],
      ['no id_token', () => undefined],
    ])('stores nothing when the exchanged token belongs to %s', async (_label, idToken) => {
      process.env[APPLE_AUDIENCES_VARIABLE] = `${CLIENT_ID},kr.co.teameet`;
      fetchSpy.mockResolvedValue(jsonResponse(200, { refresh_token: 'r.other', id_token: idToken() }));

      await expect(service().storeFromAuthorizationCode({
        subject: SUBJECT, clientId: CLIENT_ID, authorizationCode: 'code-123456',
      })).resolves.toBeUndefined();

      expect(prisma.v1AuthIdentity.update).not.toHaveBeenCalled();
      expect((Logger.prototype.error as jest.Mock).mock.calls[0][0]).toContain('not stored');
    });

    it('stores nothing when Apple refuses the code, and does not throw', async () => {
      fetchSpy.mockResolvedValue(jsonResponse(400, { error: 'invalid_grant' }));

      await expect(service().storeFromAuthorizationCode({
        subject: SUBJECT, clientId: CLIENT_ID, authorizationCode: 'code-123456',
      })).resolves.toBeUndefined();

      expect(prisma.v1AuthIdentity.update).not.toHaveBeenCalled();
      expect((Logger.prototype.error as jest.Mock).mock.calls[0][0]).toContain('invalid_grant');
    });

    it('does not throw when Apple is unreachable', async () => {
      fetchSpy.mockRejectedValue(new TypeError('fetch failed'));

      await expect(service().storeFromAuthorizationCode({
        subject: SUBJECT, clientId: CLIENT_ID, authorizationCode: 'code-123456',
      })).resolves.toBeUndefined();

      expect(prisma.v1AuthIdentity.update).not.toHaveBeenCalled();
      expect(Logger.prototype.error).toHaveBeenCalled();
    });
  });

  describe('revoke at withdrawal', () => {
    beforeEach(() => configure());

    function storedFor(identityId: string, clientId = CLIENT_ID) {
      return {
        id: identityId,
        providerRefreshTokenCiphertext: sealAppleToken(encryptionKey, identityId, {
          clientId,
          refreshToken: `refresh-of-${identityId}`,
        }),
      };
    }

    it('revokes the stored refresh token under the client id it was issued to, then clears it', async () => {
      prisma.v1AuthIdentity.findMany.mockResolvedValue([storedFor('identity-1', 'kr.co.teameet')]);
      fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));

      await service().revokeForUser('user-1');

      expect(prisma.v1AuthIdentity.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: 'user-1', provider: 'apple', providerRefreshTokenCiphertext: { not: null } },
      }));
      const { url, init, form } = sentRequest();
      expect(url).toBe(APPLE_REVOKE_URL);
      expect(init.method).toBe('POST');
      expect(form.get('client_id')).toBe('kr.co.teameet');
      expect(form.get('token')).toBe('refresh-of-identity-1');
      expect(form.get('token_type_hint')).toBe('refresh_token');
      const secret = readClientSecret(form.get('client_secret') as string);
      expect(secret.signatureValid).toBe(true);
      expect(secret.claims.sub).toBe('kr.co.teameet');

      expect(prisma.v1AuthIdentity.update).toHaveBeenCalledWith({
        where: { id: 'identity-1' },
        data: { providerRefreshTokenCiphertext: null },
      });
    });

    it('keeps the token and reports it when Apple refuses the revoke, without throwing', async () => {
      prisma.v1AuthIdentity.findMany.mockResolvedValue([storedFor('identity-1')]);
      fetchSpy.mockResolvedValue(jsonResponse(400, { error: 'invalid_client' }));

      await expect(service().revokeForUser('user-1')).resolves.toBeUndefined();

      expect(prisma.v1AuthIdentity.update).not.toHaveBeenCalled();
      expect((Logger.prototype.error as jest.Mock).mock.calls[0][0]).toContain('invalid_client');
    });

    it('refuses a ciphertext copied from another identity row instead of revoking with it', async () => {
      const foreign = storedFor('identity-other');
      prisma.v1AuthIdentity.findMany.mockResolvedValue([
        { id: 'identity-1', providerRefreshTokenCiphertext: foreign.providerRefreshTokenCiphertext },
      ]);

      await service().revokeForUser('user-1');

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(prisma.v1AuthIdentity.update).not.toHaveBeenCalled();
    });

    it('does nothing for a user who never signed in with Apple', async () => {
      prisma.v1AuthIdentity.findMany.mockResolvedValue([]);

      await service().revokeForUser('user-1');

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});

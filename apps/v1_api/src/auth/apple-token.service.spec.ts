import { Logger } from '@nestjs/common';
import { generateKeyPairSync, randomBytes, verify as verifySignature } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { openAppleToken, sealAppleToken } from './apple-token-cipher';
import { APPLE_REVOKE_URL, APPLE_TOKEN_ENV, APPLE_TOKEN_URL, AppleTokenService } from './apple-token.service';

describe('AppleTokenService', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  const encryptionKey = randomBytes(32);
  const CLIENT_ID = 'kr.co.teameet.alpha';

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
    return new AppleTokenService(prisma as unknown as PrismaService);
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
      fetchSpy.mockResolvedValue(jsonResponse(200, { refresh_token: 'r.apple.token', access_token: 'a' }));

      await service().storeFromAuthorizationCode({
        subject: '001234.abc',
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
      expect(secret.claims.exp - secret.claims.iat).toBeGreaterThan(0);
      expect(secret.claims.exp - secret.claims.iat).toBeLessThanOrEqual(15_777_000);

      expect(prisma.v1AuthIdentity.findUnique).toHaveBeenCalledWith(expect.objectContaining({
        where: { provider_providerUserKey: { provider: 'apple', providerUserKey: '001234.abc' } },
      }));
      const [{ where, data }] = prisma.v1AuthIdentity.update.mock.calls[0];
      expect(where).toEqual({ id: 'identity-1' });
      expect(data.providerRefreshTokenCiphertext).not.toContain('r.apple.token');
      expect(openAppleToken(encryptionKey, 'identity-1', data.providerRefreshTokenCiphertext)).toEqual({
        clientId: CLIENT_ID,
        refreshToken: 'r.apple.token',
      });
    });

    it('stores nothing when Apple refuses the code, and does not throw', async () => {
      fetchSpy.mockResolvedValue(jsonResponse(400, { error: 'invalid_grant' }));

      await expect(service().storeFromAuthorizationCode({
        subject: '001234.abc', clientId: CLIENT_ID, authorizationCode: 'code-123456',
      })).resolves.toBeUndefined();

      expect(prisma.v1AuthIdentity.update).not.toHaveBeenCalled();
      expect((Logger.prototype.error as jest.Mock).mock.calls[0][0]).toContain('invalid_grant');
    });

    it('does not throw when Apple is unreachable', async () => {
      fetchSpy.mockRejectedValue(new TypeError('fetch failed'));

      await expect(service().storeFromAuthorizationCode({
        subject: '001234.abc', clientId: CLIENT_ID, authorizationCode: 'code-123456',
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

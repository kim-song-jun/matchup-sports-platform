import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { getLoggerToken } from 'nestjs-pino';

import { AppleIdentityService, APPLE_AUDIENCES_VARIABLE } from './apple-identity.service';
import { APPLE_ISSUER, hashAppleNonce, type AppleJsonWebKey } from './apple-identity-token';

/**
 * The key cache, and the wiring around it.
 *
 * The pure verification has detailed cases in `apple-identity-token.spec.ts`. These cases
 * exercise the service with the real verifier: concurrency, rotation and Apple outages.
 */

const logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };

/** Placeholder keys for the sequential fetch-count cases, which use malformed tokens. */
const keysBody = { keys: [{ kid: 'k1', n: 'AQAB', e: 'AQAB', kty: 'RSA', alg: 'RS256' }] };

const okResponse = () => ({ ok: true, status: 200, json: async () => keysBody }) as unknown as Response;
const failedResponse = () => ({ ok: false, status: 503, json: async () => ({}) }) as unknown as Response;

/** Exposes the two seams the production class keeps to itself, and counts the calls. */
class TestableAppleIdentityService extends AppleIdentityService {
  clock = 1_000_000;
  fetches = 0;
  respond: () => Response | Promise<Response> = okResponse;

  protected override now(): number {
    return this.clock;
  }

  protected override fetchKeys(): Promise<Response> {
    this.fetches += 1;
    return Promise.resolve(this.respond());
  }

  /**
   * The sequential fetch-count cases deliberately use a rejected token.
   *
   * The nonce has to be a real one — the service checks it before it looks at any key, so a
   * made-up string would return without ever reaching the cache and every count would be
   * zero. It is issued fresh each time because the clock moves between calls and a nonce
   * lives five minutes.
   */
  async attemptSignIn(): Promise<void> {
    const { nonce } = this.issueNonce();
    await expect(this.verifyIdentityToken('not.a.token', nonce)).rejects.toThrow();
  }
}

const build = async () => {
  const module = await Test.createTestingModule({
    providers: [
      TestableAppleIdentityService,
      { provide: getLoggerToken(AppleIdentityService.name), useValue: logger },
      { provide: getLoggerToken(TestableAppleIdentityService.name), useValue: logger },
    ],
  }).compile();
  return module.get(TestableAppleIdentityService);
};

const signingKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
const impostorKey = generateKeyPairSync('rsa', { modulusLength: 2048 });

function signedRequest(
  service: TestableAppleIdentityService,
  subject: string,
  options: { kid?: string; key?: KeyObject; payload?: Record<string, unknown> } = {},
) {
  const { nonce } = service.issueNonce();
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = `${encode({ alg: 'RS256', kid: options.kid ?? 'k1' })}.${encode({
    iss: APPLE_ISSUER,
    aud: 'kr.co.teameet',
    sub: subject,
    iat: Math.floor(service.clock / 1000),
    exp: Math.floor(service.clock / 1000) + 600,
    nonce: hashAppleNonce(nonce),
    ...options.payload,
  })}`;
  const signature = createSign('RSA-SHA256').update(body)
    .sign(options.key ?? signingKey.privateKey).toString('base64url');
  return { token: `${body}.${signature}`, nonce };
}

function signingResponse(kid = 'k1'): Response {
  const publicJwk = signingKey.publicKey.export({ format: 'jwk' });
  const key: AppleJsonWebKey = {
    kid, kty: 'RSA', n: publicJwk.n!, e: publicJwk.e!, alg: 'RS256', use: 'sig',
  };
  return { ok: true, status: 200, json: async () => ({ keys: [key] }) } as Response;
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((release) => { resolve = release; });
  return { promise, resolve };
}

const drainRequests = () => new Promise<void>((resolve) => setImmediate(resolve));

function verifyRequest(service: TestableAppleIdentityService, request: ReturnType<typeof signedRequest>) {
  return service.verifyIdentityToken(request.token, request.nonce);
}

function expectUnauthorized(result: PromiseSettledResult<unknown>) {
  expect(result.status).toBe('rejected');
  if (result.status === 'rejected') {
    expect(result.reason.getStatus()).toBe(401);
    expect(result.reason.getResponse()).toEqual({
      code: 'APPLE_SIGN_IN_FAILED',
      message: 'Apple 로그인에 실패했어요. 다시 시도해 주세요.',
    });
  }
}

describe('AppleIdentityService', () => {
  const originalAudiences = process.env[APPLE_AUDIENCES_VARIABLE];
  const originalSecret = process.env.V1_SESSION_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env[APPLE_AUDIENCES_VARIABLE] = 'kr.co.teameet';
    process.env.V1_SESSION_SECRET = 'a'.repeat(48);
  });

  afterAll(() => {
    if (originalAudiences === undefined) delete process.env[APPLE_AUDIENCES_VARIABLE];
    else process.env[APPLE_AUDIENCES_VARIABLE] = originalAudiences;
    if (originalSecret === undefined) delete process.env.V1_SESSION_SECRET;
    else process.env.V1_SESSION_SECRET = originalSecret;
  });

  // The constructor once took the clock and the fetcher as parameters. Nest emits `() =>
  // number` as `Function`, looks for a provider by that name and refuses to build the
  // module — every integration suite failed at `AppModule`, while the unit specs passed
  // because they all substitute a double for this service. Building it through Nest here is
  // what makes that a caught regression rather than a red CI.
  it('builds through Nest dependency injection', async () => {
    await expect(build()).resolves.toBeInstanceOf(AppleIdentityService);
  });

  it('fetches Apple keys once and serves later sign-ins from the cache', async () => {
    const service = await build();

    await service.attemptSignIn();
    await service.attemptSignIn();
    await service.attemptSignIn();

    expect(service.fetches).toBe(1);
  });

  // The regression this guards: with the floor measured from the last *success*, a failed
  // fetch left the cache empty, every later sign-in still found it stale, and each one sent
  // its own request — an outage at Apple became a request per sign-in from us.
  it('does not refetch inside the floor while Apple is unreachable', async () => {
    const service = await build();
    service.respond = failedResponse;

    await service.attemptSignIn();
    service.clock += 1_000;
    await service.attemptSignIn();
    service.clock += 30_000;
    await service.attemptSignIn();

    expect(service.fetches).toBe(1);
  });

  it('tries again once the floor has passed', async () => {
    const service = await build();
    service.respond = failedResponse;

    await service.attemptSignIn();
    service.clock += 61_000;
    await service.attemptSignIn();

    expect(service.fetches).toBe(2);
  });

  it('refetches when the cached keys are older than their maximum age', async () => {
    const service = await build();

    await service.attemptSignIn();
    service.clock += 13 * 60 * 60 * 1000;
    await service.attemptSignIn();

    expect(service.fetches).toBe(2);
  });

  it.each(['sign-in', 'token-exchange'] as const)(
    'shares a pending cold-cache fetch with a concurrent valid %s', async (entry) => {
      const service = await build();
      const gate = deferredResponse();
      service.respond = () => gate.promise;
      const first = signedRequest(service, 'synthetic-first');
      const second = signedRequest(service, 'synthetic-second');
      const results = Promise.allSettled([
        verifyRequest(service, first),
        entry === 'sign-in'
          ? verifyRequest(service, second)
          : service.verifyExchangedIdToken(second.token),
      ]);
      // Observe the concurrent request before releasing JWKS: releasing immediately could
      // populate the cache before the broken unknown-key retry and hide the regression.
      await drainRequests();
      const fetchesWhilePending = service.fetches;
      gate.resolve(signingResponse());
      const [firstResult, secondResult] = await results;

      expect(fetchesWhilePending).toBe(1);
      expect(firstResult).toMatchObject({ status: 'fulfilled', value: { subject: 'synthetic-first' } });
      expect(secondResult).toMatchObject({
        status: 'fulfilled',
        value: entry === 'sign-in'
          ? { subject: 'synthetic-second' }
          : { ok: true, claims: { subject: 'synthetic-second' } },
      });
      await expect(verifyRequest(service, signedRequest(service, 'synthetic-cached')))
        .resolves.toMatchObject({ subject: 'synthetic-cached' });
      expect(service.fetches).toBe(1);
    },
  );

  it('shares a rotated-key refresh while known cached keys remain immediately usable', async () => {
    const service = await build();
    service.respond = () => signingResponse();
    await verifyRequest(service, signedRequest(service, 'synthetic-warm'));
    service.clock += 61_000;
    const gate = deferredResponse();
    service.respond = () => gate.promise;
    let cachedFinished = false;
    const results = Promise.allSettled([
      verifyRequest(service, signedRequest(service, 'synthetic-rotated-first', { kid: 'k2' })),
      verifyRequest(service, signedRequest(service, 'synthetic-rotated-second', { kid: 'k2' })),
      verifyRequest(service, signedRequest(service, 'synthetic-cached')).then((claims) => {
        cachedFinished = true;
        return claims;
      }),
    ]);
    await drainRequests();
    const cachedFinishedWhilePending = cachedFinished;
    gate.resolve(signingResponse('k2'));
    const [first, second, cached] = await results;

    expect(cachedFinishedWhilePending).toBe(true);
    expect(first).toMatchObject({ status: 'fulfilled', value: { subject: 'synthetic-rotated-first' } });
    expect(second).toMatchObject({ status: 'fulfilled', value: { subject: 'synthetic-rotated-second' } });
    expect(cached).toMatchObject({ status: 'fulfilled', value: { subject: 'synthetic-cached' } });
    expect(service.fetches).toBe(2);
  });

  it('shares a refresh after the cached keys expire', async () => {
    const service = await build();
    service.respond = () => signingResponse();
    await verifyRequest(service, signedRequest(service, 'synthetic-warm'));
    service.clock += 13 * 60 * 60 * 1000;
    const gate = deferredResponse();
    service.respond = () => gate.promise;
    let secondFinished = false;
    const results = Promise.allSettled([
      verifyRequest(service, signedRequest(service, 'synthetic-stale-first')),
      verifyRequest(service, signedRequest(service, 'synthetic-stale-second')).then((claims) => {
        secondFinished = true;
        return claims;
      }),
    ]);
    await drainRequests();
    const secondFinishedWhilePending = secondFinished;
    gate.resolve(signingResponse());
    const outcomes = await results;

    expect(secondFinishedWhilePending).toBe(false);
    expect(outcomes.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(service.fetches).toBe(2);
  });

  it('fails closed for a failed shared fetch, keeps the attempt floor, and recovers after it', async () => {
    const service = await build();
    const gate = deferredResponse();
    service.respond = () => gate.promise;
    const results = Promise.allSettled([
      verifyRequest(service, signedRequest(service, 'synthetic-first')),
      verifyRequest(service, signedRequest(service, 'synthetic-second')),
    ]);
    await drainRequests();
    gate.resolve(failedResponse());
    (await results).forEach(expectUnauthorized);
    const [insideFloor] = await Promise.allSettled([
      verifyRequest(service, signedRequest(service, 'synthetic-inside-floor')),
    ]);
    expectUnauthorized(insideFloor);
    expect(service.fetches).toBe(1);

    service.clock += 61_000;
    service.respond = () => signingResponse();
    await expect(verifyRequest(service, signedRequest(service, 'synthetic-recovered')))
      .resolves.toMatchObject({ subject: 'synthetic-recovered' });
    expect(service.fetches).toBe(2);
  });

  it.each([
    { reason: 'bad_signature', options: { key: impostorKey.privateKey } },
    { reason: 'wrong_audience', options: { payload: { aud: 'different.app' } } },
    { reason: 'nonce_mismatch', options: { payload: { nonce: hashAppleNonce('different-sign-in') } } },
    { reason: 'unknown_key', options: { kid: 'unpublished-key' } },
  ])('rejects $reason even when sharing a fetch with a valid sign-in', async ({ reason, options }) => {
    const service = await build();
    const gate = deferredResponse();
    service.respond = () => gate.promise;
    const results = Promise.allSettled([
      verifyRequest(service, signedRequest(service, 'synthetic-valid')),
      verifyRequest(service, signedRequest(service, 'synthetic-invalid', options)),
    ]);
    await drainRequests();
    gate.resolve(signingResponse());
    const [valid, invalid] = await results;

    expect(valid).toMatchObject({ status: 'fulfilled', value: { subject: 'synthetic-valid' } });
    expectUnauthorized(invalid);
    expect(logger.warn).toHaveBeenCalledWith({ reason }, 'Apple identity token refused');
    expect(service.fetches).toBe(1);
  });

  it('continues verifying cached valid keys when the refresh fails', async () => {
    const service = await build();
    service.respond = () => signingResponse();
    await verifyRequest(service, signedRequest(service, 'synthetic-warm'));
    service.clock += 13 * 60 * 60 * 1000;
    service.respond = failedResponse;

    await expect(verifyRequest(service, signedRequest(service, 'synthetic-outage')))
      .resolves.toMatchObject({ subject: 'synthetic-outage' });
    expect(service.fetches).toBe(2);
  });
});

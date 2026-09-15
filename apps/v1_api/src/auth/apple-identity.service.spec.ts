import { Test } from '@nestjs/testing';
import { getLoggerToken } from 'nestjs-pino';

import { AppleIdentityService, APPLE_AUDIENCES_VARIABLE } from './apple-identity.service';

/**
 * The key cache, and the wiring around it.
 *
 * The pure verification lives in `apple-identity-token.spec.ts`; what is left here is the
 * part that talks to Apple — how often, and what it does when Apple does not answer.
 */

const logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };

/** Whatever the JWKS body is, the token check fails — this spec only counts the fetches. */
const keysBody = { keys: [{ kid: 'k1', n: 'AQAB', e: 'AQAB', kty: 'RSA', alg: 'RS256' }] };

const okResponse = () => ({ ok: true, status: 200, json: async () => keysBody }) as unknown as Response;
const failedResponse = () => ({ ok: false, status: 503, json: async () => ({}) }) as unknown as Response;

/** Exposes the two seams the production class keeps to itself, and counts the calls. */
class TestableAppleIdentityService extends AppleIdentityService {
  clock = 1_000_000;
  fetches = 0;
  respond: () => Response = okResponse;

  protected override now(): number {
    return this.clock;
  }

  protected override fetchKeys(): Promise<Response> {
    this.fetches += 1;
    return Promise.resolve(this.respond());
  }

  /**
   * `verifyIdentityToken` is the only public way in, and every token here is rejected.
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
});

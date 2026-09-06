import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  isUsableAppleNonceSecret,
  issueAppleNonce,
  verifyAppleNonce,
} from './apple-nonce';
import {
  verifyAppleIdentityToken,
  type AppleIdentityClaims,
  type AppleJsonWebKey,
} from './apple-identity-token';

/**
 * Everything Sign in with Apple needs that is not about our own accounts: configuration,
 * Apple's signing keys, and turning an identity token into claims we are willing to act on.
 *
 * The account side stays in `AuthService`, which already owns how a user and an auth
 * identity are created — this service is deliberately ignorant of both.
 */

export const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';

/**
 * Bundle identifiers this deployment accepts as the token's audience, comma separated.
 *
 * Not a secret — a bundle id is printed in the App Store — so it is set as a literal in the
 * compose files rather than synced like a key. Unset means Apple sign-in is off, which is
 * how a deployment that has not registered the capability yet behaves.
 */
export const APPLE_AUDIENCES_VARIABLE = 'APPLE_SIGN_IN_AUDIENCES';

/**
 * Apple rotates keys; a `kid` we have never seen means refetch, not reject.
 *
 * The floor is measured from the last **attempt**, not the last success. Measured from
 * success it would not apply at all while Apple is unreachable: the cache stays empty (or
 * stays past its age), every sign-in finds it stale, and each one sends its own request —
 * turning an outage on Apple's side into a request per sign-in from ours, which is how a
 * rate limit gets added to the outage.
 */
const KEY_REFETCH_FLOOR_MS = 60_000;
const KEY_MAX_AGE_MS = 12 * 60 * 60 * 1000;

type AppleKeysResponse = { keys?: unknown };

@Injectable()
export class AppleIdentityService {
  private keys: readonly AppleJsonWebKey[] = [];
  private keysFetchedAtMs = 0;
  /** Set whether the fetch worked or not — see `KEY_REFETCH_FLOOR_MS`. */
  private keysAttemptedAtMs = 0;
  private inFlight: Promise<readonly AppleJsonWebKey[]> | null = null;

  constructor(
    @InjectPinoLogger(AppleIdentityService.name) private readonly logger: PinoLogger,
  ) {}

  // The clock and the call to Apple are overridable methods rather than constructor
  // parameters. Nest reads the constructor's emitted parameter types to inject it, and a
  // `() => number` is emitted as `Function` — it looks for a provider called `Function`,
  // finds none, and refuses to build the module. A default value does not help; nothing
  // asks for one. It cost the whole integration suite (188 tests) to learn, because the
  // unit specs all supply their own double for this service and never build it through Nest.

  /** Overridden in tests. */
  protected now(): number {
    return Date.now();
  }

  /** Overridden in tests. */
  protected fetchKeys(url: string): Promise<Response> {
    return fetch(url);
  }

  private get audiences(): readonly string[] {
    return (process.env[APPLE_AUDIENCES_VARIABLE] ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  private get secret(): string | null {
    const secret = process.env.V1_SESSION_SECRET;
    return isUsableAppleNonceSecret(secret) ? secret : null;
  }

  /**
   * Both halves have to be present. Audiences without a secret would mint nonces nobody can
   * trust; a secret without audiences would accept a token minted for any app.
   */
  get isConfigured(): boolean {
    return this.audiences.length > 0 && this.secret !== null;
  }

  private requireConfigured(): string {
    const secret = this.secret;
    if (this.audiences.length === 0 || secret === null) {
      throw new ServiceUnavailableException({
        code: 'APPLE_SIGN_IN_NOT_CONFIGURED',
        message: 'Apple 로그인이 준비되지 않았어요.',
      });
    }
    return secret;
  }

  /** The value the app hashes into its Apple request. See `apple-nonce.ts`. */
  issueNonce(): { nonce: string } {
    return { nonce: issueAppleNonce(this.requireConfigured(), this.now()) };
  }

  /**
   * Turns the token the app collected into claims, or refuses it.
   *
   * Every refusal is a 401 with the same message: which check failed is useful to us and to
   * nobody else — telling a caller "the nonce was wrong" rather than "the signature was"
   * hands them a way to probe. The reason goes to the log instead.
   */
  async verifyIdentityToken(identityToken: string, nonce: string): Promise<AppleIdentityClaims> {
    const secret = this.requireConfigured();

    const nonceCheck = verifyAppleNonce(nonce, secret, this.now());
    if (!nonceCheck.ok) {
      this.logger.warn({ reason: nonceCheck.reason }, 'Apple sign-in nonce refused');
      throw this.unauthorized();
    }

    const attempt = async (keys: readonly AppleJsonWebKey[]) =>
      verifyAppleIdentityToken({
        token: identityToken,
        keys,
        audiences: this.audiences,
        expectedNonce: nonce,
        nowSeconds: Math.floor(this.now() / 1000),
      });

    let result = await attempt(await this.signingKeys());
    // Apple publishes new keys before it uses them, but a deployment that has been up for a
    // while can still hold a set from before a rotation. An unknown key id is the one
    // rejection worth retrying, and only that one — retrying a bad signature would just
    // double the work for every forged token.
    if (!result.ok && result.reason === 'unknown_key') {
      result = await attempt(await this.signingKeys({ force: true }));
    }

    if (!result.ok) {
      this.logger.warn({ reason: result.reason }, 'Apple identity token refused');
      throw this.unauthorized();
    }
    return result.claims;
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'APPLE_SIGN_IN_FAILED',
      message: 'Apple 로그인에 실패했어요. 다시 시도해 주세요.',
    });
  }

  private async signingKeys(options: { force?: boolean } = {}): Promise<readonly AppleJsonWebKey[]> {
    const age = this.now() - this.keysFetchedAtMs;
    const wanted = options.force || this.keys.length === 0 || age > KEY_MAX_AGE_MS;
    // Nothing refetches inside the floor, however badly it is wanted. The first call after a
    // boot passes it because no attempt has been made yet.
    const sinceAttempt = this.now() - this.keysAttemptedAtMs;
    if (!wanted || sinceAttempt < KEY_REFETCH_FLOOR_MS) return this.keys;

    // One fetch at a time. A burst of sign-ins right after a rotation would otherwise send a
    // request per sign-in to Apple, which is how a rate limit turns one rotation into an
    // outage.
    this.inFlight ??= this.loadKeys().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async loadKeys(): Promise<readonly AppleJsonWebKey[]> {
    this.keysAttemptedAtMs = this.now();
    try {
      const response = await this.fetchKeys(APPLE_KEYS_URL);
      if (!response.ok) throw new Error(`Apple key endpoint answered ${response.status}`);
      const body = (await response.json()) as AppleKeysResponse;
      const keys = Array.isArray(body.keys)
        ? body.keys.filter((key): key is AppleJsonWebKey =>
            typeof key === 'object' && key !== null
            && typeof (key as AppleJsonWebKey).kid === 'string'
            && typeof (key as AppleJsonWebKey).n === 'string'
            && typeof (key as AppleJsonWebKey).e === 'string')
        : [];
      if (keys.length === 0) throw new Error('Apple key endpoint returned no usable keys');

      this.keys = keys;
      this.keysFetchedAtMs = this.now();
      return keys;
    } catch (err) {
      this.logger.warn({ err }, 'Could not refresh Apple signing keys');
      // The keys we already have are better than none: a token signed by a key still in the
      // cached set verifies fine while Apple is unreachable. An empty set simply fails every
      // token, which is what the caller then reports.
      return this.keys;
    }
  }
}

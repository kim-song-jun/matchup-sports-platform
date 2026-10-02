import { createPrivateKey, KeyObject } from 'node:crypto';
import { signEs256Jwt } from '../common/security/es256-jwt';

/**
 * APNs provider authentication token (ES256 JWT).
 *
 * Apple punishes both ends of the lifetime: a token older than an hour is rejected with
 * `ExpiredProviderToken`, and re-signing too eagerly is rejected with
 * `TooManyProviderTokenUpdates`. So the token is cached and refreshed inside a window
 * rather than signed per request — and a forced refresh (after a 403) still respects the
 * lower bound, because otherwise recovering from one rejection would earn another.
 */
export class ApnsProviderToken {
  /** Apple rejects tokens older than an hour; refresh with margin. */
  static readonly REFRESH_AFTER_MS = 50 * 60_000;
  /** Apple rejects re-issues closer together than this. */
  static readonly MIN_REISSUE_INTERVAL_MS = 20 * 60_000;

  private readonly key: KeyObject;
  private cached: { token: string; issuedAtMs: number } | null = null;

  /**
   * @param privateKeyPem the `.p8` contents. Deployment passes it as one line with literal
   *   `\n` separators, the same shape `FIREBASE_PRIVATE_KEY` already uses.
   * @param now injected so the caching boundaries can be tested without waiting an hour.
   */
  constructor(
    privateKeyPem: string,
    private readonly keyId: string,
    private readonly teamId: string,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.key = createPrivateKey(privateKeyPem.replace(/\\n/g, '\n'));
  }

  /** The token to send, signing a new one only when the cached one is old enough. */
  current(): string {
    const nowMs = this.now();
    if (this.cached && nowMs - this.cached.issuedAtMs < ApnsProviderToken.REFRESH_AFTER_MS) {
      return this.cached.token;
    }
    return this.issue(nowMs);
  }

  /**
   * Re-signs after Apple rejected the current token.
   *
   * Returns the existing token unchanged when it is younger than Apple's minimum re-issue
   * interval: signing again there would trade `InvalidProviderToken` for
   * `TooManyProviderTokenUpdates` and leave delivery just as broken.
   */
  refresh(): { token: string; reissued: boolean } {
    const nowMs = this.now();
    if (this.cached && nowMs - this.cached.issuedAtMs < ApnsProviderToken.MIN_REISSUE_INTERVAL_MS) {
      return { token: this.cached.token, reissued: false };
    }
    return { token: this.issue(nowMs), reissued: true };
  }

  private issue(nowMs: number): string {
    const token = signEs256Jwt(
      this.key,
      { kid: this.keyId },
      { iss: this.teamId, iat: Math.floor(nowMs / 1000) },
    );
    this.cached = { token, issuedAtMs: nowMs };
    return token;
  }
}

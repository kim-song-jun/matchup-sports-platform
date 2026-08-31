import { createPrivateKey, KeyObject, sign as signPayload } from 'node:crypto';

/**
 * APNs provider authentication token (ES256 JWT).
 *
 * Apple punishes both ends of the lifetime: a token older than an hour is rejected with
 * `ExpiredProviderToken`, and re-signing too eagerly is rejected with
 * `TooManyProviderTokenUpdates`. So the token is cached and refreshed inside a window
 * rather than signed per request — and a forced refresh (after a 403) still respects the
 * lower bound, because otherwise recovering from one rejection would earn another.
 *
 * 서명 형식이 특히 조용한 함정이다. `node:crypto` 의 기본 ECDSA 출력은 DER 인데 JOSE 의
 * ES256 은 r‖s 를 이어 붙인 64바이트 raw 를 요구한다. DER 로 보내면 Apple 이 403 만 돌려주고
 * 이유를 말해 주지 않는다. 그래서 `dsaEncoding: 'ieee-p1363'` 을 명시한다.
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
    const issuedAtSeconds = Math.floor(nowMs / 1000);
    const header = base64Url(JSON.stringify({ alg: 'ES256', kid: this.keyId }));
    const claims = base64Url(JSON.stringify({ iss: this.teamId, iat: issuedAtSeconds }));
    const signingInput = `${header}.${claims}`;
    const signature = signPayload('sha256', Buffer.from(signingInput), {
      key: this.key,
      // JOSE wants raw r‖s, not the DER that node emits by default.
      dsaEncoding: 'ieee-p1363',
    });
    const token = `${signingInput}.${signature.toString('base64url')}`;
    this.cached = { token, issuedAtMs: nowMs };
    return token;
  }
}

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

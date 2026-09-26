import { createPrivateKey, KeyObject, sign as signPayload } from 'node:crypto';

type FetchLike = typeof fetch;

interface GoogleTokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
}

/** Issues and caches the OAuth token used by the Teameet API to call FCM HTTP v1. */
export class FcmAccessTokenProvider {
  static readonly TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
  static readonly SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
  static readonly ASSERTION_LIFETIME_SECONDS = 60 * 60;
  static readonly REFRESH_MARGIN_MS = 5 * 60_000;

  private readonly privateKey: KeyObject;
  private cached: { token: string; expiresAtMs: number } | null = null;
  private refreshPromise: Promise<string> | null = null;

  constructor(
    privateKeyPem: string,
    private readonly clientEmail: string,
    private readonly now: () => number = () => Date.now(),
    private readonly fetcher: FetchLike = fetch,
  ) {
    this.privateKey = createPrivateKey(privateKeyPem.replace(/\\n/g, '\n'));
  }

  async current(): Promise<string> {
    const nowMs = this.now();
    if (this.cached && nowMs < this.cached.expiresAtMs - FcmAccessTokenProvider.REFRESH_MARGIN_MS) {
      return this.cached.token;
    }
    if (!this.refreshPromise) {
      this.refreshPromise = this.exchange(nowMs).finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  invalidate(rejectedToken?: string): void {
    // Several device requests can reject the same expired credential at once. A late 401
    // must not erase a newer token that another request has already refreshed.
    if (rejectedToken === undefined || this.cached?.token === rejectedToken) {
      this.cached = null;
    }
  }

  private async exchange(nowMs: number): Promise<string> {
    const response = await this.fetcher(FcmAccessTokenProvider.TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: this.assertion(nowMs),
      }),
    });
    if (!response.ok) {
      throw new Error('Google OAuth token exchange failed with HTTP ' + response.status);
    }
    const body = (await response.json()) as GoogleTokenResponse;
    if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
      throw new Error('Google OAuth token exchange returned no access token');
    }
    if (typeof body.expires_in !== 'number' || !Number.isFinite(body.expires_in) || body.expires_in <= 0) {
      throw new Error('Google OAuth token exchange returned an invalid expiry');
    }
    this.cached = { token: body.access_token, expiresAtMs: nowMs + body.expires_in * 1000 };
    return body.access_token;
  }

  private assertion(nowMs: number): string {
    const issuedAt = Math.floor(nowMs / 1000);
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64Url(JSON.stringify({
      iss: this.clientEmail,
      scope: FcmAccessTokenProvider.SCOPE,
      aud: FcmAccessTokenProvider.TOKEN_ENDPOINT,
      iat: issuedAt,
      exp: issuedAt + FcmAccessTokenProvider.ASSERTION_LIFETIME_SECONDS,
    }));
    const signingInput = header + '.' + claims;
    const signature = signPayload('RSA-SHA256', Buffer.from(signingInput), this.privateKey);
    return signingInput + '.' + signature.toString('base64url');
  }
}

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

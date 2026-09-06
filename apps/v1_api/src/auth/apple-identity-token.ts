import { createHash, createPublicKey, createVerify, timingSafeEqual } from 'node:crypto';

/**
 * Verification of the identity token Apple hands the app after Sign in with Apple.
 *
 * Kept pure — keys, audiences, the expected nonce and the current time all come in as
 * arguments — because every branch here is a way the sign-in can be forged, and a pure
 * function is the only shape where each of them can be pinned by a test. Fetching Apple's
 * keys and reaching the database happen in the service that calls this.
 *
 * The token is a plain RS256 JWT. Verifying it means: Apple signed it, it was minted for
 * *our* app, it has not expired, and it answers the nonce **this** sign-in asked for. Miss
 * the last one and a token captured from another session replays into this one.
 */

/** One key from `https://appleid.apple.com/auth/keys`. */
export type AppleJsonWebKey = {
  readonly kid: string;
  readonly kty: string;
  readonly n: string;
  readonly e: string;
  readonly alg?: string;
  readonly use?: string;
};

export type AppleIdentityClaims = {
  /** Apple's stable identifier for this person **within our team** — the account key. */
  readonly subject: string;
  /** Present on most tokens; absent when the person hid it and Apple sent no relay address. */
  readonly email: string | null;
  readonly emailVerified: boolean;
  /** True for a `@privaterelay.appleid.com` address. */
  readonly isPrivateEmail: boolean;
};

/**
 * Why a token was refused.
 *
 * Named rather than a boolean so the service can log which check failed without logging the
 * token, and so the tests read as the list of forgeries this function is expected to stop.
 */
export type AppleTokenRejection =
  | 'malformed'
  | 'unsupported_algorithm'
  | 'unknown_key'
  | 'bad_signature'
  | 'wrong_issuer'
  | 'wrong_audience'
  | 'expired'
  | 'issued_in_future'
  | 'nonce_mismatch'
  | 'missing_subject';

export type AppleTokenVerification =
  | { readonly ok: true; readonly claims: AppleIdentityClaims }
  | { readonly ok: false; readonly reason: AppleTokenRejection };

export const APPLE_ISSUER = 'https://appleid.apple.com';

/** Clocks drift. Sixty seconds is Apple's own guidance for their tokens' one-way lifetime. */
const CLOCK_SKEW_SECONDS = 60;

type AppleTokenHeader = { alg?: unknown; kid?: unknown };
type AppleTokenPayload = {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  iat?: unknown;
  sub?: unknown;
  nonce?: unknown;
  email?: unknown;
  email_verified?: unknown;
  is_private_email?: unknown;
};

function decodeSegment(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as unknown;
  } catch {
    return null;
  }
}

/**
 * Apple sends `email_verified` and `is_private_email` as either a boolean or the *string*
 * `"true"`, and which one you get has changed over time. Reading them with `=== true` looks
 * right and quietly turns every private-relay address into a non-private one.
 */
function readAppleBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

/** The hash Apple echoes back is of the raw nonce, so the comparison happens on the hash. */
export function hashAppleNonce(rawNonce: string): string {
  return createHash('sha256').update(rawNonce, 'utf8').digest('hex');
}

function equalsConstantTime(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  // `timingSafeEqual` throws on a length mismatch, which is itself a difference worth
  // reporting — but reporting it by throwing would crash the request instead of refusing it.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyAppleIdentityToken(input: {
  readonly token: string;
  readonly keys: readonly AppleJsonWebKey[];
  /** Bundle identifiers this deployment accepts — alpha and production are different apps. */
  readonly audiences: readonly string[];
  /** The nonce this deployment issued for this sign-in, unhashed. */
  readonly expectedNonce: string;
  readonly nowSeconds: number;
}): AppleTokenVerification {
  const parts = input.token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [headerSegment, payloadSegment, signatureSegment] = parts;

  const header = decodeSegment(headerSegment) as AppleTokenHeader | null;
  const payload = decodeSegment(payloadSegment) as AppleTokenPayload | null;
  if (!header || !payload || typeof header !== 'object' || typeof payload !== 'object') {
    return { ok: false, reason: 'malformed' };
  }

  // Pinned, not read from the token. `alg` is attacker-controlled: accepting whatever it
  // names is how `none` and HMAC-with-the-public-key forgeries get in.
  if (header.alg !== 'RS256') return { ok: false, reason: 'unsupported_algorithm' };
  if (typeof header.kid !== 'string') return { ok: false, reason: 'malformed' };

  const jwk = input.keys.find((key) => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) return { ok: false, reason: 'unknown_key' };

  let signatureValid = false;
  try {
    const publicKey = createPublicKey({ key: jwk as unknown as Record<string, string>, format: 'jwk' });
    signatureValid = createVerify('RSA-SHA256')
      .update(`${headerSegment}.${payloadSegment}`)
      .verify(publicKey, Buffer.from(signatureSegment, 'base64url'));
  } catch {
    // A key Node cannot import, or a signature that is not valid base64url. Either way the
    // token is not one we can trust; it is not a server fault worth a 500.
    signatureValid = false;
  }
  if (!signatureValid) return { ok: false, reason: 'bad_signature' };

  if (payload.iss !== APPLE_ISSUER) return { ok: false, reason: 'wrong_issuer' };

  // `aud` is our own bundle id for a native sign-in. A token minted for a different app of
  // ours — or anyone else's — is signed by the same Apple key and would otherwise pass.
  const audience = payload.aud;
  const audiences = Array.isArray(audience) ? audience : [audience];
  if (!audiences.some((value) => typeof value === 'string' && input.audiences.includes(value))) {
    return { ok: false, reason: 'wrong_audience' };
  }

  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SECONDS <= input.nowSeconds) {
    return { ok: false, reason: 'expired' };
  }
  if (typeof payload.iat !== 'number' || payload.iat - CLOCK_SKEW_SECONDS > input.nowSeconds) {
    return { ok: false, reason: 'issued_in_future' };
  }

  if (typeof payload.nonce !== 'string'
      || !equalsConstantTime(payload.nonce, hashAppleNonce(input.expectedNonce))) {
    return { ok: false, reason: 'nonce_mismatch' };
  }

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    return { ok: false, reason: 'missing_subject' };
  }

  return {
    ok: true,
    claims: {
      subject: payload.sub,
      email: typeof payload.email === 'string' && payload.email.length > 0 ? payload.email : null,
      emailVerified: readAppleBoolean(payload.email_verified),
      isPrivateEmail: readAppleBoolean(payload.is_private_email),
    },
  };
}

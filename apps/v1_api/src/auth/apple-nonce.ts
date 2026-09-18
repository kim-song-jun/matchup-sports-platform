import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The one-time value that ties an Apple identity token to *this* sign-in attempt.
 *
 * Without it a token captured once — from a proxy, a shared device, a log — signs its owner
 * in again later, because nothing in the token says which attempt it answered. The server
 * mints the nonce, the app hashes it into its Apple request, and Apple echoes the hash back
 * inside the signed token.
 *
 * Signed rather than stored, in the same shape as the session cookie
 * (`apps/v1_api/src/auth/v1-session.ts`): a random half plus an HMAC over it and its expiry.
 * The server keeps no row, so a restart or a second instance cannot lose someone's sign-in
 * halfway through — and the five-minute life keeps the replay window shorter than Apple's
 * own token lifetime.
 */

const NONCE_VERSION = 'a1';
const NONCE_TTL_SECONDS = 5 * 60;
const RANDOM_BYTES = 32;
const MINIMUM_SECRET_LENGTH = 32;

export type AppleNonceRejection = 'malformed' | 'bad_signature' | 'expired';

export type AppleNonceVerification =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: AppleNonceRejection };

function sign(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

/**
 * A secret this short cannot be a real one, and a weak HMAC key here means anyone can mint
 * nonces — which is the same as having none. Refusing is the honest outcome; the caller
 * turns it into "Apple sign-in is not configured" rather than a silent downgrade.
 */
export function isUsableAppleNonceSecret(secret: string | null | undefined): secret is string {
  return typeof secret === 'string' && secret.length >= MINIMUM_SECRET_LENGTH;
}

/** `a1.<random>.<expiry>.<hmac>` — the whole string travels to the app and back. */
export function issueAppleNonce(secret: string, nowMs: number): string {
  const random = randomBytes(RANDOM_BYTES).toString('base64url');
  const expiresAt = Math.floor(nowMs / 1000) + NONCE_TTL_SECONDS;
  const body = `${NONCE_VERSION}.${random}.${expiresAt}`;
  return `${body}.${sign(secret, body)}`;
}

export function verifyAppleNonce(nonce: string, secret: string, nowMs: number): AppleNonceVerification {
  const parts = nonce.split('.');
  if (parts.length !== 4) return { ok: false, reason: 'malformed' };
  const [version, random, expiresAtText, signature] = parts;
  if (version !== NONCE_VERSION || random.length === 0) return { ok: false, reason: 'malformed' };

  const expiresAt = Number(expiresAtText);
  if (!Number.isSafeInteger(expiresAt)) return { ok: false, reason: 'malformed' };

  const expected = sign(secret, `${version}.${random}.${expiresAtText}`);
  const provided = Buffer.from(signature, 'utf8');
  const computed = Buffer.from(expected, 'utf8');
  // Signature first, expiry second. Reading the expiry off an unsigned string would let a
  // forger pick their own, and answering "expired" for a forged nonce tells them the format
  // was otherwise right.
  if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) {
    return { ok: false, reason: 'bad_signature' };
  }

  if (expiresAt <= Math.floor(nowMs / 1000)) return { ok: false, reason: 'expired' };
  return { ok: true };
}

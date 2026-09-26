import { KeyObject, sign as signPayload } from 'node:crypto';

/**
 * Signs a compact JWS with ES256, the only algorithm Apple accepts for `.p8` keys (APNs
 * provider tokens and Sign in with Apple client secrets alike).
 *
 * `node:crypto` emits DER-encoded ECDSA signatures by default, but JOSE's ES256 is the raw
 * 64-byte r‖s. Apple answers a DER signature with a bare 403 / `invalid_client` that names
 * nothing, so `dsaEncoding: 'ieee-p1363'` is load-bearing.
 */
export function signEs256Jwt(
  key: KeyObject,
  header: { kid: string },
  claims: Record<string, unknown>,
): string {
  const signingInput = `${base64UrlJson({ alg: 'ES256', kid: header.kid })}.${base64UrlJson(claims)}`;
  const signature = signPayload('sha256', Buffer.from(signingInput), {
    key,
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${signature.toString('base64url')}`;
}

function base64UrlJson(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

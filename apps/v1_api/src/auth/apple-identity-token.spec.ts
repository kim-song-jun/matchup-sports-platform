import { createSign, generateKeyPairSync, KeyObject } from 'node:crypto';
import {
  APPLE_ISSUER,
  hashAppleNonce,
  verifyAppleIdentityToken,
  type AppleJsonWebKey,
} from './apple-identity-token';

/**
 * Every case here is a way someone could sign in as somebody else. The token is the whole
 * proof of identity — there is no second factor behind it — so each rejection below is the
 * only thing standing between a forged token and a session cookie.
 */
describe('verifyAppleIdentityToken', () => {
  const apple = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const impostor = generateKeyPairSync('rsa', { modulusLength: 2048 });

  const KID = 'apple-key-1';
  const AUDIENCE = 'kr.co.teameet.alpha';
  const NONCE = 'a1.random-value.1893456000.signature';
  const NOW = 1_893_456_000;

  function jwkFor(key: KeyObject, kid: string): AppleJsonWebKey {
    const jwk = key.export({ format: 'jwk' }) as unknown as { kty: string; n: string; e: string };
    return { kid, kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', use: 'sig' };
  }

  const keys = [jwkFor(apple.publicKey, KID)];

  function sign(
    payload: Record<string, unknown>,
    options: { header?: Record<string, unknown>; key?: KeyObject } = {},
  ): string {
    const header = { alg: 'RS256', kid: KID, ...options.header };
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const body = `${encode(header)}.${encode(payload)}`;
    const signature = createSign('RSA-SHA256')
      .update(body)
      .sign(options.key ?? apple.privateKey)
      .toString('base64url');
    return `${body}.${signature}`;
  }

  const validPayload = () => ({
    iss: APPLE_ISSUER,
    aud: AUDIENCE,
    exp: NOW + 600,
    iat: NOW - 10,
    sub: '001234.abcdef.0000',
    nonce: hashAppleNonce(NONCE),
    email: 'someone@privaterelay.appleid.com',
    email_verified: 'true',
    is_private_email: 'true',
  });

  const verify = (token: string, overrides: Partial<Parameters<typeof verifyAppleIdentityToken>[0]> = {}) =>
    verifyAppleIdentityToken({
      token,
      keys,
      audiences: [AUDIENCE],
      expectedNonce: NONCE,
      nowSeconds: NOW,
      ...overrides,
    });

  it('accepts a token Apple actually signed for this app and this sign-in', () => {
    const result = verify(sign(validPayload()));

    expect(result).toEqual({
      ok: true,
      claims: {
        subject: '001234.abcdef.0000',
        email: 'someone@privaterelay.appleid.com',
        emailVerified: true,
        isPrivateEmail: true,
      },
    });
  });

  /**
   * Apple sends these as a boolean on some tokens and the string `"true"` on others. Reading
   * them with `=== true` passes review, passes a boolean-only test, and quietly turns every
   * private-relay address into a real one.
   */
  it('reads Apple booleans whether they arrive as booleans or strings', () => {
    const result = verify(sign({ ...validPayload(), email_verified: true, is_private_email: false }));

    expect(result).toMatchObject({ ok: true, claims: { emailVerified: true, isPrivateEmail: false } });
  });

  it('reports no email when Apple sends none', () => {
    const { email, ...withoutEmail } = validPayload();
    void email;

    expect(verify(sign(withoutEmail))).toMatchObject({ ok: true, claims: { email: null } });
  });

  it('refuses a token signed by someone other than Apple', () => {
    expect(verify(sign(validPayload(), { key: impostor.privateKey })))
      .toEqual({ ok: false, reason: 'bad_signature' });
  });

  /**
   * The classic JWT forgery: the attacker names the algorithm. Trusting `alg` from the token
   * is what makes `none` and HMAC-with-the-public-key work, so it is pinned instead of read.
   */
  it('refuses a token that names its own algorithm', () => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'none', kid: KID })}.${encode(validPayload())}.`;

    expect(verify(unsigned)).toEqual({ ok: false, reason: 'unsupported_algorithm' });
  });

  it('refuses a token signed with a key Apple is not publishing', () => {
    expect(verify(sign(validPayload(), { header: { kid: 'rotated-away' } })))
      .toEqual({ ok: false, reason: 'unknown_key' });
  });

  it('refuses a token minted for a different app', () => {
    expect(verify(sign({ ...validPayload(), aud: 'kr.co.teameet' })))
      .toEqual({ ok: false, reason: 'wrong_audience' });
  });

  /** Alpha and production are separate apps, and a deployment may accept either during a move. */
  it('accepts any audience the deployment lists', () => {
    const result = verify(sign({ ...validPayload(), aud: 'kr.co.teameet' }), {
      audiences: ['kr.co.teameet.alpha', 'kr.co.teameet'],
    });

    expect(result).toMatchObject({ ok: true });
  });

  it('refuses a token from an issuer that is not Apple', () => {
    expect(verify(sign({ ...validPayload(), iss: 'https://appleid.apple.com.evil.test' })))
      .toEqual({ ok: false, reason: 'wrong_issuer' });
  });

  it('refuses an expired token, allowing only clock skew', () => {
    expect(verify(sign({ ...validPayload(), exp: NOW - 61 })))
      .toEqual({ ok: false, reason: 'expired' });
    expect(verify(sign({ ...validPayload(), exp: NOW - 30 }))).toMatchObject({ ok: true });
  });

  it('refuses a token dated in the future beyond skew', () => {
    expect(verify(sign({ ...validPayload(), iat: NOW + 61 })))
      .toEqual({ ok: false, reason: 'issued_in_future' });
  });

  /**
   * The replay guard. A token captured from another sign-in is signed by Apple, minted for
   * this app and unexpired — the nonce is the only thing that says it is not ours.
   */
  it('refuses a token that answers a different sign-in', () => {
    expect(verify(sign({ ...validPayload(), nonce: hashAppleNonce('a1.someone-elses.0.sig') })))
      .toEqual({ ok: false, reason: 'nonce_mismatch' });
  });

  it('refuses a token carrying no nonce at all', () => {
    const { nonce, ...withoutNonce } = validPayload();
    void nonce;

    expect(verify(sign(withoutNonce))).toEqual({ ok: false, reason: 'nonce_mismatch' });
  });

  /**
   * The raw nonce must not be accepted in place of its hash: Apple echoes what the app put in
   * the request, and the app puts the hash there.
   */
  it('does not accept the unhashed nonce', () => {
    expect(verify(sign({ ...validPayload(), nonce: NONCE })))
      .toEqual({ ok: false, reason: 'nonce_mismatch' });
  });

  it('refuses a token with no subject to key the account on', () => {
    expect(verify(sign({ ...validPayload(), sub: '' })))
      .toEqual({ ok: false, reason: 'missing_subject' });
  });

  it.each([
    ['not a jwt at all', 'not-a-jwt'],
    ['two segments', 'aaa.bbb'],
    ['undecodable segments', 'zzz.zzz.zzz'],
  ])('refuses %s', (_label, token) => {
    expect(verify(token)).toEqual({ ok: false, reason: 'malformed' });
  });
});

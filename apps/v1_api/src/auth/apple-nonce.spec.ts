import { issueAppleNonce, isUsableAppleNonceSecret, verifyAppleNonce } from './apple-nonce';

describe('Apple sign-in nonce', () => {
  const SECRET = 'a'.repeat(48);
  const OTHER_SECRET = 'b'.repeat(48);
  const NOW = 1_893_456_000_000;

  it('accepts a nonce it issued', () => {
    expect(verifyAppleNonce(issueAppleNonce(SECRET, NOW), SECRET, NOW)).toEqual({ ok: true });
  });

  it('issues a different nonce every time', () => {
    expect(issueAppleNonce(SECRET, NOW)).not.toEqual(issueAppleNonce(SECRET, NOW));
  });

  /**
   * The point of signing it. An attacker who can pick their own nonce can also pick the one
   * a captured token answers, which is the replay this guard exists to stop.
   */
  it('refuses a nonce it did not sign', () => {
    expect(verifyAppleNonce(issueAppleNonce(OTHER_SECRET, NOW), SECRET, NOW))
      .toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('refuses a nonce whose expiry was edited', () => {
    const [version, random, expiresAt, signature] = issueAppleNonce(SECRET, NOW).split('.');
    const stretched = [version, random, String(Number(expiresAt) + 86_400), signature].join('.');

    expect(verifyAppleNonce(stretched, SECRET, NOW)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('expires after five minutes', () => {
    const nonce = issueAppleNonce(SECRET, NOW);

    expect(verifyAppleNonce(nonce, SECRET, NOW + 299_000)).toEqual({ ok: true });
    expect(verifyAppleNonce(nonce, SECRET, NOW + 301_000)).toEqual({ ok: false, reason: 'expired' });
  });

  it.each([
    ['empty', ''],
    ['too few parts', 'a1.random.123'],
    ['wrong version', ['a0', 'random', '99999999999', 'sig'].join('.')],
    ['non-numeric expiry', ['a1', 'random', 'soon', 'sig'].join('.')],
  ])('refuses a %s nonce', (_label, nonce) => {
    expect(verifyAppleNonce(nonce, SECRET, NOW)).toEqual({ ok: false, reason: 'malformed' });
  });

  describe('secret guard', () => {
    it('accepts a secret long enough to be real', () => {
      expect(isUsableAppleNonceSecret(SECRET)).toBe(true);
    });

    it.each([
      ['missing', undefined],
      ['null', null],
      ['empty', ''],
      ['too short', 'short-secret'],
    ])('refuses a %s secret', (_label, secret) => {
      expect(isUsableAppleNonceSecret(secret)).toBe(false);
    });
  });
});

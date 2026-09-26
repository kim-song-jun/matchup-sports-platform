import { createVerify, generateKeyPairSync, verify as verifySignature } from 'node:crypto';
import { ApnsProviderToken } from './apns-provider-token';

/**
 * These exist because this file replaced a battle-tested SDK with our own code on a path
 * that fails silently: a wrongly-signed token earns a 403 with no explanation, and a
 * wrongly-timed one earns a different 403. Neither shows up as an exception anywhere.
 */
describe('ApnsProviderToken', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const keyId = 'ABC1234DEF';
  const teamId = 'TEAM123456';

  function decode(token: string) {
    const [header, claims, signature] = token.split('.');
    return {
      header: JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as Record<string, unknown>,
      claims: JSON.parse(Buffer.from(claims, 'base64url').toString('utf8')) as Record<string, unknown>,
      signature: Buffer.from(signature, 'base64url'),
      signingInput: `${header}.${claims}`,
    };
  }

  it('signs a token this process can verify with the matching public key', () => {
    const token = new ApnsProviderToken(pem, keyId, teamId, () => 1_700_000_000_000).current();
    const { signingInput, signature } = decode(token);

    // The point of verifying rather than snapshotting: node's default ECDSA output is DER,
    // while JOSE requires raw r‖s. A DER signature would round-trip through our own code
    // perfectly and be rejected by Apple with an unexplained 403.
    const verified = verifySignature(
      'sha256',
      Buffer.from(signingInput),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      signature,
    );
    expect(verified).toBe(true);
    expect(signature).toHaveLength(64);
  });

  it('rejects the signature when read as DER, proving the encoding is the JOSE one', () => {
    const token = new ApnsProviderToken(pem, keyId, teamId).current();
    const { signingInput, signature } = decode(token);
    const der = createVerify('sha256');
    der.update(signingInput);
    expect(der.verify(publicKey, signature)).toBe(false);
  });

  it('carries the header and claims Apple requires', () => {
    const issuedAtMs = 1_700_000_000_000;
    const { header, claims } = decode(
      new ApnsProviderToken(pem, keyId, teamId, () => issuedAtMs).current(),
    );
    expect(header).toEqual({ alg: 'ES256', kid: keyId });
    expect(claims).toEqual({ iss: teamId, iat: Math.floor(issuedAtMs / 1000) });
  });

  describe('caching', () => {
    let nowMs = 1_700_000_000_000;
    const clock = () => nowMs;

    beforeEach(() => {
      nowMs = 1_700_000_000_000;
    });

    it('reuses one token for the whole refresh window', () => {
      const provider = new ApnsProviderToken(pem, keyId, teamId, clock);
      const first = provider.current();
      nowMs += ApnsProviderToken.REFRESH_AFTER_MS - 1;
      expect(provider.current()).toBe(first);
    });

    /// Apple rejects a token older than an hour with ExpiredProviderToken, so the refresh
    /// window has to close before then.
    it('signs a new token once the refresh window closes', () => {
      const provider = new ApnsProviderToken(pem, keyId, teamId, clock);
      const first = provider.current();
      nowMs += ApnsProviderToken.REFRESH_AFTER_MS;
      const second = provider.current();
      expect(second).not.toBe(first);
      expect(ApnsProviderToken.REFRESH_AFTER_MS).toBeLessThan(60 * 60_000);
    });

    /// The other side of the same coin: Apple rejects re-issues closer together than twenty
    /// minutes with TooManyProviderTokenUpdates. Recovering from one rejection must not earn
    /// another.
    it('refuses to re-sign inside the minimum re-issue interval', () => {
      const provider = new ApnsProviderToken(pem, keyId, teamId, clock);
      const first = provider.current();

      nowMs += ApnsProviderToken.MIN_REISSUE_INTERVAL_MS - 1;
      const held = provider.refresh();
      expect(held.reissued).toBe(false);
      expect(held.token).toBe(first);

      nowMs += 1;
      const reissued = provider.refresh();
      expect(reissued.reissued).toBe(true);
      expect(reissued.token).not.toBe(first);
    });

    it('keeps the two boundaries in the order Apple requires', () => {
      expect(ApnsProviderToken.MIN_REISSUE_INTERVAL_MS).toBeGreaterThanOrEqual(20 * 60_000);
      expect(ApnsProviderToken.REFRESH_AFTER_MS).toBeGreaterThan(
        ApnsProviderToken.MIN_REISSUE_INTERVAL_MS,
      );
    });

    it('signs on the first use rather than at construction', () => {
      const provider = new ApnsProviderToken(pem, keyId, teamId, clock);
      const issuedAt = decode(provider.current()).claims.iat as number;
      expect(issuedAt).toBe(Math.floor(nowMs / 1000));
    });
  });

  it('accepts a key delivered as one line with escaped newlines', () => {
    // The shape deployment uses for FIREBASE_PRIVATE_KEY, reused here so the injection path
    // stays the same one operators already know.
    const oneLine = pem.replace(/\n/g, '\\n');
    expect(() => new ApnsProviderToken(oneLine, keyId, teamId).current()).not.toThrow();
  });
});

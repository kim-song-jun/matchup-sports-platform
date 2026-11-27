import { randomBytes } from 'node:crypto';
import { PrivacyCipher, type PrivacyKeyring } from './privacy-cipher';

const ring = (): PrivacyKeyring => ({ environment: 'test', current: 'k1', keys: new Map([
  ['k1', { encryption: randomBytes(32), search: randomBytes(32) }],
]) });

describe('private storage cryptographic boundary', () => {
  it('uses independent random envelopes and roundtrips text and structured data without plaintext', () => {
    const cipher = new PrivacyCipher(ring());
    const value = 'privacy-fixture@example.test';
    const first = cipher.seal('V1User', 'email', 'fixture-id', value);
    expect(first).not.toContain(value);
    expect(cipher.seal('V1User', 'email', 'fixture-id', value)).not.toBe(first);
    expect(cipher.open('V1User', 'email', 'fixture-id', first)).toBe(value);
    const data = { contact: value, nested: [false, 42] };
    expect(cipher.open('V1UserOnboardingProgress', 'draftJson', 'fixture-id', cipher.seal('V1UserOnboardingProgress', 'draftJson', 'fixture-id', data))).toEqual(data);
  });

  it('rejects field/model/environment substitution and unavailable keys without plaintext fallback', () => {
    const source = ring();
    const cipher = new PrivacyCipher(source);
    const sealed = cipher.seal('V1User', 'email', 'fixture-id', 'fixture@example.test');
    expect(() => cipher.open('V1User', 'email', 'other-row', sealed)).toThrow();
    expect(() => cipher.open('V1User', 'phone', 'fixture-id', sealed)).toThrow();
    expect(() => cipher.open('V1AuthIdentity', 'email', 'fixture-id', sealed)).toThrow();
    expect(() => new PrivacyCipher({ ...source, environment: 'other' }).open('V1User', 'email', 'fixture-id', sealed)).toThrow();
    expect(() => new PrivacyCipher(ring()).open('V1User', 'email', 'fixture-id', sealed)).toThrow();
    expect(() => cipher.open('V1User', 'email', 'fixture-id', 'unsealed fixture')).toThrow();
    expect(() => cipher.open('V1User', 'email', 'fixture-id', sealed.replace(':k1:', ':missing:'))).toThrow();
  });

  it('rejects modifications of the nonce, authentication tag and encrypted body', () => {
    const cipher = new PrivacyCipher(ring());
    const parts = cipher.seal('V1User', 'email', 'fixture-id', 'fixture@example.test').split(':');
    for (const index of [3, 4, 5]) {
      const changed = [...parts];
      changed[index] = (changed[index][0] === 'A' ? 'B' : 'A') + changed[index].slice(1);
      expect(() => cipher.open('V1User', 'email', 'fixture-id', changed.join(':'))).toThrow();
    }
  });

  it('reads an old encryption version while new writes use the selected version', () => {
    const previous = ring();
    const old = new PrivacyCipher(previous).seal('V1User', 'email', 'fixture-id', 'fixture@example.test');
    const next = { ...previous, current: 'k2', keys: new Map([...previous.keys,
      ['k2', { encryption: randomBytes(32), search: randomBytes(32) }] as const]) };
    const cipher = new PrivacyCipher(next);
    expect(cipher.open('V1User', 'email', 'fixture-id', old)).toBe('fixture@example.test');
    expect(cipher.seal('V1User', 'email', 'fixture-id', 'fixture@example.test')).toContain(':k2:');
  });

  it('normalizes mailbox case while separating lookup purposes and environments', () => {
    const source = ring();
    const cipher = new PrivacyCipher(source);
    expect(cipher.lookup('V1User', 'email', '  FIXTURE@example.test ')).toBe(cipher.lookup('V1User', 'email', 'fixture@example.test'));
    expect(cipher.lookup('V1User', 'phone', '01012345678')).not.toBe(cipher.lookup('V1AuthIdentity', 'phone', '01012345678'));
    expect(cipher.lookup('V1User', 'email', 'a+b@example.test')).not.toBe(cipher.lookup('V1User', 'email', 'a@example.test'));
    expect(new PrivacyCipher({ ...source, environment: 'other' }).lookup('V1User', 'email', 'fixture@example.test'))
      .not.toBe(cipher.lookup('V1User', 'email', 'fixture@example.test'));
  });
});

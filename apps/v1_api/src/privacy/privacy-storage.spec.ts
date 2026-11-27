import { randomBytes } from 'node:crypto';
import { PrivacyCipher } from './privacy-cipher';
import { PrivacyStorage } from './privacy-storage';
const create = () => {
  const cipher = new PrivacyCipher({ environment: 'test', current: 'k1', keys: new Map([
    ['k1', { encryption: randomBytes(32), search: randomBytes(32) }],
  ]) });
  return { storage: new PrivacyStorage(cipher), cipher };
};
it('seals nested identity/profile writes and restores only requested fields without lookup metadata', () => {
  const { storage } = create();
  const input = { data: { id: 'user-id', email: 'fixture@example.test', profile: { create: { id: 'profile-id', realName: '검증용 이름', birthDate: '2000-01-02' } },
    authIdentities: { create: { id: 'identity-id', provider: 'email', providerUserKey: 'fixture@example.test' } } } };
  const transformed = storage.args('V1User', input) as typeof input;
  expect(JSON.stringify(transformed)).not.toContain('fixture@example.test');
  expect(JSON.stringify(transformed)).not.toContain('검증용 이름');
  const restored = storage.result('V1User', { ...transformed.data, profile: transformed.data.profile.create,
    authIdentities: [transformed.data.authIdentities.create] });
  expect(restored).toEqual({ id: 'user-id', email: 'fixture@example.test', profile: { id: 'profile-id', realName: '검증용 이름', birthDate: '2000-01-02' },
    authIdentities: [{ id: 'identity-id', provider: 'email', providerUserKey: 'fixture@example.test' }] });
  expect(input.data.email).toBe('fixture@example.test');
});
it('rewrites exact/compound/relation identity filters to indexed lookups', () => {
  const { storage, cipher } = create();
  expect(storage.args('V1User', { where: { OR: [{ email: 'fixture@example.test' }, { phone: { in: ['01012345678'] } }] } }))
    .toEqual({ where: { OR: [{ emailPrivacyLookup: cipher.lookup('V1User', 'email', 'fixture@example.test') },
      { phonePrivacyLookup: { in: [cipher.lookup('V1User', 'phone', '01012345678')] } }] } });
  expect(storage.args('V1AuthIdentity', { where: { provider_providerUserKey: { provider: 'email', providerUserKey: 'fixture@example.test' } } }))
    .toEqual({ where: { provider_providerUserKeyPrivacyLookup: { provider: 'email', providerUserKeyPrivacyLookup: cipher.lookup('V1AuthIdentity', 'providerUserKey', 'fixture@example.test') } } });
  expect(storage.args('V1Team', { where: { ownerUser: { email: 'fixture@example.test' } } }))
    .toEqual({ where: { ownerUser: { emailPrivacyLookup: cipher.lookup('V1User', 'email', 'fixture@example.test') } } });
});
it('fails explicitly for partial/range/sort/private JSON filtering and unsealed results', () => {
  const { storage } = create();
  for (const args of [{ where: { email: { contains: 'fixture' } } }, { orderBy: { email: 'asc' } },
    { where: { phone: { gt: '010' } } }, { where: { draftJson: { path: ['phone'], equals: '010' } } }]) {
    expect(() => storage.args('draftJson' in (args.where ?? {}) ? 'V1UserOnboardingProgress' : 'V1User', args)).toThrow();
  }
  expect(() => storage.result('V1User', { id: 'user-id', email: 'plain@example.test' })).toThrow('Unsealed');
});

it('requires stable identity on writes and protected selections and rejects copied ciphertext', () => {
  const { storage } = create();
  expect(() => storage.data('V1User', { email: 'fixture@example.test' })).toThrow('record ID required');
  const data = storage.data('V1User', { id: 'first-user', email: 'fixture@example.test' });
  expect(() => storage.result('V1User', { email: data.email })).toThrow('record ID required');
  expect(() => storage.result('V1User', { ...data, id: 'second-user' })).toThrow('authentication failed');
  const update = storage.args('V1User', { where: { id: 'first-user' }, data: { email: 'updated@example.test' } }) as { data: Record<string, unknown> };
  expect(storage.result('V1User', { id: 'first-user', ...update.data })).toEqual({ id: 'first-user', email: 'updated@example.test' });
});

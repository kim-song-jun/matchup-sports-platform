import { randomBytes } from 'node:crypto';
import { KMSClient } from '@aws-sdk/client-kms';
import { loadPrivacyCipher } from './privacy-keys';

const names = ['PII_ENVIRONMENT', 'PII_KEY_VERSION', 'PII_WRAPPED_KEYRING', 'PII_KMS_KEY_ID'] as const;
const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
afterEach(() => {
  jest.restoreAllMocks();
  for (const name of names) if (original[name] === undefined) delete process.env[name]; else process.env[name] = original[name];
});
function configure() {
  process.env.PII_ENVIRONMENT = 'test';
  process.env.PII_KEY_VERSION = 'k1';
  process.env.PII_KMS_KEY_ID = 'alias/test-privacy-fixture';
  process.env.PII_WRAPPED_KEYRING = JSON.stringify({ k1: { encryption: Buffer.from('wrapped-encryption').toString('base64'), search: Buffer.from('wrapped-search').toString('base64') } });
}
it('unwraps distinct purposes with environment-bound KMS context and clears SDK plaintext buffers', async () => {
  configure();
  const buffers: Buffer[] = [];
  const contexts: unknown[] = [];
  jest.spyOn(KMSClient.prototype, 'send').mockImplementation((async (command: { input: { EncryptionContext: unknown } }) => {
    contexts.push(command.input.EncryptionContext);
    const key = randomBytes(32); buffers.push(key);
    return { Plaintext: key };
  }) as never);
  const cipher = await loadPrivacyCipher();
  expect(contexts).toEqual([
    { application: 'teameet', environment: 'test', purpose: 'pii-encryption', version: 'k1' },
    { application: 'teameet', environment: 'test', purpose: 'pii-search', version: 'k1' },
  ]);
  expect(buffers.every((key) => key.every((byte) => byte === 0))).toBe(true);
  const sealed = cipher.seal('V1User', 'email', 'fixture-id', 'fixture@example.test');
  expect(cipher.open('V1User', 'email', 'fixture-id', sealed)).toBe('fixture@example.test');
});
it('fails on unavailable KMS instead of accepting plaintext keys or falling back', async () => {
  configure();
  jest.spyOn(KMSClient.prototype, 'send').mockRejectedValue(new Error('KMS unavailable') as never);
  await expect(loadPrivacyCipher()).rejects.toThrow('KMS unavailable');
  delete process.env.PII_WRAPPED_KEYRING;
  await expect(loadPrivacyCipher()).rejects.toThrow('configuration required');
});

import { DecryptCommand, KMSClient } from '@aws-sdk/client-kms';
import { PrivacyCipher, type PrivacyKey } from './privacy-cipher';

/** Environment contains KMS-wrapped data keys only. No plaintext encryption key configuration is accepted. */
export async function loadPrivacyCipher(): Promise<PrivacyCipher> {
  const environment = process.env.PII_ENVIRONMENT;
  const current = process.env.PII_KEY_VERSION;
  const raw = process.env.PII_WRAPPED_KEYRING;
  const keyId = process.env.PII_KMS_KEY_ID;
  if (!environment || !current || !raw || !keyId) throw new Error('Privacy KMS configuration required');
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid wrapped privacy keyring');
  const entries = Object.entries(parsed);
  if (entries.length < 1 || entries.length > 4) throw new Error('Invalid privacy keyring size');
  const client = new KMSClient({ maxAttempts: 2 });
  const keys = new Map<string, PrivacyKey>();
  try {
    for (const [version, input] of entries) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid wrapped privacy key');
      const pair = input as Record<string, unknown>;
      const decrypt = async (purpose: 'encryption' | 'search') => {
        const wrapped = pair[purpose];
        if (typeof wrapped !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(wrapped)) throw new Error('Invalid wrapped privacy key');
        const result = await client.send(new DecryptCommand({ KeyId: keyId,
          CiphertextBlob: Buffer.from(wrapped, 'base64'),
          EncryptionContext: { application: 'teameet', environment, purpose: `pii-${purpose}`, version } }), { abortSignal: AbortSignal.timeout(5_000) });
        if (!result.Plaintext || result.Plaintext.length !== 32) throw new Error('Invalid unwrapped privacy key');
        const key = Buffer.from(result.Plaintext);
        result.Plaintext.fill(0);
        return key;
      };
      keys.set(version, { encryption: await decrypt('encryption'), search: await decrypt('search') });
    }
    return new PrivacyCipher({ environment, current, keys });
  } finally { client.destroy(); }
}

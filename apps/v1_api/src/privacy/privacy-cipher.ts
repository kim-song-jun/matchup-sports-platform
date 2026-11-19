import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { PRIVACY_PREFIX } from './privacy-fields';

export type PrivacyKey = { encryption: Buffer; search: Buffer };
export type PrivacyKeyring = { environment: string; current: string; keys: ReadonlyMap<string, PrivacyKey> };

/** Authenticated data is supplied by the storage adapter, never accepted from the ciphertext itself. */
export class PrivacyCipher {
  constructor(private readonly ring: PrivacyKeyring) {
    if (!/^[a-z][a-z0-9-]{1,31}$/.test(ring.environment) || !/^[a-zA-Z0-9_-]{1,40}$/.test(ring.current)
      || !ring.keys.has(ring.current)) throw new Error('Invalid privacy keyring');
    for (const [version, key] of ring.keys) {
      if (!/^[a-zA-Z0-9_-]{1,40}$/.test(version) || key.encryption.length !== 32 || key.search.length !== 32
        || key.encryption.equals(key.search)) throw new Error('Invalid privacy key material');
    }
  }

  seal(model: string, field: string, recordId: string, value: unknown): string {
    const key = this.ring.keys.get(this.ring.current)!;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key.encryption, iv);
    cipher.setAAD(this.aad(model, field, recordId));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return `${PRIVACY_PREFIX}${this.ring.current}:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
  }

  open(model: string, field: string, recordId: string, sealed: unknown): unknown {
    if (typeof sealed !== 'string' || !sealed.startsWith(PRIVACY_PREFIX)) throw new Error('Unsealed privacy data');
    const parts = sealed.slice(PRIVACY_PREFIX.length).split(':');
    if (parts.length !== 4 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error('Invalid privacy envelope');
    const [version, nonce, authTag, content] = parts;
    const key = this.ring.keys.get(version);
    if (!key) throw new Error('Privacy key version unavailable');
    const iv = Buffer.from(nonce, 'base64url');
    const tag = Buffer.from(authTag, 'base64url');
    if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid privacy envelope');
    try {
      const decipher = createDecipheriv('aes-256-gcm', key.encryption, iv);
      decipher.setAAD(this.aad(model, field, recordId));
      decipher.setAuthTag(tag);
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(content, 'base64url')), decipher.final()]).toString('utf8')) as unknown;
    } catch { throw new Error('Privacy authentication failed'); }
  }

  lookup(model: string, field: string, value: string): string {
    // Preserve existing identity normalization. Do not collapse provider-specific mailbox aliases.
    const normalized = /email/i.test(field) ? value.trim().toLowerCase() : value;
    return `${this.ring.current}:${createHmac('sha256', this.ring.keys.get(this.ring.current)!.search)
      .update(JSON.stringify([this.ring.environment, model, field, normalized])).digest('hex')}`;
  }

  private aad(model: string, field: string, recordId: string): Buffer {
    if (typeof recordId !== 'string' || !recordId || recordId.length > 256) throw new Error('Private record ID required');
    return Buffer.from(JSON.stringify(['teameet-pii-v1', this.ring.environment, model, field, recordId]));
  }
}

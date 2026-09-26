import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * At-rest encryption for the Apple refresh token (AES-256-GCM).
 *
 * The refresh token is a live credential for the reader's Apple authorization; a database
 * dump alone must not be enough to use it. The identity row id is bound in as associated
 * data so a ciphertext copied onto another identity row fails to open instead of revoking
 * someone else's authorization.
 */

export type StoredAppleToken = {
  /** The `client_id` (bundle id) the code was exchanged under; revoke must use the same one. */
  readonly clientId: string;
  readonly refreshToken: string;
};

const FORMAT_VERSION = 'v1';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/** Accepts the base64 of exactly 32 random bytes (`openssl rand -base64 32`), else null. */
export function parseAppleTokenKey(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  const key = Buffer.from(raw.trim(), 'base64');
  return key.length === KEY_BYTES ? key : null;
}

export function sealAppleToken(key: Buffer, identityId: string, token: StoredAppleToken): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(identityId, 'utf8'));
  const body = Buffer.concat([
    cipher.update(JSON.stringify({ c: token.clientId, r: token.refreshToken }), 'utf8'),
    cipher.final(),
  ]);
  return [FORMAT_VERSION, iv, cipher.getAuthTag(), body]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

/** Throws when the value was not sealed with this key for this identity row. */
export function openAppleToken(key: Buffer, identityId: string, sealed: string): StoredAppleToken {
  const [version, iv, tag, body] = sealed.split('.');
  if (version !== FORMAT_VERSION || !iv || !tag || !body) {
    throw new Error('Unrecognised sealed Apple token format');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(identityId, 'utf8'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(body, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
  const parsed = JSON.parse(plain) as { c?: unknown; r?: unknown };
  if (typeof parsed.c !== 'string' || typeof parsed.r !== 'string') {
    throw new Error('Sealed Apple token is missing its fields');
  }
  return { clientId: parsed.c, refreshToken: parsed.r };
}

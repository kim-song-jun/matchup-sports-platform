import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);
const keyLength = 64;
const scheme = 'scrypt';

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = (await scrypt(password, salt, keyLength)) as Buffer;
  return `${scheme}:${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) return false;

  const [storedScheme, salt, key] = storedHash.split(':');
  if (storedScheme !== scheme || !salt || !key) return false;

  const expected = Buffer.from(key, 'hex');
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

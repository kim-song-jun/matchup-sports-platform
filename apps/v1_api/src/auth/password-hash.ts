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

// Hash of a discarded random value; nobody holds its preimage. Same scheme and cost as real hashes.
const UNMATCHABLE_PASSWORD_HASH =
  'scrypt:645d48ea4d7127ba8c27001cbd319d78:a3f7324d33bb4dd3949e794c777f36fef9e15eb442ff606212787dc6b9d4f13d84eebfacc8b926e74bc06c8deccad1ad9e50e97f04919fd1c9e8b930aa266131';

/**
 * Like `verifyPassword`, but a missing stored hash (unknown account, social-only identity) still pays
 * the full scrypt cost, so response time does not reveal whether an account has a password.
 */
export async function verifyPasswordConstantCost(password: string, storedHash: string | null | undefined) {
  if (storedHash) return verifyPassword(password, storedHash);
  await verifyPassword(password, UNMATCHABLE_PASSWORD_HASH);
  return false;
}

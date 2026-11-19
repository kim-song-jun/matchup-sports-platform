import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';

const KEY_LENGTH = 64;
const CURRENT_PREFIX = 'scrypt$v1$32768$8$3$';
const currentCost = { N: 32_768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const legacyCost = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const derive = (password: string, salt: string, options: typeof currentCost): Promise<Buffer> =>
  new Promise((resolve, reject) => scryptCallback(password, salt, KEY_LENGTH, options, (error, key) => error ? reject(error) : resolve(key)));

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, currentCost);
  return `${CURRENT_PREFIX}${salt}$${key.toString('hex')}`;
}

function parseHash(stored: string | null | undefined) {
  if (!stored) return null;
  const current = /^scrypt\$v1\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(stored);
  if (current) return { salt: current[1], key: current[2], options: currentCost };
  const legacy = /^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(stored);
  return legacy ? { salt: legacy[1], key: legacy[2], options: legacyCost } : null;
}

export async function verifyPassword(password: string, storedHash: string | null | undefined) {
  const parsed = parseHash(storedHash);
  if (!parsed) return false;
  const actual = await derive(password, parsed.salt, parsed.options);
  return timingSafeEqual(Buffer.from(parsed.key, 'hex'), actual);
}

export function needsPasswordRehash(storedHash: string | null | undefined) {
  return Boolean(parseHash(storedHash)) && !storedHash!.startsWith(CURRENT_PREFIX);
}

/** Both supported work factors run for every account shape, including missing/invalid identities. */
export async function verifyPasswordConstantCost(password: string, storedHash: string | null | undefined) {
  const parsed = parseHash(storedHash);
  const salt = parsed?.salt ?? '0'.repeat(32);
  const legacy = await derive(password, salt, legacyCost);
  const current = await derive(password, salt, currentCost);
  const actual = parsed?.options === legacyCost ? legacy : current;
  const matches = timingSafeEqual(Buffer.from(parsed?.key ?? '0'.repeat(128), 'hex'), actual);
  return Boolean(parsed) && matches;
}

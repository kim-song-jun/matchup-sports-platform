const MAX_NICKNAME_LENGTH = 20;
const MIN_NICKNAME_LENGTH = 2;
const SUFFIXED_ATTEMPTS = 8;
const FALLBACK_ATTEMPTS = 5;
const FALLBACK_PREFIX = '팀밋사용자';

export function normalizeSocialNicknameSeed(seed: string | null | undefined): string | null {
  const collapsed = (seed ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const cleaned = takeCodePoints(collapsed, MAX_NICKNAME_LENGTH).trim();
  return Array.from(cleaned).length >= MIN_NICKNAME_LENGTH ? cleaned : null;
}

function takeCodePoints(value: string, limit: number): string {
  return Array.from(value).slice(0, limit).join('');
}

function randomDigits(length: number, random: () => number): string {
  const max = 10 ** length;
  return String(Math.floor(random() * max)).padStart(length, '0');
}

/**
 * Picks an unused nickname for a social signup that skipped the profile form.
 * Nicknames have no unique constraint, so the check is best-effort; the loop is bounded and
 * always returns a value.
 */
export async function generateSocialNickname(
  seed: string | null | undefined,
  isTaken: (nickname: string) => Promise<boolean>,
  random: () => number = Math.random,
): Promise<string> {
  const base = normalizeSocialNicknameSeed(seed);

  if (base && !(await isTaken(base))) return base;

  if (base) {
    for (let attempt = 0; attempt < SUFFIXED_ATTEMPTS; attempt += 1) {
      // 2 digits for the first tries, widening to 4 as collisions pile up.
      const digits = randomDigits(Math.min(2 + Math.floor(attempt / 3), 4), random);
      const candidate = `${takeCodePoints(base, MAX_NICKNAME_LENGTH - digits.length).trim()}${digits}`;
      if (!(await isTaken(candidate))) return candidate;
    }
  }

  let fallback = `${FALLBACK_PREFIX}${randomDigits(4, random)}`;
  for (let attempt = 0; attempt < FALLBACK_ATTEMPTS; attempt += 1) {
    if (!(await isTaken(fallback))) return fallback;
    fallback = `${FALLBACK_PREFIX}${randomDigits(4, random)}`;
  }
  return fallback;
}

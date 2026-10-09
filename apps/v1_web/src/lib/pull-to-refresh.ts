export const PULL_RESISTANCE = 0.5;
export const PULL_THRESHOLD_PX = 64;
export const PULL_MAX_PX = 96;
export const PULL_INTENT_SLOP_PX = 8;
export const PULL_MIN_REFRESH_MS = 400;

/** Routes that must keep their own touch handling or hold unsaved input. Matched against the pathname only. */
const EXCLUDED_PREFIXES = [
  '/admin',
  '/admin-content-preview',
  '/tournament-ops',
  '/auth',
  '/login',
  '/signup',
  '/onboarding',
  '/callback',
  '/account-deletion',
  '/my/settings',
  '/my/phone-verify',
];

const EXCLUDED_PATTERNS: readonly RegExp[] = [
  /^\/chat\/[^/]+/, // chat room: reverse scroll + older-message loading
  /\/(new|edit)(\/|$)/, // create / edit forms
  /^\/team-matches\/[^/]+\/(lineup|record|result)(\/|$)/,
  /^\/teams\/[^/]+\/(dissolve|invite|contact|tactics|games)(\/|$)/,
  /^\/tournaments\/[^/]+\/(apply|registrations)(\/|$)/,
  /^\/my\/reviews\/[^/]+\/[^/]+/, // review compose; the list and /received stay enabled
];

export function isPullToRefreshRoute(pathname: string): boolean {
  const matchesPrefix = EXCLUDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (matchesPrefix) return false;
  return !EXCLUDED_PATTERNS.some((pattern) => pattern.test(pathname));
}

export type PullIntent = 'undecided' | 'pull' | 'ignore';

/** Decides from the first movement whether the touch is a downward pull or something else (swipe, scroll up). */
export function classifyPullIntent(dx: number, dy: number): PullIntent {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < PULL_INTENT_SLOP_PX) return 'undecided';
  return dy > 0 && dy > Math.abs(dx) ? 'pull' : 'ignore';
}

export function pullOffset(dy: number): number {
  return Math.min(PULL_MAX_PX, Math.max(0, dy) * PULL_RESISTANCE);
}

export function pullProgress(offset: number): number {
  return Math.min(1, Math.max(0, offset / PULL_THRESHOLD_PX));
}

export function shouldRefresh(offset: number): boolean {
  return offset >= PULL_THRESHOLD_PX;
}

/**
 * Notification href safety guard.
 *
 * All notification action URLs stored in the DB are same-origin root-relative
 * paths (e.g. "/matches/123", "/notifications"). This module validates and
 * normalises them before use in navigation or <a href>.
 *
 * Rules:
 *  - Must start with "/" (root-relative)
 *  - Must NOT start with "//" (protocol-relative external URL)
 *  - Must NOT contain "://" (absolute URL with scheme)
 *  - Must NOT contain a "/v1/" prefix (legacy basePath — removed in 2026-07)
 *  - Must NOT be "/login" or start with "/login" (avoid redirect loops)
 *
 * If validation fails, the fallback is "/notifications".
 */

const FALLBACK_HREF = '/notifications';

/** Returns true when `href` is a safe, same-origin root-relative path. */
export function isSafeNotificationHref(href: unknown): href is string {
  if (typeof href !== 'string') return false;
  if (!href.startsWith('/')) return false;
  if (href.startsWith('//')) return false;
  if (href.includes('://')) return false;
  // Strip legacy /v1/ prefix — these URLs are no longer valid browser routes.
  if (href === '/v1' || href.startsWith('/v1/')) return false;
  // Avoid self-referential login redirect loops.
  if (href === '/login' || href.startsWith('/login')) return false;
  return true;
}

/**
 * Returns a validated same-origin href for use in notification navigation.
 * Falls back to "/notifications" when the input is unsafe.
 */
export function safeNotificationHref(href: unknown): string {
  return isSafeNotificationHref(href) ? href : FALLBACK_HREF;
}

/**
 * Strips the legacy /v1 prefix from a stored notification href and returns
 * the root-relative equivalent.
 *
 * Example: "/v1/matches/123" → "/matches/123"
 *
 * This is a one-time migration helper for any /v1/* hrefs still persisted
 * in the DB from the basePath era. Call it before `safeNotificationHref`.
 */
export function migrateV1NotificationHref(href: string): string {
  if (href === '/v1') return '/home';
  if (href.startsWith('/v1/')) return href.slice('/v1'.length);
  return href;
}

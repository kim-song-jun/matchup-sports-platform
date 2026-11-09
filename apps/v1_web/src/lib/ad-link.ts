import { checkAdLink } from '@/lib/ad-link-rule';

export type AdLink = {
  /** `internal` is an in-app path to navigate with the router; `external` is an HTTPS url that leaves the app. */
  kind: 'internal' | 'external';
  href: string;
};

// Resolving against a fixed origin turns the stored path into the path the browser will follow.
const INTERNAL_BASE = 'https://ad-link-guard.invalid';

/**
 * Classifies a campaign `linkUrl`. Returns `null` for anything the server would refuse to save (`checkAdLink`),
 * so the caller can skip rendering the ad instead of rendering a link it cannot trust. The server validates
 * links on save; this is the last guard before a stored value becomes a clickable link.
 *
 * An in-app `href` is the path the browser resolves, not the stored text (`/a/../b` becomes `/b`).
 */
export function resolveAdLink(value: string | null | undefined): AdLink | null {
  if (!value || !checkAdLink(value).ok) return null;
  if (!value.startsWith('/')) return { kind: 'external', href: value };
  const resolved = new URL(value, INTERNAL_BASE);
  return { kind: 'internal', href: `${resolved.pathname}${resolved.search}${resolved.hash}` };
}

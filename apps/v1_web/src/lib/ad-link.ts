import { isSafePopupLink } from '@/lib/popup-targets';

export type AdLink = {
  /** `internal` is an in-app path to navigate with the router; `external` is an HTTPS url that leaves the app. */
  kind: 'internal' | 'external';
  href: string;
};

/**
 * Classifies a campaign `linkUrl`. Returns `null` for anything that is not an in-app path or an HTTPS url,
 * so the caller can skip rendering the ad instead of rendering a link it cannot trust. The server validates
 * links on save; this stops a bad stored value from becoming a clickable link.
 */
export function resolveAdLink(value: string | null | undefined): AdLink | null {
  if (!value || !isSafePopupLink(value)) return null;
  return { kind: value.startsWith('/') ? 'internal' : 'external', href: value };
}

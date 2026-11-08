import { isSafePopupLink } from '@/lib/popup-targets';

export type AdLink = {
  /** `internal` is an in-app path to navigate with the router; `external` is an HTTPS url that leaves the app. */
  kind: 'internal' | 'external';
  href: string;
};

// Resolving against a fixed origin tells whether a path stays on this site, the same way `sanitizeRedirectPath` does.
const INTERNAL_BASE = new URL('https://ad-link-guard.invalid');

const hasControlCharacter = (value: string) =>
  Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f;
  });

/**
 * Classifies a campaign `linkUrl`. Returns `null` for anything that is not an in-app path or an HTTPS url,
 * so the caller can skip rendering the ad instead of rendering a link it cannot trust. The server validates
 * links on save; this is the last guard before a stored value becomes a clickable link.
 *
 * An in-app `href` is the path the browser resolves, not the stored text: resolving can turn a harmless-looking
 * path into another site (`/..//host` becomes `//host`), so the resolved value is what gets checked and returned.
 */
export function resolveAdLink(value: string | null | undefined): AdLink | null {
  if (!value || hasControlCharacter(value) || value.includes('\\') || !isSafePopupLink(value)) return null;

  if (value.startsWith('/')) {
    let resolved: URL;
    try {
      resolved = new URL(value, INTERNAL_BASE);
    } catch {
      return null;
    }
    if (resolved.origin !== INTERNAL_BASE.origin || resolved.pathname.startsWith('//')) return null;
    return { kind: 'internal', href: `${resolved.pathname}${resolved.search}${resolved.hash}` };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  return { kind: 'external', href: value };
}

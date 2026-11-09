import { registerDecorator, type ValidationOptions } from 'class-validator';
import { isPrivateHostname } from '../common/safe-image-url';
import { isSafePopupLink } from '../popups/popup-screen';

/** Same ceiling as the popup `linkUrl` column. */
export const AD_LINK_MAX_LENGTH = 500;

// eslint-disable-next-line no-control-regex -- rejecting control characters is the point.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const INTERNAL_HOST_SUFFIXES = ['.local', '.internal', '.lan', '.home.arpa'];
/** 100.64.0.0/10 (carrier-grade NAT); `isPrivateHostname` does not cover it. */
const CARRIER_GRADE_NAT = /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./u;
/** First path segments the web app owns for itself; an ad must not send people there. */
const RESERVED_FIRST_SEGMENTS = new Set(['admin', 'api', 'uploads', 'tournament-ops']);
const MAX_DECODE_ROUNDS = 4;
const IN_APP_BASE = 'https://app.invalid';

/**
 * True when the in-app path, once percent-decoding and dot segments are applied the way a browser and the
 * router would, lands under a reserved first segment. Anything that cannot be decoded cleanly is treated as
 * reserved rather than guessed at. Query and fragment are not part of the path.
 */
function isReservedInternalPath(value: string): boolean {
  const end = value.search(/[?#]/u);
  let path = end === -1 ? value : value.slice(0, end);
  for (let round = 0; ; round += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      // A malformed escape in the link itself is rejected; one that only appears after a decoding round is a literal "%".
      if (round === 0) return true;
      break;
    }
    if (decoded === path) break;
    if (round >= MAX_DECODE_ROUNDS) return true;
    path = decoded;
  }
  if (path.startsWith('//') || path.includes('\\') || CONTROL_CHARACTERS.test(path)) return true;
  // Dot segments can normalize into a protocol-relative path: `/..//evil.example` becomes `//evil.example`.
  const resolved = new URL(path, IN_APP_BASE);
  if (resolved.origin !== IN_APP_BASE || resolved.pathname.startsWith('//')) return true;
  const firstSegment = resolved.pathname.split('/')[1] ?? '';
  return RESERVED_FIRST_SEGMENTS.has(firstSegment.toLowerCase());
}

/**
 * An ad link is an in-app path or a public-looking HTTPS URL. It starts from the notice-popup rule
 * (`isSafePopupLink`) and adds what that rule leaves open: userinfo, loopback/private/link-local
 * hosts, IPv6 literals (IPv4-mapped forms hide private addresses), single-label and internal-suffix
 * hosts (a trailing dot does not hide them), backslashes, and control characters. In-app paths may not enter
 * the admin, API, upload or tournament-ops areas. The popup rule itself is unchanged.
 */
export function isSafeAdLinkUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > AD_LINK_MAX_LENGTH) return false;
  if (CONTROL_CHARACTERS.test(value) || value.includes('\\')) return false;
  if (!isSafePopupLink(value)) return false;
  if (value.startsWith('/')) return !isReservedInternalPath(value);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/\.+$/u, '');
  if (host.startsWith('[')) return false;
  if (isPrivateHostname(host) || CARRIER_GRADE_NAT.test(host)) return false;
  if (!host.includes('.')) return false;
  return !INTERNAL_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export function IsSafeAdLinkUrl(validationOptions?: ValidationOptions) {
  return (target: object, propertyName: string): void => {
    registerDecorator({
      name: 'isSafeAdLinkUrl',
      target: target.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => isSafeAdLinkUrl(value),
        defaultMessage: () => `${propertyName} must be an in-app path or a public HTTPS URL without credentials`,
      },
    });
  };
}

import { registerDecorator, type ValidationOptions } from 'class-validator';
import { isPrivateHostname } from '../common/safe-image-url';
import { isSafePopupLink } from '../popups/popup-screen';

/** Same ceiling as the popup `linkUrl` column. */
export const AD_LINK_MAX_LENGTH = 500;

// eslint-disable-next-line no-control-regex -- rejecting control characters is the point.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const INTERNAL_HOST_SUFFIXES = ['.local', '.internal', '.lan', '.home.arpa'];

/**
 * An ad link is an in-app path or a public-looking HTTPS URL. It starts from the notice-popup rule
 * (`isSafePopupLink`) and adds what that rule leaves open: userinfo, loopback/private/link-local
 * hosts, IPv6 literals (IPv4-mapped forms hide private addresses), single-label and internal-suffix
 * hosts, backslashes, and control characters. The popup rule itself is unchanged.
 */
export function isSafeAdLinkUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > AD_LINK_MAX_LENGTH) return false;
  if (CONTROL_CHARACTERS.test(value) || value.includes('\\')) return false;
  if (!isSafePopupLink(value)) return false;
  if (value.startsWith('/')) return true;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (host.startsWith('[')) return false;
  if (isPrivateHostname(host)) return false;
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

import { registerDecorator, type ValidationOptions } from 'class-validator';

const SAFE_MEDIA_SEGMENT = /^[\p{L}\p{N}._-]+$/u;
const UNSAFE_URL_CHARACTERS = /[\\'"<>{}\u0000-\u001f\u007f]/u;
const ENCODED_CSS_BREAKOUT = /%(?:22|27|5c)/iu;
const UPLOADS_PREFIX = '/uploads/';

export type SafeImageUrlOptions = {
  /** true 면 `/uploads/` 안의 안전한 경로만 허용한다(https 거부, 점으로 시작하는 세그먼트 거부). */
  localUploadsOnly?: boolean;
};

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true;
  if (/^(?:0|10|127|169\.254|192\.168)\./u.test(host)) return true;
  const private172 = /^172\.(\d{1,2})\./u.exec(host);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return true;
  return /^(?:fc|fd|fe8|fe9|fea|feb)[0-9a-f:]*$/u.test(host);
}

/**
 * 이미지 URL 이 CSS `url()`·`<img src>` 에 그대로 실려도 안전한지 판정한다.
 * `uploads/.private/` 에 채팅 파일·임시 파일이 있어 localUploadsOnly 는 점 세그먼트를 거부한다.
 */
export function isSafeImageUrl(value: unknown, options: SafeImageUrlOptions = {}): boolean {
  if (typeof value !== 'string' || UNSAFE_URL_CHARACTERS.test(value)) return false;
  const localOnly = options.localUploadsOnly === true;

  if (value.startsWith(UPLOADS_PREFIX)) {
    const segments = value.slice(UPLOADS_PREFIX.length).split('/');
    return (
      segments.length > 0 &&
      segments.every(
        (segment) =>
          segment !== '.' &&
          segment !== '..' &&
          SAFE_MEDIA_SEGMENT.test(segment) &&
          !(localOnly && segment.startsWith('.')),
      )
    );
  }
  if (localOnly || ENCODED_CSS_BREAKOUT.test(value)) return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' && !url.username && !url.password && !isPrivateHostname(url.hostname)
    );
  } catch {
    return false;
  }
}

export function IsSafeImageUrl(options: SafeImageUrlOptions = {}, validationOptions?: ValidationOptions) {
  return (target: object, propertyName: string): void => {
    registerDecorator({
      name: 'isSafeImageUrl',
      target: target.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => isSafeImageUrl(value, options),
        defaultMessage: () =>
          options.localUploadsOnly === true
            ? 'coverImageUrl must be a local /uploads/ path'
            : 'imageUrl must be an HTTPS URL or a local /uploads/ path',
      },
    });
  };
}

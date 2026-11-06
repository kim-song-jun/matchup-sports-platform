import { getImageProps } from 'next/image';

export function publicAssetPath(path: string) {
  return path;
}

function cssUrl(path: string) {
  const escaped = path
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\d ')
    .replace(/\n/g, '\\a ')
    .replace(/\f/g, '\\c ');
  return `url("${escaped}")`;
}

/**
 * `/_next/image` 가 줄여 줄 수 있는 같은 origin 경로인지. 외부 URL 은 remotePatterns 밖이라 400 이 되고,
 * `/api/` 응답은 쿠키가 있어야 받을 수 있는데 최적화 서버는 쿠키 없이 받아 온다.
 */
export function isOptimizableImagePath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/api/');
}

/**
 * 화면에 `displayWidth`(CSS px)로 그려지는 이미지를 2배 밀도 폭의 WebP 로 받는 URL.
 * 최적화할 수 없는 경로와 data:·blob:·SVG 는 원본 그대로 돌려준다(SVG·data·blob 판정은 next/image 가 한다).
 */
export function optimizedImageSrc(path: string, displayWidth: number): string {
  const src = publicAssetPath(path);
  if (!isOptimizableImagePath(src)) return src;
  return getImageProps({ src, alt: '', width: displayWidth, height: displayWidth }).props.src;
}

/** CSS `background`/`background-image` 용 `url("…")`. 원본을 직접 넣지 말고 이것을 쓴다. */
export function optimizedCssUrl(path: string, displayWidth: number): string {
  return cssUrl(optimizedImageSrc(path, displayWidth));
}

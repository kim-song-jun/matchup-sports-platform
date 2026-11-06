import type { CSSProperties } from 'react';
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

type ResponsiveBackgroundVars = Record<'--tm-bg-image' | '--tm-bg-image-wide', string>;

/**
 * 폭에 따라 다른 크기의 사진을 받는 CSS 배경. 배경 한 장은 URL 이 하나뿐이라, 좁은 화면용·넓은 화면용을
 * 사용자 지정 속성 두 개로 나눠 담고 `.tm-responsive-bg`(globals.css)가 폭에 맞는 쪽만 background-image 로 쓴다.
 * 요소의 인라인 `background`/`backgroundImage` 와 함께 쓰면 이 클래스가 진다 — 위치·크기는 longhand 로 둔다.
 */
export function responsiveBackgroundImageVars(path: string, narrowWidth: number, wideWidth: number): CSSProperties {
  const vars: ResponsiveBackgroundVars = {
    '--tm-bg-image': optimizedCssUrl(path, narrowWidth),
    '--tm-bg-image-wide': optimizedCssUrl(path, wideWidth),
  };
  return vars as CSSProperties;
}

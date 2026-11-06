import { describe, expect, it } from 'vitest';
import { isOptimizableImagePath, optimizedCssUrl, optimizedImageSrc, publicAssetPath, responsiveBackgroundImageVars } from './assets';

function optimizerParams(src: string) {
  const url = new URL(src, 'http://localhost');
  return { pathname: url.pathname, url: url.searchParams.get('url'), w: url.searchParams.get('w') };
}

describe('publicAssetPath', () => {
  it('keeps public assets at the web root', () => {
    expect(publicAssetPath('/brand/teameet-mark.png')).toBe('/brand/teameet-mark.png');
  });
});

describe('isOptimizableImagePath', () => {
  it('accepts same-origin static paths only', () => {
    expect(isOptimizableImagePath('/uploads/2026/11/a.png')).toBe(true);
    expect(isOptimizableImagePath('/illustrations/futsal-640.webp')).toBe(true);
    expect(isOptimizableImagePath('https://k.kakaocdn.net/a.jpg')).toBe(false);
    expect(isOptimizableImagePath('//cdn.example.com/a.jpg')).toBe(false);
    expect(isOptimizableImagePath('/api/v1/chat/rooms/r/messages/m/file')).toBe(false);
    expect(isOptimizableImagePath('blob:https://teameet.co.kr/123')).toBe(false);
    expect(isOptimizableImagePath('data:image/png;base64,AAAA')).toBe(false);
  });
});

describe('optimizedImageSrc', () => {
  it('requests an uploaded image at twice the display width instead of the original', () => {
    expect(optimizerParams(optimizedImageSrc('/uploads/2026/11/a.png', 56))).toEqual({
      pathname: '/_next/image',
      url: '/uploads/2026/11/a.png',
      w: '128',
    });
  });

  it('snaps large display widths to an allowed optimizer width', () => {
    expect(optimizerParams(optimizedImageSrc('/uploads/2026/11/a.png', 390)).w).toBe('828');
  });

  it('returns paths the optimizer cannot fetch unchanged', () => {
    expect(optimizedImageSrc('https://k.kakaocdn.net/a.jpg', 40)).toBe('https://k.kakaocdn.net/a.jpg');
    expect(optimizedImageSrc('blob:https://teameet.co.kr/123', 40)).toBe('blob:https://teameet.co.kr/123');
    expect(optimizedImageSrc('/brand/teameet-mark.svg', 40)).toBe('/brand/teameet-mark.svg');
  });
});

describe('optimizedCssUrl', () => {
  it('wraps the optimized URL for CSS backgrounds', () => {
    const css = optimizedCssUrl('/uploads/2026/11/a.png', 56);
    expect(css.startsWith('url("/_next/image?')).toBe(true);
    expect(optimizerParams(css.slice(5, -2)).url).toBe('/uploads/2026/11/a.png');
  });

  it('escapes CSS string control characters, quotes, and backslashes', () => {
    expect(optimizedCssUrl('https://cdn.example.com/a\\b"c\n.png', 40)).toBe('url("https://cdn.example.com/a\\\\b\\"c\\a .png")');
  });
});

describe('responsiveBackgroundImageVars', () => {
  const vars = (path: string, narrow: number, wide: number) =>
    responsiveBackgroundImageVars(path, narrow, wide) as Record<string, string>;
  const requestOf = (css: string) => optimizerParams(css.slice(5, -2));

  it('좁은 화면용·넓은 화면용 주소를 서로 다른 폭의 사용자 지정 속성 두 개로 낸다', () => {
    const style = vars('/uploads/2026/11/a.png', 600, 960);

    expect(Object.keys(style).sort()).toEqual(['--tm-bg-image', '--tm-bg-image-wide']);
    expect(requestOf(style['--tm-bg-image'])).toEqual({ pathname: '/_next/image', url: '/uploads/2026/11/a.png', w: '1200' });
    expect(requestOf(style['--tm-bg-image-wide'])).toEqual({ pathname: '/_next/image', url: '/uploads/2026/11/a.png', w: '1920' });
  });

  it('최적화할 수 없는 경로는 두 속성이 같은 원본 주소를 가리킨다', () => {
    const external = vars('https://cdn.example.com/banner.png', 600, 960);
    expect(external['--tm-bg-image']).toBe('url("https://cdn.example.com/banner.png")');
    expect(external['--tm-bg-image-wide']).toBe(external['--tm-bg-image']);

    const blob = vars('blob:https://teameet.co.kr/123', 600, 960);
    expect(blob['--tm-bg-image']).toBe('url("blob:https://teameet.co.kr/123")');
    expect(blob['--tm-bg-image-wide']).toBe(blob['--tm-bg-image']);
  });
});

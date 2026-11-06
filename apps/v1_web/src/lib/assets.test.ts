import { describe, expect, it } from 'vitest';
import { isOptimizableImagePath, optimizedCssUrl, optimizedImageSrc, publicAssetPath } from './assets';

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

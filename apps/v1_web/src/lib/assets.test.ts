import { describe, expect, it } from 'vitest';
import { cssUrl, publicAssetPath } from './assets';

describe('publicAssetPath', () => {
  it('keeps public assets at the web root', () => {
    expect(publicAssetPath('/brand/teameet-mark.png')).toBe('/brand/teameet-mark.png');
  });
});

describe('cssUrl', () => {
  it('escapes CSS string control characters, quotes, and backslashes', () => {
    expect(cssUrl('/mock/a\\b"c\n.png')).toBe('url("/mock/a\\\\b\\"c\\a .png")');
  });
});

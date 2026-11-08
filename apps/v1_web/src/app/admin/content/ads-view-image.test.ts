import { describe, expect, it } from 'vitest';
import {
  AD_IMAGE_SPECS,
  checkAdImageRatio,
  prepareAdImage,
  type ImageSize,
} from './ads-view-image';

describe('checkAdImageRatio', () => {
  it('accepts the exact ratios', () => {
    expect(checkAdImageRatio('banner', { width: 3500, height: 1000 })).toEqual({ ok: true, warnings: [] });
    expect(checkAdImageRatio('popup', { width: 1200, height: 900 })).toEqual({ ok: true, warnings: [] });
  });

  it.each([
    ['banner', 357, 100, true],
    ['banner', 358, 100, false],
    ['banner', 343, 100, true],
    ['banner', 342, 100, false],
    ['popup', 1224, 900, true],
    ['popup', 1225, 900, false],
    ['popup', 1176, 900, true],
    ['popup', 1175, 900, false],
  ] as const)('%s %i×%i is %s at the ±2%% edge', (channel, width, height, accepted) => {
    expect(checkAdImageRatio(channel, { width, height }).ok).toBe(accepted);
  });

  it('refuses with the ratio to use and the size it got', () => {
    expect(checkAdImageRatio('banner', { width: 1000, height: 1000 })).toEqual({
      ok: false,
      message: '배너는 3.5:1 이미지를 올려 주세요. 지금 이미지는 1000×1000예요.',
    });
    expect(checkAdImageRatio('popup', { width: 1600, height: 900 })).toEqual({
      ok: false,
      message: '팝업은 4:3 이미지를 올려 주세요. 지금 이미지는 1600×900예요.',
    });
  });

  it('accepts a small image of the right ratio but warns that it can look blurry', () => {
    const small = checkAdImageRatio('banner', { width: 700, height: 200 });
    expect(small.ok).toBe(true);
    expect(small).toMatchObject({ warnings: [expect.stringContaining('흐려 보일 수 있어요')] });
    expect(checkAdImageRatio('popup', { width: 800, height: 600 })).toMatchObject({
      warnings: [expect.stringContaining('흐려 보일 수 있어요')],
    });
  });

  it('stops warning exactly at the recommended width', () => {
    expect(checkAdImageRatio('banner', { width: AD_IMAGE_SPECS.banner.minWidth, height: 300 })).toEqual({ ok: true, warnings: [] });
    expect(checkAdImageRatio('popup', { width: AD_IMAGE_SPECS.popup.minWidth, height: 630 })).toEqual({ ok: true, warnings: [] });
  });
});

function imageFile(name: string, type = 'image/png') {
  return new File(['x'], name, { type });
}

/** Sizes are keyed by file name so a "compressed" file can report a different size than the original. */
function sizeReader(sizes: Record<string, ImageSize>) {
  return async (file: File) => {
    const size = sizes[file.name];
    if (!size) throw new Error('unreadable');
    return size;
  };
}

describe('prepareAdImage', () => {
  it('refuses a format the server does not accept', async () => {
    const result = await prepareAdImage(imageFile('a.gif', 'image/gif'), 'banner', {
      readSize: sizeReader({ 'a.gif': { width: 3500, height: 1000 } }),
      compress: async (file) => file,
    });
    expect(result).toEqual({ ok: false, message: 'JPEG·PNG·WebP 이미지만 올릴 수 있어요.' });
  });

  it('refuses a file the browser cannot decode instead of uploading it blind', async () => {
    const result = await prepareAdImage(imageFile('broken.png'), 'banner', {
      readSize: sizeReader({}),
      compress: async (file) => file,
    });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('이미지를 읽지 못했어요') });
  });

  it('refuses a wrong ratio before compressing anything', async () => {
    let compressed = false;
    const result = await prepareAdImage(imageFile('wide.png'), 'popup', {
      readSize: sizeReader({ 'wide.png': { width: 1600, height: 900 } }),
      compress: async (file) => { compressed = true; return file; },
    });
    expect(result).toEqual({ ok: false, message: '팝업은 4:3 이미지를 올려 주세요. 지금 이미지는 1600×900예요.' });
    expect(compressed).toBe(false);
  });

  it('returns the original file when compression keeps it', async () => {
    const file = imageFile('banner.png');
    const result = await prepareAdImage(file, 'banner', {
      readSize: sizeReader({ 'banner.png': { width: 2100, height: 600 } }),
      compress: async (original) => original,
    });
    expect(result).toEqual({ ok: true, file, size: { width: 2100, height: 600 }, warnings: [] });
  });

  it('refuses when compression changed the ratio', async () => {
    const result = await prepareAdImage(imageFile('big.png'), 'banner', {
      readSize: sizeReader({
        'big.png': { width: 3500, height: 1000 },
        'big.webp': { width: 1920, height: 700 },
      }),
      compress: async () => imageFile('big.webp', 'image/webp'),
    });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('비율이 바뀌었어요') });
  });

  it('warns from the compressed size, because that is what readers will see', async () => {
    const compressed = imageFile('big.webp', 'image/webp');
    const result = await prepareAdImage(imageFile('big.png'), 'banner', {
      readSize: sizeReader({
        'big.png': { width: 3500, height: 1000 },
        'big.webp': { width: 800, height: 229 },
      }),
      compress: async () => compressed,
    });
    expect(result).toMatchObject({
      ok: true,
      file: compressed,
      size: { width: 800, height: 229 },
      warnings: [expect.stringContaining('흐려 보일 수 있어요')],
    });
  });

  it('passes the compression failure message through (file cannot fit in 5MB)', async () => {
    const result = await prepareAdImage(imageFile('huge.png'), 'banner', {
      readSize: sizeReader({ 'huge.png': { width: 7000, height: 2000 } }),
      compress: async () => { throw new Error('이미지 용량을 5MB 아래로 줄이지 못했어요.'); },
    });
    expect(result).toEqual({ ok: false, message: '이미지 용량을 5MB 아래로 줄이지 못했어요.' });
  });
});

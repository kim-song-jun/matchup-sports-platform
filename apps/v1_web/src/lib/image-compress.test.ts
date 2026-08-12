import { describe, expect, it, vi } from 'vitest';
import {
  compressImageForUpload,
  compressImagesForUpload,
  fitWithin,
  IMAGE_TOO_LARGE_MESSAGE,
  UPLOAD_IMAGE_MAX_BYTES,
  type ImageEncoder,
} from './image-compress';

function makeFile(bytes: number, type = 'image/jpeg', name = 'poster.jpg'): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function makeBlob(bytes: number, type = 'image/webp'): Blob {
  return new Blob([new Uint8Array(bytes)], { type });
}

const MB = 1024 * 1024;

describe('fitWithin', () => {
  it('긴 변이 상한을 넘으면 종횡비를 유지한 채 줄인다', () => {
    expect(fitWithin(4000, 3000, 1920)).toEqual({ width: 1920, height: 1440 });
    expect(fitWithin(3000, 4000, 1920)).toEqual({ width: 1440, height: 1920 });
  });

  it('상한 이하 이미지는 확대하지 않는다', () => {
    expect(fitWithin(800, 600, 1920)).toEqual({ width: 800, height: 600 });
  });

  it('극단적인 종횡비에서도 최소 1px 을 유지한다', () => {
    expect(fitWithin(10000, 3, 1000)).toEqual({ width: 1000, height: 1 });
  });
});

describe('compressImageForUpload', () => {
  it('한도를 넘는 원본을 한도 안 파일로 재인코딩한다', async () => {
    const encode: ImageEncoder = vi.fn(async () => makeBlob(400 * 1024));
    const result = await compressImageForUpload(makeFile(12 * MB), encode);

    expect(result.size).toBeLessThanOrEqual(UPLOAD_IMAGE_MAX_BYTES);
    expect(result.type).toBe('image/webp');
    expect(result.name).toBe('poster.webp');
    expect(encode).toHaveBeenCalledTimes(1);
  });

  it('첫 시도가 여전히 한도를 넘으면 품질을 낮춰 다시 시도한다', async () => {
    const encode: ImageEncoder = vi.fn(async (_file, _maxEdge, quality) =>
      makeBlob(quality > 0.8 ? 9 * MB : 2 * MB),
    );
    const result = await compressImageForUpload(makeFile(20 * MB), encode);

    expect(result.size).toBe(2 * MB);
    expect(encode).toHaveBeenCalledTimes(2);
    expect(vi.mocked(encode).mock.calls[0]?.[2]).toBeGreaterThan(
      vi.mocked(encode).mock.calls[1]?.[2] ?? 1,
    );
  });

  it('품질을 최저로 낮춰도 부족하면 긴 변 상한을 줄여 다시 시도한다', async () => {
    const encode: ImageEncoder = vi.fn(async (_file, maxEdge) =>
      makeBlob(maxEdge >= 1920 ? 9 * MB : 3 * MB),
    );
    const result = await compressImageForUpload(makeFile(30 * MB), encode);

    expect(result.size).toBe(3 * MB);
    expect(vi.mocked(encode).mock.calls[0]?.[1]).toBe(1920);
    expect(vi.mocked(encode).mock.calls.at(-1)?.[1]).toBeLessThan(1920);
  });

  it('재인코딩 결과가 원본보다 커지면 원본을 그대로 쓴다', async () => {
    const original = makeFile(2 * MB, 'image/png', 'logo.png');
    const encode: ImageEncoder = vi.fn(async () => makeBlob(4 * MB));
    const result = await compressImageForUpload(original, encode);

    expect(result).toBe(original);
  });

  it('한도 이하로 작은 원본은 재인코딩하지 않는다', async () => {
    const original = makeFile(900 * 1024);
    const encode: ImageEncoder = vi.fn(async () => makeBlob(100 * 1024));
    const result = await compressImageForUpload(original, encode);

    expect(result).toBe(original);
    expect(encode).not.toHaveBeenCalled();
  });

  it('캔버스를 쓸 수 없는 환경에서 한도 이하 원본은 그대로 통과시킨다', async () => {
    const original = makeFile(3 * MB);
    const encode: ImageEncoder = vi.fn(async () => null);

    await expect(compressImageForUpload(original, encode)).resolves.toBe(original);
  });

  it('압축이 불가능하고 원본도 한도를 넘으면 무엇을 해야 하는지 알려주는 에러를 던진다', async () => {
    const encode: ImageEncoder = vi.fn(async () => null);

    await expect(compressImageForUpload(makeFile(12 * MB), encode)).rejects.toThrow(
      IMAGE_TOO_LARGE_MESSAGE,
    );
  });

  it('캔버스로 다룰 수 없는 형식은 손대지 않고 서버 검증에 맡긴다', async () => {
    const original = makeFile(12 * MB, 'image/gif', 'anim.gif');
    const encode: ImageEncoder = vi.fn(async () => makeBlob(100 * 1024));
    const result = await compressImageForUpload(original, encode);

    expect(result).toBe(original);
    expect(encode).not.toHaveBeenCalled();
  });
});

describe('compressImagesForUpload', () => {
  it('여러 장을 동시에 인코딩하지 않는다 — 모바일에서 비트맵이 한꺼번에 잡히면 탭이 죽는다', async () => {
    let inFlight = 0;
    let peakInFlight = 0;
    const encode: ImageEncoder = async () => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return makeBlob(200 * 1024);
    };

    const results = await compressImagesForUpload(
      [makeFile(9 * MB, 'image/jpeg', 'a.jpg'), makeFile(9 * MB, 'image/jpeg', 'b.jpg'), makeFile(9 * MB, 'image/jpeg', 'c.jpg')],
      encode,
    );

    expect(peakInFlight).toBe(1);
    expect(results.map((file) => file.name)).toEqual(['a.webp', 'b.webp', 'c.webp']);
  });

  it('원본 순서를 그대로 유지한다', async () => {
    const encode: ImageEncoder = async () => makeBlob(100 * 1024);
    const results = await compressImagesForUpload(
      [makeFile(400 * 1024, 'image/jpeg', 'small.jpg'), makeFile(9 * MB, 'image/jpeg', 'big.jpg')],
      encode,
    );

    expect(results.map((file) => file.name)).toEqual(['small.jpg', 'big.webp']);
  });
});

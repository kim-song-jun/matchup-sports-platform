import { describe, expect, it, vi } from 'vitest';
import {
  compressImageForUpload,
  compressImagesForUpload,
  encodeCanvasToBlob,
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
    const original = makeFile(3 * MB, 'image/png', 'logo.png');
    const encode: ImageEncoder = vi.fn(async () => makeBlob(4 * MB));
    const result = await compressImageForUpload(original, encode);

    expect(result).toBe(original);
  });

  it('2MB 이하는 손대지 않고, 2MB 를 넘으면 WebP 로 변환한다 -- 사용자 확정 경계', async () => {
    // "용량 제한을 빼고 2MB 넘어가면 자동으로 WebP 변환"(2026-08-25). 경계가 밀리면
    // 멀쩡한 사진을 다시 인코딩해 화질만 잃거나, 큰 사진이 변환 없이 서버 한도로 간다.
    const encode: ImageEncoder = vi.fn(async () => makeBlob(500 * 1024));

    const atLimit = makeFile(2 * MB, 'image/jpeg', 'at.jpg');
    await expect(compressImageForUpload(atLimit, encode)).resolves.toBe(atLimit);
    expect(encode).not.toHaveBeenCalled();

    const overLimit = await compressImageForUpload(makeFile(2 * MB + 1, 'image/jpeg', 'over.jpg'), encode);
    expect(overLimit.type).toBe('image/webp');
    expect(overLimit.name).toBe('over.webp');
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

  it('서버가 안 받는 형식(HEIC·GIF)은 크기와 무관하게 WebP 로 변환해 살린다', async () => {
    // 서버는 jpeg/png/webp 만 받는다 -- 원본 그대로 보내면 어차피 거부되므로,
    // 브라우저가 디코드할 수 있으면 변환해서 업로드가 성공하게 만든다(아이폰 HEIC 실사례).
    const original = makeFile(1 * MB, 'image/heic', 'photo.heic');
    const encode: ImageEncoder = vi.fn(async () => makeBlob(800 * 1024));
    const result = await compressImageForUpload(original, encode);

    expect(result.type).toBe('image/webp');
    expect(result.name).toBe('photo.webp');
  });

  it('서버가 안 받는 형식인데 디코드도 안 되면 원본을 그대로 보내 서버 검증이 말하게 한다', async () => {
    // 여기서 용량 에러를 던지면 진짜 문제(형식)를 가린다 -- 서버의 형식 에러가 정답이다.
    const original = makeFile(12 * MB, 'image/gif', 'anim.gif');
    const encode: ImageEncoder = vi.fn(async () => null);

    await expect(compressImageForUpload(original, encode)).resolves.toBe(original);
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

describe('encodeCanvasToBlob', () => {
  function fakeCanvas(supported: Set<string>) {
    const calls: string[] = [];
    const canvas = {
      toBlob(callback: (blob: Blob | null) => void, type?: string) {
        calls.push(type ?? '');
        // 브라우저는 지원하지 않는 형식을 요청받으면 PNG 로 조용히 대체한다(Safari 의 WebP).
        const actual = type && supported.has(type) ? type : 'image/png';
        callback(makeBlob(10, actual));
      },
    };
    return { canvas, calls };
  }

  it('WebP 를 지원하는 브라우저는 WebP 한 번으로 끝난다', async () => {
    const { canvas, calls } = fakeCanvas(new Set(['image/webp', 'image/jpeg']));
    const blob = await encodeCanvasToBlob(canvas, 0.8);
    expect(blob?.type).toBe('image/webp');
    expect(calls).toEqual(['image/webp']);
  });

  it('WebP 요청이 PNG 로 대체되는 브라우저(Safari)는 JPEG 로 다시 인코딩한다', async () => {
    const { canvas, calls } = fakeCanvas(new Set(['image/jpeg']));
    const blob = await encodeCanvasToBlob(canvas, 0.8);
    expect(blob?.type).toBe('image/jpeg');
    expect(calls).toEqual(['image/webp', 'image/jpeg']);
  });
});

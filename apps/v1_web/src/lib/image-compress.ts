/**
 * 업로드 전에 브라우저에서 이미지를 축소·재인코딩한다.
 *
 * 대회 홍보 이미지처럼 원본 포스터를 그대로 올리면 서버 업로드 한도(UploadsService 의
 * 5MB 정밀 검증, 그 위의 multer 하드캡 10MB)에 걸려 413 "File too large" 로 실패한다.
 * 홍보 카드가 실제로 렌더되는 폭은 1200px 남짓이라 원본 해상도가 필요 없으므로,
 * 전송 전에 긴 변을 줄이고 WebP 로 재인코딩해 한도 안으로 들여보낸다.
 */

/** 서버 UploadsService 의 image 정밀 한도(KIND_RULES.image.maxBytes)와 동일하게 유지한다. */
export const UPLOAD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * 이 크기 이하 원본은 재인코딩하지 않는다. 이미 한도 안이라 다시 인코딩해봐야
 * 화질만 잃고 얻는 게 없다.
 */
const SKIP_RECOMPRESS_BELOW_BYTES = 1.5 * 1024 * 1024;

/**
 * 캔버스로 다시 그릴 수 있는 MIME 만 처리한다. 그 외 형식은 손대지 않고 그대로
 * 보내 서버의 형식 검증(UPLOAD_FILE_TYPE_INVALID)이 판정하게 둔다.
 */
const RECOMPRESSIBLE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** 긴 변 상한 → 품질 순으로 낮춰가며 한도 안에 들어올 때까지 시도한다. */
const MAX_EDGE_STEPS = [1920, 1440, 1080];
const QUALITY_STEPS = [0.85, 0.7, 0.55];

export const IMAGE_TOO_LARGE_MESSAGE =
  '이미지 용량을 5MB 아래로 줄이지 못했어요. 더 작은 이미지를 선택해주세요.';

/**
 * 원본 파일을 주어진 긴 변 상한·품질로 재인코딩한다. 인코딩할 수 없는 환경이면
 * null 을 돌려주고, 호출자는 원본을 그대로 쓴다.
 */
export type ImageEncoder = (
  file: File,
  maxEdge: number,
  quality: number,
) => Promise<Blob | null>;

/** 종횡비를 유지한 채 긴 변이 maxEdge 를 넘지 않도록 줄인 크기 (확대하지 않는다). */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longestEdge = Math.max(width, height);
  if (longestEdge <= maxEdge) return { width, height };

  const ratio = maxEdge / longestEdge;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/** 재인코딩 결과의 확장자를 실제 blob MIME 에 맞춰 바꾼다. */
function toEncodedFile(original: File, blob: Blob): File {
  const extension = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
  const baseName = original.name.replace(/\.[^./\\]+$/, '') || 'image';
  return new File([blob], `${baseName}.${extension}`, {
    type: blob.type,
    lastModified: original.lastModified,
  });
}

/**
 * 업로드에 쓸 파일을 돌려준다 — 필요하면 축소·재인코딩한 새 File, 아니면 원본 그대로.
 *
 * 재인코딩해도 한도(5MB) 안으로 못 들어오고 원본도 한도를 넘으면, 서버의 영어 413 대신
 * 무엇을 해야 하는지 알려주는 한국어 에러를 던진다.
 */
export async function compressImageForUpload(
  file: File,
  encode: ImageEncoder = encodeWithCanvas,
): Promise<File> {
  const withinLimit = file.size <= UPLOAD_IMAGE_MAX_BYTES;

  if (!RECOMPRESSIBLE_MIME_TYPES.includes(file.type)) return file;
  if (file.size <= SKIP_RECOMPRESS_BELOW_BYTES) return file;

  for (const maxEdge of MAX_EDGE_STEPS) {
    for (const quality of QUALITY_STEPS) {
      const encoded = await encode(file, maxEdge, quality);
      // 인코딩 자체가 불가능한 환경(캔버스 없음·디코드 실패)이면 더 시도해도 같다.
      if (!encoded) {
        if (withinLimit) return file;
        throw new Error(IMAGE_TOO_LARGE_MESSAGE);
      }
      // 재인코딩이 원본보다 커지는 경우(작은 PNG 등)가 있어 크기가 줄었을 때만 채택한다.
      if (encoded.size <= UPLOAD_IMAGE_MAX_BYTES && encoded.size < file.size) {
        return toEncodedFile(file, encoded);
      }
    }
  }

  if (withinLimit) return file;
  throw new Error(IMAGE_TOO_LARGE_MESSAGE);
}

/** 브라우저 캔버스 기반 기본 인코더. 브라우저 밖(SSR·테스트)에서는 null 을 돌려준다. */
async function encodeWithCanvas(
  file: File,
  maxEdge: number,
  quality: number,
): Promise<Blob | null> {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return null;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // 손상된 파일이거나 브라우저가 디코드하지 못하는 형식 — 원본 경로로 넘긴다.
    return null;
  }

  try {
    const size = fitWithin(bitmap.width, bitmap.height, maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;

    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, size.width, size.height);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/webp', quality);
    });
  } finally {
    bitmap.close();
  }
}

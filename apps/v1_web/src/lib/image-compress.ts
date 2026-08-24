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
 * 화질만 잃고 얻는 게 없다. 2MB 는 사용자 확정 정책이다(2026-08-25) --
 * "용량 제한을 빼고, 2MB 넘어가면 자동으로 WebP 변환해서 올린다".
 */
const SKIP_RECOMPRESS_BELOW_BYTES = 2 * 1024 * 1024;

/**
 * 서버가 원본 그대로 받아 주는 MIME. 이 목록의 형식은 2MB 이하면 재인코딩을 생략한다.
 * 목록 밖 `image/*`(HEIC·GIF 등)는 크기와 무관하게 WebP 변환을 **시도**한다 --
 * 서버가 jpeg/png/webp 만 받아서 원본 그대로는 어차피 거부되기 때문이다. 브라우저가
 * 디코드하지 못하면 원본을 그대로 보내 서버의 형식 검증(UPLOAD_FILE_TYPE_INVALID)이
 * 무엇이 문제인지 말하게 둔다.
 */
const SERVER_ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** 긴 변 상한 → 품질 순으로 낮춰가며 한도 안에 들어올 때까지 시도한다.
 * 마지막 단(800px · 0.4)은 "용량 때문에 업로드가 실패하는 일"을 사실상 없애기 위한
 * 최후 단이다 -- 프로필 사진 표시 폭에는 800px 로도 충분하다. */
const MAX_EDGE_STEPS = [1920, 1440, 1080, 800];
const QUALITY_STEPS = [0.85, 0.7, 0.55, 0.4];

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
 * 재인코딩 대상 형식(jpeg/png/webp)인데 재인코딩해도 한도(5MB) 안으로 못 들어오고 원본도
 * 한도를 넘으면, 서버의 영어 413 대신 무엇을 해야 하는지 알려주는 한국어 에러를 던진다.
 * 그 외 형식은 크기와 무관하게 그대로 돌려주고 서버 검증에 맡긴다.
 */
export async function compressImageForUpload(
  file: File,
  encode: ImageEncoder = encodeWithCanvas,
): Promise<File> {
  const withinLimit = file.size <= UPLOAD_IMAGE_MAX_BYTES;
  const serverAccepted = SERVER_ACCEPTED_MIME_TYPES.includes(file.type);

  if (!file.type.startsWith('image/')) return file;
  if (serverAccepted && file.size <= SKIP_RECOMPRESS_BELOW_BYTES) return file;

  for (const maxEdge of MAX_EDGE_STEPS) {
    for (const quality of QUALITY_STEPS) {
      const encoded = await encode(file, maxEdge, quality);
      // 인코딩 자체가 불가능한 환경(캔버스 없음·디코드 실패)이면 더 시도해도 같다.
      if (!encoded) {
        if (serverAccepted && !withinLimit) throw new Error(IMAGE_TOO_LARGE_MESSAGE);
        return file;
      }
      // 서버가 받는 형식은 크기가 줄었을 때만 채택한다(작은 PNG 를 재인코딩하면 커질 수 있다).
      // 서버가 안 받는 형식(HEIC 등)은 원본이 어차피 거부되므로 한도 안이기만 하면 채택한다.
      const adopt = serverAccepted
        ? encoded.size <= UPLOAD_IMAGE_MAX_BYTES && encoded.size < file.size
        : encoded.size <= UPLOAD_IMAGE_MAX_BYTES;
      if (adopt) return toEncodedFile(file, encoded);
    }
  }

  if (withinLimit) return file;
  throw new Error(IMAGE_TOO_LARGE_MESSAGE);
}

/**
 * 여러 장을 순차로 처리한다 — 동시에 돌리면 사진 여러 장을 고른 모바일에서
 * ImageBitmap + 캔버스가 한꺼번에 잡혀(4천만 화소 한 장이 수십 MB) 탭이 죽을 수 있다.
 * 대회 후기 사진첨부(awards)처럼 한 번에 여러 장을 올리는 화면이 실제로 있다.
 * 업로드 자체가 네트워크에 훨씬 오래 묶이므로 직렬화 비용은 사실상 드러나지 않는다.
 */
export async function compressImagesForUpload(
  files: File[],
  encode: ImageEncoder = encodeWithCanvas,
): Promise<File[]> {
  const prepared: File[] = [];
  for (const file of files) {
    prepared.push(await compressImageForUpload(file, encode));
  }
  return prepared;
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

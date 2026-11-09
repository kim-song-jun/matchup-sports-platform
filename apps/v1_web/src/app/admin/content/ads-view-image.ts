import { compressImageForUpload } from '@/lib/image-compress';
import type { V1AdChannel } from '@/types/ads';

export type ImageSize = { width: number; height: number };

type AdImageSpec = {
  /** Width : height as integers, so the tolerance check is exact instead of floating point. */
  ratio: readonly [number, number];
  ratioLabel: string;
  /** Narrower images upload but look blurry on a phone screen. */
  minWidth: number;
  subject: string;
};

export const AD_IMAGE_SPECS: Record<V1AdChannel, AdImageSpec> = {
  banner: { ratio: [7, 2], ratioLabel: '3.5:1', minWidth: 1050, subject: '배너는' },
  popup: { ratio: [4, 3], ratioLabel: '4:3', minWidth: 840, subject: '팝업은' },
};

export const AD_IMAGE_RATIO_TOLERANCE_PERCENT = 2;
export const AD_IMAGE_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const AD_IMAGE_TYPE_MESSAGE = 'JPEG·PNG·WebP 이미지만 올릴 수 있어요.';
export const AD_IMAGE_UNREADABLE_MESSAGE = '이미지를 읽지 못했어요. 파일이 손상됐거나 JPEG·PNG·WebP 형식이 아니에요.';

export type AdImageCheck = { ok: true; warnings: string[] } | { ok: false; message: string };

/** Ratio within ±2% of the channel's ratio, plus a blur warning when the image is narrower than recommended. */
export function checkAdImageRatio(channel: V1AdChannel, size: ImageSize): AdImageCheck {
  const spec = AD_IMAGE_SPECS[channel];
  const [num, den] = spec.ratio;
  const expected = size.height * num;
  const deviation = Math.abs(size.width * den - expected);
  if (size.width <= 0 || size.height <= 0 || deviation * 100 > AD_IMAGE_RATIO_TOLERANCE_PERCENT * expected) {
    return {
      ok: false,
      message: `${spec.subject} ${spec.ratioLabel} 이미지를 올려 주세요. 지금 이미지는 ${size.width}×${size.height}예요.`,
    };
  }
  const warnings = size.width < spec.minWidth
    ? [`가로 ${size.width}px라 작은 화면에서 흐려 보일 수 있어요. ${spec.minWidth}px 이상을 권장해요.`]
    : [];
  return { ok: true, warnings };
}

/** Pixel size as the browser displays it (EXIF orientation applied). Throws when the file cannot be decoded. */
export async function readImageSize(file: File): Promise<ImageSize> {
  if (typeof createImageBitmap !== 'function') throw new Error('createImageBitmap is not available');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

export type PreparedAdImage =
  | { ok: true; file: File; size: ImageSize; warnings: string[] }
  | { ok: false; message: string };

type PrepareDeps = {
  readSize?: (file: File) => Promise<ImageSize>;
  compress?: (file: File) => Promise<File>;
};

/**
 * Everything the owner can fix before an upload: format, ratio, and the file size limit. The ratio is checked on
 * the original and again on the compressed file, because the upload is the compressed one.
 */
export async function prepareAdImage(
  file: File,
  channel: V1AdChannel,
  { readSize = readImageSize, compress = compressImageForUpload }: PrepareDeps = {},
): Promise<PreparedAdImage> {
  if (!AD_IMAGE_ACCEPTED_TYPES.includes(file.type)) return { ok: false, message: AD_IMAGE_TYPE_MESSAGE };

  let original: ImageSize;
  try {
    original = await readSize(file);
  } catch {
    return { ok: false, message: AD_IMAGE_UNREADABLE_MESSAGE };
  }
  const originalCheck = checkAdImageRatio(channel, original);
  if (!originalCheck.ok) return originalCheck;

  let upload: File;
  try {
    upload = await compress(file);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '이미지를 줄이지 못했어요.' };
  }
  if (upload === file) return { ok: true, file, size: original, warnings: originalCheck.warnings };

  let size: ImageSize;
  try {
    size = await readSize(upload);
  } catch {
    return { ok: false, message: AD_IMAGE_UNREADABLE_MESSAGE };
  }
  const uploadCheck = checkAdImageRatio(channel, size);
  if (!uploadCheck.ok) {
    return { ok: false, message: '이미지를 줄이는 중에 비율이 바뀌었어요. 용량이 더 작은 이미지로 다시 올려 주세요.' };
  }
  return { ok: true, file: upload, size, warnings: uploadCheck.warnings };
}

'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { adChannelLabel } from '@/lib/admin-labels';
import type { V1AdChannel } from '@/types/ads';

/** Same ratios the upload check enforces, so the preview frame has the shape the public slot has. */
const FRAME_RATIO: Record<V1AdChannel, string> = {
  banner: 'aspect-[7/2]',
  popup: 'aspect-[4/3]',
};

/**
 * The creative as readers see it: its own ratio, with the 「광고」 chip the public slot always draws.
 * Preview only — it never sends a measurement event.
 */
export function AdCreativePreview({
  channel,
  imageUrl,
  altText,
  className = '',
}: {
  channel: V1AdChannel;
  imageUrl: string;
  altText: string | null;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = failedUrl === imageUrl;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] ${FRAME_RATIO[channel]} ${className}`}
    >
      {failed ? (
        <div className="tm-on-tint flex h-full w-full flex-col items-center justify-center gap-1 px-3 text-center text-[length:var(--font-size-caption)] text-[var(--text-muted)]" role="img" aria-label={`${adChannelLabel(channel)} 이미지를 불러오지 못했어요`}>
          <ImageOff size={20} aria-hidden="true" />
          이미지를 불러오지 못했어요
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- 업로드 직후 원본 비율을 그대로 보여 주는 미리보기라 최적화 변환을 거치지 않는다.
        <img
          src={imageUrl}
          alt={altText?.trim() || `${adChannelLabel(channel)} 소재`}
          loading="lazy"
          onError={() => setFailedUrl(imageUrl)}
          className="block h-full w-full object-contain"
        />
      )}
      <span className="absolute right-2 top-2 rounded bg-[var(--scrim-dark-72)] px-1.5 py-0.5 text-[length:var(--font-size-micro)] font-semibold text-[var(--static-white)]">
        광고
      </span>
    </div>
  );
}

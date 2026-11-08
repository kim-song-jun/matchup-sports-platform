'use client';

import { useId, useState, type ChangeEvent } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { adChannelLabel } from '@/lib/admin-labels';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdChannel } from '@/types/ads';
import { AdCreativePreview } from './ads-view-creative';
import { AD_IMAGE_ACCEPTED_TYPES, AD_IMAGE_SPECS, prepareAdImage } from './ads-view-image';

/** The server rejects anything over this after upload; the hint tells the owner before they try. */
const MAX_FILE_LABEL = '5MB';

const BANNER_CORNER_NOTE = '오른쪽 위에는 「광고」 표시가 붙어요. 그 자리에 글자나 로고를 두지 마세요.';

/**
 * Picks, checks and uploads one channel's image. The check (format, ratio, size) runs in the browser before
 * anything is uploaded, so a wrong image is refused with what to fix instead of a server error afterwards.
 */
export function AdImageField({
  channel,
  imageUrl,
  altText,
  disabled,
  upload,
  onChange,
}: {
  channel: V1AdChannel;
  imageUrl: string;
  altText: string;
  disabled: boolean;
  /** Uploads the prepared file and returns the stored `/uploads/…` url. */
  upload: (file: File) => Promise<string>;
  onChange: (url: string) => void;
}) {
  const inputId = useId();
  const hintId = useId();
  const spec = AD_IMAGE_SPECS[channel];
  const name = adChannelLabel(channel);
  const [phase, setPhase] = useState<'idle' | 'checking' | 'uploading'>('idle');
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    // Cleared so picking the same file again after fixing it still fires `change`.
    input.value = '';
    if (!file) return;

    setError('');
    setPhase('checking');
    const prepared = await prepareAdImage(file, channel);
    if (!prepared.ok) {
      setPhase('idle');
      setError(prepared.message);
      return;
    }

    setPhase('uploading');
    try {
      onChange(await upload(prepared.file));
      setWarnings(prepared.warnings);
    } catch (uploadError) {
      setError(extractErrorMessage(uploadError, '이미지를 올리지 못했어요. 잠시 뒤 다시 시도해 주세요.'));
    } finally {
      setPhase('idle');
    }
  }

  const busy = phase !== 'idle';

  return (
    <div className="flex flex-col gap-2">
      <p id={hintId} className="text-[length:var(--font-size-caption)] leading-5 text-[var(--text-muted)]">
        {spec.ratioLabel} 비율 · 가로 {spec.minWidth}px 이상 · JPEG·PNG·WebP · {MAX_FILE_LABEL} 이하예요.
        {channel === 'banner' ? ` ${BANNER_CORNER_NOTE}` : ''}
      </p>

      {imageUrl ? <AdCreativePreview channel={channel} imageUrl={imageUrl} altText={altText} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          id={inputId}
          type="file"
          accept={AD_IMAGE_ACCEPTED_TYPES.join(',')}
          onChange={(event) => void handleFile(event)}
          disabled={disabled || busy}
          aria-describedby={hintId}
          className="peer sr-only"
        />
        <label
          htmlFor={inputId}
          className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--card-surface)] px-4 text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-body)] transition-colors hover:border-blue-300 hover:text-[var(--blue700)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-500 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
        >
          {name} 이미지 {imageUrl ? '바꾸기' : '올리기'}
        </label>
        {imageUrl ? (
          <button
            type="button"
            onClick={() => {
              setWarnings([]);
              setError('');
              onChange('');
            }}
            disabled={disabled || busy}
            aria-label={`${name} 이미지 지우기`}
            className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-soft)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            <Trash2 size={17} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {busy ? (
        <p role="status" className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
          {phase === 'checking' ? '이미지를 확인하고 있어요.' : '이미지를 올리고 있어요.'}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-[length:var(--font-size-label)] font-medium text-[var(--red700)]">{error}</p>
      ) : null}
      {warnings.map((warning) => (
        <p key={warning} role="status" className="flex items-start gap-1.5 text-[length:var(--font-size-label)] text-[var(--orange700)]">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          {warning}
        </p>
      ))}
    </div>
  );
}

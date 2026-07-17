'use client';

import Image from 'next/image';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useId, useRef } from 'react';
import { publicAssetPath } from '@/lib/assets';

const COVER_EXAMPLE = '/mock/generated/futsal-rooftop.webp';

type CoverImageUploaderProps = {
  value: string | null;
  onSelectFile: (file: File) => void;
  onClear: () => void;
  uploading?: boolean;
  disabled?: boolean;
  label?: string;
  eager?: boolean;
};

export function CoverImageUploader({
  value,
  onSelectFile,
  onClear,
  uploading = false,
  disabled = false,
  label = '커버 이미지',
  eager = false,
}: CoverImageUploaderProps) {
  const generatedId = useId();
  const inputId = `tournament-cover-${generatedId.replaceAll(':', '')}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const locked = uploading || disabled;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[var(--font-size-label)] font-semibold text-[var(--text-body)]">
        {label}
      </span>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,240px)_1fr] sm:items-center">
        <div className="relative aspect-video overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--grey50)]">
          <Image
            src={publicAssetPath(value ?? COVER_EXAMPLE)}
            alt={value ? '선택한 대회 커버 미리보기' : '대회 커버 이미지 예시'}
            fill
            sizes="(max-width: 640px) 100vw, 240px"
            className={`object-cover ${value ? '' : 'opacity-55'}`}
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={eager ? 'high' : 'auto'}
            unoptimized
          />
          {!value ? (
            <div className="absolute inset-0 grid place-items-center bg-black/20 px-4 text-center text-xs font-semibold text-white">
              업로드 전 예시 · 권장 비율 16:9
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-start gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={locked}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onSelectFile(file);
              event.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={locked}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50 disabled:opacity-50"
          >
            <ImagePlus size={16} aria-hidden="true" />
            {uploading ? '업로드 중…' : value ? '이미지 변경' : '이미지 선택'}
          </button>
          {value ? (
            <button
              type="button"
              onClick={onClear}
              disabled={locked}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-[var(--text-caption)] transition-colors hover:bg-red-50 hover:text-[var(--red500)] disabled:opacity-50"
            >
              <Trash2 size={16} aria-hidden="true" />
              이미지 제거
            </button>
          ) : null}
          <p className="text-xs leading-5 text-[var(--text-caption)]">
            JPG, PNG, WebP · 최대 10MB. 목록과 상세 상단에 같은 이미지가 표시돼요.
          </p>
        </div>
      </div>
    </div>
  );
}

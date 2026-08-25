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
  helperText?: string;
  previewAlt?: string;
  eager?: boolean;
  /**
   * 미리보기 맞춤 방식. 사진형 커버는 실제 노출(정사각 썸네일 크롭)과 같은 'cover',
   * 로고처럼 잘리면 안 되는 이미지는 'contain' — 미리보기는 항상 실제 노출을 따라간다.
   */
  previewFit?: 'cover' | 'contain';
};

export function CoverImageUploader({
  value,
  onSelectFile,
  onClear,
  uploading = false,
  disabled = false,
  label = '커버 이미지',
  helperText = 'JPG, PNG, WebP · 큰 사진은 올릴 때 자동으로 줄여요. 목록·상세는 물론 홍보 카드의 기본 이미지로도 함께 쓰여요.',
  previewAlt,
  eager = false,
  previewFit = 'cover',
}: CoverImageUploaderProps) {
  const generatedId = useId();
  const inputId = `tournament-cover-${generatedId.replaceAll(':', '')}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const locked = uploading || disabled;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">
        {label}
      </span>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,240px)_1fr] sm:items-center">
        {/* 2026-08-11: 이 미리보기는 실제 노출 위치(tournament-card.tsx의 56×56 정사각 썸네일 —
            대회 상세·목록 어디에도 와이드 히어로 사용처가 없음)를 그대로 반영해 1:1로 맞춘다.
            이전 16:9 미리보기는 관리자가 가로로 프레이밍한 사진을 업로드하게 유도했지만 실제
            화면에선 좌우가 크게 잘려 나가는 미리보기-실사용 불일치가 있었다. */}
        <div className="relative aspect-square overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--grey50)]">
          <Image
            src={publicAssetPath(value ?? COVER_EXAMPLE)}
            alt={previewAlt ?? (value ? '선택한 대회 커버 미리보기' : '대회 커버 이미지 예시')}
            fill
            sizes="(max-width: 640px) 100vw, 240px"
            className={`${previewFit === 'contain' ? 'object-contain p-3' : 'object-cover'} ${value ? '' : 'opacity-55'}`}
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={eager ? 'high' : 'auto'}
            unoptimized
          />
          {!value ? (
            <div className="absolute inset-0 grid place-items-center bg-black/20 px-4 text-center text-xs font-semibold text-white">
              업로드 전 예시 · 목록·상세에 정사각형으로 표시돼요
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-start gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            aria-label={`${label} 파일 선택`}
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
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--tint-blue-border)] bg-[var(--card-surface)] px-4 text-sm font-semibold text-[var(--blue700)] transition-colors hover:bg-[var(--tint-blue)] disabled:opacity-50"
          >
            <ImagePlus size={16} aria-hidden="true" />
            {uploading ? '업로드 중…' : value ? '이미지 변경' : '이미지 선택'}
          </button>
          {value ? (
            <button
              type="button"
              onClick={onClear}
              disabled={locked}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-[var(--text-caption)] transition-colors hover:bg-[var(--red50)] hover:text-[var(--red500)] disabled:opacity-50"
            >
              <Trash2 size={16} aria-hidden="true" />
              이미지 제거
            </button>
          ) : null}
          <p className="text-xs leading-5 text-[var(--text-caption)]">
            {helperText}
          </p>
        </div>
      </div>
    </div>
  );
}

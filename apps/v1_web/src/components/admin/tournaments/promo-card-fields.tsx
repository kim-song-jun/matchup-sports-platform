'use client';

import { ImagePlus } from 'lucide-react';
import { useId, useRef } from 'react';
import {
  PromoHomePreview,
  PromoListPreview,
  type PromoPreviewFallback,
} from '@/components/admin/promo-card-preview';

export type TournamentPromoCardValue = {
  enabled: boolean;
  title: string;
  subtitle: string;
  imageUrl: string;
  badgeText: string;
  dateText: string;
  teamsText: string;
  locationText: string;
  prizeText: string;
  priority: string;
};

type PromoCardFieldsProps = {
  variant: 'home' | 'list';
  value: TournamentPromoCardValue;
  onChange: (value: TournamentPromoCardValue) => void;
  fallback: PromoPreviewFallback;
  onSelectImage?: (file: File) => void;
  uploading?: boolean;
  disabled?: boolean;
  priorityError?: string;
  /**
   * 이 자리를 비워뒀을 때 실제로 노출될 기본 이미지(대회 커버). 미리보기도 이 값을 반영해
   * 저장 전에 무엇이 보일지 그대로 확인할 수 있게 한다.
   */
  defaultImageUrl?: string | null;
};

const inputClass =
  'h-[44px] w-full rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';

export function PromoCardFields({
  variant,
  value,
  onChange,
  fallback,
  onSelectImage,
  uploading = false,
  disabled = false,
  priorityError,
  defaultImageUrl,
}: PromoCardFieldsProps) {
  const generatedId = useId().replaceAll(':', '');
  const fileRef = useRef<HTMLInputElement>(null);
  const prefix = `promo-${variant}-${generatedId}`;
  const update = <K extends keyof TournamentPromoCardValue>(
    key: K,
    fieldValue: TournamentPromoCardValue[K],
  ) => onChange({ ...value, [key]: fieldValue });
  const trimmedDefaultImageUrl = defaultImageUrl?.trim() ?? '';
  const usingDefaultImage = !value.imageUrl.trim() && Boolean(trimmedDefaultImageUrl);
  const previewFields = {
    title: value.title,
    subtitle: value.subtitle,
    badgeText: value.badgeText,
    imageUrl: value.imageUrl.trim() || trimmedDefaultImageUrl,
    dateText: value.dateText,
    teamsText: value.teamsText,
    locationText: value.locationText,
    prizeText: value.prizeText,
  };

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--grey50)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-strong)]">
            {variant === 'home' ? '홈 오늘의 추천' : '대회 목록 상단'}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-caption)]">
            저장 전에 실제 카드 형태를 확인할 수 있어요.
          </p>
        </div>
        <label className="flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--card-surface)] px-3 text-sm font-semibold text-[var(--text-body)]">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(event) => update('enabled', event.target.checked)}
            disabled={disabled}
            className="h-4 w-4"
          />
          노출
        </label>
      </div>

      <div className="mt-4">
        {variant === 'home' ? (
          <PromoHomePreview fields={previewFields} fallback={fallback} />
        ) : (
          <PromoListPreview fields={previewFields} fallback={fallback} />
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field id={`${prefix}-title`} label="카드 제목">
          <input
            id={`${prefix}-title`}
            value={value.title}
            onChange={(event) => update('title', event.target.value)}
            disabled={disabled}
            maxLength={120}
            className={inputClass}
          />
        </Field>
        <Field id={`${prefix}-badge`} label="배지">
          <input
            id={`${prefix}-badge`}
            value={value.badgeText}
            onChange={(event) => update('badgeText', event.target.value)}
            disabled={disabled}
            maxLength={60}
            className={inputClass}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field id={`${prefix}-subtitle`} label="소개 문구">
            <input
              id={`${prefix}-subtitle`}
              value={value.subtitle}
              onChange={(event) => update('subtitle', event.target.value)}
              disabled={disabled}
              maxLength={300}
              className={inputClass}
            />
          </Field>
        </div>
        <Field id={`${prefix}-date`} label="날짜 문구">
          <input
            id={`${prefix}-date`}
            value={value.dateText}
            onChange={(event) => update('dateText', event.target.value)}
            disabled={disabled}
            maxLength={120}
            className={inputClass}
          />
        </Field>
        <Field id={`${prefix}-teams`} label="팀 문구">
          <input
            id={`${prefix}-teams`}
            value={value.teamsText}
            onChange={(event) => update('teamsText', event.target.value)}
            disabled={disabled}
            maxLength={120}
            className={inputClass}
          />
        </Field>
        <Field id={`${prefix}-location`} label="장소 문구">
          <input
            id={`${prefix}-location`}
            value={value.locationText}
            onChange={(event) => update('locationText', event.target.value)}
            disabled={disabled}
            maxLength={120}
            className={inputClass}
          />
        </Field>
        <Field id={`${prefix}-prize`} label="상금 문구">
          <input
            id={`${prefix}-prize`}
            value={value.prizeText}
            onChange={(event) => update('prizeText', event.target.value)}
            disabled={disabled}
            maxLength={160}
            className={inputClass}
          />
        </Field>
        <Field id={`${prefix}-priority`} label="노출 우선순위" error={priorityError}>
          <input
            id={`${prefix}-priority`}
            type="number"
            inputMode="numeric"
            min={0}
            max={9999}
            value={value.priority}
            onChange={(event) => update('priority', event.target.value)}
            disabled={disabled}
            aria-invalid={Boolean(priorityError)}
            className={inputClass}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field id={`${prefix}-image`} label="홍보 이미지">
            <div className="flex flex-wrap gap-2">
              <input
                id={`${prefix}-image`}
                value={value.imageUrl}
                onChange={(event) => update('imageUrl', event.target.value)}
                disabled={disabled}
                maxLength={1000}
                placeholder={trimmedDefaultImageUrl ? '비우면 기본 이미지 사용' : '/uploads/...'}
                className={`${inputClass} min-w-[220px] flex-1`}
              />
              {onSelectImage ? (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={disabled || uploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) onSelectImage(file);
                      event.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={disabled || uploading}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--tint-blue-border)] bg-[var(--card-surface)] px-4 text-sm font-semibold text-[var(--blue700)] disabled:opacity-50"
                  >
                    <ImagePlus size={16} aria-hidden="true" />
                    {uploading ? '업로드 중…' : '이미지 업로드'}
                  </button>
                </>
              ) : null}
              {trimmedDefaultImageUrl && !usingDefaultImage ? (
                <button
                  type="button"
                  onClick={() => update('imageUrl', '')}
                  disabled={disabled}
                  className="inline-flex min-h-[44px] items-center rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-4 text-sm font-semibold text-[var(--text-body)] disabled:opacity-50"
                >
                  기본 이미지로
                </button>
              ) : null}
            </div>
            <p className="mt-1.5 text-xs text-[var(--text-caption)]">
              {trimmedDefaultImageUrl
                ? usingDefaultImage
                  ? '기본 이미지(대회 대표 이미지)를 쓰고 있어요. 이 카드만 다르게 하려면 업로드해 주세요.'
                  : '이 카드 전용 이미지를 쓰고 있어요. 비우면 기본 이미지로 돌아가요.'
                : value.imageUrl.trim()
                  ? '대표 이미지가 아직 없어서, 이 이미지가 대표 이미지 자리에도 함께 쓰여요.'
                  : '대표 이미지를 올리면 비워둔 이 자리에도 함께 쓰여요.'}
            </p>
          </Field>
        </div>
      </div>
    </section>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-[var(--text-body)]">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs font-medium text-[var(--red500)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

'use client';

import { ImagePlus, RotateCcw } from 'lucide-react';
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
   * 날짜/장소/상금 문구를 대회 정보에서 다시 만들어 채운다. 넘기지 않으면 버튼이
   * 나오지 않는다 — 이미 저장된 대회를 고치는 화면에서는 관리자가 정한 문구를
   * 임의로 되돌리지 않기 위해 생략한다.
   */
  onResetFacts?: () => void;
  /**
   * 되돌릴 것이 있는가 — 관리자가 사실 문구를 하나라도 직접 고쳤는지. false 면 버튼을
   * 눌러도 바뀔 게 없어 무반응처럼 보이므로 비활성으로 두고, 그 이유를 버튼 아래 문구로
   * 함께 띄운다.
   */
  canResetFacts?: boolean;
  /**
   * 이 자리를 비워뒀을 때 실제로 노출될 기본 이미지 — 보통 대회 커버지만, 커버가 없으면
   * 다른 홍보 자리의 이미지일 수도 있다(resolveTournamentImage 의 폴백 순서). 호출자가 자기
   * 자리를 뺀 폴백 결과를 계산해 넘겨야 미리보기가 공개 화면과 어긋나지 않는다.
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
  onResetFacts,
  canResetFacts = true,
}: PromoCardFieldsProps) {
  const generatedId = useId().replaceAll(':', '');
  const fileRef = useRef<HTMLInputElement>(null);
  const prefix = `promo-${variant}-${generatedId}`;
  const update = <K extends keyof TournamentPromoCardValue>(
    key: K,
    fieldValue: TournamentPromoCardValue[K],
  ) => onChange({ ...value, [key]: fieldValue });
  // 비활성 사유는 눈에 보이는 문구로 낸다 — disabled 버튼은 포인터 이벤트가 안 가서
  // title 툴팁이 뜨지 않고(터치 기기엔 hover 자체가 없다), 탭 순서에서도 빠져 키보드·
  // 스크린리더 사용자에게 이유가 닿지 않는다.
  const resetHintId = `${prefix}-reset-hint`;
  const showResetHint = Boolean(onResetFacts) && !canResetFacts;
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onResetFacts ? (
            <button
              type="button"
              onClick={onResetFacts}
              disabled={disabled || !canResetFacts}
              title={canResetFacts ? '날짜·장소·상금 문구를 대회 정보로 다시 채워요.' : undefined}
              aria-label="날짜·장소·상금 문구를 대회 정보로 다시 채우기"
              aria-describedby={showResetHint ? resetHintId : undefined}
              className="inline-flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-xs font-semibold text-[var(--text-body)] disabled:opacity-50"
            >
              <RotateCcw size={14} aria-hidden="true" />
              {/* 좁은 화면에서 라벨 전체를 쓰면 두 줄로 접혀 카드 헤더가 무너진다. */}
              <span className="hidden sm:inline">날짜·장소·상금 다시 채우기</span>
              <span className="sm:hidden">다시 채우기</span>
            </button>
          ) : null}
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
      </div>

      {showResetHint ? (
        <p id={resetHintId} className="mt-2 text-xs text-[var(--text-caption)] sm:text-right">
          직접 고친 문구가 없어서 되돌릴 것이 없어요.
        </p>
      ) : null}

      <div className="mt-4">
        {variant === 'home' ? (
          <PromoHomePreview fields={previewFields} fallback={fallback} />
        ) : (
          <PromoListPreview fields={previewFields} fallback={fallback} />
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field id={`${prefix}-title`} label="카드 제목" hint="비우면 대회 이름이 그대로 나와요.">
          <input
            id={`${prefix}-title`}
            value={value.title}
            onChange={(event) => update('title', event.target.value)}
            disabled={disabled}
            maxLength={120}
            aria-describedby={`${prefix}-title-hint`}
            placeholder={fallback.title || '대회 이름'}
            className={inputClass}
          />
        </Field>
        <Field id={`${prefix}-badge`} label="배지" hint="카드 맨 위 작은 라벨. 비우면 '추천 대회'가 나와요.">
          <input
            id={`${prefix}-badge`}
            value={value.badgeText}
            onChange={(event) => update('badgeText', event.target.value)}
            disabled={disabled}
            maxLength={60}
            aria-describedby={`${prefix}-badge-hint`}
            placeholder="추천 대회"
            className={inputClass}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field
            id={`${prefix}-subtitle`}
            label="소개 문구"
            hint="제목 아래 한 줄. 비우면 대회 장소가 대신 나와요."
          >
            <input
              id={`${prefix}-subtitle`}
              value={value.subtitle}
              onChange={(event) => update('subtitle', event.target.value)}
              disabled={disabled}
              maxLength={300}
              aria-describedby={`${prefix}-subtitle-hint`}
              className={inputClass}
            />
          </Field>
        </div>
        <Field id={`${prefix}-date`} label="날짜 문구" hint="대회 일정에서 자동으로 채워요.">
          <input
            id={`${prefix}-date`}
            value={value.dateText}
            onChange={(event) => update('dateText', event.target.value)}
            disabled={disabled}
            maxLength={120}
            aria-describedby={`${prefix}-date-hint`}
            className={inputClass}
          />
        </Field>
        <Field
          id={`${prefix}-teams`}
          label="강조 문구"
          hint="날짜와 장소 사이에 들어가는 자유 문구예요. 비워도 돼요."
        >
          <input
            id={`${prefix}-teams`}
            value={value.teamsText}
            onChange={(event) => update('teamsText', event.target.value)}
            disabled={disabled}
            maxLength={120}
            aria-describedby={`${prefix}-teams-hint`}
            placeholder="예: 마감임박 · 16팀 참가"
            className={inputClass}
          />
        </Field>
        <Field id={`${prefix}-location`} label="장소 문구" hint="대회 장소에서 자동으로 채워요.">
          <input
            id={`${prefix}-location`}
            value={value.locationText}
            onChange={(event) => update('locationText', event.target.value)}
            disabled={disabled}
            maxLength={120}
            aria-describedby={`${prefix}-location-hint`}
            className={inputClass}
          />
        </Field>
        <Field
          id={`${prefix}-prize`}
          label="상금 문구"
          hint="상품 및 상금 요약에서 자동으로 채워요."
        >
          <input
            id={`${prefix}-prize`}
            value={value.prizeText}
            onChange={(event) => update('prizeText', event.target.value)}
            disabled={disabled}
            maxLength={160}
            aria-describedby={`${prefix}-prize-hint`}
            className={inputClass}
          />
        </Field>
        <Field
          id={`${prefix}-priority`}
          label="노출 우선순위"
          hint="숫자가 클수록 위에 나와요."
          error={priorityError}
        >
          <input
            id={`${prefix}-priority`}
            type="number"
            inputMode="numeric"
            min={0}
            max={9999}
            value={value.priority}
            onChange={(event) => update('priority', event.target.value)}
            disabled={disabled}
            aria-describedby={`${prefix}-priority-hint`}
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
            <p className="mt-2 text-xs text-[var(--text-caption)]">
              {trimmedDefaultImageUrl
                ? usingDefaultImage
                  ? '기본 이미지를 쓰고 있어요. 이 카드만 다르게 하려면 업로드해 주세요.'
                  : '이 카드 전용 이미지를 쓰고 있어요. 비우면 기본 이미지로 돌아가요.'
                : value.imageUrl.trim()
                  ? '다른 자리에 이미지가 없어서, 이 이미지가 대표 이미지 자리에도 함께 쓰여요.'
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
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  /** 이 칸을 비웠을 때 무엇이 나오는지 / 어디에 쓰이는지 — 입력과 aria-describedby로 잇는다. */
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-xs font-semibold text-[var(--text-body)]">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-[var(--text-caption)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-[var(--red500)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

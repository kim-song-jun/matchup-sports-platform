'use client';

import Image from 'next/image';
import type { FormEvent, ReactNode } from 'react';
import { ImagePlus, Plus, Save, Trash2, X } from 'lucide-react';
import { publicAssetPath } from '@/lib/assets';
import type { SponsorForm } from './tournament-sponsors-admin-model';

const inputCls = [
  'h-[44px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[13px] text-[var(--text-strong)]',
  'outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2',
  'focus:ring-blue-100 disabled:bg-[var(--surface-soft)] disabled:text-gray-400',
].join(' ');
const textareaCls = [
  'min-h-[88px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 py-2.5 text-[13px] text-[var(--text-strong)]',
  'outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2',
  'focus:ring-blue-100 disabled:bg-[var(--surface-soft)] disabled:text-gray-400',
].join(' ');
const primaryBtnCls = [
  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-blue-500 px-4',
  'text-[13px] font-semibold text-white transition-colors hover:bg-blue-600 active:scale-[0.98]',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');
const secondaryBtnCls = [
  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[var(--border)]',
  'bg-[var(--card-surface)] px-4 text-[13px] font-semibold text-[var(--text-body)] transition-colors hover:bg-[var(--surface-soft)]',
  'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');

export function TournamentSponsorForm({
  form,
  mode,
  pending,
  uploadingLogo,
  logoUploadError,
  onSelectLogo,
  onCancel,
  onSubmit,
  setField,
}: {
  readonly form: SponsorForm;
  readonly mode: 'create' | 'update';
  readonly pending: boolean;
  readonly uploadingLogo: boolean;
  readonly logoUploadError?: string;
  readonly onSelectLogo: (file: File) => void;
  readonly onCancel?: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly setField: (field: keyof SponsorForm, value: string | boolean) => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] px-5 py-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold text-[var(--text-strong)]">
            {mode === 'update' ? '협찬 정보 수정' : '협찬 정보 추가'}
          </h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            대회 상세에 노출되는 협찬사, 혜택, 이벤트 결과를 관리해요.
          </p>
        </div>
        {mode === 'update' && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-2 text-gray-400 transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--text-body)]"
            aria-label="수정 취소"
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="협찬사명" required>
          <input
            type="text"
            value={form.name}
            onChange={(event) => setField('name', event.target.value)}
            disabled={pending}
            placeholder="예: 서울 스포츠랩"
            maxLength={120}
            required
            className={inputCls}
          />
        </Field>

        <Field label="소개">
          <input
            type="text"
            value={form.description}
            onChange={(event) => setField('description', event.target.value)}
            disabled={pending}
            placeholder="예: 풋살 장비 파트너"
            maxLength={500}
            className={inputCls}
          />
        </Field>

        <SponsorLogoUploader
          value={form.logoUrl}
          disabled={pending}
          uploading={uploadingLogo}
          error={logoUploadError}
          onSelectFile={onSelectLogo}
          onClear={() => setField('logoUrl', '')}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="홈페이지">
            <input
              type="url"
              value={form.websiteUrl}
              onChange={(event) => setField('websiteUrl', event.target.value)}
              disabled={pending}
              placeholder="https://"
              className={inputCls}
            />
          </Field>
          <Field label="인스타그램">
            <input
              type="url"
              value={form.instagramUrl}
              onChange={(event) => setField('instagramUrl', event.target.value)}
              disabled={pending}
              placeholder="https://"
              className={inputCls}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="제공 혜택">
            <textarea
              value={form.benefitText}
              onChange={(event) => setField('benefitText', event.target.value)}
              disabled={pending}
              placeholder="협찬품, 쿠폰, 참가자 혜택"
              className={textareaCls}
            />
          </Field>
          <Field label="현장 부스">
            <textarea
              value={form.boothText}
              onChange={(event) => setField('boothText', event.target.value)}
              disabled={pending}
              placeholder="부스 운영 여부와 위치"
              className={textareaCls}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
          <Field label="이벤트명">
            <input
              type="text"
              value={form.eventTitle}
              onChange={(event) => setField('eventTitle', event.target.value)}
              disabled={pending}
              placeholder="예: 매너 리뷰 이벤트"
              maxLength={200}
              className={inputCls}
            />
          </Field>
          <Field label="정렬">
            <input
              type="number"
              min="0"
              max="9999"
              value={form.sortOrder}
              onChange={(event) => setField('sortOrder', event.target.value)}
              disabled={pending}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="이벤트 참여 방식">
          <textarea
            value={form.eventDescription}
            onChange={(event) => setField('eventDescription', event.target.value)}
            disabled={pending}
            placeholder="리뷰 참여, 현장 인증, 하이라이트 공유 등"
            className={textareaCls}
          />
        </Field>

        <Field label="이벤트 결과">
          <textarea
            value={form.eventResultText}
            onChange={(event) => setField('eventResultText', event.target.value)}
            disabled={pending}
            placeholder="당첨자·지급 결과가 확정되면 입력"
            className={textareaCls}
          />
        </Field>

        <label className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--text-body)]">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => setField('isActive', event.target.checked)}
            disabled={pending}
            className="h-4 w-4 rounded border-[var(--border-strong)] text-blue-500 focus:ring-blue-500"
          />
          대회 상세에 공개
        </label>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="submit" disabled={!form.name.trim() || pending || uploadingLogo} className={primaryBtnCls}>
            {mode === 'update' ? <Save size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
            {pending ? '저장 중…' : mode === 'update' ? '수정 저장' : '협찬 추가'}
          </button>
          {mode === 'update' && onCancel ? (
            <button type="button" onClick={onCancel} disabled={pending} className={secondaryBtnCls}>
              취소
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function SponsorLogoUploader({
  value,
  disabled,
  uploading,
  error,
  onSelectFile,
  onClear,
}: {
  readonly value: string;
  readonly disabled: boolean;
  readonly uploading: boolean;
  readonly error?: string;
  readonly onSelectFile: (file: File) => void;
  readonly onClear: () => void;
}) {
  const locked = disabled || uploading;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] text-[var(--text-strong)]">협찬사 로고</span>
      <div className="grid gap-3 sm:grid-cols-[112px_1fr] sm:items-center">
        <div className="relative grid aspect-square place-items-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]">
          {value ? (
            <Image
              src={publicAssetPath(value)}
              alt="선택한 협찬사 로고 미리보기"
              fill
              sizes="112px"
              className="object-contain p-3"
              unoptimized
            />
          ) : (
            <ImagePlus size={28} className="text-[var(--text-muted)]" aria-hidden="true" />
          )}
        </div>
        <div className="flex flex-col items-start gap-2">
          <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--tint-blue-border)] bg-[var(--card-surface)] px-4 text-sm font-semibold text-[var(--blue700)] transition-colors hover:bg-[var(--blue50)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
            <ImagePlus size={16} aria-hidden="true" />
            {uploading ? '업로드 중…' : value ? '로고 변경' : '로고 선택'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="협찬사 로고 파일 선택"
              className="sr-only"
              disabled={locked}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onSelectFile(file);
                event.target.value = '';
              }}
            />
          </label>
          {value ? (
            <button type="button" onClick={onClear} disabled={locked} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--red50)] hover:text-[var(--red700)] disabled:opacity-50">
              <Trash2 size={16} aria-hidden="true" />
              로고 제거
            </button>
          ) : null}
          <p className="text-xs leading-5 text-[var(--text-muted)]">JPG, PNG, WebP · 최대 10MB. 정사각형 또는 가로형 로고를 권장해요.</p>
          {error ? <p role="alert" className="text-xs text-[var(--red700)]">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  readonly label: string;
  readonly required?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] text-[var(--text-strong)]">
      <span>
        {label}
        {required ? (
          <>
            {' '}
            <span className="text-[var(--red700)]" aria-hidden="true">*</span>
            <span className="sr-only">(필수)</span>
          </>
        ) : null}
      </span>
      {children}
    </label>
  );
}

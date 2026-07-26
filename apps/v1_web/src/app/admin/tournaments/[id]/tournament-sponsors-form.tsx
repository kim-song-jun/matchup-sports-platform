'use client';

import type { FormEvent, ReactNode } from 'react';
import { Plus, Save, X } from 'lucide-react';
import type { SponsorForm } from './tournament-sponsors-admin-model';

const inputCls = [
  'h-[44px] rounded-xl border border-gray-200 bg-white px-3 text-[13px] text-gray-900',
  'outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2',
  'focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-400',
].join(' ');
const textareaCls = [
  'min-h-[88px] rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[13px] text-gray-900',
  'outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2',
  'focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-400',
].join(' ');
const primaryBtnCls = [
  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-blue-500 px-4',
  'text-[13px] font-semibold text-white transition-colors hover:bg-blue-600 active:scale-[0.98]',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');
const secondaryBtnCls = [
  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-gray-200',
  'bg-white px-4 text-[13px] font-semibold text-gray-700 transition-colors hover:bg-gray-50',
  'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');

export function TournamentSponsorForm({
  form,
  mode,
  pending,
  onCancel,
  onSubmit,
  setField,
}: {
  readonly form: SponsorForm;
  readonly mode: 'create' | 'update';
  readonly pending: boolean;
  readonly onCancel?: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly setField: (field: keyof SponsorForm, value: string | boolean) => void;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-5 py-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold text-gray-900">
            {mode === 'update' ? '협찬 정보 수정' : '협찬 정보 추가'}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            대회 상세에 노출되는 협찬사, 혜택, 이벤트 결과를 관리해요.
          </p>
        </div>
        {mode === 'update' && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700"
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

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="로고 URL">
            <input
              type="url"
              value={form.logoUrl}
              onChange={(event) => setField('logoUrl', event.target.value)}
              disabled={pending}
              placeholder="https://"
              className={inputCls}
            />
          </Field>
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

        <label className="inline-flex items-center gap-2 text-[13px] font-medium text-gray-800">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => setField('isActive', event.target.checked)}
            disabled={pending}
            className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
          />
          대회 상세에 공개
        </label>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="submit" disabled={!form.name.trim() || pending} className={primaryBtnCls}>
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
    <label className="flex flex-col gap-1.5 text-[13px] text-gray-900">
      <span>
        {label}
        {required ? (
          <>
            {' '}
            <span className="text-red-500" aria-hidden="true">*</span>
            <span className="sr-only">(필수)</span>
          </>
        ) : null}
      </span>
      {children}
    </label>
  );
}

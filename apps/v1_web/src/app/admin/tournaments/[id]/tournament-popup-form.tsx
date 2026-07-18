'use client';

import type { FormEvent, ReactNode } from 'react';
import { Plus, Save, X } from 'lucide-react';
import type { V1TournamentPopupStatus } from '@/types/api';
import type { PopupForm } from './tournament-popup-admin-model';

const inputCls = [
  'h-[44px] rounded-xl border border-gray-200 bg-white px-3 text-[13px] text-gray-900',
  'outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2',
  'focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-400',
].join(' ');
const textareaCls = [
  'min-h-[96px] rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[13px] text-gray-900',
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

const STATUS_OPTIONS: { value: V1TournamentPopupStatus; label: string }[] = [
  { value: 'draft', label: '초안' },
  { value: 'published', label: '발행' },
  { value: 'archived', label: '보관' },
];

export function TournamentPopupForm({
  form,
  mode,
  pending,
  onCancel,
  onSubmit,
  setField,
}: {
  readonly form: PopupForm;
  readonly mode: 'create' | 'update';
  readonly pending: boolean;
  readonly onCancel?: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly setField: <K extends keyof PopupForm>(field: K, value: PopupForm[K]) => void;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-5 py-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold text-gray-900">
            {mode === 'update' ? '팝업 수정' : '팝업 추가'}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            대회 상세 페이지 진입 시 노출되는 공지·홍보 팝업이에요. 발행 상태 + 노출 기간 안에서만 보여요.
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
        <Field label="제목" required>
          <input
            type="text"
            value={form.title}
            onChange={(event) => setField('title', event.target.value)}
            disabled={pending}
            placeholder="예: 얼리버드 신청 안내"
            maxLength={120}
            required
            className={inputCls}
          />
        </Field>

        <Field label="내용" required>
          <textarea
            value={form.body}
            onChange={(event) => setField('body', event.target.value)}
            disabled={pending}
            placeholder="예: 7/31까지 신청하면 참가비를 할인해 드려요."
            required
            className={textareaCls}
          />
        </Field>

        <Field label="이미지 URL">
          <input
            type="url"
            value={form.imageUrl}
            onChange={(event) => setField('imageUrl', event.target.value)}
            disabled={pending}
            placeholder="https://"
            className={inputCls}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="상태">
            <select
              value={form.status}
              onChange={(event) => setField('status', event.target.value as V1TournamentPopupStatus)}
              disabled={pending}
              className={inputCls}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="노출 시작">
            <input
              type="datetime-local"
              value={form.displayStartAt}
              onChange={(event) => setField('displayStartAt', event.target.value)}
              disabled={pending}
              className={inputCls}
            />
          </Field>
          <Field label="노출 종료">
            <input
              type="datetime-local"
              value={form.displayEndAt}
              onChange={(event) => setField('displayEndAt', event.target.value)}
              disabled={pending}
              className={inputCls}
            />
          </Field>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="submit"
            disabled={!form.title.trim() || !form.body.trim() || pending}
            className={primaryBtnCls}
          >
            {mode === 'update' ? <Save size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
            {pending ? '저장 중…' : mode === 'update' ? '수정 저장' : '팝업 추가'}
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

'use client';

import { useState, type FormEvent } from 'react';
import type {
  TournamentCampaignForm,
  TournamentCampaignFormErrors,
} from './tournament-campaign-admin-model';
import { validateTournamentCampaignForm } from './tournament-campaign-admin-model';
import { TournamentCampaignEditorCollections } from './tournament-campaign-editor-collections';

const INPUT_CLASS = [
  'min-h-[44px] w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900',
  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-100 disabled:text-gray-500',
].join(' ');

type TextField = Exclude<keyof TournamentCampaignForm, 'highlights' | 'faq'>;

type EditorProps = {
  readonly mode: 'create' | 'update';
  readonly initialForm: TournamentCampaignForm;
  readonly slugLocked: boolean;
  readonly pending: boolean;
  readonly onSubmit: (form: TournamentCampaignForm) => void;
  readonly onCancel: () => void;
};

export function TournamentCampaignEditor({
  mode,
  initialForm,
  slugLocked,
  pending,
  onSubmit,
  onCancel,
}: EditorProps) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState<TournamentCampaignFormErrors>({});

  const setField = (field: TextField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateTournamentCampaignForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onSubmit(form);
  };

  return (
    <form aria-label={mode === 'create' ? '캠페인 생성 폼' : '캠페인 편집 폼'} onSubmit={submit} noValidate className="grid gap-6 rounded-2xl border border-gray-100 bg-white p-5">
      <div>
        <h2 className="text-base font-bold tracking-tight text-gray-900">
          {mode === 'create' ? '새 캠페인' : '캠페인 편집'}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">공개 대회 정보는 서버에서 연결되고, 이 폼에서는 캠페인 설명 콘텐츠만 관리해요.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <EditorField label="캠페인 주소" value={form.slug} error={errors.slug} maxLength={80} disabled={slugLocked} onChange={(value) => setField('slug', value)} />
        <EditorField label="히어로 제목" value={form.heroTitle} error={errors.heroTitle} maxLength={120} onChange={(value) => setField('heroTitle', value)} />
        <EditorField label="히어로 요약" value={form.heroSummary} error={errors.heroSummary} maxLength={300} onChange={(value) => setField('heroSummary', value)} />
        <EditorField label="히어로 이미지 주소" value={form.heroImageUrl} error={errors.heroImageUrl} maxLength={2048} onChange={(value) => setField('heroImageUrl', value)} />
      </div>

      {slugLocked ? <p className="-mt-4 text-xs text-gray-500">한 번 공개된 캠페인의 주소는 보관 후에도 유지돼요.</p> : null}

      <section className="grid gap-4" aria-label="소개 편집">
        <h3 className="text-sm font-bold text-gray-900">소개</h3>
        <EditorField label="소개 제목" value={form.introTitle} error={errors.introTitle} maxLength={120} onChange={(value) => setField('introTitle', value)} />
        <EditorField label="소개 내용" value={form.introBody} error={errors.introBody} maxLength={3000} multiline onChange={(value) => setField('introBody', value)} />
      </section>

      <EditorField label="하이라이트 섹션 제목" value={form.highlightsSectionTitle} error={errors.highlightsSectionTitle} maxLength={120} onChange={(value) => setField('highlightsSectionTitle', value)} />
      <TournamentCampaignEditorCollections
        form={form}
        errors={errors}
        faqSectionTitleField={(
          <EditorField label="FAQ 섹션 제목" value={form.faqSectionTitle} error={errors.faqSectionTitle} maxLength={120} onChange={(value) => setField('faqSectionTitle', value)} />
        )}
        onHighlightsChange={(highlights) => {
          setForm((current) => ({ ...current, highlights }));
          setErrors((current) => ({ ...current, highlights: undefined }));
        }}
        onFaqChange={(faq) => {
          setForm((current) => ({ ...current, faq }));
          setErrors((current) => ({ ...current, faq: undefined }));
        }}
      />

      <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-5">
        <button type="button" onClick={onCancel} disabled={pending} className="min-h-[44px] rounded-xl bg-gray-100 px-4 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50">취소</button>
        <button type="submit" disabled={pending} className="min-h-[44px] rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-50">
          {pending ? '저장 중…' : mode === 'create' ? '캠페인 생성' : '변경 저장'}
        </button>
      </div>
    </form>
  );
}

function EditorField({
  label,
  value,
  error,
  maxLength,
  multiline = false,
  disabled = false,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly error?: string;
  readonly maxLength: number;
  readonly multiline?: boolean;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-gray-700">
      {label}
      {multiline ? (
        <textarea className={INPUT_CLASS} rows={5} maxLength={maxLength} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input className={INPUT_CLASS} maxLength={maxLength} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
      {error ? <span className="text-xs font-normal text-red-500" role="alert">{error}</span> : null}
    </label>
  );
}

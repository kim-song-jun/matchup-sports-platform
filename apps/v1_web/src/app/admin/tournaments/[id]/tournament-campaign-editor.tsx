'use client';

import { useState, type FormEvent } from 'react';
import { CoverImageUploader } from '@/components/admin/tournaments/cover-image-uploader';
import { useV1UploadImages } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type {
  TournamentCampaignForm,
  TournamentCampaignFormErrors,
} from './tournament-campaign-admin-model';
import { validateTournamentCampaignForm } from './tournament-campaign-admin-model';
import { TournamentCampaignEditorCollections } from './tournament-campaign-editor-collections';

const INPUT_CLASS = [
  'min-h-[44px] w-full rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 py-3 text-sm text-[var(--text-strong)]',
  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-[var(--surface-soft)] disabled:text-[var(--text-muted)]',
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
  const [uploadingSlot, setUploadingSlot] = useState<'hero' | `highlight-${number}` | null>(null);
  const [uploadError, setUploadError] = useState('');
  const uploadImages = useV1UploadImages();

  const setField = (field: TextField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (uploadingSlot !== null) return;
    const nextErrors = validateTournamentCampaignForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onSubmit(form);
  };

  const uploadImage = async (slot: 'hero' | `highlight-${number}`, file: File) => {
    setUploadingSlot(slot);
    setUploadError('');
    try {
      const uploaded = await uploadImages.mutateAsync(file);
      const imageUrl = uploaded.urls[0];
      if (!imageUrl) throw new Error('이미지 업로드 결과가 비어 있어요.');
      if (slot === 'hero') {
        setField('heroImageUrl', imageUrl);
      } else {
        const index = Number(slot.slice('highlight-'.length));
        setForm((current) => ({
          ...current,
          highlights: current.highlights.map((item, itemIndex) => (
            itemIndex === index ? { ...item, imageUrl } : item
          )),
        }));
        setErrors((current) => ({ ...current, highlights: undefined }));
      }
    } catch (error) {
      setUploadError(extractErrorMessage(error, '캠페인 이미지를 업로드하지 못했어요.'));
    } finally {
      setUploadingSlot(null);
    }
  };

  return (
    <form aria-label={mode === 'create' ? '캠페인 생성 폼' : '캠페인 편집 폼'} onSubmit={submit} noValidate className="grid gap-6 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5">
      <div>
        <h2 className="text-base font-bold tracking-tight text-[var(--text-strong)]">
          {mode === 'create' ? '새 캠페인' : '캠페인 편집'}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">공개 대회 정보는 서버에서 연결되고, 이 폼에서는 캠페인 설명 콘텐츠만 관리해요.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <EditorField label="공개 URL" value={`/tournaments/campaigns/${form.slug}`} error={errors.slug} maxLength={103} disabled onChange={() => undefined} />
        <EditorField label="대제목" value={form.heroTitle} error={errors.heroTitle} maxLength={120} onChange={(value) => setField('heroTitle', value)} />
        <EditorField label="서브 내용" value={form.heroSummary} error={errors.heroSummary} maxLength={300} onChange={(value) => setField('heroSummary', value)} />
      </div>

      <CoverImageUploader
        label="메인 상단 이미지"
        value={form.heroImageUrl || null}
        onSelectFile={(file) => void uploadImage('hero', file)}
        onClear={() => setField('heroImageUrl', '')}
        uploading={uploadingSlot === 'hero'}
        disabled={pending || uploadingSlot !== null}
        helperText="JPG, PNG, WebP · 큰 사진은 올릴 때 자동으로 줄여요. 캠페인 상단 배경으로 표시돼요."
        previewAlt={form.heroImageUrl ? '메인 상단 이미지 미리보기' : '메인 상단 이미지 예시'}
        eager
      />
      {errors.heroImageUrl ? <p className="text-xs text-[var(--red700)]" role="alert">{errors.heroImageUrl}</p> : null}
      {uploadError ? <p className="text-xs text-[var(--red700)]" role="alert">{uploadError}</p> : null}

      <p className="-mt-4 text-xs text-[var(--text-muted)]">
        {slugLocked ? '한 번 공개된 캠페인의 URL은 보관 후에도 유지돼요.' : '대회별 공개 URL은 자동으로 만들어져요.'}
      </p>

      <section className="grid gap-4" aria-label="소개 편집">
        <h3 className="text-sm font-bold text-[var(--text-strong)]">소개</h3>
        <EditorField label="소개 제목" value={form.introTitle} error={errors.introTitle} maxLength={120} onChange={(value) => setField('introTitle', value)} />
        <EditorField label="소개 내용" value={form.introBody} error={errors.introBody} maxLength={3000} multiline onChange={(value) => setField('introBody', value)} />
      </section>

      <EditorField label="참가할 이유" value={form.highlightsSectionTitle} error={errors.highlightsSectionTitle} maxLength={120} onChange={(value) => setField('highlightsSectionTitle', value)} />
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
        onHighlightImageSelect={(index, file) => void uploadImage(`highlight-${index}`, file)}
        onHighlightImageClear={(index) => {
          setForm((current) => ({
            ...current,
            highlights: current.highlights.map((item, itemIndex) => (
              itemIndex === index ? { ...item, imageUrl: '' } : item
            )),
          }));
          setErrors((current) => ({ ...current, highlights: undefined }));
        }}
        uploadingHighlightIndex={uploadingSlot?.startsWith('highlight-') ? Number(uploadingSlot.slice('highlight-'.length)) : null}
        imageUploadDisabled={pending || uploadingSlot !== null}
        onFaqChange={(faq) => {
          setForm((current) => ({ ...current, faq }));
          setErrors((current) => ({ ...current, faq: undefined }));
        }}
      />

      <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-5">
        <button type="button" onClick={onCancel} disabled={pending || uploadingSlot !== null} className="min-h-[44px] rounded-xl bg-[var(--surface-soft)] px-4 text-sm font-semibold text-[var(--text-body)] transition-colors hover:bg-[var(--border)] disabled:opacity-50">취소</button>
        <button type="submit" disabled={pending || uploadingSlot !== null} className="min-h-[44px] rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-50">
          {uploadingSlot ? '이미지 업로드 중…' : pending ? '저장 중…' : mode === 'create' ? '캠페인 생성' : '변경 저장'}
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
    <label className="grid gap-2 text-xs font-semibold text-[var(--text-body)]">
      {label}
      {multiline ? (
        <textarea className={INPUT_CLASS} rows={5} maxLength={maxLength} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input className={INPUT_CLASS} maxLength={maxLength} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
      {error ? <span className="text-xs font-normal text-[var(--red700)]" role="alert">{error}</span> : null}
    </label>
  );
}

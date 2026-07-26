import { Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type {
  CampaignFaqForm,
  CampaignHighlightForm,
  TournamentCampaignForm,
  TournamentCampaignFormErrors,
} from './tournament-campaign-admin-model';

const INPUT_CLASS = [
  'min-h-[44px] w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900',
  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
].join(' ');

type CollectionsProps = {
  readonly form: TournamentCampaignForm;
  readonly errors: TournamentCampaignFormErrors;
  readonly faqSectionTitleField: ReactNode;
  readonly onHighlightsChange: (items: readonly CampaignHighlightForm[]) => void;
  readonly onFaqChange: (items: readonly CampaignFaqForm[]) => void;
};

export function TournamentCampaignEditorCollections({
  form,
  errors,
  faqSectionTitleField,
  onHighlightsChange,
  onFaqChange,
}: CollectionsProps) {
  return (
    <>
      <EditorCollectionSection
        title="하이라이트"
        count={`${form.highlights.length}/8`}
        error={errors.highlights}
        addLabel="하이라이트 추가"
        addDisabled={form.highlights.length >= 8}
        onAdd={() => onHighlightsChange([
          ...form.highlights,
          { title: '', body: '', imageUrl: '' },
        ])}
      >
        {form.highlights.map((item, index) => (
          <div key={`highlight-${index}`} className="rounded-xl bg-gray-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-gray-600">하이라이트 {index + 1}</p>
              <RemoveButton
                label={`하이라이트 ${index + 1} 삭제`}
                onClick={() => onHighlightsChange(form.highlights.filter((_, itemIndex) => itemIndex !== index))}
              />
            </div>
            <div className="grid gap-3">
              <CollectionField
                label={`하이라이트 ${index + 1} 제목`}
                value={item.title}
                maxLength={100}
                onChange={(title) => onHighlightsChange(replaceHighlight(form.highlights, index, { ...item, title }))}
              />
              <CollectionField
                label={`하이라이트 ${index + 1} 내용`}
                value={item.body}
                maxLength={500}
                multiline
                onChange={(body) => onHighlightsChange(replaceHighlight(form.highlights, index, { ...item, body }))}
              />
              <CollectionField
                label={`하이라이트 ${index + 1} 이미지 주소`}
                value={item.imageUrl}
                maxLength={2048}
                onChange={(imageUrl) => onHighlightsChange(replaceHighlight(form.highlights, index, { ...item, imageUrl }))}
              />
            </div>
          </div>
        ))}
      </EditorCollectionSection>

      {faqSectionTitleField}

      <EditorCollectionSection
        title="FAQ"
        count={`${form.faq.length}/12`}
        error={errors.faq}
        addLabel="FAQ 추가"
        addDisabled={form.faq.length >= 12}
        onAdd={() => onFaqChange([...form.faq, { question: '', answer: '' }])}
      >
        {form.faq.map((item, index) => (
          <div key={`faq-${index}`} className="rounded-xl bg-gray-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-gray-600">FAQ {index + 1}</p>
              <RemoveButton
                label={`FAQ ${index + 1} 삭제`}
                onClick={() => onFaqChange(form.faq.filter((_, itemIndex) => itemIndex !== index))}
              />
            </div>
            <div className="grid gap-3">
              <CollectionField
                label={`FAQ ${index + 1} 질문`}
                value={item.question}
                maxLength={200}
                onChange={(question) => onFaqChange(replaceFaq(form.faq, index, { ...item, question }))}
              />
              <CollectionField
                label={`FAQ ${index + 1} 답변`}
                value={item.answer}
                maxLength={1000}
                multiline
                onChange={(answer) => onFaqChange(replaceFaq(form.faq, index, { ...item, answer }))}
              />
            </div>
          </div>
        ))}
      </EditorCollectionSection>
    </>
  );
}

function EditorCollectionSection({
  title,
  count,
  error,
  addLabel,
  addDisabled,
  onAdd,
  children,
}: {
  readonly title: string;
  readonly count: string;
  readonly error?: string;
  readonly addLabel: string;
  readonly addDisabled: boolean;
  readonly onAdd: () => void;
  readonly children: ReactNode;
}) {
  return (
    <section className="grid gap-3" aria-label={`${title} 편집`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-gray-900">{title}</h3>
          <span className="text-xs text-gray-500 tabular-nums">{count}</span>
        </div>
        <button
          type="button"
          disabled={addDisabled}
          onClick={onAdd}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-gray-100 px-3 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-40"
        >
          <Plus size={14} aria-hidden="true" />
          {addLabel}
        </button>
      </div>
      {error ? <p className="text-xs text-red-500" role="alert">{error}</p> : null}
      {children}
    </section>
  );
}

function CollectionField({
  label,
  value,
  maxLength,
  multiline = false,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly maxLength: number;
  readonly multiline?: boolean;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-gray-700">
      {label}
      {multiline ? (
        <textarea className={INPUT_CLASS} rows={3} maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input className={INPUT_CLASS} maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function RemoveButton({ label, onClick }: { readonly label: string; readonly onClick: () => void }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600">
      <Trash2 size={15} aria-hidden="true" />
    </button>
  );
}

function replaceHighlight(items: readonly CampaignHighlightForm[], index: number, next: CampaignHighlightForm) {
  return items.map((item, itemIndex) => itemIndex === index ? next : item);
}

function replaceFaq(items: readonly CampaignFaqForm[], index: number, next: CampaignFaqForm) {
  return items.map((item, itemIndex) => itemIndex === index ? next : item);
}

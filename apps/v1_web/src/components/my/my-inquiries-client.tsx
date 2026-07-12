'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AlertBanner, Card, EmptyState, ErrorState, ListItem, TextField } from '@/components/v1-ui/primitives';
import { AppChrome } from '@/components/v1-ui/shell';
import { useV1CreateInquiry, useV1Inquiries, useV1Inquiry } from '@/hooks/use-v1-api';
import { appRoute } from '@/lib/app-route';
import { V1ApiError } from '@/lib/api-client';
import { getStoredV1Session } from '@/lib/session-storage';
import type { V1CreateInquiryPayload, V1Inquiry, V1InquiryCategory } from '@/types/api';

const t = {
  account: '\uacc4\uc815',
  match: '\ub9e4\uce58',
  team: '\ud300',
  tournament: '\ub300\ud68c',
  paymentRefund: '\uacb0\uc81c/\ud658\ubd88',
  report: '\uc2e0\uace0',
  other: '\uae30\ud0c0',
  received: '\uc811\uc218\ub428',
  reviewing: '\ud655\uc778 \uc911',
  answered: '\ub2f5\ubcc0 \uc644\ub8cc',
  closed: '\uc885\ub8cc',
  inquiry: '\ubb38\uc758',
  inquiryNew: '\ubb38\uc758\ud558\uae30',
  myInquiries: '\ub0b4 \ubb38\uc758',
  listSub: '\uc811\uc218\ud55c \ubb38\uc758\uc640 \ucc98\ub9ac \uc0c1\ud0dc\ub97c \ud655\uc778\ud574\uc694.',
  listError: '\ubb38\uc758 \ubaa9\ub85d\uc744 \ubd88\ub7ec\uc624\uc9c0 \ubabb\ud588\uc5b4\uc694. \uc7a0\uc2dc \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud574 \uc8fc\uc138\uc694.',
  emptyTitle: '\uc811\uc218\ud55c \ubb38\uc758\uac00 \uc5c6\uc5b4\uc694',
  emptySub: '\uacc4\uc815, \ub9e4\uce58, \ub300\ud68c, \uacb0\uc81c \ubb38\uc81c\ub97c \uc6b4\uc601\ud300\uc5d0 \ub0a8\uae38 \uc218 \uc788\uc5b4\uc694.',
  title: '\uc81c\ubaa9',
  body: '\ub0b4\uc6a9',
  category: '\ubb38\uc758 \uc720\ud615',
  cancel: '\ucde8\uc18c',
  submit: '\uc811\uc218\ud558\uae30',
  submitting: '\uc811\uc218 \uc911',
  detail: '\ubb38\uc758 \uc0c1\uc138',
  detailLoad: '\ubb38\uc758 \ub0b4\uc6a9\uc744 \ubd88\ub7ec\uc624\ub294 \uc911\uc774\uc5d0\uc694.',
  detailError: '\ubb38\uc758 \ub0b4\uc6a9\uc744 \ubd88\ub7ec\uc624\uc9c0 \ubabb\ud588\uc5b4\uc694. \uad8c\ud55c\uc774 \uc5c6\uac70\ub098 \uc0ad\uc81c\ub41c \ubb38\uc758\uc77c \uc218 \uc788\uc5b4\uc694.',
  myQuestion: '\ub0b4 \ubb38\uc758',
  answer: '\ub2f5\ubcc0',
  waitingAnswer: '\uc6b4\uc601\ud300\uc774 \ubb38\uc758\ub97c \ud655\uc778\ud558\uace0 \uc788\uc5b4\uc694.',
  waitingAnswerSub: '\ub2f5\ubcc0\uc774 \ub4f1\ub85d\ub418\uba74 \uc774 \ud654\uba74\uc5d0\uc11c \uc774\uc5b4\uc11c \ud655\uc778\ud560 \uc218 \uc788\uc5b4\uc694.',
};

const categories: Array<{ value: V1InquiryCategory; label: string }> = [
  { value: 'account', label: t.account },
  { value: 'match', label: t.match },
  { value: 'team', label: t.team },
  { value: 'tournament', label: t.tournament },
  { value: 'payment_refund', label: t.paymentRefund },
  { value: 'report', label: t.report },
  { value: 'other', label: t.other },
];

const categoryLabel: Record<V1InquiryCategory, string> = Object.fromEntries(
  categories.map((item) => [item.value, item.label]),
) as Record<V1InquiryCategory, string>;

const statusLabel: Record<V1Inquiry['status'], string> = {
  received: t.received,
  reviewing: t.reviewing,
  answered: t.answered,
  closed: t.closed,
};

type InquiryFormErrors = Partial<Record<'title' | 'body' | 'form', string>>;

export function MyInquiriesListClient() {
  const query = useV1Inquiries({ limit: 20 });
  const items = query.data?.items ?? [];

  if (query.isError) {
    return (
      <AppChrome title={t.inquiry} activeTab="my" bottomNav={false} backHref="/my">
        <div className="tm-my-shell">
          <ErrorState message={t.listError} onRetry={() => void query.refetch()} />
        </div>
      </AppChrome>
    );
  }

  return (
    <AppChrome title={t.inquiry} activeTab="my" bottomNav={false} backHref="/my">
      <div className="tm-my-shell">
        <div className="tm-my-settings-desktop">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div>
              <div className="tm-text-heading">{t.myInquiries}</div>
              <div className="tm-text-caption" style={{ marginTop: 4 }}>{t.listSub}</div>
            </div>
            <Link className="tm-btn tm-btn-sm tm-btn-primary" href="/my/inquiries/new">{t.inquiryNew}</Link>
          </div>
          {items.length === 0 ? (
            <EmptyState
              title={t.emptyTitle}
              sub={t.emptySub}
            />
          ) : (
            <Card pad={0}>
              {items.map((item) => (
                <ListItem
                  key={item.inquiryId}
                  title={item.title}
                  sub={`${categoryLabel[item.category]} · ${formatDate(item.createdAt)}`}
                  trailing={statusLabel[item.status]}
                  href={`/my/inquiries/${item.inquiryId}`}
                  chev
                />
              ))}
            </Card>
          )}
        </div>
      </div>
    </AppChrome>
  );
}

export function MyInquiryCreateClient() {
  const router = useRouter();
  const pathname = usePathname();
  const createInquiry = useV1CreateInquiry();
  const [category, setCategory] = useState<V1InquiryCategory>('account');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<InquiryFormErrors>({});

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: InquiryFormErrors = {};
    if (!title.trim()) nextErrors.title = '\ubb38\uc758 \uc81c\ubaa9\uc744 \uc785\ub825\ud574 \uc8fc\uc138\uc694.';
    if (!body.trim()) nextErrors.body = '\ubb38\uc758 \ub0b4\uc6a9\uc744 \uc785\ub825\ud574 \uc8fc\uc138\uc694.';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const payload: V1CreateInquiryPayload = {
      category,
      title: title.trim(),
      body: body.trim(),
      contact: getStoredV1Session().userEmail ?? '\uacc4\uc815 \uc815\ubcf4',
    };

    createInquiry.mutate(payload, {
      onSuccess: (inquiry) => {
        router.replace(appRoute(`/my/inquiries/${inquiry.inquiryId}`, pathname));
      },
      onError: (error) => {
        setErrors({ form: errorMessage(error) });
      },
    });
  };

  return (
    <AppChrome title={t.inquiryNew} activeTab="my" bottomNav={false} backHref="/my/inquiries">
      <div className="tm-my-shell">
        <div className="tm-my-settings-desktop">
          <Card pad={16}>
            <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
              <label className="tm-create-field">
                <span className="tm-text-label">{t.category}</span>
                <select className="tm-input" value={category} onChange={(event) => setCategory(event.target.value as V1InquiryCategory)}>
                  {categories.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <TextField label={t.title} value={title} maxLength={80} error={errors.title} onChange={(event) => setTitle(event.target.value)} />
              <TextField label={t.body} value={body} maxLength={2000} error={errors.body} multiline rows={8} onChange={(event) => setBody(event.target.value)} />
              {errors.form ? <AlertBanner message={errors.form} tone="error" /> : null}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Link className="tm-btn tm-btn-lg tm-btn-neutral" href="/my/inquiries">{t.cancel}</Link>
                <button className="tm-btn tm-btn-lg tm-btn-primary" type="submit" disabled={createInquiry.isPending}>
                  {createInquiry.isPending ? t.submitting : t.submit}
                </button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </AppChrome>
  );
}

export function MyInquiryDetailClient({ inquiryId }: { inquiryId: string }) {
  const query = useV1Inquiry(inquiryId);
  const inquiry = query.data;

  if (query.isError) {
    return (
      <AppChrome title={t.detail} activeTab="my" bottomNav={false} backHref="/my/inquiries">
        <div className="tm-my-shell">
          <ErrorState message={t.detailError} onRetry={() => void query.refetch()} />
        </div>
      </AppChrome>
    );
  }

  return (
    <AppChrome title={t.detail} activeTab="my" bottomNav={false} backHref="/my/inquiries">
      <div className="tm-my-shell">
        <div className="tm-my-settings-desktop">
          {!inquiry ? (
            <Card pad={16}>
              <div className="tm-text-body-lg">{t.detailLoad}</div>
            </Card>
          ) : (
            <InquiryDetail inquiry={inquiry} />
          )}
        </div>
      </div>
    </AppChrome>
  );
}

function InquiryDetail({ inquiry }: { inquiry: V1Inquiry }) {
  const meta = useMemo(() => `${categoryLabel[inquiry.category]} · ${formatDate(inquiry.createdAt)}`, [inquiry]);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card pad={16}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div className="tm-text-heading">{inquiry.title}</div>
            <div className="tm-text-caption" style={{ marginTop: 6 }}>{meta}</div>
          </div>
          <span className="tm-badge tm-badge-blue">{statusLabel[inquiry.status]}</span>
        </div>
      </Card>
      <Card pad={16}>
        <div className="tm-text-body-lg">{t.myQuestion}</div>
        <p className="tm-text-body" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: '10px 0 0' }}>
          {inquiry.body}
        </p>
      </Card>
      <Card pad={16}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div className="tm-text-body-lg">{t.answer}</div>
          <span className="tm-badge tm-badge-grey">{inquiry.replies?.length ?? 0}</span>
        </div>
        {inquiry.replies && inquiry.replies.length > 0 ? (
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {inquiry.replies.map((reply) => (
              <div key={reply.replyId} style={{ borderRadius: 14, background: '#f8fafc', padding: 12 }}>
                <div className="tm-text-label" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{reply.adminName ?? '\uc6b4\uc601\ud300'}</span>
                  <span style={{ color: '#94a3b8' }}>{formatDate(reply.createdAt)}</span>
                </div>
                <p className="tm-text-body" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: '8px 0 0' }}>
                  {reply.body}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <>
            <p className="tm-text-body" style={{ lineHeight: 1.6, margin: '10px 0 0' }}>{t.waitingAnswer}</p>
            <p className="tm-text-caption" style={{ lineHeight: 1.55, margin: '6px 0 0' }}>{t.waitingAnswerSub}</p>
          </>
        )}
      </Card>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

function errorMessage(error: unknown) {
  if (error instanceof V1ApiError) {
    if (error.statusCode === 401) return '\ub85c\uadf8\uc778\uc774 \ub9cc\ub8cc\ub410\uc5b4\uc694. \ub2e4\uc2dc \ub85c\uadf8\uc778\ud55c \ub4a4 \ubb38\uc758\ub97c \uc811\uc218\ud574 \uc8fc\uc138\uc694.';
    if (error.statusCode === 400) return '\uc785\ub825\uac12\uc744 \ud655\uc778\ud574 \uc8fc\uc138\uc694.';
    return error.message || '\ubb38\uc758 \uc811\uc218\uc5d0 \uc2e4\ud328\ud588\uc5b4\uc694.';
  }
  return '\ubb38\uc758 \uc811\uc218\uc5d0 \uc2e4\ud328\ud588\uc5b4\uc694. \uc7a0\uc2dc \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud574 \uc8fc\uc138\uc694.';
}

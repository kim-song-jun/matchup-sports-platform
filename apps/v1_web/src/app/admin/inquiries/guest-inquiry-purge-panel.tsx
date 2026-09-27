'use client';

import Link from 'next/link';
import { AdminInlineError, type AdminToastVariant } from '@/components/admin';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { useV1AdminGuestInquiryPurgeCandidates, useV1PurgeGuestInquiries } from '@/hooks/use-v1-api';
import { formatAdminDate } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { formatGuestInquiryRetention } from '@/lib/public-site/site-info';
import type { V1InquiryCategory } from '@/types/api';

interface GuestInquiryPurgePanelProps {
  categoryLabel: Record<V1InquiryCategory, string>;
  showToast: (message: string, variant?: AdminToastVariant) => void;
}

const NO_PERMISSION_ID = 'guest-inquiry-purge-no-permission';

/**
 * 보관 기간이 지난 비회원 문의의 수동 파기. 대상이 없으면 아무것도 그리지 않는다.
 * 파기는 화면에 보이는 목록(최대 200건)의 id 만 보낸다 — 되돌릴 수 없는 작업이라 본 것만 지운다.
 */
export function GuestInquiryPurgePanel({ categoryLabel, showToast }: GuestInquiryPurgePanelProps) {
  const canWrite = useAdminCanWrite();
  const { data, isError, error, refetch } = useV1AdminGuestInquiryPurgeCandidates();
  const purge = useV1PurgeGuestInquiries();
  const { confirm, ConfirmModal } = useConfirm();

  if (isError) {
    return (
      <AdminInlineError
        message={extractErrorMessage(error, '보관 기간이 지난 비회원 문의를 불러오지 못했어요.')}
        onRetry={() => void refetch()}
      />
    );
  }
  if (!data || data.total === 0) return null;

  const shownIds = data.items.map((item) => item.inquiryId);

  async function handlePurge() {
    const ok = await confirm({
      title: `비회원 문의 ${shownIds.length}건의 개인정보를 파기할까요?`,
      message: '연락처를 지우고 제목·본문·답변을 파기 표시로 바꿔요. 되돌릴 수 없어요.',
      confirmLabel: '개인정보 파기',
      tone: 'danger',
    });
    if (!ok) return;
    purge.mutate(
      { scope: 'selected', inquiryIds: shownIds },
      {
        onSuccess: (result) => {
          const skipped = result.skippedCount > 0 ? ` 대상에서 빠진 ${result.skippedCount}건은 건너뛰었어요.` : '';
          showToast(`비회원 문의 ${result.purgedCount}건의 개인정보를 파기했어요.${skipped}`, 'success');
        },
        onError: (err) => showToast(extractErrorMessage(err, '개인정보를 파기하지 못했어요.'), 'error'),
      },
    );
  }

  return (
    <>
      <section
        aria-labelledby="guest-inquiry-purge-title"
        className="tm-on-tint rounded-2xl border border-[var(--tint-orange-border)] bg-[var(--tint-orange)] p-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 id="guest-inquiry-purge-title" className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--orange700)]">
              보관 기간이 지난 비회원 문의 {data.total.toLocaleString('ko-KR')}건
            </h2>
            <p className="mt-1 text-[length:var(--font-size-caption)] leading-relaxed text-[var(--text-muted)]">
              제출 때 안내한 보관 기간과 현재 설정({formatGuestInquiryRetention(data.retentionDays)}) 중 짧은 쪽이 지났어요.
              자동으로 지우지 않으니 확인한 뒤 직접 파기해 주세요.
              {data.total > data.items.length ? ` 한 번에 ${data.items.length}건씩 보여요.` : ''}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
            <button
              type="button"
              onClick={() => void handlePurge()}
              disabled={!canWrite || purge.isPending}
              aria-describedby={canWrite ? undefined : NO_PERMISSION_ID}
              className="inline-flex h-[44px] items-center whitespace-nowrap rounded-xl border border-[var(--tint-red-border)] bg-[var(--card-surface)] px-4 text-[length:var(--font-size-label)] font-semibold text-[var(--red700)] transition-colors hover:bg-[var(--red50)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2"
            >
              {purge.isPending ? '파기하는 중...' : `개인정보 파기 (${shownIds.length}건)`}
            </button>
            {!canWrite ? (
              <p id={NO_PERMISSION_ID} className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
                개인정보 파기는 운영·소유자 역할만 할 수 있어요.
              </p>
            ) : null}
          </div>
        </div>

        <ul role="list" aria-label="파기 대상 문의" className="mt-3 max-h-[240px] divide-y divide-[var(--border)] overflow-y-auto rounded-xl bg-[var(--card-surface)]">
          {data.items.map((item) => (
            <li key={item.inquiryId} className="flex items-center justify-between gap-3 px-3 py-2 text-[length:var(--font-size-caption)] text-[var(--text-body)]">
              <span className="min-w-0">
                <span className="font-semibold">{categoryLabel[item.category]}</span>
                <span className="text-[var(--text-muted)]">
                  {' · '}처리 완료 {formatAdminDate(item.completedAt)}{' · '}보관 만료 {formatAdminDate(item.retentionExpiredAt)}
                </span>
              </span>
              <Link
                href={`/admin/inquiries/${item.inquiryId}`}
                className="inline-flex h-[44px] shrink-0 items-center rounded-lg px-3 font-semibold text-[var(--blue700)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                조회
              </Link>
            </li>
          ))}
        </ul>
      </section>
      {/* 섹션의 tm-on-tint 토큰 재정의가 모달 글자색에 번지지 않게 밖에 둔다. */}
      {ConfirmModal}
    </>
  );
}

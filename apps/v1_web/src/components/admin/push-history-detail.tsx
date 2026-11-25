'use client';

import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import Link from 'next/link';
import { useAdminPushHistoryDetail } from '@/hooks/use-admin-push-history';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { SectionTitle } from '@/components/v1-ui/primitives';
import { formatAdminDateTime } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { adminPushGenderLabel, adminPushTargetLabel } from '@/lib/admin-labels';
import type { AdminPushDeliveryChannel } from '@/types/admin-push-history';
import { AdminDetailRow } from './admin-detail-row';
import { AdminInlineError } from './admin-inline-error';
import { PushNotificationPreview } from './push-notification-preview';

function ChannelResult({ label, value }: { label: string; value: AdminPushDeliveryChannel | null }) {
  return (
    <div className="space-y-1 py-3">
      <h3 className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-strong)]">{label}</h3>
      {value === null ? <p className="text-[length:var(--font-size-label)] text-[var(--text-muted)]">전송 결과가 보관되지 않았어요.</p> : (
        <>
          <p className="text-[length:var(--font-size-label)] text-[var(--text-body)]">대상 {value.total.toLocaleString()}건 · 접수 {value.delivered.toLocaleString()}건 · 실패 {value.failed.toLocaleString()}건</p>
          {value.disabled && <p className="text-[length:var(--font-size-caption)] text-[var(--red700)]">발송 당시 이 푸시 채널이 꺼져 있었어요.</p>}
          {!value.disabled && value.total === 0 && <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">등록된 수신 대상이 없어 이 채널로는 전송하지 않았어요.</p>}
        </>
      )}
    </div>
  );
}

export function PushHistoryDetail({ id, open, onClose }: { id: string | null; open: boolean; onClose: () => void }) {
  const query = useAdminPushHistoryDetail(id);
  const { dialogRef, initialFocusRef, onBackdropClick, mounted, closing } = useModalA11y<HTMLButtonElement>({ open, onClose });
  if (!mounted) return null;
  const item = query.data;
  const hasContent = item?.content.source === 'snapshot' || item?.content.source === 'notification';
  const displayCount = (value: number | null) => value === null ? '미보관' : `${value.toLocaleString()}건`;
  return createPortal(
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim-dark-32)] p-3 sm:p-6 tm-modal-scrim${closing ? ' is-closing' : ''}`} onClick={onBackdropClick}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="push-history-dialog-title" className={`max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-[var(--card-surface)] p-5 sm:p-6 tm-modal-panel${closing ? ' is-closing' : ''}`}>
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 id="push-history-dialog-title" className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">발송 상세</h2>
          <button ref={initialFocusRef} type="button" onClick={onClose} aria-label="발송 상세 닫기" className="flex size-11 shrink-0 items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500"><X size={20} /></button>
        </div>
        {query.isPending && <p role="status" className="py-8 text-[length:var(--font-size-body)] text-[var(--text-muted)]">발송 내용을 불러오고 있어요.</p>}
        {query.isError && <AdminInlineError message={extractErrorMessage(query.error, '발송 내용을 불러오지 못했어요.')} onRetry={() => void query.refetch()} />}
        {!query.isError && item && <div className="space-y-6">
          <p className="whitespace-pre-wrap break-words text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">{item.title ?? '제목 미보관'}</p>
          <dl className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
            <AdminDetailRow label="발송 시각" value={formatAdminDateTime(item.createdAt)} />
            <AdminDetailRow label="발송자" value={item.sender.name ?? '이름 미보관'} />
            <AdminDetailRow label="발송 대상" value={adminPushTargetLabel(item.target)} />
            {item.target === 'competition' && <AdminDetailRow label="대회·리그" value={item.competition?.title ?? '이름 미보관'} />}
            {item.target !== 'user' && <AdminDetailRow label="성별" value={adminPushGenderLabel(item.gender)} />}
            <AdminDetailRow label="알림함 생성" value={displayCount(item.sent)} />
            <AdminDetailRow label="수신 설정으로 제외" value={displayCount(item.skipped)} />
            <AdminDetailRow label="알림 처리 실패" value={displayCount(item.failed)} />
          </dl>
          {item.target === 'user' && item.recipientUserId && <Link href={`/admin/users/${item.recipientUserId}`} className="inline-flex min-h-[44px] items-center text-[length:var(--font-size-label)] font-semibold text-[var(--blue600)] underline">대상 회원 상세 보기</Link>}
          <section aria-label="전송 결과" className="space-y-2">
            <SectionTitle title="전송 결과" />
            <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">푸시 서비스의 접수 결과예요. 실제 기기 도착·읽음 수와는 달라요.</p>
            <div className="divide-y divide-[var(--border)]">
              <ChannelResult label="앱 푸시 · iPhone / Android" value={item.delivery.native} />
              <ChannelResult label="웹 푸시" value={item.delivery.web} />
            </div>
          </section>
          {hasContent ? <>
            {item.content.source === 'notification' && <p role="note" className="text-[length:var(--font-size-label)] text-[var(--text-muted)]">과거 발송 요청 원본은 미보관이에요. 같은 제목·발송 시간대의 회원 알림함에서 확인한 내용을 표시해요.</p>}
            <PushNotificationPreview title={item.title ?? '제목 미보관'} body={item.content.body} />
            <section className="space-y-2" aria-label="발송 내용 전문">
              <SectionTitle title="내용 전문" />
              <p className="whitespace-pre-wrap break-words text-[length:var(--font-size-body)] text-[var(--text-body)]">{item.content.body || '본문 없이 발송했어요.'}</p>
              <p className="break-all text-[length:var(--font-size-caption)] text-[var(--text-muted)]">이동 경로: {item.content.url ?? '/notifications (알림함 기본 경로)'}</p>
            </section>
          </> : <p role="note" className="text-[length:var(--font-size-label)] text-[var(--text-muted)]">{item.content.source === 'ambiguous' ? '같은 시간대에 서로 다른 내용이 있어 이 발송의 본문을 확정할 수 없어요.' : '본문·이동 경로가 보관되지 않아 미리보기를 표시할 수 없어요.'}</p>}
        </div>}
      </div>
    </div>, document.body,
  );
}

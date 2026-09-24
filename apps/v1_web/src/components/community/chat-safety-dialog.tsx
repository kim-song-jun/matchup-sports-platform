'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useChatSafety } from '@/hooks/use-chat-safety';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { extractErrorMessage } from '@/lib/error-message';
import { withFromPath } from '@/lib/session-storage';
import { INQUIRY_REPORT_REASON_OPTIONS } from '@/lib/v1-status-labels';
import type { V1InquiryReportReason } from '@/types/api';

export type ChatSafetyTarget = { id: string; label: string };
export function ChatSafetyDialog({ roomId, target, onClose }: {
  roomId: string; target: ChatSafetyTarget | null; onClose: () => void;
}) {
  // 신고 처리 내역에서 뒤로가면 이 채팅방으로 돌아온다.
  const pathname = usePathname();
  const { blocked, block, unblock, report } = useChatSafety(roomId, !target);
  const [reason, setReason] = useState<V1InquiryReportReason>('harassment');
  const [detail, setDetail] = useState('');
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [notice, setNotice] = useState('');
  const pending = block.isPending || unblock.isPending || report.isPending;
  const { dialogRef, onBackdropClick } = useModalA11y({ open: true, onClose, pending });
  const error = block.error || unblock.error || report.error;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(25,31,40,.45)' }} onClick={onBackdropClick}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="chat-safety-title"
        className="w-full max-w-[420px] rounded-2xl p-5" style={{ background: 'var(--card-surface)', maxHeight: '85dvh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between gap-3">
          <h2 id="chat-safety-title" className="tm-text-heading">{target ? '메시지 신고·사용자 차단' : '채팅 차단 관리'}</h2>
          <button type="button" className="tm-btn tm-btn-md tm-btn-ghost" onClick={onClose} disabled={pending}>닫기</button>
        </div>
        {target ? <div className="grid gap-3 mt-4">
          <p className="tm-text-body">{target.label}님의 메시지</p>
          {report.data ? <div role="status" className="tm-text-body">신고가 접수됐어요. <Link className="underline" href={withFromPath(`/my/inquiries/${report.data.inquiryId}`, pathname)}>처리 내역 보기</Link></div> : <>
            <label className="tm-text-label" htmlFor="chat-report-reason">신고 사유</label>
            <select id="chat-report-reason" className="tm-input" value={reason} onChange={(e) => setReason(e.target.value as V1InquiryReportReason)} disabled={pending}>
              {INQUIRY_REPORT_REASON_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <label className="tm-text-label" htmlFor="chat-report-detail">추가 설명 (선택)</label>
            <textarea id="chat-report-detail" className="tm-input" rows={3} maxLength={500} value={detail} onChange={(e) => setDetail(e.target.value)} disabled={pending} />
            <button type="button" className="tm-btn tm-btn-lg tm-btn-primary" disabled={pending} onClick={() => report.mutate({ messageId: target.id, reason, detail })}>{report.isPending ? '접수 중…' : '신고 접수'}</button>
          </>}
          <p className="tm-text-caption">차단하면 모든 채팅방에서 서로의 메시지와 새 메시지 알림을 받지 않아요. 채팅 차단 관리에서 해제할 수 있어요.</p>
          <button type="button" className="tm-btn tm-btn-lg tm-btn-outline" disabled={pending} onClick={() => {
            if (!confirmBlock) { setConfirmBlock(true); return; }
            block.mutate(target.id, { onSuccess: onClose });
          }}>{block.isPending ? '차단 중…' : confirmBlock ? '이 사용자 차단 확인' : '이 사용자 차단'}</button>
        </div> : <div className="grid gap-3 mt-4">
          <p className="tm-text-caption">내가 차단한 사용자예요. 해제하면 이전 메시지도 다시 보여요.</p>
          {blocked.isPending ? <p role="status">목록을 불러오는 중이에요.</p> : blocked.isError ? <div role="alert"><p>차단 목록을 불러오지 못했어요.</p><button className="tm-btn tm-btn-md tm-btn-outline" onClick={() => blocked.refetch()}>다시 시도</button></div> : blocked.data?.items.length === 0 ? <p>차단한 사용자가 없어요.</p> : blocked.data?.items.map((user) => <div className="flex items-center justify-between gap-3" key={user.userId}>
            <span className="tm-text-body break-all">{user.displayName}</span>
            <button className="tm-btn tm-btn-md tm-btn-outline shrink-0" disabled={pending} onClick={() => unblock.mutate(user.userId, { onSuccess: () => setNotice('차단을 해제했어요.') })}>차단 해제</button>
          </div>)}
        </div>}
        {notice ? <p role="status" className="tm-text-caption mt-3">{notice}</p> : null}
        {error ? <p role="alert" className="tm-text-caption mt-3" style={{ color: 'var(--red700)' }}>{extractErrorMessage(error, '처리하지 못했어요. 다시 시도해 주세요.')}</p> : null}
      </section>
    </div>, document.body,
  );
}

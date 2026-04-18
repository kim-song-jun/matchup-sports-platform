'use client';

import { useRef, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, AlertTriangle, Loader2, Send } from 'lucide-react';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { DisputeMessageThread } from '@/components/dispute/dispute-message-thread';
import { useToast } from '@/components/ui/toast';
import { extractErrorMessage } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useDispute, useAddDisputeMessage } from '@/hooks/use-api';
import type { DisputeMessage } from '@/components/dispute/dispute-message-thread';

// useDispute(id)           → { data: Dispute | undefined; isLoading; isError; refetch }
// useAddDisputeMessage()   → mutation.mutate({ id, data: { message, attachmentUrls? } })
//
// Dispute.events: DisputeEvent[] (actorRole: 'buyer'|'seller'|'admin'|'system', message)
// We adapt DisputeEvent → DisputeMessage for the thread component.

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  filed: { text: '검토 대기', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' },
  seller_responded: { text: '판매자 응답', color: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300' },
  admin_reviewing: { text: '운영팀 검토 중', color: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300' },
  resolved_refund: { text: '환불 완료', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  resolved_release: { text: '지급 완료', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  resolved_partial: { text: '부분 환불', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  dismissed: { text: '기각됨', color: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
  withdrawn: { text: '취하됨', color: 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500' },
};

const TYPE_LABELS: Record<string, string> = {
  not_delivered: '상품 미수령',
  not_as_described: '상품 상태 불일치',
  damaged: '파손',
  other: '기타',
};

const RESOLVED_STATUSES = new Set(['resolved_refund', 'resolved_release', 'resolved_partial', 'dismissed', 'withdrawn']);

export default function DisputeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const disputeId = params.id as string;
  const bottomRef = useRef<HTMLDivElement>(null);
  const [messageInput, setMessageInput] = useState('');

  useRequireAuth();

  const { data: dispute, isLoading, isError, refetch } = useDispute(disputeId);
  const addMessage = useAddDisputeMessage();

  const isResolved = dispute ? RESOLVED_STATUSES.has(dispute.status) : false;

  // Map DisputeEvent → DisputeMessage for the thread component
  const threadMessages: DisputeMessage[] = (dispute?.events ?? []).map((event) => ({
    id: event.id,
    senderId: event.actorUserId,
    senderName: event.actor?.nickname ?? null,
    senderRole: event.actorRole,
    content: event.message,
    createdAt: event.createdAt,
  }));

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dispute?.events]);

  const handleSendMessage = () => {
    const content = messageInput.trim();
    if (!content || addMessage.isPending) return;

    setMessageInput('');
    addMessage.mutate(
      { id: disputeId, data: { message: content } },
      {
        onError: (err) => {
          toast('error', extractErrorMessage(err, '메시지 전송에 실패했어요. 다시 시도해주세요.'));
          setMessageInput(content); // restore on failure
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
        <div className="@3xl:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800">
          <div className="h-10 w-10 rounded-xl bg-gray-100 dark:bg-gray-700 animate-pulse" />
          <div className="h-6 w-32 rounded-xl bg-gray-100 dark:bg-gray-700 animate-pulse" />
        </div>
        <div className="px-5 @3xl:px-0 mt-4 space-y-3 animate-pulse">
          <div className="h-20 rounded-2xl bg-gray-100 dark:bg-gray-800" />
          <div className="h-60 rounded-2xl bg-gray-100 dark:bg-gray-800" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0 mt-4">
        <ErrorState message="분쟁 정보를 불러오지 못했어요" onRetry={() => void refetch()} />
      </div>
    );
  }

  if (!dispute) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0 mt-4">
        <EmptyState
          icon={AlertTriangle}
          title="분쟁을 찾을 수 없어요"
          description="삭제되었거나 존재하지 않는 분쟁이에요"
          action={{ label: '분쟁 목록', href: '/my/disputes' }}
        />
      </div>
    );
  }

  const statusConfig = STATUS_LABELS[dispute.status] ?? STATUS_LABELS.filed;

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in flex flex-col min-h-dvh">
      {/* Mobile header */}
      <header className="@3xl:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800 shrink-0">
        <button
          aria-label="뒤로 가기"
          onClick={() => router.back()}
          className="rounded-xl p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-[0.98] transition-[colors,transform] min-w-11 min-h-[44px] flex items-center justify-center"
        >
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate flex-1">분쟁 상세</h1>
      </header>

      {/* Info card */}
      <div className="px-5 @3xl:px-0 mt-4 shrink-0">
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${statusConfig.color}`}>
              {statusConfig.text}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {TYPE_LABELS[dispute.type] ?? dispute.type}
            </span>
          </div>

          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{dispute.reason}</p>

          <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
            <span>신청일 {new Date(dispute.createdAt).toLocaleDateString('ko-KR')}</span>
            {dispute.resolvedAt && (
              <span>해결일 {new Date(dispute.resolvedAt).toLocaleDateString('ko-KR')}</span>
            )}
          </div>

          {dispute.adminNotes && isResolved && (
            <div className="rounded-xl bg-gray-50 dark:bg-gray-700 px-3 py-2.5">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">운영팀 메모</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{dispute.adminNotes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto mt-3">
        <DisputeMessageThread
          messages={threadMessages}
          currentUserId={user?.id ?? ''}
        />
        <div ref={bottomRef} />
      </div>

      {/* Message input — hidden when resolved */}
      {!isResolved && (
        <div className="shrink-0 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 pb-[max(12px,var(--safe-area-bottom))]">
          <div className="flex items-end gap-2">
            <label htmlFor="dispute-reply-input" className="sr-only">메시지 입력</label>
            <textarea
              id="dispute-reply-input"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="메시지를 입력하세요"
              rows={1}
              className="flex-1 min-h-[44px] max-h-[120px] resize-none rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
            />
            <button
              type="button"
              onClick={handleSendMessage}
              disabled={!messageInput.trim() || addMessage.isPending}
              aria-label="메시지 보내기"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {addMessage.isPending ? (
                <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              ) : (
                <Send size={18} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

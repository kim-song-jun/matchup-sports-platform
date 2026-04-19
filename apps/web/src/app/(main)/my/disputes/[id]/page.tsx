'use client';

import { useRef, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, AlertTriangle, Loader2, Send, MessageSquare } from 'lucide-react';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { DisputeMessageThread } from '@/components/dispute/dispute-message-thread';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { extractErrorMessage } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useDispute, useAddDisputeMessage, useSellerRespond } from '@/hooks/use-api';
import { USER_DISPUTE_STATUS_LABELS, DISPUTE_TYPE_LABELS, RESOLVED_DISPUTE_STATUSES } from '@/lib/dispute-labels';
import type { DisputeMessage } from '@/components/dispute/dispute-message-thread';

// useDispute(id)           → { data: Dispute | undefined; isLoading; isError; refetch }
// useAddDisputeMessage()   → mutation.mutate({ id, data: { message, attachmentUrls? } })
//
// Dispute.events: DisputeEvent[] (actorRole: 'buyer'|'seller'|'admin'|'system', message)
// We adapt DisputeEvent → DisputeMessage for the thread component.

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
  const sellerRespond = useSellerRespond();
  const [showRespondModal, setShowRespondModal] = useState(false);
  const [respondMessage, setRespondMessage] = useState('');

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dispute?.events]);

  // Guard: useRequireAuth triggers redirect, but render must still be safe
  if (!user) return null;

  const isResolved = dispute ? RESOLVED_DISPUTE_STATUSES.has(dispute.status) : false;

  // Map DisputeEvent → DisputeMessage for the thread component
  const threadMessages: DisputeMessage[] = (dispute?.events ?? []).map((event) => ({
    id: event.id,
    senderId: event.actorUserId,
    senderName: event.actor?.nickname ?? null,
    senderRole: event.actorRole,
    content: event.message,
    createdAt: event.createdAt,
  }));

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

  const handleSellerRespond = () => {
    const content = respondMessage.trim();
    if (!content || sellerRespond.isPending) return;

    sellerRespond.mutate(
      { id: disputeId, data: { message: content } },
      {
        onSuccess: () => {
          toast('success', '답변이 제출됐어요. 운영팀이 검토할 예정이에요.');
          setRespondMessage('');
          setShowRespondModal(false);
        },
        onError: (err) => {
          toast('error', extractErrorMessage(err, '답변 제출에 실패했어요. 다시 시도해주세요.'));
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

  const statusConfig = USER_DISPUTE_STATUS_LABELS[dispute.status] ?? USER_DISPUTE_STATUS_LABELS.filed;

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
              {DISPUTE_TYPE_LABELS[dispute.type] ?? dispute.type}
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

          {/* Seller respond CTA — shown when dispute is filed and current user is the respondent */}
          {dispute.status === 'filed' && dispute.respondentUserId === user.id && (
            <button
              type="button"
              onClick={() => setShowRespondModal(true)}
              className="w-full min-h-[44px] rounded-xl border border-blue-200 dark:border-blue-800 py-2.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors flex items-center justify-center gap-2"
            >
              <MessageSquare size={16} aria-hidden="true" />
              답변 작성
            </button>
          )}
        </div>
      </div>

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto mt-3">
        <DisputeMessageThread
          messages={threadMessages}
          currentUserId={user.id}
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

      {/* Seller respond modal */}
      <Modal
        isOpen={showRespondModal}
        onClose={() => { setShowRespondModal(false); setRespondMessage(''); }}
        size="md"
        title="분쟁 답변 작성"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            분쟁에 대한 입장을 작성해주세요. 운영팀이 양측 답변을 검토해 결정해요.
          </p>
          <div>
            <label htmlFor="seller-respond-input" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
              답변 내용 <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <textarea
              id="seller-respond-input"
              value={respondMessage}
              onChange={(e) => setRespondMessage(e.target.value)}
              placeholder="구체적인 상황을 설명해주세요"
              rows={5}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 resize-none transition-colors"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setShowRespondModal(false); setRespondMessage(''); }}
              disabled={sellerRespond.isPending}
              className="flex-1 min-h-[44px] rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSellerRespond}
              disabled={!respondMessage.trim() || sellerRespond.isPending}
              className="flex-1 min-h-[44px] rounded-xl bg-blue-500 py-3 text-base font-semibold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {sellerRespond.isPending ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : null}
              답변 제출
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

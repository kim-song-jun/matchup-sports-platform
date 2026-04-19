'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  AlertCircle,
  Package,
  ExternalLink,
  Scale,
  ChevronRight,
  AlertTriangle,
  Calendar,
  MapPin,
  Shield,
  Loader2,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { DisputeMessageThread } from '@/components/dispute/dispute-message-thread';
import { DisputeResolveModal } from '@/components/dispute/dispute-resolve-modal';
import { formatAmount, extractErrorMessage } from '@/lib/utils';
import { useAdminDispute, useReviewDispute, useResolveDispute, useForceReleaseOrder } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { ADMIN_DISPUTE_STATUS_LABELS, DISPUTE_TYPE_LABELS, RESOLVED_DISPUTE_STATUSES } from '@/lib/dispute-labels';
import type { DisputeMessage } from '@/components/dispute/dispute-message-thread';

// useAdminDispute(id) → { data: Dispute; isLoading; isError; refetch }
// Dispute from types/dispute.ts:
//   { id, targetType, orderId, teamMatchId, type, status, buyerId, sellerId,
//     buyer?, seller?, description, resolution, resolvedByAdminId, resolvedAt,
//     createdAt, updatedAt, events: DisputeEvent[] }
//
// useReviewDispute() → status transition (filed→admin_reviewing)
// useResolveDispute() → final resolution (admin_reviewing→resolved_*|dismissed)

type LegacyActionMode = 'review' | null;

export default function AdminDisputeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const disputeId = params.id as string;
  const { toast } = useToast();
  const { user } = useAuthStore();

  const { data: dispute, isLoading, isError, refetch } = useAdminDispute(disputeId);
  const reviewDispute = useReviewDispute();
  const resolveDispute = useResolveDispute();
  const forceRelease = useForceReleaseOrder();

  const [showResolveModal, setShowResolveModal] = useState(false);
  const [showForceReleaseModal, setShowForceReleaseModal] = useState(false);
  const [forceReleaseNote, setForceReleaseNote] = useState('');
  const [legacyActionMode, setLegacyActionMode] = useState<LegacyActionMode>(null);
  const [adminNote, setAdminNote] = useState('');

  const isMarketplace = !!(dispute?.orderId);
  const isResolved = dispute ? RESOLVED_DISPUTE_STATUSES.has(dispute.status) : false;

  // Map DisputeEvent → DisputeMessage for thread component.
  // actor user object is not returned by the API; senderName is null (thread renders senderId fallback).
  const threadMessages: DisputeMessage[] = (dispute?.events ?? []).map((event) => ({
    id: event.id,
    senderId: event.actorUserId,
    senderName: null,
    senderRole: event.actorRole,
    content: event.message,
    createdAt: event.createdAt,
  }));

  const handleForceRelease = async () => {
    const note = forceReleaseNote.trim();
    if (!note) {
      toast('error', '메모를 입력해주세요');
      return;
    }
    if (!dispute?.orderId) return;
    try {
      await forceRelease.mutateAsync({ id: dispute.orderId, note });
      toast('success', '에스크로가 강제 해제됐어요');
      setShowForceReleaseModal(false);
      setForceReleaseNote('');
    } catch (err) {
      toast('error', extractErrorMessage(err, '강제 해제에 실패했어요.'));
    }
  };

  const handleReview = async () => {
    if (!adminNote.trim()) {
      toast('error', '메모를 입력해주세요');
      return;
    }
    try {
      await reviewDispute.mutateAsync({ id: disputeId, data: { note: adminNote } });
      toast('success', '검토 상태로 변경됐어요');
      setLegacyActionMode(null);
      setAdminNote('');
    } catch (err) {
      toast('error', extractErrorMessage(err, '상태 변경에 실패했어요.'));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded-xl bg-gray-100 dark:bg-gray-800" />
        <div className="h-40 rounded-2xl bg-gray-100 dark:bg-gray-800" />
        <div className="h-60 rounded-2xl bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (isError) {
    return <ErrorState message="분쟁 정보를 불러오지 못했어요" onRetry={() => void refetch()} />;
  }

  if (!dispute) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="분쟁을 찾을 수 없어요"
        description="삭제되었거나 존재하지 않는 분쟁이에요"
        action={{ label: '목록으로', href: '/admin/disputes' }}
      />
    );
  }

  const sc = ADMIN_DISPUTE_STATUS_LABELS[dispute.status] ?? { label: dispute.status, color: 'bg-gray-100 text-gray-500' };

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="목록으로"
            className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
          </button>
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Link href="/admin/disputes" className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">신고/분쟁</Link>
              <ChevronRight size={14} aria-hidden="true" />
              <span className="font-mono text-gray-700 dark:text-gray-300">{dispute.id}</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">분쟁 상세</h1>
          </div>
        </div>

        {!isResolved && (
          <div className="flex items-center gap-2 shrink-0">
            {isMarketplace && dispute.orderId && (
              <button
                type="button"
                onClick={() => setShowForceReleaseModal(true)}
                className="flex items-center gap-2 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                강제 해제
              </button>
            )}
            {dispute.status === 'filed' && (
              <button
                type="button"
                onClick={() => setLegacyActionMode('review')}
                className="flex items-center gap-2 min-h-[44px] rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 px-4 py-2.5 text-sm font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
              >
                <AlertTriangle size={15} aria-hidden="true" />
                검토 시작
              </button>
            )}
            {(dispute.status === 'admin_reviewing' || dispute.status === 'seller_responded') && (
              <button
                type="button"
                onClick={() => setShowResolveModal(true)}
                className="flex items-center gap-2 min-h-[44px] rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-600 transition-colors"
              >
                <Scale size={16} aria-hidden="true" />
                분쟁 처리
              </button>
            )}
          </div>
        )}
      </div>

      {/* Review modal (for filed→admin_reviewing transition) */}
      <Modal isOpen={legacyActionMode === 'review'} onClose={() => setLegacyActionMode(null)} title="검토 시작" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            검토 시작 메모를 남기면 감사 이벤트에 기록돼요.
          </p>
          <label htmlFor="admin-review-note" className="sr-only">운영 메모</label>
          <textarea
            id="admin-review-note"
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            rows={4}
            placeholder="검토 사유 또는 메모를 입력하세요"
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-base text-gray-900 dark:text-white placeholder:text-gray-400 resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
          />
          <div className="flex gap-3">
            <button
              onClick={() => setLegacyActionMode(null)}
              className="flex-1 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              취소
            </button>
            <button
              onClick={() => void handleReview()}
              disabled={reviewDispute.isPending}
              className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 py-3 text-base font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-60"
            >
              {reviewDispute.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
              검토 시작
            </button>
          </div>
        </div>
      </Modal>

      {/* Force-release modal — admin escrow override for marketplace disputes */}
      <Modal
        isOpen={showForceReleaseModal}
        onClose={() => { setShowForceReleaseModal(false); setForceReleaseNote(''); }}
        title="강제 해제"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            관리자 권한으로 에스크로를 해제할까요? 이 작업은 되돌릴 수 없어요.
          </p>
          <div>
            <label htmlFor="force-release-note" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
              메모 <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <textarea
              id="force-release-note"
              value={forceReleaseNote}
              onChange={(e) => setForceReleaseNote(e.target.value)}
              placeholder="강제 해제 사유를 입력하세요"
              rows={4}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 resize-none transition-colors"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setShowForceReleaseModal(false); setForceReleaseNote(''); }}
              disabled={forceRelease.isPending}
              className="flex-1 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void handleForceRelease()}
              disabled={!forceReleaseNote.trim() || forceRelease.isPending}
              className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 dark:bg-gray-100 py-3 text-base font-semibold text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-white disabled:opacity-50 transition-colors"
            >
              {forceRelease.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
              강제 해제
            </button>
          </div>
        </div>
      </Modal>

      {/* Meta grid */}
      <div className="grid @3xl:grid-cols-2 gap-4">
        {/* Info */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 space-y-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">분쟁 정보</h2>
          <dl className="space-y-2.5">
            <div className="flex justify-between items-start gap-4">
              <dt className="text-sm text-gray-500 dark:text-gray-400 shrink-0">출처</dt>
              <dd>
                <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${isMarketplace ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                  {isMarketplace ? '장터' : '팀매치'}
                </span>
              </dd>
            </div>
            <div className="flex justify-between items-start gap-4">
              <dt className="text-sm text-gray-500 dark:text-gray-400 shrink-0">유형</dt>
              <dd className="text-sm font-medium text-gray-900 dark:text-white text-right">{DISPUTE_TYPE_LABELS[dispute.type] ?? dispute.type}</dd>
            </div>
            <div className="flex justify-between items-start gap-4">
              <dt className="text-sm text-gray-500 dark:text-gray-400 shrink-0">상태</dt>
              <dd><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sc.color}`}>{sc.label}</span></dd>
            </div>
            <div className="flex justify-between items-start gap-4">
              <dt className="text-sm text-gray-500 dark:text-gray-400 shrink-0">신고일</dt>
              <dd className="text-sm text-gray-700 dark:text-gray-300">{new Date(dispute.createdAt).toLocaleDateString('ko-KR')}</dd>
            </div>
            {dispute.resolvedAt && (
              <div className="flex justify-between items-start gap-4">
                <dt className="text-sm text-gray-500 dark:text-gray-400 shrink-0">처리일</dt>
                <dd className="text-sm text-gray-700 dark:text-gray-300">{new Date(dispute.resolvedAt).toLocaleDateString('ko-KR')}</dd>
              </div>
            )}
            {dispute.resolvedByAdminId && (
              <div className="flex justify-between items-start gap-4">
                <dt className="text-sm text-gray-500 dark:text-gray-400 shrink-0">처리자</dt>
                <dd className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate max-w-[200px]">
                  {dispute.resolvedByAdminId}
                </dd>
              </div>
            )}
            {dispute.resolution && (
              <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-400 mb-1">운영 메모</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{dispute.resolution}</p>
              </div>
            )}
          </dl>
        </div>

        {/* Parties */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 space-y-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">당사자</h2>
          <dl className="space-y-3">
            {dispute.buyer && (
              <div className="flex justify-between items-center gap-4">
                <dt className="text-sm text-gray-500 dark:text-gray-400 shrink-0">신고인</dt>
                <dd>
                  <Link href={`/admin/users/${dispute.buyer.id}`} className="text-sm font-medium text-blue-500 hover:text-blue-600 flex items-center gap-1">
                    {dispute.buyer.nickname}
                    <ExternalLink size={12} aria-hidden="true" />
                  </Link>
                </dd>
              </div>
            )}
            {dispute.seller && (
              <div className="flex justify-between items-center gap-4">
                <dt className="text-sm text-gray-500 dark:text-gray-400 shrink-0">피신고인</dt>
                <dd>
                  <Link href={`/admin/users/${dispute.seller.id}`} className="text-sm font-medium text-blue-500 hover:text-blue-600 flex items-center gap-1">
                    {dispute.seller.nickname}
                    <ExternalLink size={12} aria-hidden="true" />
                  </Link>
                </dd>
              </div>
            )}
            {isMarketplace && dispute.orderId && (
              <div className="flex justify-between items-center gap-4">
                <dt className="text-sm text-gray-500 dark:text-gray-400 shrink-0">주문</dt>
                <dd>
                  <Link href={`/admin/orders/${dispute.orderId}`} className="text-sm font-medium text-blue-500 hover:text-blue-600 flex items-center gap-1 font-mono">
                    <Package size={12} className="shrink-0" aria-hidden="true" />
                    <span className="truncate max-w-[160px]">{dispute.orderId}</span>
                    <ExternalLink size={12} className="shrink-0" aria-hidden="true" />
                  </Link>
                </dd>
              </div>
            )}
            {!isMarketplace && dispute.teamMatchId && (
              <div className="flex justify-between items-center gap-4">
                <dt className="text-sm text-gray-500 dark:text-gray-400 shrink-0">팀 매치</dt>
                <dd>
                  <Link href={`/admin/team-matches/${dispute.teamMatchId}`} className="text-sm font-medium text-blue-500 hover:text-blue-600 flex items-center gap-1 font-mono">
                    <span className="truncate max-w-[160px]">{dispute.teamMatchId}</span>
                    <ExternalLink size={12} className="shrink-0" aria-hidden="true" />
                  </Link>
                </dd>
              </div>
            )}
          </dl>

          {/* Dispute reason/description */}
          <div className="pt-3 border-t border-gray-50 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-2 uppercase tracking-wide">신고 내용</p>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{dispute.description}</p>
          </div>
        </div>
      </div>

      {/* Match info — shown for team-match disputes */}
      {!isMarketplace && (
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">팀 매치 정보</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <Calendar size={14} className="text-gray-400" aria-hidden="true" />
                <span className="text-xs text-gray-400">매치 ID</span>
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white font-mono">{dispute.teamMatchId ?? '-'}</p>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <MapPin size={14} className="text-gray-400" aria-hidden="true" />
                <span className="text-xs text-gray-400">신고 유형</span>
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{DISPUTE_TYPE_LABELS[dispute.type] ?? dispute.type}</p>
            </div>
          </div>
        </div>
      )}

      {/* Message thread */}
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">메시지 스레드</h2>
          <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
            <Shield size={12} aria-hidden="true" />
            <span>관리자 뷰</span>
          </div>
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          <DisputeMessageThread
            messages={threadMessages}
            currentUserId={user?.id ?? ''}
          />
        </div>
      </div>

      {/* Resolve modal — shown for marketplace OR team-match in admin_reviewing */}
      <DisputeResolveModal
        isOpen={showResolveModal}
        onClose={() => setShowResolveModal(false)}
        disputeId={disputeId}
        resolveDisputeMutation={{
          mutate: (vars, callbacks) => {
            resolveDispute.mutate(
              {
                id: vars.id,
                data: {
                  action: vars.decision as 'refund' | 'release' | 'dismiss',
                  note: vars.note ?? '',
                },
              },
              callbacks,
            );
          },
          isPending: resolveDispute.isPending,
        }}
      />
    </div>
  );
}

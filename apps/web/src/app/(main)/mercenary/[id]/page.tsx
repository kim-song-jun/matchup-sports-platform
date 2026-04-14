'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Users, Pencil, Trash2, AlertTriangle, UserCheck, ChevronRight } from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import {
  useAcceptMercenaryApplication,
  useApplyMercenary,
  useDeleteMercenaryPost,
  useMercenaryPost,
  useRejectMercenaryApplication,
  useWithdrawMercenaryApplication,
} from '@/hooks/use-api';
import { sportLabel, levelLabel, sportCardAccent } from '@/lib/constants';
import { formatFullDate, formatCurrency } from '@/lib/utils';

const positionLabel: Record<string, string> = {
  GK: '골키퍼',
  DF: '수비수',
  MF: '미드필더',
  FW: '공격수',
  ALL: '포지션 무관',
};

const applicationStatusLabel: Record<string, string> = {
  pending: '대기 중',
  accepted: '승인됨',
  rejected: '거절됨',
  withdrawn: '신청 취소',
};

function extractErrorMessage(error: unknown, fallback: string): string {
  const maybe = error as { response?: { data?: { message?: string | string[] } } };
  const message = maybe.response?.data?.message;
  if (Array.isArray(message)) {
    return message[0] ?? fallback;
  }
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }
  return fallback;
}

function statusBadgeClass(status: string): string {
  if (status === 'accepted') return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300';
  if (status === 'rejected') return 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300';
  if (status === 'withdrawn') return 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300';
  return 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300';
}

function getApplyCtaLabel(reason: string | null, postStatus: string): string {
  if (reason === 'AUTH_REQUIRED') return '로그인 후 신청';
  if (reason === 'TEAM_MANAGER_CANNOT_APPLY' || reason === 'TEAM_MEMBER_CANNOT_APPLY') {
    return '소속팀 모집글';
  }
  if (reason === 'ALREADY_APPLIED') return '신청 완료';
  if (reason === 'POST_NOT_OPEN') return postStatus === 'filled' ? '모집 완료' : '모집 마감';
  return '신청할 수 없어요';
}

export default function MercenaryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { user, isAuthenticated } = useAuthStore();
  const { toast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [processingApplicationId, setProcessingApplicationId] = useState<string | null>(null);

  const { data: post, isLoading, isError, refetch } = useMercenaryPost(id);
  const applyMutation = useApplyMercenary();
  const acceptMutation = useAcceptMercenaryApplication();
  const rejectMutation = useRejectMercenaryApplication();
  const withdrawMutation = useWithdrawMercenaryApplication();
  const deleteMutation = useDeleteMercenaryPost();

  if (isLoading) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <div className="space-y-4 animate-pulse pt-4">
          <div className="h-6 w-1/3 bg-gray-100 dark:bg-gray-700 rounded" />
          <div className="h-8 w-2/3 bg-gray-100 dark:bg-gray-700 rounded" />
          <div className="h-40 bg-gray-100 dark:bg-gray-700 rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <ErrorState message="용병 모집글을 불러오지 못했어요" onRetry={() => refetch()} />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <EmptyState
          icon={UserCheck}
          title="모집글을 찾을 수 없어요"
          description="삭제되었거나 존재하지 않는 모집글이에요"
          action={{ label: '목록으로', href: '/mercenary' }}
        />
      </div>
    );
  }

  const isAuthor = post.viewer?.isAuthor ?? (!!user && (post.author?.id === user.id || post.authorId === user.id));
  const canManageApplications = post.canManageApplications ?? post.viewer?.canManage ?? false;
  const myApplication =
    post.viewerApplication ??
    post.applications?.find((application) => application.userId === user?.id);
  const myApplicationStatus = post.viewer?.myApplicationStatus ?? myApplication?.status ?? null;
  const canApply =
    post.canApply ??
    post.viewer?.canApply ??
    (!canManageApplications && !myApplication && post.status === 'open');
  const applyBlockReason = post.applyBlockReason ?? post.viewer?.applyBlockReason ?? null;
  const canEdit = isAuthor || canManageApplications;

  const fee = post.fee ?? 0;
  const level = post.level ?? 0;
  const count = post.count ?? 1;
  const positionKey = post.position ?? 'ALL';
  const accent = sportCardAccent[post.sportType];
  const applications = post.applications ?? [];

  async function handleApply() {
    if (applyBlockReason === 'AUTH_REQUIRED' || (!isAuthenticated && !canApply)) {
      router.push(`/login?redirect=/mercenary/${id}`);
      return;
    }

    try {
      await applyMutation.mutateAsync({ id, data: { message: '' } });
      toast('success', '용병 신청이 완료되었어요');
    } catch (error) {
      toast('error', extractErrorMessage(error, '신청에 실패했어요. 잠시 후 다시 시도해주세요'));
    }
  }

  async function handleWithdraw() {
    try {
      await withdrawMutation.mutateAsync(id);
      toast('success', '신청을 취소했어요');
    } catch (error) {
      toast('error', extractErrorMessage(error, '신청을 취소하지 못했어요. 다시 시도해주세요'));
    }
  }

  async function handleAccept(applicationId: string) {
    setProcessingApplicationId(applicationId);
    try {
      await acceptMutation.mutateAsync({ postId: id, applicationId });
      toast('success', '신청을 승인했어요');
    } catch (error) {
      toast('error', extractErrorMessage(error, '승인에 실패했어요. 다시 시도해주세요'));
    } finally {
      setProcessingApplicationId(null);
    }
  }

  async function handleReject(applicationId: string) {
    setProcessingApplicationId(applicationId);
    try {
      await rejectMutation.mutateAsync({ postId: id, applicationId });
      toast('success', '신청을 거절했어요');
    } catch (error) {
      toast('error', extractErrorMessage(error, '거절에 실패했어요. 다시 시도해주세요'));
    } finally {
      setProcessingApplicationId(null);
    }
  }

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(id);
      toast('success', '모집글이 삭제되었어요');
      router.push('/mercenary');
    } catch (error) {
      toast('error', extractErrorMessage(error, '삭제하지 못했어요. 다시 시도해주세요'));
    }
    setShowDeleteConfirm(false);
  }

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in bg-gray-50 dark:bg-gray-900 min-h-screen">
      <MobileGlassHeader className="justify-between">
        <button
          onClick={() => router.back()}
          aria-label="뒤로 가기"
          className="glass-mobile-icon-button flex items-center justify-center min-h-[44px] min-w-11 rounded-xl"
        >
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <span className="text-base font-semibold text-gray-900 dark:text-white">용병 모집</span>
        <div className="min-w-11" aria-hidden="true" />
      </MobileGlassHeader>

      <div className="px-5 @3xl:px-0 pb-40">
        <div className="hidden @3xl:flex items-center gap-2 px-5 @3xl:px-0 pt-4 mb-4 text-sm text-gray-500 dark:text-gray-400">
          <Link href="/mercenary" className="hover:text-blue-500 transition-colors">용병 모집</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span className="text-gray-900 dark:text-white font-medium truncate">{post?.team?.name ?? ''}</span>
        </div>

        <div className="flex items-center gap-2 mt-4 mb-2">
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-semibold ${accent?.badge ?? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'}`}
          >
            {sportLabel[post.sportType] ?? post.sportType}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {positionLabel[positionKey] ?? positionKey}
          </span>
          {fee === 0 && (
            <span className="text-xs text-green-600 dark:text-green-400 font-semibold">무료</span>
          )}
          <span className="text-xs text-gray-300 dark:text-gray-600" aria-hidden="true">·</span>
          <span className={`text-xs font-semibold ${post.status === 'open' ? 'text-blue-500 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>
            {post.status === 'open' ? '모집중' : post.status === 'filled' ? '모집 완료' : post.status}
          </span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          {post.team?.name ?? '—'}
        </h1>

        <div className="flex flex-col gap-1 mt-3 mb-4 text-sm text-gray-500 dark:text-gray-400">
          <p className="font-medium text-gray-700 dark:text-gray-200">
            {formatFullDate(post.matchDate)}
          </p>
          {post.venue && (
            <p className="flex items-center gap-1">
              <MapPin size={14} aria-hidden="true" />
              {post.venue}
            </p>
          )}
        </div>

        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700 mb-4">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">모집 인원</span>
            <div className="flex items-center gap-1 text-sm font-semibold text-gray-900 dark:text-white">
              <Users size={14} aria-hidden="true" />
              {count}명
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">신청 현황</span>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {post.applicationCount ?? applications.length}
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">필요 포지션</span>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {positionLabel[positionKey] ?? positionKey}
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">요구 레벨</span>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {levelLabel[level] ?? `레벨 ${level}`} 이상
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">참가 비용</span>
            <span className={`text-sm font-semibold ${fee === 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
              {formatCurrency(fee)}
            </span>
          </div>
        </div>

        {(post.notes || post.description) && (
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">모집 내용</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">
              {post.notes ?? post.description}
            </p>
          </div>
        )}

        {post.author && (
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">작성자</h2>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-sm font-bold text-gray-500 dark:text-gray-300">
                {post.author.nickname.charAt(0)}
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {post.author.nickname}
              </span>
            </div>
          </div>
        )}

        {canManageApplications && (
          <section className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">지원 목록</h2>
            {applications.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">아직 지원자가 없어요.</p>
            ) : (
              <div className="space-y-3">
                {applications.map((application) => {
                  const isPending = application.status === 'pending';
                  const isProcessing = processingApplicationId === application.id;
                  return (
                    <div key={application.id} className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {application.user?.nickname ?? '지원자'}
                        </p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(application.status)}`}>
                          {applicationStatusLabel[application.status] ?? application.status}
                        </span>
                      </div>
                      {application.message && (
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                          {application.message}
                        </p>
                      )}
                      {isPending && (
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => void handleAccept(application.id)}
                            disabled={isProcessing}
                            className="flex-1 min-h-[44px] rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-50 transition-colors"
                          >
                            승인
                          </button>
                          <button
                            onClick={() => void handleReject(application.id)}
                            disabled={isProcessing}
                            className="flex-1 min-h-[44px] rounded-xl border border-red-200 dark:border-red-800 text-red-500 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors"
                          >
                            거절
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {myApplicationStatus && !canManageApplications && (
          <section className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">내 신청 상태</h2>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(myApplicationStatus)}`}>
              {applicationStatusLabel[myApplicationStatus] ?? myApplicationStatus}
            </span>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">호스트의 승인/거절 결과가 여기에 반영됩니다.</p>
          </section>
        )}
      </div>

      <div className="fixed bottom-20 lg:bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-5 py-4 lg:pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {canEdit ? (
          <div className="flex gap-3">
            <Link
              href={`/mercenary/${id}/edit`}
              className="flex flex-1 items-center justify-center gap-1.5 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-600 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Pencil size={15} aria-hidden="true" />
              수정
            </Link>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex flex-1 items-center justify-center gap-1.5 min-h-[44px] rounded-xl border border-red-200 dark:border-red-800 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              <Trash2 size={15} aria-hidden="true" />
              삭제
            </button>
          </div>
        ) : myApplicationStatus === 'pending' ? (
          <button
            onClick={() => void handleWithdraw()}
            disabled={withdrawMutation.isPending}
            className="w-full min-h-[44px] rounded-xl py-3.5 text-base font-bold border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-60 transition-colors"
          >
            {withdrawMutation.isPending ? '취소 중...' : '신청 취소'}
          </button>
        ) : (
          <button
            onClick={() => void handleApply()}
            disabled={(!canApply && applyBlockReason !== 'AUTH_REQUIRED') || applyMutation.isPending}
            aria-label={canApply || applyBlockReason === 'AUTH_REQUIRED' ? '용병 신청하기' : '신청할 수 없는 모집글'}
            className={`w-full min-h-[44px] rounded-xl py-3.5 text-base font-bold transition-colors ${
              !canApply && applyBlockReason !== 'AUTH_REQUIRED'
                ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700 disabled:opacity-60'
            }`}
          >
            {applyMutation.isPending
              ? '신청 중...'
              : myApplicationStatus
                ? (applicationStatusLabel[myApplicationStatus] ?? '신청 완료')
                : canApply
                  ? '신청하기'
                  : getApplyCtaLabel(applyBlockReason, post.status)}
          </button>
        )}
      </div>

      <Modal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)}>
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/30 mx-auto mb-4">
          <AlertTriangle size={24} className="text-red-500" aria-hidden="true" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center">
          모집글을 삭제하시겠어요?
        </h3>
        <p className="text-base text-gray-500 dark:text-gray-400 text-center mt-2">
          삭제된 모집글은 복구할 수 없습니다.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => setShowDeleteConfirm(false)}
            className="flex-1 min-h-[44px] rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            돌아가기
          </button>
          <button
            onClick={() => void handleDelete()}
            disabled={deleteMutation.isPending}
            className="flex-1 min-h-[44px] rounded-xl bg-red-500 py-3 text-sm font-semibold text-white hover:bg-red-600 transition-colors"
          >
            {deleteMutation.isPending ? '삭제 중...' : '삭제하기'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

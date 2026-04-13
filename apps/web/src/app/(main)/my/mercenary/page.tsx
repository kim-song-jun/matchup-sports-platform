'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, MapPin, Pencil, Trash2, AlertTriangle, UserCheck } from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useRequireAuth } from '@/hooks/use-require-auth';
import {
  useDeleteMercenaryPost,
  useMercenaryPosts,
  useMyMercenaryApplications,
  useWithdrawMercenaryApplication,
} from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { sportLabel } from '@/lib/constants';
import { formatCurrency, formatMatchDate } from '@/lib/utils';

type TabKey = 'created' | 'applied';

const statusLabel: Record<string, string> = {
  pending: '대기 중',
  accepted: '승인됨',
  rejected: '거절됨',
  withdrawn: '취소됨',
};

function statusBadgeClass(status: string): string {
  if (status === 'accepted') return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300';
  if (status === 'rejected') return 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300';
  if (status === 'withdrawn') return 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300';
  return 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300';
}

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

export default function MyMercenaryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuthStore();
  useRequireAuth();

  const [activeTab, setActiveTab] = useState<TabKey>('created');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [withdrawingPostId, setWithdrawingPostId] = useState<string | null>(null);

  const { data: apiData } = useMercenaryPosts();
  const { data: myApplicationsData } = useMyMercenaryApplications();
  const myApplications = myApplicationsData?.items ?? [];
  const deleteMutation = useDeleteMercenaryPost();
  const withdrawMutation = useWithdrawMercenaryApplication();

  const myPosts = (apiData?.items ?? []).filter((post) => post.authorId === user?.id);

  async function handleDelete(id: string) {
    try {
      await deleteMutation.mutateAsync(id);
      toast('success', '모집글이 취소되었어요');
    } catch (error) {
      toast('error', extractErrorMessage(error, '취소하지 못했어요. 다시 시도해주세요'));
    }
    setDeleteTarget(null);
  }

  async function handleWithdraw(postId: string) {
    setWithdrawingPostId(postId);
    try {
      await withdrawMutation.mutateAsync(postId);
      toast('success', '신청을 취소했어요');
    } catch (error) {
      toast('error', extractErrorMessage(error, '신청 취소에 실패했어요. 다시 시도해주세요'));
    } finally {
      setWithdrawingPostId(null);
    }
  }

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      <MobileGlassHeader className="gap-3">
        <button
          aria-label="뒤로 가기"
          onClick={() => router.back()}
          className="glass-mobile-icon-button flex min-h-[44px] min-w-11 items-center justify-center rounded-xl"
        >
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">내 용병 모집/신청</h1>
      </MobileGlassHeader>
      <div className="hidden @3xl:block mb-6 px-5 @3xl:px-0 pt-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">내 용병 모집/신청</h2>
        <p className="text-base text-gray-500 dark:text-gray-400 mt-1">내 모집글과 지원 상태를 관리하세요</p>
      </div>

      <div className="px-5 @3xl:px-0 pb-8">
        <div className="mb-4 flex gap-1 rounded-xl bg-gray-100 dark:bg-gray-700 p-1" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'created'}
            onClick={() => setActiveTab('created')}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'created'
                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                : 'text-gray-600 dark:text-gray-300'
            }`}
          >
            내 모집
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'applied'}
            onClick={() => setActiveTab('applied')}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'applied'
                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                : 'text-gray-600 dark:text-gray-300'
            }`}
          >
            내 신청
          </button>
        </div>

        {activeTab === 'created' ? (
          <div className="space-y-3">
            {myPosts.length === 0 ? (
              <EmptyState
                icon={UserCheck}
                title="용병 모집글이 없어요"
                description="용병을 모집해보세요"
                action={{ label: '용병 모집하기', href: '/mercenary/new' }}
              />
            ) : myPosts.map((post) => (
              <div key={post.id} className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="rounded-md bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-semibold text-gray-500 dark:text-gray-300">
                    {sportLabel[post.sportType] ?? post.sportType}
                  </span>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                    post.status === 'open'
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-500 dark:text-blue-400'
                      : post.status === 'filled'
                        ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-500 dark:text-emerald-400'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  }`}>
                    {post.status === 'open' ? '모집중' : post.status === 'filled' ? '모집 완료' : post.status}
                  </span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white ml-auto">
                    {formatCurrency(post.fee ?? 0)}
                  </span>
                </div>

                <Link href={`/mercenary/${post.id}`}>
                  <h3 className="text-md font-semibold text-gray-900 dark:text-white hover:text-blue-500 transition-colors truncate">
                    {post.notes ?? post.description ?? '용병 모집'}
                  </h3>
                </Link>

                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                    <Calendar size={12} aria-hidden="true" />
                    <span>{formatMatchDate(post.matchDate)}</span>
                  </div>
                  {post.venue && (
                    <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                      <MapPin size={12} aria-hidden="true" />
                      <span>{post.venue}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-sm text-blue-500 dark:text-blue-400">
                    <UserCheck size={12} aria-hidden="true" />
                    <span>신청 {post.applicationCount ?? 0}명</span>
                  </div>
                </div>

                {post.status === 'open' && (
                  <div className="mt-3 flex gap-2">
                    <Link
                      href={`/mercenary/${post.id}/edit`}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gray-50 dark:bg-gray-700 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors min-h-[44px]"
                    >
                      <Pencil size={14} aria-hidden="true" />
                      수정
                    </Link>
                    <button
                      onClick={() => setDeleteTarget(post.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-red-50 dark:bg-red-900/30 py-2.5 text-sm font-semibold text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors min-h-[44px]"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      취소
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {myApplications.length === 0 ? (
              <EmptyState
                icon={UserCheck}
                title="지원한 모집글이 없어요"
                description="원하는 모집글에 지원해보세요"
                action={{ label: '용병 모집 보기', href: '/mercenary' }}
              />
            ) : myApplications.map((application) => {
              const isPending = application.status === 'pending';
              const isWithdrawing = withdrawingPostId === application.post.id;

              return (
                <div key={application.id} className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="rounded-md bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-semibold text-gray-500 dark:text-gray-300">
                      {sportLabel[application.post.sportType] ?? application.post.sportType}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(application.status)}`}>
                      {statusLabel[application.status] ?? application.status}
                    </span>
                  </div>

                  <Link href={`/mercenary/${application.post.id}`}>
                    <h3 className="text-md font-semibold text-gray-900 dark:text-white hover:text-blue-500 transition-colors truncate">
                      {application.post.team?.name ?? '용병 모집글'}
                    </h3>
                  </Link>

                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                      <Calendar size={12} aria-hidden="true" />
                      <span>{formatMatchDate(application.post.matchDate)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                      <MapPin size={12} aria-hidden="true" />
                      <span>{application.post.venue ?? '장소 미정'}</span>
                    </div>
                  </div>

                  {isPending && (
                    <button
                      onClick={() => void handleWithdraw(application.post.id)}
                      disabled={isWithdrawing}
                      className="mt-3 w-full min-h-[44px] rounded-xl border border-red-200 dark:border-red-800 text-red-500 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-60 transition-colors"
                    >
                      {isWithdrawing ? '취소 중...' : '신청 취소'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="모집글 취소"
        size="sm"
      >
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/30 mx-auto mb-4">
          <AlertTriangle size={24} className="text-red-500" aria-hidden="true" />
        </div>
        <p className="text-base text-gray-900 dark:text-white font-bold text-center">모집글을 취소하시겠어요?</p>
        <p className="text-base text-gray-500 dark:text-gray-400 text-center mt-2">취소하면 신청한 용병들에게 알림이 발송돼요.</p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => setDeleteTarget(null)}
            className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors min-h-[44px]"
          >
            돌아가기
          </button>
          <button
            onClick={() => deleteTarget && void handleDelete(deleteTarget)}
            disabled={deleteMutation.isPending}
            className="flex-1 rounded-xl bg-red-500 py-3 text-base font-semibold text-white hover:bg-red-600 disabled:opacity-60 transition-colors min-h-[44px]"
          >
            {deleteMutation.isPending ? '취소 중...' : '취소하기'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Users, Pencil, Trash2, AlertTriangle, UserCheck, ChevronRight } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { useMercenaryPost } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { sportLabel, levelLabel, sportCardAccent } from '@/lib/constants';
import { formatFullDate, formatCurrency } from '@/lib/utils';

const positionLabel: Record<string, string> = {
  GK: '골키퍼',
  DF: '수비수',
  MF: '미드필더',
  FW: '공격수',
  ALL: '포지션 무관',
};

export default function MercenaryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { user, isAuthenticated } = useAuthStore();
  const { toast } = useToast();
  const [applying, setApplying] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: post, isLoading, isError, refetch } = useMercenaryPost(id);

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

  const isAuthor = !!user && (post.author?.id === user.id || post.authorId === user.id);
  const isAlreadyApplied = post.applications?.some((a) => a.userId === user?.id) ?? false;

  const fee = post.fee ?? 0;
  const level = post.level ?? 0;
  const count = post.count ?? 1;
  const positionKey = post.position ?? 'ALL';
  const accent = sportCardAccent[post.sportType];

  async function handleApply() {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/mercenary/${id}`);
      return;
    }
    setApplying(true);
    try {
      await api.post(`/mercenary/${id}/apply`, { message: '' });
      toast('success', '용병 신청이 완료되었어요');
      refetch();
    } catch {
      toast('error', '신청에 실패했어요. 잠시 후 다시 시도해주세요');
    } finally {
      setApplying(false);
    }
  }

  async function handleDelete() {
    try {
      await api.delete(`/mercenary/${id}`);
      toast('success', '모집글이 삭제되었어요');
      router.push('/mercenary');
    } catch {
      toast('error', '삭제하지 못했어요. 다시 시도해주세요');
    }
    setShowDeleteConfirm(false);
  }

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Mobile header */}
      <header className="@3xl:hidden flex items-center justify-between px-5 py-3 sticky top-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm z-10 border-b border-gray-50 dark:border-gray-800">
        <button
          onClick={() => router.back()}
          aria-label="뒤로 가기"
          className="flex items-center justify-center min-h-[44px] min-w-11 rounded-xl -ml-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <span className="text-base font-semibold text-gray-900 dark:text-white">용병 모집</span>
        <div className="min-w-11" aria-hidden="true" />
      </header>

      <div className="px-5 @3xl:px-0 pb-28">
        {/* Desktop breadcrumb */}
        <div className="hidden @3xl:flex items-center gap-2 px-5 @3xl:px-0 pt-4 mb-4 text-sm text-gray-500 dark:text-gray-400">
          <Link href="/mercenary" className="hover:text-blue-500 transition-colors">용병 모집</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span className="text-gray-900 dark:text-white font-medium truncate">{post?.team?.name ?? ''}</span>
        </div>

        {/* Sport + position badge row */}
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
        </div>

        {/* Team name */}
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          {post.team?.name ?? '—'}
        </h1>

        {/* Match date + venue */}
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

        {/* Detail info card */}
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700 mb-4">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">모집 인원</span>
            <div className="flex items-center gap-1 text-sm font-semibold text-gray-900 dark:text-white">
              <Users size={14} aria-hidden="true" />
              {count}명
            </div>
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

        {/* Notes / description */}
        {(post.notes || post.description) && (
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">모집 내용</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">
              {post.notes ?? post.description}
            </p>
          </div>
        )}

        {/* Author info */}
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
      </div>

      {/* Bottom CTA — fixed */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {isAuthor ? (
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
        ) : (
          <button
            onClick={handleApply}
            disabled={isAlreadyApplied || applying}
            aria-label={isAlreadyApplied ? '이미 신청한 모집글' : '용병 신청하기'}
            className={`w-full min-h-[44px] rounded-xl py-3.5 text-base font-bold transition-colors ${
              isAlreadyApplied
                ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700 disabled:opacity-60'
            }`}
          >
            {applying ? '신청 중...' : isAlreadyApplied ? '신청 완료' : '신청하기'}
          </button>
        )}
      </div>

      {/* Delete confirm modal */}
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
            onClick={handleDelete}
            className="flex-1 min-h-[44px] rounded-xl bg-red-500 py-3 text-sm font-semibold text-white hover:bg-red-600 transition-colors"
          >
            삭제하기
          </button>
        </div>
      </Modal>
    </div>
  );
}

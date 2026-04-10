'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, MapPin, Pencil, Trash2, AlertTriangle, UserCheck } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { api } from '@/lib/api';
import { useMercenaryPosts, queryKeys } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { useQueryClient } from '@tanstack/react-query';
import { sportLabel } from '@/lib/constants';
import { formatCurrency } from '@/lib/utils';

export default function MyMercenaryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  useRequireAuth();

  const { data: apiData } = useMercenaryPosts();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Filter to only posts authored by the current user
  const myPosts = (apiData?.items ?? []).filter(
    (p) => p.authorId === user?.id
  );

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/mercenary/${id}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.mercenary.list() });
      toast('success', '모집글이 취소되었어요');
    } catch {
      toast('error', '취소하지 못했어요. 다시 시도해주세요');
    }
    setDeleteTarget(null);
  };

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      <header className="@3xl:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800">
        <button
          aria-label="뒤로 가기"
          onClick={() => router.back()}
          className="rounded-xl p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-[0.98] transition-[colors,transform] min-w-11 min-h-[44px] flex items-center justify-center"
        >
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">내 용병 모집</h1>
      </header>
      <div className="hidden @3xl:block mb-6 px-5 @3xl:px-0 pt-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">내 용병 모집</h2>
        <p className="text-base text-gray-500 dark:text-gray-400 mt-1">용병 모집글을 관리하세요</p>
      </div>

      <div className="px-5 @3xl:px-0 space-y-3 pb-8">
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
                {sportLabel[post.sportType]}
              </span>
              <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                post.status === 'open'
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-500 dark:text-blue-400'
                  : post.status === 'closed'
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  : 'bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400'
              }`}>
                {post.status === 'open' ? '모집중' : post.status === 'closed' ? '마감' : '취소됨'}
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
                <span>{post.matchDate}</span>
              </div>
              {post.venue && (
                <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                  <MapPin size={12} aria-hidden="true" />
                  <span>{post.venue}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-sm text-blue-500 dark:text-blue-400">
                <UserCheck size={12} aria-hidden="true" />
                <span>신청 {post.applications?.length ?? 0}명</span>
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
            onClick={() => deleteTarget && handleDelete(deleteTarget)}
            className="flex-1 rounded-xl bg-red-500 py-3 text-base font-semibold text-white hover:bg-red-600 transition-colors min-h-[44px]"
          >
            취소하기
          </button>
        </div>
      </Modal>
    </div>
  );
}

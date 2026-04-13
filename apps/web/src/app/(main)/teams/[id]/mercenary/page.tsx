'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, UserPlus, Plus, Calendar } from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useTeam, useMercenaryPosts, useMyTeams } from '@/hooks/use-api';
import { sportLabel, sportCardAccent } from '@/lib/constants';
import { formatMatchDate } from '@/lib/utils';
import type { MercenaryPost } from '@/types/api';

export default function TeamMercenaryPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.id as string;

  const { data: team } = useTeam(teamId);
  const { data, isLoading, error, refetch } = useMercenaryPosts({ teamId });
  const { data: myTeams } = useMyTeams();

  const posts = data?.items ?? [];
  const myMembership = myTeams?.find((t) => t.id === teamId);
  const canManage = myMembership?.role === 'owner' || myMembership?.role === 'manager';

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      {/* Mobile header */}
      <MobileGlassHeader className="gap-3">
        <button
          onClick={() => router.back()}
          aria-label="뒤로 가기"
          className="glass-mobile-icon-button flex items-center justify-center min-h-[44px] min-w-11 rounded-xl"
        >
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate flex-1">
          {team ? `${team.name} 용병 모집` : '용병 모집'}
        </h1>
        {canManage && (
          <Link
            href={`/mercenary/new?teamId=${teamId}`}
            aria-label="용병 모집 추가"
            className="flex items-center justify-center min-h-[44px] min-w-11 rounded-xl bg-blue-500 hover:bg-blue-600 transition-colors"
          >
            <Plus size={18} className="text-white" />
          </Link>
        )}
      </MobileGlassHeader>

      <div className="hidden @3xl:block px-5 @3xl:px-0 pt-4 mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/teams" className="hover:text-gray-600">팀&middot;클럽</Link>
          <span>/</span>
          <Link href={`/teams/${teamId}`} className="hover:text-gray-600">{team?.name}</Link>
          <span>/</span>
          <span className="text-gray-700">용병 모집</span>
        </div>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">용병 모집</h2>
          {canManage && (
            <Link
              href={`/mercenary/new?teamId=${teamId}`}
              className="flex items-center gap-1.5 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-600 transition-colors"
            >
              <Plus size={14} />
              모집 추가
            </Link>
          )}
        </div>
      </div>

      <div className="px-5 @3xl:px-0 pb-8">
        {isLoading ? (
          <div className="space-y-3 mt-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-28 rounded-xl bg-gray-50 dark:bg-gray-800 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <ErrorState onRetry={() => refetch()} />
        ) : posts.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="용병 모집글이 없어요"
            description={canManage ? '용병을 모집해보세요' : '현재 모집 중인 용병 포지션이 없어요'}
            action={canManage ? { label: '모집글 등록', href: `/mercenary/new?teamId=${teamId}` } : undefined}
          />
        ) : (
          <div className="space-y-3 mt-3 stagger-children">
            {posts.map((post: MercenaryPost) => (
              <Link key={post.id} href={`/mercenary/${post.id}`} className="block">
                <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors active:scale-[0.99]">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${sportCardAccent[post.sportType]?.badge ?? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'}`}>
                      {sportLabel[post.sportType] || post.sportType}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      post.status === 'open'
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300'
                        : post.status === 'filled'
                          ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'
                    }`}>
                      {post.status === 'open' ? '모집중' : post.status === 'filled' ? '모집 완료' : '마감'}
                    </span>
                  </div>
                  {(post.notes || post.description) && (
                    <p className="text-base font-medium text-gray-900 dark:text-white mt-1 line-clamp-2">{post.notes ?? post.description}</p>
                  )}
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 mt-2">
                    <Calendar size={12} />
                    <span>{formatMatchDate(post.matchDate)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                    <span>{post.venue ?? '장소 미정'}</span>
                    <span>신청 {post.applicationCount ?? 0}명</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

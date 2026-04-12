'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search, UserPlus } from 'lucide-react';
import { MobilePageTopZone } from '@/components/layout/mobile-page-top-zone';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useMercenaryPosts } from '@/hooks/use-api';
import { MercenaryCard } from '@/components/mercenary/mercenary-card';
import { sportLabel } from '@/lib/constants';

const sportFilters = [
  { key: '', label: '전체' },
  ...Object.entries(sportLabel).map(([key, label]) => ({ key, label })),
];

export default function MercenaryPage() {
  const [activeSport, setActiveSport] = useState('');
  const { data: apiData, isLoading, isError, refetch } = useMercenaryPosts();

  const allPosts = apiData?.items ?? [];
  const filtered = activeSport
    ? allPosts.filter((post) => post.sportType === activeSport)
    : allPosts;

  return (
    <div className="pt-[var(--safe-area-top)] animate-fade-in">
      <MobilePageTopZone
        surface="plain"
        eyebrow="팀 빈자리 채우기"
        title="용병 모집"
        subtitle="급하게 필요한 포지션을 빠르게 채우고, 내 모집/신청도 한 흐름 안에서 관리하세요."
        action={(
          <Link
            href="/mercenary/new"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-blue-500 px-3.5 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-600"
          >
            <UserPlus size={16} strokeWidth={2.5} aria-hidden="true" />
            용병 모집하기
          </Link>
        )}
      >
        <Link href="/my/mercenary" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-300">
          내 모집/신청
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </MobilePageTopZone>

      <div className="px-5 @3xl:px-0 mb-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {sportFilters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setActiveSport(filter.key)}
            className={`shrink-0 min-h-[44px] rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              activeSport === filter.key
                ? 'bg-blue-500 text-white dark:bg-blue-500 dark:text-white'
                : 'border border-gray-100 bg-gray-50 text-gray-600 hover:bg-gray-100 active:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="px-5 @3xl:px-0 flex flex-col gap-3">
          {[1, 2, 3].map((skeleton) => (
            <div
              key={skeleton}
              className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 animate-pulse"
            >
              <div className="h-3 w-1/3 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
              <div className="h-5 w-1/2 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
              <div className="h-3 w-2/3 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="px-5 @3xl:px-0">
          <ErrorState message="용병 모집 목록을 불러오지 못했어요" onRetry={() => refetch()} />
        </div>
      ) : (
        <>
          <div className="px-5 @3xl:px-0 mb-3">
            <p className="text-sm text-gray-500">{filtered.length}개의 모집글</p>
          </div>

          <div className="px-5 @3xl:px-0">
            {filtered.length === 0 ? (
              <EmptyState
                icon={Search}
                title={activeSport ? `${sportLabel[activeSport]} 용병 모집이 없어요` : '아직 등록된 용병 모집이 없어요'}
                description="직접 용병을 모집해보세요"
                action={{ label: '용병 모집하기', href: '/mercenary/new' }}
              />
            ) : (
              <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2 stagger-children">
                {filtered.map((post) => (
                  <MercenaryCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
      <div className="h-24" />
    </div>
  );
}

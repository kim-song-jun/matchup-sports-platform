'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserPlus, Search, Star } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useToast } from '@/components/ui/toast';
import { useMercenaryPosts } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { sportLabel, levelLabel, sportCardAccent } from '@/lib/constants';
import { formatMatchDate, formatCurrency } from '@/lib/utils';
import type { MercenaryPost } from '@/types/api';

const sportFilters = [
  { key: '', label: '전체' },
  ...Object.entries(sportLabel).map(([key, label]) => ({ key, label })),
];

const positionLabel: Record<string, string> = {
  GK: '골키퍼',
  DF: '수비수',
  MF: '미드필더',
  FW: '공격수',
  ALL: '포지션 무관',
};

export default function MercenaryPage() {
  const [activeSport, setActiveSport] = useState('');
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { data: apiData, isLoading, isError, refetch } = useMercenaryPosts();

  const allPosts: MercenaryPost[] = apiData?.items ?? [];

  const filtered = activeSport
    ? allPosts.filter((p) => p.sportType === activeSport)
    : allPosts;

  async function handleApply(id: string) {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/mercenary/${id}`);
      return;
    }
    try {
      await api.post(`/mercenary/${id}/apply`);
      setAppliedIds((prev) => new Set(prev).add(id));
      toast('success', '용병 신청이 완료되었어요');
    } catch {
      toast('error', '신청에 실패했어요. 잠시 후 다시 시도해주세요');
    }
  }

  return (
    <div className="pt-[var(--safe-area-top)] animate-fade-in">
      <header className="px-5 @3xl:px-0 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">용병 모집</h1>
          <Link href="/my/mercenary" className="text-sm text-gray-500 hover:text-gray-600 transition-colors">
            내 모집/신청
          </Link>
        </div>
        <Link
          href="/mercenary/new"
          className="flex items-center gap-1.5 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors"
        >
          <UserPlus size={16} strokeWidth={2.5} />
          용병 모집하기
        </Link>
      </header>

      {/* 필터 칩 */}
      <div className="px-5 @3xl:px-0 mb-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {sportFilters.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveSport(f.key)}
            className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              activeSport === f.key
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'bg-white text-gray-600 border border-gray-200 active:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="px-5 @3xl:px-0 flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
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

          {/* 모집글 리스트 */}
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
                {filtered.map((post: MercenaryPost) => {
                  const isApplied = appliedIds.has(post.id);
                  const teamName = post.team?.name ?? '—';
                  const mannerScore = post.team?.mannerScore ?? 0;
                  const positionKey = post.position ?? 'ALL';
                  const fee = post.fee ?? 0;
                  const level = post.level ?? 0;
                  const count = post.count ?? 1;

                  return (
                    <Link
                      key={post.id}
                      href={`/mercenary/${post.id}`}
                      className="block rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 duration-200"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-1 text-xs text-gray-500">
                            <span className={`rounded-md px-1.5 py-0.5 font-semibold ${sportCardAccent[post.sportType]?.badge ?? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'}`}>
                              {sportLabel[post.sportType]}
                            </span>
                            <span className="text-gray-200 dark:text-gray-600" aria-hidden="true">·</span>
                            <span>{positionLabel[positionKey] ?? positionKey}</span>
                            {fee === 0 && (
                              <>
                                <span className="text-gray-200 dark:text-gray-600" aria-hidden="true">·</span>
                                <span className="text-green-600 dark:text-green-400 font-semibold">무료</span>
                              </>
                            )}
                          </div>
                          <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {teamName}
                          </h3>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-amber-500 shrink-0">
                          <Star size={12} fill="currentColor" aria-hidden="true" />
                          <span className="font-semibold">{mannerScore.toFixed(1)}</span>
                        </div>
                      </div>

                      <p className="mt-2.5 text-sm text-gray-500 leading-relaxed">
                        {formatMatchDate(post.matchDate)}
                        {post.venue && (
                          <>
                            <span className="text-gray-300 dark:text-gray-600 mx-1" aria-hidden="true">·</span>
                            {post.venue}
                          </>
                        )}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        {levelLabel[level] ?? `레벨 ${level}`} 이상
                        <span className="text-gray-300 dark:text-gray-600 mx-1" aria-hidden="true">·</span>
                        <span className={`font-semibold ${fee === 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-800 dark:text-gray-200'}`}>
                          {formatCurrency(fee)}
                        </span>
                      </p>

                      {post.notes && (
                        <p className="mt-2 text-xs text-gray-500 truncate">{post.notes}</p>
                      )}

                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                          {count}명 모집
                        </span>
                        <button
                          onClick={(e) => { e.preventDefault(); handleApply(post.id); }}
                          disabled={isApplied}
                          aria-label={isApplied ? '신청 완료됨' : `${teamName} 용병 신청`}
                          className={`rounded-xl px-5 py-2.5 min-h-[44px] text-sm font-bold transition-colors ${
                            isApplied
                              ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                              : 'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700'
                          }`}
                        >
                          {isApplied ? '신청완료' : '신청'}
                        </button>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

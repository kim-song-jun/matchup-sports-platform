'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { MobilePageTopZone } from '@/components/layout/mobile-page-top-zone';
import { EmptyState } from '@/components/ui/empty-state';
import { useTeamMatches, useMyTeams } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { TeamMatchCard } from '@/components/match/team-match-card';
import { sportLabel } from '@/lib/constants';
import type { TeamMatch } from '@/types/api';

const sportFilters = [
  { key: '', label: '전체' },
  { key: 'soccer', label: '축구' },
  { key: 'futsal', label: '풋살' },
];


export default function TeamMatchesPage() {
  const [activeSport, setActiveSport] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const { isAuthenticated } = useAuthStore();
  const { data: myTeams } = useMyTeams();
  const params = activeSport ? { sportType: activeSport } : undefined;
  const { data, isLoading, error, refetch } = useTeamMatches(params);
  const allMatches = data?.items ?? [];
  let matches = dateFilter
    ? allMatches.filter((m: TeamMatch) => m.matchDate?.startsWith(dateFilter))
    : allMatches;
  if (levelFilter) {
    const [min, max] = levelFilter.split('-').map(Number);
    matches = matches.filter((m: TeamMatch) => {
      const lvl = parseInt(String(m.requiredLevel || '0'), 10);
      return lvl >= min && lvl <= max;
    });
  }

  // Only teams where user is owner/manager are considered "my host teams"
  const myHostTeamIds = new Set(
    (myTeams ?? [])
      .filter((t) => t.role === 'owner' || t.role === 'manager')
      .map((t) => t.id),
  );
  const myTeamMatches = isAuthenticated ? matches.filter((m: TeamMatch) => m.hostTeamId && myHostTeamIds.has(m.hostTeamId)) : [];
  const otherMatches = isAuthenticated && myHostTeamIds.size > 0 ? matches.filter((m: TeamMatch) => !m.hostTeamId || !myHostTeamIds.has(m.hostTeamId)) : matches;

  return (
    <div className="pt-[var(--safe-area-top)] animate-fade-in">
      <MobilePageTopZone
        eyebrow="밸런스 매칭"
        title="팀 매칭"
        subtitle="우리 팀과 비슷한 상대를 찾고, 호스트 모집글도 한 흐름 안에서 관리하세요."
        action={(
          <Link
            href="/team-matches/new"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500 text-white transition-colors hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
            aria-label="모집글 작성"
          >
            <Plus size={18} aria-hidden="true" />
          </Link>
        )}
      />

      {/* 필터 칩 */}
      <div className="px-5 @3xl:px-0 mb-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {sportFilters.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={activeSport === f.key}
            onClick={() => setActiveSport(f.key)}
            className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
              activeSport === f.key
                ? 'bg-blue-500 text-white'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 필터 행 */}
      <div className="px-5 @3xl:px-0 mb-4 flex flex-wrap items-center gap-2">
        <label htmlFor="team-match-date-filter" className="sr-only">경기 날짜 필터</label>
        <Input
          id="team-match-date-filter"
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="w-auto"
        />
        {[
          { key: '', label: '전체' },
          { key: '1-2', label: '입문~초급' },
          { key: '3-4', label: '중급~상급' },
          { key: '5-5', label: '고수' },
        ].map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={levelFilter === f.key}
            onClick={() => setLevelFilter(f.key)}
            className={`shrink-0 rounded-full px-3 py-2 text-sm font-medium transition-colors ${
              levelFilter === f.key
                ? 'bg-blue-500 text-white'
                : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!isLoading && matches.length > 0 && (
        <div className="px-5 @3xl:px-0 mb-3">
          <p className="text-sm text-gray-500">{matches.length}개의 모집글</p>
        </div>
      )}

      {/* 모집글 리스트 */}
      <div className="px-5 @3xl:px-0">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[160px] rounded-xl bg-gray-100 dark:bg-gray-800 skeleton-shimmer" />
            ))}
          </div>
        ) : error ? (
          <ErrorState onRetry={() => refetch()} />
        ) : matches.length === 0 ? (
          <EmptyState
            icon={Search}
            title={activeSport ? `${sportLabel[activeSport]} 모집글이 없어요` : '모집글이 없어요'}
            description="직접 모집글을 작성해보세요"
            action={{ label: '모집글 작성', href: '/team-matches/new' }}
          />
        ) : (
          <div className="space-y-6">
            {isAuthenticated && myHostTeamIds.size > 0 && (
              <div>
                <h2 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-3">내 팀 호스트 모집글</h2>
                {myTeamMatches.length === 0 ? (
                  <EmptyState
                    icon={Search}
                    title="내 팀의 모집글이 없어요"
                    description="모집글을 작성해 상대팀을 구해보세요"
                    action={{ label: '모집글 작성', href: '/team-matches/new' }}
                    size="sm"
                  />
                ) : (
                  <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2">
                    {myTeamMatches.map((match: TeamMatch) => (
                      <TeamMatchCard key={match.id} match={match} />
                    ))}
                  </div>
                )}
              </div>
            )}
            <div>
              {isAuthenticated && myHostTeamIds.size > 0 && (
                <h2 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-3">다른 팀 매칭</h2>
              )}
              {otherMatches.length === 0 && isAuthenticated && myHostTeamIds.size > 0 ? (
                <EmptyState
                  icon={Search}
                  title="다른 팀의 모집글이 없어요"
                  description="내 팀이 모든 매칭을 호스트하고 있어요"
                  size="sm"
                />
              ) : (
                <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2 stagger-children">
                  {otherMatches.map((match: TeamMatch) => (
                    <TeamMatchCard key={match.id} match={match} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="h-24" />
    </div>
  );
}


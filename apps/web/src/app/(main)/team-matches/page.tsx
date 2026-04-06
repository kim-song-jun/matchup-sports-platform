'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useTeamMatches, useMyTeams } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { ErrorState } from '@/components/ui/error-state';
import { getGradeInfo } from '@/lib/skill-grades';
import { sportLabel, sportCardAccent } from '@/lib/constants';
import { formatCurrency, formatMatchDate } from '@/lib/utils';
import type { TeamMatch } from '@/types/api';

const sportFilters = [
  { key: '', label: '전체' },
  { key: 'soccer', label: '축구' },
  { key: 'futsal', label: '풋살' },
];

const levelLabel: Record<string, string> = {
  beginner: '입문',
  lower: '하',
  middle: '중',
  upper: '상',
  pro: '프로',
};

const matchStyleLabel: Record<string, string> = {
  friendly: '친선',
  competitive: '경쟁',
  manner_focused: '매너 중시',
};

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

  const myTeamIds = new Set((myTeams ?? []).map((t) => t.id));
  const myTeamMatches = isAuthenticated ? matches.filter((m: TeamMatch) => m.hostTeamId && myTeamIds.has(m.hostTeamId)) : [];
  const otherMatches = isAuthenticated && myTeamMatches.length > 0 ? matches.filter((m: TeamMatch) => !m.hostTeamId || !myTeamIds.has(m.hostTeamId)) : matches;

  return (
    <div className="pt-[var(--safe-area-top)] animate-fade-in">
      <header className="px-5 @3xl:px-0 pt-4 pb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">팀 매칭</h1>
        <Link
          href="/team-matches/new"
          className="flex items-center gap-1.5 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors"
        >
          <Plus size={16} strokeWidth={2.5} />
          모집글 작성
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

      {/* 필터 행 */}
      <div className="px-5 @3xl:px-0 mb-4 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        {[
          { key: '', label: '전체' },
          { key: '1-2', label: '입문~초급' },
          { key: '3-4', label: '중급~상급' },
          { key: '5-5', label: '고수' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setLevelFilter(f.key)}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              levelFilter === f.key
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'bg-white text-gray-600 border border-gray-200 active:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
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
            {myTeamMatches.length > 0 && (
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white mb-3">내 팀 매칭</h2>
                <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2">
                  {myTeamMatches.map((match: TeamMatch) => (
                    <TeamMatchCard key={match.id} match={match} />
                  ))}
                </div>
              </div>
            )}
            <div>
              {myTeamMatches.length > 0 && (
                <h2 className="text-base font-bold text-gray-900 dark:text-white mb-3">다른 팀 매칭</h2>
              )}
              <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2 stagger-children">
                {otherMatches.map((match: TeamMatch) => (
                  <TeamMatchCard key={match.id} match={match} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

function TeamMatchCard({ match }: { match: TeamMatch }) {
  const statusMap: Record<string, { label: string; className: string }> = {
    recruiting: { label: '모집중', className: 'bg-gray-100 text-gray-500' },
    matched: { label: '매칭완료', className: 'text-blue-500' },
    completed: { label: '경기종료', className: 'bg-gray-100 text-gray-500' },
    cancelled: { label: '취소', className: 'bg-red-50 text-red-500' },
  };
  const status = statusMap[match.status] ?? statusMap.recruiting;

  return (
    <Link href={`/team-matches/${match.id}`}>
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 transition-colors active:scale-[0.98] hover:bg-gray-50 dark:hover:bg-gray-700 duration-200">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${status.className}`}>
                {status.label}
              </span>
              <span className={`${sportCardAccent[match.sportType]?.badge || 'bg-gray-100 text-gray-500'} rounded-full px-2 py-0.5 text-xs font-normal`}>
                {sportLabel[match.sportType] ?? match.sportType}
              </span>
              {match.matchStyle && (
                <>
                  <span className="text-gray-200">·</span>
                  <span className="text-xs text-gray-500">
                    {matchStyleLabel[match.matchStyle] ?? match.matchStyle}
                  </span>
                </>
              )}
              {match.isFreeInvitation && (
                <span className="text-xs font-semibold text-green-600 ml-1">
                  무료초청
                </span>
              )}
            </div>
            <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100 truncate">
              {match.title}
            </h3>
          </div>
        </div>

        <p className="mt-2.5 text-sm text-gray-500 leading-relaxed">
          {formatMatchDate(match.matchDate)} {match.startTime}
          <span className="text-gray-300 mx-1">·</span>
          {match.venueName}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          {match.quarterCount}쿼터
          <span className="text-gray-300 mx-1">·</span>
          {match.skillGrade ? getGradeInfo(match.skillGrade).label : (match.requiredLevel ? levelLabel[match.requiredLevel] ?? match.requiredLevel : '제한없음')}
          {match.gameFormat && (
            <>
              <span className="text-gray-300 mx-1">·</span>
              {match.gameFormat}
            </>
          )}
          <span className="text-gray-300 mx-1">·</span>
          <span className="font-semibold text-gray-800 dark:text-gray-200">
            {formatCurrency(match.opponentFee ?? match.totalFee)}
          </span>
        </p>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            신청 {String(match.applicationCount ?? 0)}팀
          </span>
          {match.hostTeam && (
            <span className="text-xs text-gray-500">
              {match.hostTeam.name}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

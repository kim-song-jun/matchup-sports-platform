'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Calendar, MapPin, Users, DollarSign, Trophy, Plus, Search } from 'lucide-react';
import { useTeamMatches } from '@/hooks/use-api';
import { getGradeInfo } from '@/lib/skill-grades';
import { sportLabel } from '@/lib/constants';
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
  const params = activeSport ? { sportType: activeSport } : undefined;
  const { data, isLoading } = useTeamMatches(params);
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

  return (
    <div className="pt-[var(--safe-area-top)] animate-fade-in">
      <header className="px-5 lg:px-0 pt-4 pb-3 flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-gray-900 dark:text-white">팀 매칭</h1>
        <Link
          href="/team-matches/new"
          className="flex items-center gap-1.5 rounded-xl bg-blue-500 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors"
        >
          <Plus size={16} strokeWidth={2.5} />
          모집글 작성
        </Link>
      </header>

      {/* 필터 칩 */}
      <div className="px-5 lg:px-0 mb-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {sportFilters.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveSport(f.key)}
            className={`shrink-0 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-all ${
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
      <div className="px-5 lg:px-0 mb-4 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        {[
          { key: '', label: '전체' },
          { key: '1-2', label: 'Lv.1-2' },
          { key: '3-4', label: 'Lv.3-4' },
          { key: '5-5', label: 'Lv.5' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setLevelFilter(f.key)}
            className={`shrink-0 rounded-lg px-3 py-2 text-[13px] font-medium transition-all ${
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
        <div className="px-5 lg:px-0 mb-3">
          <p className="text-[13px] text-gray-400">{matches.length}개의 모집글</p>
        </div>
      )}

      {/* 모집글 리스트 */}
      <div className="px-5 lg:px-0">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[160px] rounded-2xl bg-gray-100 dark:bg-gray-800 skeleton-shimmer" />
            ))}
          </div>
        ) : matches.length === 0 ? (
          <div className="rounded-2xl bg-gray-50 p-16 text-center">
            <Search size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-[15px] font-medium text-gray-600">
              {activeSport ? `${sportLabel[activeSport]} 모집글이 없어요` : '모집글이 없어요'}
            </p>
            <p className="text-[13px] text-gray-400 mt-1">
              직접 모집글을 작성해보세요
            </p>
          </div>
        ) : (
          <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 stagger-children">
            {matches.map((match: TeamMatch) => {
              const statusMap: Record<string, { label: string; className: string }> = {
                recruiting: { label: '모집중', className: 'bg-blue-50 text-blue-500' },
                matched: { label: '매칭완료', className: 'bg-green-50 text-green-600' },
                completed: { label: '경기종료', className: 'bg-gray-100 text-gray-500' },
                cancelled: { label: '취소', className: 'bg-red-50 text-red-500' },
              };
              const status = statusMap[match.status] ?? statusMap.recruiting;

              return (
                <Link key={match.id} href={`/team-matches/${match.id}`}>
                  <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 transition-all active:scale-[0.98] hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 duration-200">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>
                            {status.label}
                          </span>
                          <span className="text-[12px] text-gray-400">
                            {sportLabel[match.sportType] ?? match.sportType}
                          </span>
                          {match.matchStyle && (
                            <>
                              <span className="text-gray-200">·</span>
                              <span className="text-[12px] text-gray-400">
                                {matchStyleLabel[match.matchStyle] ?? match.matchStyle}
                              </span>
                            </>
                          )}
                          {match.isFreeInvitation && (
                            <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-600 ml-1">
                              무료초청
                            </span>
                          )}
                        </div>
                        <h3 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {match.title}
                        </h3>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-y-1.5 gap-x-4">
                      <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                        <Calendar size={15} className="text-gray-400" />
                        <span>{formatMatchDate(match.matchDate)} {match.startTime}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                        <MapPin size={15} className="text-gray-400" />
                        <span className="truncate">{match.venueName}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                        <Trophy size={15} className="text-gray-400" />
                        <span>{match.quarterCount}쿼터</span>
                        <span className="text-gray-200">·</span>
                        {match.skillGrade ? (() => {
                          const grade = getGradeInfo(match.skillGrade);
                          return (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${grade.color}`}>
                              {grade.label}
                            </span>
                          );
                        })() : (
                          <span>{match.requiredLevel ? levelLabel[match.requiredLevel] ?? match.requiredLevel : '제한없음'}</span>
                        )}
                        {match.gameFormat && (
                          <>
                            <span className="text-gray-200">·</span>
                            <span>{match.gameFormat}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[13px]">
                        <DollarSign size={15} className="text-gray-400" />
                        <span className="font-semibold text-gray-800">
                          {formatCurrency(match.opponentFee ?? match.totalFee)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[12px] text-gray-400">
                        <Users size={12} />
                        <span>신청 {String(match.applicationCount ?? 0)}팀</span>
                      </div>
                      {match.hostTeam && (
                        <span className="text-[12px] text-gray-400">
                          {match.hostTeam.name}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="h-6" />
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, ChevronRight, CalendarDays, ShieldCheck, Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useTeamMatches } from '@/hooks/use-api';
import { ErrorState } from '@/components/ui/error-state';
import { getGradeInfo } from '@/lib/skill-grades';
import { sportLabel } from '@/lib/constants';
import { formatCurrency, formatMatchDate } from '@/lib/utils';
import type { TeamMatch } from '@/types/api';

const surfaceCard =
  'rounded-[28px] border border-slate-200/70 bg-white/85 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/75 dark:shadow-black/20';

const softCard =
  'rounded-[24px] border border-slate-200/60 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-black/10';

const sportFilters = [
  { key: '', label: '전체' },
  { key: 'soccer', label: '축구' },
  { key: 'futsal', label: '풋살' },
] as const;

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

const statusMap: Record<string, { label: string; className: string }> = {
  recruiting: { label: '모집중', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200' },
  matched: { label: '매칭완료', className: 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200' },
  completed: { label: '경기종료', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  cancelled: { label: '취소', className: 'bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-200' },
};

function TeamMatchCard({ match }: { match: TeamMatch }) {
  const status = statusMap[match.status] ?? statusMap.recruiting;

  return (
    <Link href={`/team-matches/${match.id}`}>
      <div className={`${softCard} h-full p-4 transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:bg-white dark:hover:bg-slate-900`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {sportLabel[match.sportType] ?? match.sportType}
              </span>
              {match.matchStyle && (
                <span className="rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-400">
                  {matchStyleLabel[match.matchStyle] ?? match.matchStyle}
                </span>
              )}
              {match.isFreeInvitation && (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">
                  무료초청
                </span>
              )}
            </div>
            <h3 className="mt-3 truncate text-lg font-bold tracking-tight text-slate-950 dark:text-white">{match.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {formatMatchDate(match.matchDate)} {match.startTime}
              <span className="mx-2 text-slate-300 dark:text-slate-700">·</span>
              {match.venueName}
            </p>
          </div>
          <ChevronRight size={18} className="mt-1 text-slate-400" />
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/70">
            <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">수준</p>
            <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">
              {match.skillGrade ? getGradeInfo(match.skillGrade).label : (match.requiredLevel ? levelLabel[match.requiredLevel] ?? match.requiredLevel : '제한없음')}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/70">
            <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">비용</p>
            <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{formatCurrency(match.opponentFee ?? match.totalFee)}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-950/70">
            <Users size={12} />
            신청 {String(match.applicationCount ?? 0)}팀
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-950/70">
            <CalendarDays size={12} />
            {match.quarterCount}쿼터
          </span>
          {match.hostTeam && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-950/70">
              <ShieldCheck size={12} />
              {match.hostTeam.name}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function TeamMatchesPage() {
  const [activeSport, setActiveSport] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const params = activeSport ? { sportType: activeSport } : undefined;
  const { data, isLoading, error, refetch } = useTeamMatches(params);
  const allMatches = data?.items ?? [];

  const matches = useMemo(() => {
    let result = dateFilter
      ? allMatches.filter((m: TeamMatch) => m.matchDate?.startsWith(dateFilter))
      : allMatches;

    if (levelFilter) {
      const [min, max] = levelFilter.split('-').map(Number);
      result = result.filter((m: TeamMatch) => {
        const lvl = parseInt(String(m.requiredLevel || '0'), 10);
        return lvl >= min && lvl <= max;
      });
    }

    return result;
  }, [allMatches, dateFilter, levelFilter]);

  const recruitingCount = useMemo(
    () => matches.filter((match) => match.status === 'recruiting').length,
    [matches]
  );

  return (
    <div className="relative isolate overflow-hidden pt-[var(--safe-area-top)] pb-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[340px]"
        style={{
          background:
            'radial-gradient(circle at 20% 0%, rgba(59,130,246,0.18), transparent 36%), radial-gradient(circle at 82% 4%, rgba(15,23,42,0.12), transparent 24%), linear-gradient(180deg, rgba(248,250,252,0.9) 0%, rgba(248,250,252,0.55) 42%, rgba(248,250,252,0) 100%)',
        }}
      />

      <header className="relative px-5 @3xl:px-0 pt-4">
        <div className={`${surfaceCard} p-6 sm:p-7`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Team matching</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white">팀 매칭</h1>
              <p className="mt-3 max-w-[44rem] text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                모집 상태, 경기 방식, 난이도를 한 번에 정리해 팀 운영에 필요한 정보를 먼저 보여줍니다.
              </p>
            </div>
            <Link
              href="/team-matches/new"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-950/20 active:translate-y-0 dark:bg-white dark:text-slate-950"
            >
              <Plus size={16} strokeWidth={2.5} />
              모집글 작성
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { label: '총 모집글', value: String(matches.length) },
              { label: '모집중', value: String(recruitingCount) },
              { label: '활성 종목', value: activeSport ? sportLabel[activeSport] ?? activeSport : '전체' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{item.label}</p>
                <p className="mt-2 text-xl font-black tracking-tight text-slate-950 dark:text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      <section className="relative mt-4 px-5 @3xl:px-0">
        <div className={`${surfaceCard} p-4 sm:p-5`}>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {sportFilters.map((f) => (
              <button
                key={f.key}
                onClick={() => setActiveSport(f.key)}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                  activeSport === f.key
                    ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                    : 'border-slate-200 bg-white/70 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mt-4 px-5 @3xl:px-0">
        <div className={`${softCard} p-4 sm:p-5`}>
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-950 outline-none transition-colors focus:border-slate-300 dark:border-slate-800 dark:bg-slate-950/70 dark:text-white"
            />
            <div className="flex gap-2">
              {[
                { key: '', label: '전체' },
                { key: '1-2', label: '입문~초급' },
                { key: '3-4', label: '중급~상급' },
                { key: '5-5', label: '고수' },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setLevelFilter(f.key)}
                  className={`shrink-0 rounded-2xl border px-4 py-2 text-sm font-semibold transition-colors ${
                    levelFilter === f.key
                      ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                      : 'border-slate-200 bg-white/70 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {!isLoading && matches.length > 0 && (
        <section className="relative mt-4 px-5 @3xl:px-0">
          <div className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/75 px-4 py-3 text-sm text-slate-600 shadow-[0_12px_40px_rgba(15,23,42,0.04)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
            <span>{matches.length}개의 모집글</span>
            <ChevronRight size={16} className="text-slate-400" />
          </div>
        </section>
      )}

      <section className="relative mt-4 px-5 @3xl:px-0">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[200px] rounded-[24px] bg-slate-100/80 dark:bg-slate-800/70 skeleton-shimmer" />
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
          <div className="grid gap-3 @3xl:grid-cols-2">
            {matches.map((match: TeamMatch) => (
              <TeamMatchCard key={match.id} match={match} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

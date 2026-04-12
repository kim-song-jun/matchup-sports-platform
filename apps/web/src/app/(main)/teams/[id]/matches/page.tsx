'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trophy, Calendar, MapPin } from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useTeam, useTeamMatches } from '@/hooks/use-api';
import { sportLabel, sportCardAccent } from '@/lib/constants';
import type { TeamMatch } from '@/types/api';

function getDayLabel(dateStr: string) {
  return ['일', '월', '화', '수', '목', '금', '토'][new Date(dateStr).getDay()];
}

const statusLabel: Record<string, { text: string; style: string }> = {
  recruiting: { text: '모집중', style: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300' },
  scheduled: { text: '확정', style: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300' },
  completed: { text: '완료', style: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200' },
  cancelled: { text: '취소', style: 'bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-300' },
};

export default function TeamMatchesPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.id as string;

  const { data: team } = useTeam(teamId);
  const { data, isLoading, error, refetch } = useTeamMatches({ teamId });

  const matches = data?.items ?? [];

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
          {team ? `${team.name} 경기` : '팀 경기'}
        </h1>
      </MobileGlassHeader>

      <div className="hidden @3xl:block px-5 @3xl:px-0 pt-4 mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/teams" className="hover:text-gray-600">팀&middot;클럽</Link>
          <span>/</span>
          <Link href={`/teams/${teamId}`} className="hover:text-gray-600">{team?.name}</Link>
          <span>/</span>
          <span className="text-gray-700">경기 기록</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">경기 기록</h2>
      </div>

      <div className="px-5 @3xl:px-0 pb-8">
        {isLoading ? (
          <div className="space-y-3 mt-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-gray-50 dark:bg-gray-800 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <ErrorState onRetry={() => refetch()} />
        ) : matches.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="아직 경기 기록이 없어요"
            description="팀 매칭에 참여하면 경기 기록이 쌓여요"
            action={{ label: '팀 매칭 찾기', href: '/team-matches' }}
          />
        ) : (
          <div className="space-y-3 mt-3 stagger-children">
            {matches.map((match: TeamMatch) => {
              const st = statusLabel[match.status] ?? statusLabel.recruiting;
              return (
                <Link key={match.id} href={`/team-matches/${match.id}`} className="block">
                  <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors active:scale-[0.99]">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${sportCardAccent[match.sportType]?.badge ?? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'}`}>
                          {sportLabel[match.sportType] || match.sportType}
                        </span>
                        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${st.style}`}>
                          {st.text}
                        </span>
                      </div>
                    </div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">{match.title}</h3>
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                        <Calendar size={12} />
                        <span>{match.matchDate} ({getDayLabel(match.matchDate)}) {match.startTime}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                        <MapPin size={12} />
                        <span className="truncate">{match.venueName}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

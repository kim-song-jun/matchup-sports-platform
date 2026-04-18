'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Calendar, Clock, Users, Trophy } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { useMyMatches } from '@/hooks/use-api';
import { sportLabel } from '@/lib/constants';
import { formatCurrency } from '@/lib/utils';

const statusLabel: Record<string, { text: string; style: string }> = {
  recruiting: { text: '모집중', style: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300' },
  open: { text: '모집중', style: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300' },
  full: { text: '마감', style: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' },
  completed: { text: '완료', style: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200' },
  cancelled: { text: '취소됨', style: 'bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-300' },
};

function getDayLabel(dateStr: string) {
  return ['일','월','화','수','목','금','토'][new Date(dateStr).getDay()];
}

export default function MyMatchesPage() {
  const router = useRouter();
  useRequireAuth();
  const {
    data: apiData,
    isLoading,
    isError,
    refetch,
  } = useMyMatches();
  const apiMatches = apiData?.items?.map((m) => ({
    id: m.id,
    title: m.title,
    sportType: m.sportType,
    matchDate: m.matchDate,
    startTime: m.startTime,
    endTime: m.endTime,
    venue: m.venue?.name || '',
    currentPlayers: m.currentPlayers,
    maxPlayers: m.maxPlayers,
    fee: m.fee,
    status: m.status,
  }));
  const matches = apiMatches ?? [];

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      {/* Header */}
      <header className="@3xl:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800">
        <button aria-label="뒤로 가기" onClick={() => router.back()} className="rounded-xl p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-[0.98] transition-[colors,transform] min-w-11 min-h-[44px] flex items-center justify-center">
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">매치 히스토리</h1>
      </header>
      <div className="hidden @3xl:block mb-2 px-5 @3xl:px-0 pt-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">매치 히스토리</h2>
        <p className="text-base text-gray-500 mt-1">참가한 매치 이력을 확인하세요</p>
      </div>

      <div className="px-5 @3xl:px-0 pb-8 space-y-3 mt-3">
        <div className="space-y-3 stagger-children">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`participated-match-skeleton-${index}`}
                className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="animate-pulse space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="h-5 w-28 rounded-full bg-gray-100 dark:bg-gray-700" />
                    <div className="h-5 w-16 rounded-full bg-gray-100 dark:bg-gray-700" />
                  </div>
                  <div className="h-6 w-3/4 rounded-xl bg-gray-100 dark:bg-gray-700" />
                  <div className="space-y-2">
                    <div className="h-4 w-2/3 rounded-lg bg-gray-100 dark:bg-gray-700" />
                    <div className="h-4 w-1/2 rounded-lg bg-gray-100 dark:bg-gray-700" />
                    <div className="h-4 w-3/5 rounded-lg bg-gray-100 dark:bg-gray-700" />
                  </div>
                </div>
              </div>
            ))
          ) : isError ? (
            <ErrorState
              message="참가한 매치를 불러오지 못했어요"
              onRetry={() => { void refetch(); }}
            />
          ) : matches.length === 0 ? (
            <EmptyState
              icon={Trophy}
              title="참가한 매치가 아직 없어요"
              description="관심 있는 매치에 참가하면 이력과 상태가 여기에 표시됩니다"
              action={{ label: '매치 찾기', href: '/matches' }}
            />
          ) : (
            matches.map((match) => {
              const st = statusLabel[match.status] || statusLabel.recruiting;
              return (
                <div
                  key={match.id}
                  className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-semibold text-gray-500">
                        {sportLabel[match.sportType]}
                      </span>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${st.style}`}>
                        {st.text}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(match.fee)}</span>
                  </div>

                  <Link href={`/matches/${match.id}`}>
                    <h3 className="text-md font-semibold text-gray-900 dark:text-white hover:text-blue-500 transition-colors truncate">{match.title}</h3>
                  </Link>

                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <Calendar size={12} />
                      <span>{match.matchDate} ({getDayLabel(match.matchDate)})</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <Clock size={12} />
                      <span>{match.startTime} ~ {match.endTime}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <MapPin size={12} />
                      <span>{match.venue}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <Users size={12} />
                      <span>{match.currentPlayers}/{match.maxPlayers}명</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

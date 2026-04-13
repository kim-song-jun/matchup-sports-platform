'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, ChevronRight, MapPin, Trophy } from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useTournament } from '@/hooks/use-api';
import { sportLabel } from '@/lib/constants';
import { formatCurrency, formatMatchDate } from '@/lib/utils';

export default function TournamentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = params.id as string;
  const { data, isLoading, isError, refetch } = useTournament(tournamentId);

  if (isLoading) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0 space-y-3">
        <div className="h-8 w-40 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        <div className="h-36 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <ErrorState message="대회 정보를 불러오지 못했어요" onRetry={() => void refetch()} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <EmptyState icon={Trophy} title="대회를 찾을 수 없어요" description="삭제되었거나 존재하지 않는 대회예요." action={{ label: '목록으로', href: '/tournaments' }} />
      </div>
    );
  }

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <MobileGlassHeader className="justify-between">
        <button aria-label="뒤로 가기" onClick={() => router.back()} className="glass-mobile-icon-button flex min-h-[44px] min-w-11 items-center justify-center rounded-xl">
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate flex-1 ml-3">대회 상세</h1>
      </MobileGlassHeader>

      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/tournaments" className="hover:text-gray-600 transition-colors">대회</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">{data.title}</span>
      </div>

      <div className="px-5 @3xl:px-0">
        <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{data.title}</h2>
          <p className="mt-1 text-sm text-gray-500">{sportLabel[data.sportType] || data.sportType}</p>
          <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <p className="flex items-center gap-2"><CalendarDays size={14} /> {formatMatchDate(data.eventDate)} {data.startTime ?? ''}</p>
            <p className="flex items-center gap-2"><MapPin size={14} /> {data.venueName || [data.city, data.district].filter(Boolean).join(' ') || '장소 미정'}</p>
          </div>
          {typeof data.entryFee === 'number' && (
            <p className="mt-4 text-sm text-blue-600 dark:text-blue-300">참가비: {formatCurrency(data.entryFee)}</p>
          )}
          {data.description && (
            <p className="mt-4 whitespace-pre-line text-base text-gray-700 dark:text-gray-200">{data.description}</p>
          )}
          {(data.team || data.venue) && (
            <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
              {data.team && <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-1">팀: {data.team.name}</span>}
              {data.venue && <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-1">장소: {data.venue.name}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

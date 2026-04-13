'use client';

import Link from 'next/link';
import { CalendarDays, Plus, Trophy } from 'lucide-react';
import { MobilePageTopZone } from '@/components/layout/mobile-page-top-zone';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useTournaments } from '@/hooks/use-api';
import { sportLabel } from '@/lib/constants';
import { formatCurrency, formatMatchDate } from '@/lib/utils';
import type { Tournament } from '@/types/api';

function statusLabel(status?: string) {
  switch (status) {
    case 'recruiting':
      return '접수중';
    case 'full':
      return '접수마감';
    case 'ongoing':
      return '진행중';
    case 'completed':
      return '종료';
    case 'cancelled':
      return '취소';
    default:
      return '준비중';
  }
}

export default function TournamentsPage() {
  const { data, isLoading, isError, refetch } = useTournaments();
  const tournaments = data?.items ?? [];

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <MobilePageTopZone
        surface="plain"
        eyebrow="이벤트"
        title="대회"
        subtitle="팀과 장소 맥락을 함께 보며 대회를 탐색하세요."
        action={(
          <Link
            href="/tournaments/new"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-blue-500 px-3.5 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-600"
          >
            <Plus size={14} strokeWidth={2.5} />
            대회 등록
          </Link>
        )}
      />

      <div className="px-5 @3xl:px-0">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-24 rounded-xl bg-gray-50 dark:bg-gray-800 animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState message="대회 목록을 불러오지 못했어요" onRetry={() => void refetch()} />
        ) : tournaments.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="등록된 대회가 없어요"
            description="새 대회가 열리면 이 목록에 표시됩니다."
          />
        ) : (
          <div className="space-y-3">
            {tournaments.map((event) => (
              <TournamentCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TournamentCard({ event }: { event: Tournament }) {
  return (
    <Link href={`/tournaments/${event.id}`} className="block">
      <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{event.title}</h3>
          <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-2xs text-gray-600 dark:text-gray-300">
            {statusLabel(event.status)}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-sm text-gray-500">
          <CalendarDays size={13} />
          <span>{formatMatchDate(event.eventDate)}</span>
          {event.startTime && <span>{event.startTime}</span>}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {(sportLabel[event.sportType] || event.sportType)}
          {(event.city || event.district) ? ` · ${[event.city, event.district].filter(Boolean).join(' ')}` : ''}
          {event.venueName ? ` · ${event.venueName}` : ''}
        </p>
        <div className="mt-2 flex items-center gap-1.5 text-2xs text-gray-500">
          {event.team && <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5">팀: {event.team.name}</span>}
          {event.venue && <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5">장소: {event.venue.name}</span>}
          {typeof event.entryFee === 'number' && (
            <span className="rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-blue-600 dark:text-blue-300">
              참가비 {formatCurrency(event.entryFee)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

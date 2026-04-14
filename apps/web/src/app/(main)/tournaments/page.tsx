'use client';

import Link from 'next/link';
import { CalendarDays, Plus, Trophy } from 'lucide-react';
import { MobilePageTopZone } from '@/components/layout/mobile-page-top-zone';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useTournaments } from '@/hooks/use-api';
import { Card } from '@/components/ui/card';
import { sportLabel, sportCardAccent } from '@/lib/constants';
import { formatCurrency, formatMatchDate, cn } from '@/lib/utils';
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

const statusStyle: Record<string, string> = {
  recruiting: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300',
  full: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300',
  ongoing: 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300',
  completed: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  cancelled: 'bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-300',
};

function TournamentCard({ event }: { event: Tournament }) {

  return (
    <Link href={`/tournaments/${event.id}`} className="block">
      <Card
        variant="default"
        padding="sm"
        interactive
        className="active:scale-[0.98] transition-[border-color,transform] duration-150"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-1.5 flex-wrap">
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', sportCardAccent[event.sportType]?.badge ?? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300')}>
                {sportLabel[event.sportType] || event.sportType}
              </span>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusStyle[event.status ?? ''] ?? statusStyle.recruiting)}>
                {statusLabel(event.status)}
              </span>
            </div>
            <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100 truncate">{event.title}</h3>
          </div>
        </div>
        <p className="mt-2.5 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          <CalendarDays size={11} className="shrink-0 opacity-40" aria-hidden="true" />
          <span>{formatMatchDate(event.eventDate)}{event.startTime ? ` ${event.startTime}` : ''}</span>
          {(event.city || event.district) && (
            <>
              <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">·</span>
              <span className="truncate">{[event.city, event.district].filter(Boolean).join(' ')}</span>
            </>
          )}
          {event.venueName && (
            <>
              <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">·</span>
              <span className="truncate">{event.venueName}</span>
            </>
          )}
        </p>
        {(event.team || event.venue || typeof event.entryFee === 'number') && (
          <div className="mt-3 pt-2.5 border-t border-gray-50 dark:border-gray-700 flex items-center gap-1.5 flex-wrap text-xs text-gray-500 dark:text-gray-400">
            {event.team && <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5">팀: {event.team.name}</span>}
            {event.venue && <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5">장소: {event.venue.name}</span>}
            {typeof event.entryFee === 'number' && (
              <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 font-medium text-gray-700 dark:text-gray-200">
                참가비 {formatCurrency(event.entryFee)}
              </span>
            )}
          </div>
        )}
      </Card>
    </Link>
  );
}

'use client';

import { useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, ChevronRight, Clock3, GraduationCap, Ticket } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { TrustSignalBanner } from '@/components/ui/trust-signal-banner';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { useMyLessonTickets } from '@/hooks/use-api';
import { sportLabel, ticketTypeLabel } from '@/lib/constants';
import { formatAmount, formatDateCompact, formatDateShort } from '@/lib/utils';

const ticketStatusMeta: Record<string, { label: string; className: string }> = {
  active: {
    label: '사용 가능',
    className: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300',
  },
  expired: {
    label: '만료',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  },
  exhausted: {
    label: '소진',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
  refunded: {
    label: '환불',
    className: 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-300',
  },
  cancelled: {
    label: '취소',
    className: 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-300',
  },
};

function getUsageSummary(totalSessions: number | undefined, usedSessions: number) {
  if (!totalSessions) {
    return usedSessions > 0 ? `사용 ${usedSessions}회` : '사용 횟수 제한 없음';
  }

  return `잔여 ${Math.max(totalSessions - usedSessions, 0)}회 / 전체 ${totalSessions}회`;
}

function getExpiryCopy(expiresAt?: string) {
  if (!expiresAt) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(expiresAt);
  expiry.setHours(0, 0, 0, 0);

  const days = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (days < 0) {
    return '이미 만료됨';
  }

  if (days === 0) {
    return '오늘 만료';
  }

  return `D-${days}`;
}

export default function MyLessonTicketsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useRequireAuth();

  const {
    data: tickets,
    isLoading,
    isError,
    refetch,
  } = useMyLessonTickets();
  const highlightedTicketId = searchParams.get('ticketId');
  const orderedTickets = useMemo(() => {
    if (!tickets) {
      return [];
    }

    if (!highlightedTicketId) {
      return tickets;
    }

    return [...tickets].sort((a, b) => {
      if (a.id === highlightedTicketId) {
        return -1;
      }

      if (b.id === highlightedTicketId) {
        return 1;
      }

      return 0;
    });
  }, [highlightedTicketId, tickets]);
  const hasHighlightedTicket = Boolean(
    highlightedTicketId && orderedTickets.some((ticket) => ticket.id === highlightedTicketId),
  );
  const showPendingHighlightNotice =
    Boolean(highlightedTicketId) && !isLoading && !isError && !hasHighlightedTicket;

  useEffect(() => {
    if (!highlightedTicketId || !orderedTickets.some((ticket) => ticket.id === highlightedTicketId)) {
      return;
    }

    const node = document.getElementById(`lesson-ticket-${highlightedTicketId}`);
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedTicketId, orderedTickets]);

  return (
    <div className="animate-fade-in pt-[var(--safe-area-top)] @3xl:pt-0">
      <header className="@3xl:hidden flex items-center gap-3 border-b border-gray-50 px-5 py-3 dark:border-gray-800">
        <button
          aria-label="뒤로 가기"
          onClick={() => router.back()}
          className="flex min-h-[44px] min-w-11 items-center justify-center rounded-xl p-2 -ml-2 transition-[colors,transform] hover:bg-gray-100 active:scale-[0.98] dark:hover:bg-gray-700"
        >
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">내 수강권</h1>
      </header>

      <div className="hidden @3xl:block mb-4 px-5 @3xl:px-0 pt-4">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">내 수강권</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          결제 완료된 수강권만 실제 데이터 기준으로 보여드려요
        </p>
      </div>

      <div className="space-y-3 px-5 pb-10 pt-4 @3xl:px-0">
        {isLoading ? (
          Array.from({ length: 2 }).map((_, index) => (
            <div
              key={`lesson-ticket-skeleton-${index}`}
              className="overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="animate-pulse space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-5 w-28 rounded-full bg-gray-100 dark:bg-gray-700" />
                  <div className="h-5 w-20 rounded-full bg-gray-100 dark:bg-gray-700" />
                </div>
                <div className="h-7 w-4/5 rounded-xl bg-gray-100 dark:bg-gray-700" />
                <div className="space-y-2">
                  <div className="h-4 w-2/3 rounded-lg bg-gray-100 dark:bg-gray-700" />
                  <div className="h-4 w-1/2 rounded-lg bg-gray-100 dark:bg-gray-700" />
                  <div className="h-10 w-full rounded-xl bg-gray-100 dark:bg-gray-700" />
                </div>
              </div>
            </div>
          ))
        ) : isError ? (
          <ErrorState
            message="내 수강권을 불러오지 못했어요"
            onRetry={() => {
              void refetch();
            }}
          />
        ) : !tickets || tickets.length === 0 ? (
          <div className="space-y-4">
            {showPendingHighlightNotice ? (
              <TrustSignalBanner
                tone="info"
                label="반영 확인"
                title="방금 등록한 수강권을 아직 찾지 못했어요"
                description="결제가 끝났더라도 목록 반영이 조금 늦을 수 있어요. 잠시 후 다시 확인하거나 새로고침해 주세요."
              />
            ) : (
              <TrustSignalBanner
                tone="warning"
                label="실데이터"
                title="결제 완료된 수강권만 이 화면에 표시돼요"
                description="구매를 시작했지만 결제를 끝내지 않은 티켓이나 샘플 데이터는 여기서 보여주지 않습니다."
              />
            )}
            <div className="rounded-2xl border border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-800">
              <EmptyState
                icon={Ticket}
                title="보유한 수강권이 아직 없어요"
                description="레슨 상세에서 수강권을 결제하면 이 화면에 실제 보유 티켓이 나타납니다"
                action={{ label: '레슨 둘러보기', href: '/lessons' }}
              />
            </div>
          </div>
        ) : (
          <>
            {showPendingHighlightNotice ? (
              <TrustSignalBanner
                tone="info"
                label="반영 확인"
                title="방금 등록한 수강권을 아직 찾지 못했어요"
                description="다른 보유 티켓은 정상적으로 보이고 있어요. 신규 티켓 반영이 조금 늦을 수 있으니 잠시 후 다시 확인해 주세요."
              />
            ) : (
              <TrustSignalBanner
                tone="success"
                label="실데이터"
                title="결제 완료된 수강권만 보고 있어요"
                description="현재 목록은 `/lessons/tickets/me` 기준이며, payment 완료 티켓만 표시됩니다."
              />
            )}

            <div className="space-y-3">
              {orderedTickets.map((ticket) => {
                const status = ticketStatusMeta[ticket.status] ?? ticketStatusMeta.active;
                const lesson = ticket.lesson;
                const plan = ticket.plan;
                const expiryCopy = getExpiryCopy(ticket.expiresAt);
                const isHighlighted = highlightedTicketId === ticket.id;

                return (
                  <div
                    key={ticket.id}
                    id={`lesson-ticket-${ticket.id}`}
                    className={[
                      'rounded-2xl border bg-white p-5 dark:bg-gray-800',
                      isHighlighted
                        ? 'border-blue-200 ring-2 ring-blue-100 dark:border-blue-500/50 dark:ring-blue-900/50'
                        : 'border-gray-100 dark:border-gray-700',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {isHighlighted ? (
                          <span className="rounded-full bg-blue-500 px-2.5 py-1 text-xs font-semibold text-white">
                            방금 등록됨
                          </span>
                        ) : null}
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                          {ticketTypeLabel[plan?.type ?? 'single'] ?? '수강권'}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>
                          {status.label}
                        </span>
                        {lesson?.sportType ? (
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                            {sportLabel[lesson.sportType] ?? lesson.sportType}
                          </span>
                        ) : null}
                      </div>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">
                        {formatAmount(ticket.paidAmount)}
                      </span>
                    </div>

                    <div className="mt-3">
                      <Link
                        href={lesson ? `/lessons/${lesson.id}` : '/lessons'}
                        className="inline-flex items-center gap-1 text-lg font-bold text-gray-900 transition-colors hover:text-blue-500 dark:text-white"
                      >
                        {lesson?.title ?? '연결된 강좌 정보 없음'}
                        <ChevronRight size={16} />
                      </Link>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {plan?.name ?? '수강권 플랜 정보 없음'}
                      </p>
                    </div>

                    <div className="mt-4 grid gap-3 rounded-2xl bg-gray-50 p-4 dark:bg-gray-900/40">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                          <Calendar size={14} />
                          구매일
                        </span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {formatDateCompact(ticket.purchasedAt)}
                        </span>
                      </div>

                      {lesson?.lessonDate ? (
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                            <GraduationCap size={14} />
                            수업 일시
                          </span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {formatDateShort(lesson.lessonDate)} {lesson.startTime} - {lesson.endTime}
                          </span>
                        </div>
                      ) : null}

                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                          <Clock3 size={14} />
                          사용 현황
                        </span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {getUsageSummary(ticket.totalSessions, ticket.usedSessions)}
                        </span>
                      </div>

                      {expiryCopy ? (
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                            <Ticket size={14} />
                            만료 정보
                          </span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {expiryCopy}
                            {ticket.expiresAt ? ` · ${formatDateCompact(ticket.expiresAt)}` : ''}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <div className="h-24" />
      </div>
    </div>
  );
}

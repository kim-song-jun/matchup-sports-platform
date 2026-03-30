'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Ticket, Calendar, CalendarDays, ChevronRight } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthStore } from '@/stores/auth-store';
import { ticketTypeLabel } from '@/lib/constants';
import { formatAmount, formatDateCompact, formatDateShort } from '@/lib/utils';
import type { LessonTicket, TicketStatus, TicketType } from '@/types/api';

// ── Mock data ──────────────────────────────────────────────────────────────────

type MockTicket = Omit<LessonTicket, 'plan' | 'lesson' | 'attendances'> & {
  planName: string;
  planType: TicketType;
  lessonTitle: string;
  lessonId: string;
  sportType: string;
};

const MOCK_TICKETS: MockTicket[] = [
  {
    id: 'tkt-1',
    planId: 'plan-1',
    userId: 'user-1',
    lessonId: 'lesson-1',
    lessonTitle: '성인 수영 중급반 — 마포 아쿠아파크',
    sportType: 'swimming',
    planName: '10회 정기수강권',
    planType: 'multi',
    status: 'active',
    totalSessions: 10,
    usedSessions: 3,
    paidAmount: 180000,
    purchasedAt: '2026-02-15',
    startDate: '2026-02-17',
    expiresAt: '2026-05-17',
  },
  {
    id: 'tkt-2',
    planId: 'plan-2',
    userId: 'user-1',
    lessonId: 'lesson-2',
    lessonTitle: '배드민턴 기초 클래스 — 강남 배드민턴장',
    sportType: 'badminton',
    planName: '1일 체험권',
    planType: 'single',
    status: 'active',
    totalSessions: 1,
    usedSessions: 0,
    paidAmount: 25000,
    purchasedAt: '2026-03-20',
    expiresAt: '2026-04-20',
  },
  {
    id: 'tkt-3',
    planId: 'plan-3',
    userId: 'user-1',
    lessonId: 'lesson-3',
    lessonTitle: '풋살 테크닉 클리닉 — 잠실 풋살파크',
    sportType: 'futsal',
    planName: '30일 무제한 수강권',
    planType: 'unlimited',
    status: 'active',
    usedSessions: 0,
    paidAmount: 120000,
    purchasedAt: '2026-03-16',
    startDate: '2026-03-16',
    expiresAt: '2026-04-15',
  },
  {
    id: 'tkt-4',
    planId: 'plan-4',
    userId: 'user-1',
    lessonId: 'lesson-4',
    lessonTitle: '농구 슛 전문 레슨 — 마포 체육관',
    sportType: 'basketball',
    planName: '5회 정기수강권',
    planType: 'multi',
    status: 'exhausted',
    totalSessions: 5,
    usedSessions: 5,
    paidAmount: 75000,
    purchasedAt: '2026-01-10',
    startDate: '2026-01-12',
    expiresAt: '2026-02-12',
  },
  {
    id: 'tkt-5',
    planId: 'plan-5',
    userId: 'user-1',
    lessonId: 'lesson-5',
    lessonTitle: '테니스 입문 레슨 — 올림픽테니스장',
    sportType: 'tennis',
    planName: '30일 무제한 수강권',
    planType: 'unlimited',
    status: 'expired',
    usedSessions: 0,
    paidAmount: 150000,
    purchasedAt: '2025-12-01',
    startDate: '2025-12-01',
    expiresAt: '2025-12-31',
  },
];

// ── Tab types ──────────────────────────────────────────────────────────────────

type TabKey = 'all' | 'active' | 'inactive';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'active', label: '사용 가능' },
  { key: 'inactive', label: '만료 · 소진' },
];

function isActive(status: TicketStatus): boolean {
  return status === 'active';
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getDaysRemaining(expiresAt?: string): number | null {
  if (!expiresAt) return null;
  const now = new Date();
  const exp = new Date(expiresAt);
  return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Ticket type badge with color coding */
function TicketTypeBadge({ type }: { type: TicketType }) {
  const styles: Record<TicketType, string> = {
    single:
      'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    multi:
      'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    unlimited:
      'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  };
  return (
    <span
      className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${styles[type]}`}
    >
      {ticketTypeLabel[type]}
    </span>
  );
}

/** Usage indicator — the primary visual element of each card */
function UsageIndicator({ ticket }: { ticket: MockTicket }) {
  const inactive = !isActive(ticket.status);

  if (ticket.planType === 'single') {
    const used = ticket.usedSessions > 0;
    return (
      <div
        className={`flex items-center justify-between rounded-xl px-4 py-3 ${
          inactive || used
            ? 'bg-gray-50 dark:bg-gray-700/50'
            : 'bg-blue-50 dark:bg-blue-900/20'
        }`}
      >
        <span
          className={`text-sm font-semibold ${
            inactive || used
              ? 'text-gray-400 dark:text-gray-500'
              : 'text-blue-600 dark:text-blue-400'
          }`}
        >
          {used ? '사용 완료' : '사용 전'}
        </span>
        {!used && !inactive && (
          <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
        )}
      </div>
    );
  }

  if (ticket.planType === 'multi') {
    const total = ticket.totalSessions ?? 1;
    const used = ticket.usedSessions;
    const remaining = total - used;
    const pct = used / total; // 0 → 1

    return (
      <div
        className={`rounded-xl px-4 py-3 ${
          inactive ? 'bg-gray-50 dark:bg-gray-700/50' : 'bg-blue-50 dark:bg-blue-900/20'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span
            className={`text-sm font-semibold ${
              inactive ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'
            }`}
          >
            {inactive ? (
              used >= total ? '모두 사용했어요' : '기간이 만료됐어요'
            ) : (
              <>
                <span className="text-blue-600 dark:text-blue-400 text-base">{remaining}</span>
                <span className="text-gray-500 dark:text-gray-400">/{total}회 남음</span>
              </>
            )}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {used}/{total}회 사용
          </span>
        </div>
        {/* Progress bar using transform:scaleX per design guidelines */}
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-600">
          <div
            className={`absolute inset-y-0 left-0 w-full origin-left rounded-full transition-transform ${
              inactive ? 'bg-gray-400 dark:bg-gray-500' : 'bg-blue-500'
            }`}
            style={{ transform: `scaleX(${pct})` }}
            aria-hidden="true"
          />
        </div>
      </div>
    );
  }

  // unlimited
  const days = getDaysRemaining(ticket.expiresAt);
  const isExpired = inactive || (days !== null && days <= 0);

  return (
    <div
      className={`flex items-center justify-between rounded-xl px-4 py-3 ${
        isExpired
          ? 'bg-gray-50 dark:bg-gray-700/50'
          : days !== null && days <= 7
          ? 'bg-amber-50 dark:bg-amber-900/20'
          : 'bg-blue-50 dark:bg-blue-900/20'
      }`}
    >
      <span
        className={`text-sm font-semibold ${
          isExpired
            ? 'text-gray-400 dark:text-gray-500'
            : days !== null && days <= 7
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-blue-600 dark:text-blue-400'
        }`}
      >
        {isExpired
          ? '만료됨'
          : days !== null
          ? `D-${days} 남음`
          : '기간 무제한'}
      </span>
      {!isExpired && ticket.expiresAt && (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {formatDateShort(ticket.expiresAt)} 만료
        </span>
      )}
    </div>
  );
}

/** Status chip shown on inactive tickets */
function StatusChip({ status }: { status: TicketStatus }) {
  const cfg: Partial<Record<TicketStatus, { label: string; style: string }>> = {
    expired:   { label: '만료', style: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
    exhausted: { label: '소진', style: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
    refunded:  { label: '환불', style: 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400' },
    cancelled: { label: '취소', style: 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400' },
  };
  const c = cfg[status];
  if (!c) return null;
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${c.style}`}>
      {c.label}
    </span>
  );
}

/** Single ticket card */
function TicketCard({ ticket }: { ticket: MockTicket }) {
  const inactive = !isActive(ticket.status);

  return (
    <div
      className={`rounded-2xl border p-4 transition-[colors,transform] active:scale-[0.995] ${
        inactive
          ? 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 opacity-70'
          : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600'
      }`}
    >
      {/* Top row: type badge + status chip */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <TicketTypeBadge type={ticket.planType} />
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {ticket.planName}
          </span>
        </div>
        {inactive && <StatusChip status={ticket.status} />}
      </div>

      {/* Lesson title */}
      <h3
        className={`text-base font-semibold leading-snug mb-3 ${
          inactive ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'
        }`}
      >
        {ticket.lessonTitle}
      </h3>

      {/* Usage indicator */}
      <UsageIndicator ticket={ticket} />

      {/* Meta row */}
      <div className="mt-3 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <Calendar size={12} aria-hidden="true" />
          구매일 {formatDateCompact(ticket.purchasedAt)}
        </span>
        <span className="ml-auto font-semibold text-gray-700 dark:text-gray-300">
          {formatAmount(ticket.paidAmount)}
        </span>
      </div>

      {/* CTA */}
      {!inactive && (
        <Link
          href={`/lessons/${ticket.lessonId}`}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-blue-500 text-sm font-semibold text-white hover:bg-blue-600 active:scale-[0.98] transition-[colors,transform]"
        >
          <CalendarDays size={15} aria-hidden="true" />
          일정 보기
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      )}
      {inactive && (
        <Link
          href={`/lessons/${ticket.lessonId}`}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          레슨 보기
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function MyLessonTicketsPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  // Auth guard
  if (!isAuthenticated) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <EmptyState
          icon={Ticket}
          title="로그인이 필요해요"
          description="수강권을 확인하려면 먼저 로그인해주세요"
          action={{ label: '로그인하기', href: '/login' }}
          size="md"
        />
      </div>
    );
  }

  // Filter tickets by tab
  const filtered = MOCK_TICKETS.filter((t) => {
    if (activeTab === 'active') return isActive(t.status);
    if (activeTab === 'inactive') return !isActive(t.status);
    return true;
  });

  // Count badges
  const activeCount = MOCK_TICKETS.filter((t) => isActive(t.status)).length;

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      {/* Mobile header */}
      <header className="@3xl:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800">
        <button
          aria-label="뒤로 가기"
          onClick={() => router.back()}
          className="rounded-xl p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-[0.98] transition-[colors,transform] min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">내 수강권</h1>
        {activeCount > 0 && (
          <span className="ml-auto flex h-6 min-w-[24px] items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-bold text-white">
            {activeCount}
          </span>
        )}
      </header>

      {/* Desktop header */}
      <div className="hidden @3xl:block mb-2 px-5 @3xl:px-0 pt-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">내 수강권</h2>
        <p className="text-base text-gray-500 mt-1">구매한 수강권과 이용 현황을 확인하세요</p>
      </div>

      {/* Tabs */}
      <div className="px-5 @3xl:px-0 pt-3 pb-1">
        <div className="flex gap-1 rounded-xl bg-gray-100 dark:bg-gray-700 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 rounded-lg py-2.5 text-base font-semibold transition-colors min-h-[44px] ${
                activeTab === tab.key
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Card list */}
      <div className="px-5 @3xl:px-0 pb-10 mt-3 space-y-3 stagger-children">
        {filtered.length === 0 ? (
          activeTab === 'active' ? (
            <EmptyState
              icon={Ticket}
              title="사용 가능한 수강권이 없어요"
              description="레슨 페이지에서 수강권을 구매해보세요"
              action={{ label: '레슨 둘러보기', href: '/lessons' }}
              size="md"
            />
          ) : (
            <EmptyState
              icon={Ticket}
              title="아직 수강권이 없어요"
              description="레슨 페이지에서 마음에 드는 레슨을 찾아보세요"
              action={{ label: '레슨 둘러보기', href: '/lessons' }}
              size="md"
            />
          )
        ) : (
          filtered.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))
        )}
      </div>
    </div>
  );
}

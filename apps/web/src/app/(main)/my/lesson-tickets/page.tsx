'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Ticket,
  Calendar,
  CalendarDays,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  RefreshCw,
  ArrowUpDown,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthStore } from '@/stores/auth-store';
import { ticketTypeLabel } from '@/lib/constants';
import {
  formatAmount,
  formatDateCompact,
  formatDateShort,
  formatFullDate,
} from '@/lib/utils';
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
    expiresAt: '2026-04-06',
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
    expiresAt: '2026-04-04',
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

// ── Tab & sort types ───────────────────────────────────────────────────────────

type TabKey = 'all' | 'active' | 'inactive';
type SortKey = 'recent' | 'expiring';

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
  now.setHours(0, 0, 0, 0);
  const exp = new Date(expiresAt);
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getSortedTickets(tickets: MockTicket[], sort: SortKey): MockTicket[] {
  if (sort === 'recent') {
    return [...tickets].sort(
      (a, b) =>
        new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime()
    );
  }
  // expiring: nulls last, expired last
  return [...tickets].sort((a, b) => {
    const da = a.expiresAt ? getDaysRemaining(a.expiresAt) ?? Infinity : Infinity;
    const db = b.expiresAt ? getDaysRemaining(b.expiresAt) ?? Infinity : Infinity;
    return da - db;
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Ticket type badge with color coding */
function TicketTypeBadge({ type }: { type: TicketType }) {
  const styles: Record<TicketType, string> = {
    single: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    multi: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    unlimited: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  };
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${styles[type]}`}>
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
    const pct = used / total;

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
  const isExpiredState = inactive || (days !== null && days <= 0);
  const isExpiringSoon = !isExpiredState && days !== null && days <= 7;

  return (
    <div
      className={`rounded-xl px-4 py-3 ${
        isExpiredState
          ? 'bg-gray-50 dark:bg-gray-700/50'
          : isExpiringSoon
          ? 'bg-amber-50 dark:bg-amber-900/20'
          : 'bg-blue-50 dark:bg-blue-900/20'
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-sm font-semibold ${
            isExpiredState
              ? 'text-gray-400 dark:text-gray-500'
              : isExpiringSoon
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-blue-600 dark:text-blue-400'
          }`}
        >
          {ticket.status === 'expired'
            ? '만료됨 · 갱신 가능'
            : isExpiredState
            ? '만료됨'
            : days !== null
            ? `D-${days} 남음`
            : '기간 무제한'}
        </span>
        {!isExpiredState && ticket.expiresAt && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatDateShort(ticket.expiresAt)} 만료
          </span>
        )}
      </div>

      {/* Renewal or expiring-soon CTA inside indicator */}
      {(isExpiringSoon || ticket.status === 'expired') && (
        <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-800/60">
          <Link
            href={`/lessons/${ticket.lessonId}`}
            className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <RefreshCw size={12} aria-hidden="true" />
            {ticket.status === 'expired' ? '동일 레슨 다시 등록하기' : '갱신하기'}
          </Link>
        </div>
      )}
    </div>
  );
}

/** Status chip shown on inactive tickets */
function StatusChip({ status }: { status: TicketStatus }) {
  const cfg: Partial<Record<TicketStatus, { label: string; style: string }>> = {
    expired: { label: '만료', style: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
    exhausted: { label: '소진', style: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
    refunded: { label: '환불', style: 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400' },
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

/** Expanded detail row */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{label}</span>
      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 text-right break-all">
        {value}
      </span>
    </div>
  );
}

/** Single ticket card */
function TicketCard({
  ticket,
  isExpanded,
  onToggle,
  cardRef,
}: {
  ticket: MockTicket;
  isExpanded: boolean;
  onToggle: () => void;
  cardRef?: React.Ref<HTMLDivElement>;
}) {
  const inactive = !isActive(ticket.status);

  return (
    <div
      ref={cardRef}
      className={`rounded-2xl border transition-[colors,transform] ${
        inactive
          ? 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 opacity-70'
          : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600'
      }`}
    >
      {/* Clickable card body */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="w-full text-left p-4 min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-2xl"
      >
        {/* Top row: type badge + status chip + expand toggle */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <TicketTypeBadge type={ticket.planType} />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {ticket.planName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {inactive && <StatusChip status={ticket.status} />}
            <span className="text-gray-400 dark:text-gray-500">
              {isExpanded ? (
                <ChevronUp size={16} aria-hidden="true" />
              ) : (
                <ChevronDown size={16} aria-hidden="true" />
              )}
            </span>
          </div>
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
      </button>

      {/* Expanded detail section */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700">
          <div className="pt-3 divide-y divide-gray-100 dark:divide-gray-700">
            <DetailRow label="구매일" value={formatFullDate(ticket.purchasedAt)} />
            {ticket.startDate && (
              <DetailRow label="시작일" value={formatFullDate(ticket.startDate)} />
            )}
            {ticket.expiresAt && (
              <DetailRow label="만료일" value={formatFullDate(ticket.expiresAt)} />
            )}
            <DetailRow label="결제금액" value={formatAmount(ticket.paidAmount)} />
            {ticket.planType === 'multi' && ticket.totalSessions != null && (
              <DetailRow
                label="이용 내역"
                value={`${ticket.usedSessions}회 사용 / ${ticket.totalSessions}회 중`}
              />
            )}
            <DetailRow label="수강권 ID" value={`...${ticket.id.slice(-8)}`} />
          </div>
        </div>
      )}

      {/* CTA buttons */}
      <div className="px-4 pb-4">
        {!inactive ? (
          <Link
            href={`/lessons/${ticket.lessonId}`}
            className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-blue-500 text-sm font-semibold text-white hover:bg-blue-600 active:scale-[0.98] transition-[colors,transform]"
          >
            <CalendarDays size={15} aria-hidden="true" />
            일정 보기
            <ChevronRight size={14} aria-hidden="true" />
          </Link>
        ) : (
          <Link
            href={`/lessons/${ticket.lessonId}`}
            className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            레슨 보기
            <ChevronRight size={14} aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Expiration warning banner ──────────────────────────────────────────────────

function ExpirationBanner({
  count,
  onScrollToFirst,
}: {
  count: number;
  onScrollToFirst: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="mx-5 @3xl:mx-0 mb-3 flex items-center gap-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 px-4 py-3">
      <AlertTriangle
        size={16}
        className="text-amber-500 dark:text-amber-400 shrink-0"
        aria-hidden="true"
      />
      <p className="text-sm font-medium text-amber-700 dark:text-amber-300 flex-1">
        <span className="font-bold">{count}개</span>의 수강권이 곧 만료됩니다
      </p>
      <button
        type="button"
        onClick={onScrollToFirst}
        className="shrink-0 rounded-lg px-3 py-1.5 min-h-[36px] text-xs font-semibold bg-amber-100 dark:bg-amber-800/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-700/40 transition-colors"
      >
        확인하기
      </button>
    </div>
  );
}

// ── Sort toggle ────────────────────────────────────────────────────────────────

function SortToggle({
  sort,
  onToggle,
}: {
  sort: SortKey;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-1.5 rounded-lg px-3 py-2 min-h-[36px] text-xs font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
    >
      <ArrowUpDown size={13} aria-hidden="true" />
      {sort === 'recent' ? '최근 구매순' : '만료 임박순'}
    </button>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function MyLessonTicketsPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [sort, setSort] = useState<SortKey>('recent');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Refs for expiring cards (for scroll-to)
  const expiringCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const scrollToFirstExpiring = useCallback(() => {
    // Find the first active ticket expiring within 7 days
    const first = MOCK_TICKETS.find((t) => {
      if (!isActive(t.status)) return false;
      const days = getDaysRemaining(t.expiresAt);
      return days !== null && days <= 7;
    });
    if (!first) return;

    // Switch to appropriate tab so the card is visible
    setActiveTab((prev) => {
      if (prev === 'inactive') return 'all';
      return prev;
    });

    // Scroll after state update
    setTimeout(() => {
      const el = expiringCardRefs.current.get(first.id);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  }, []);

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

  // Tickets expiring within 7 days (active only)
  const expiringSoonTickets = MOCK_TICKETS.filter((t) => {
    if (!isActive(t.status)) return false;
    const days = getDaysRemaining(t.expiresAt);
    return days !== null && days <= 7;
  });

  // Filter by tab
  const tabFiltered = MOCK_TICKETS.filter((t) => {
    if (activeTab === 'active') return isActive(t.status);
    if (activeTab === 'inactive') return !isActive(t.status);
    return true;
  });

  // Apply sort
  const filtered = getSortedTickets(tabFiltered, sort);

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

      {/* Expiration warning banner — shown only when there are expiring tickets */}
      {expiringSoonTickets.length > 0 && activeTab !== 'inactive' && (
        <ExpirationBanner
          count={expiringSoonTickets.length}
          onScrollToFirst={scrollToFirstExpiring}
        />
      )}

      {/* Tabs + sort toggle */}
      <div className="px-5 @3xl:px-0 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-1 rounded-xl bg-gray-100 dark:bg-gray-700 p-1">
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

        {/* Sort toggle below tabs */}
        <div className="flex justify-end mt-2">
          <SortToggle sort={sort} onToggle={() => setSort((s) => (s === 'recent' ? 'expiring' : 'recent'))} />
        </div>
      </div>

      {/* Card list */}
      <div className="px-5 @3xl:px-0 pb-10 mt-1 space-y-3 stagger-children">
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
          filtered.map((ticket) => {
            const isExpiringSoon =
              isActive(ticket.status) &&
              (() => {
                const d = getDaysRemaining(ticket.expiresAt);
                return d !== null && d <= 7;
              })();

            return (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                isExpanded={expandedIds.has(ticket.id)}
                onToggle={() => toggleExpand(ticket.id)}
                cardRef={
                  isExpiringSoon
                    ? (el: HTMLDivElement | null) => {
                        if (el) {
                          expiringCardRefs.current.set(ticket.id, el);
                        } else {
                          expiringCardRefs.current.delete(ticket.id);
                        }
                      }
                    : undefined
                }
              />
            );
          })
        )}
      </div>
    </div>
  );
}

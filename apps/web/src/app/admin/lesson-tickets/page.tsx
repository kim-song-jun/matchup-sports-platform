'use client';

import { useState, useMemo } from 'react';
import { Ticket, Users, TrendingUp, XCircle, CreditCard, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatAmount, formatDateCompact } from '@/lib/utils';
import { ticketTypeLabel } from '@/lib/constants';
import type { TicketStatus, TicketType } from '@/types/api';

// ── Mock data ────────────────────────────────────────────────────────────────

interface MockTicket {
  id: string;
  buyerName: string;
  lessonTitle: string;
  sportType: string;
  ticketType: TicketType;
  status: TicketStatus;
  usedSessions: number;
  totalSessions: number | null; // null = unlimited
  paidAmount: number;
  purchasedAt: string;
  expiresAt: string | null;
}

const MOCK_TICKETS: MockTicket[] = [
  {
    id: 'tk-001', buyerName: '김민준', lessonTitle: '풋살 기초 체력 레슨',
    sportType: '풋살', ticketType: 'multi', status: 'active',
    usedSessions: 4, totalSessions: 10, paidAmount: 120000,
    purchasedAt: '2026-03-01', expiresAt: '2026-05-01',
  },
  {
    id: 'tk-002', buyerName: '이서연', lessonTitle: '배드민턴 클리닉 (초급반)',
    sportType: '배드민턴', ticketType: 'single', status: 'exhausted',
    usedSessions: 1, totalSessions: 1, paidAmount: 25000,
    purchasedAt: '2026-03-05', expiresAt: '2026-03-05',
  },
  {
    id: 'tk-003', buyerName: '박지호', lessonTitle: '농구 실전 클리닉',
    sportType: '농구', ticketType: 'unlimited', status: 'active',
    usedSessions: 7, totalSessions: null, paidAmount: 80000,
    purchasedAt: '2026-03-10', expiresAt: '2026-04-10',
  },
  {
    id: 'tk-004', buyerName: '최수아', lessonTitle: '풋살 기초 체력 레슨',
    sportType: '풋살', ticketType: 'multi', status: 'expired',
    usedSessions: 6, totalSessions: 10, paidAmount: 120000,
    purchasedAt: '2026-01-15', expiresAt: '2026-03-15',
  },
  {
    id: 'tk-005', buyerName: '정하은', lessonTitle: '테니스 입문 그룹 레슨',
    sportType: '테니스', ticketType: 'multi', status: 'active',
    usedSessions: 2, totalSessions: 8, paidAmount: 96000,
    purchasedAt: '2026-03-18', expiresAt: '2026-05-18',
  },
  {
    id: 'tk-006', buyerName: '윤재원', lessonTitle: '수영 자유형 마스터 클래스',
    sportType: '수영', ticketType: 'unlimited', status: 'refunded',
    usedSessions: 1, totalSessions: null, paidAmount: 75000,
    purchasedAt: '2026-03-20', expiresAt: '2026-04-20',
  },
  {
    id: 'tk-007', buyerName: '한예진', lessonTitle: '배드민턴 클리닉 (초급반)',
    sportType: '배드민턴', ticketType: 'single', status: 'active',
    usedSessions: 0, totalSessions: 1, paidAmount: 25000,
    purchasedAt: '2026-03-25', expiresAt: '2026-03-25',
  },
  {
    id: 'tk-008', buyerName: '오동현', lessonTitle: '농구 실전 클리닉',
    sportType: '농구', ticketType: 'multi', status: 'active',
    usedSessions: 1, totalSessions: 12, paidAmount: 144000,
    purchasedAt: '2026-03-22', expiresAt: '2026-06-22',
  },
  {
    id: 'tk-009', buyerName: '임소희', lessonTitle: '테니스 입문 그룹 레슨',
    sportType: '테니스', ticketType: 'single', status: 'exhausted',
    usedSessions: 1, totalSessions: 1, paidAmount: 18000,
    purchasedAt: '2026-03-08', expiresAt: '2026-03-08',
  },
  {
    id: 'tk-010', buyerName: '강도윤', lessonTitle: '수영 자유형 마스터 클래스',
    sportType: '수영', ticketType: 'multi', status: 'cancelled',
    usedSessions: 0, totalSessions: 8, paidAmount: 0,
    purchasedAt: '2026-03-28', expiresAt: '2026-05-28',
  },
];

// ── Status config ─────────────────────────────────────────────────────────────

const ticketStatusLabel: Record<TicketStatus, string> = {
  active: '활성',
  expired: '만료',
  exhausted: '소진',
  refunded: '환불',
  cancelled: '취소',
};

const ticketStatusColor: Record<TicketStatus, string> = {
  active: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  expired: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  exhausted: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  refunded: 'bg-rose-50 text-rose-500 dark:bg-rose-900/30 dark:text-rose-400',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
};

const ticketTypeColor: Record<TicketType, string> = {
  single: 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400',
  multi: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  unlimited: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
};

// ── Filter tabs ───────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'active' | 'expired' | 'refunded';

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'active', label: '활성' },
  { key: 'expired', label: '만료·소진' },
  { key: 'refunded', label: '환불·취소' },
];

const PAGE_SIZE = 8;

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminLessonTicketsPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return MOCK_TICKETS.filter((t) => {
      const matchSearch = !search ||
        t.buyerName.includes(search) ||
        t.lessonTitle.toLowerCase().includes(search.toLowerCase());

      const matchFilter =
        filter === 'all' ||
        (filter === 'active' && t.status === 'active') ||
        (filter === 'expired' && (t.status === 'expired' || t.status === 'exhausted')) ||
        (filter === 'refunded' && (t.status === 'refunded' || t.status === 'cancelled'));

      return matchSearch && matchFilter;
    });
  }, [search, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filter/search changes
  const handleSearch = (v: string) => { setSearch(v); setPage(1); };
  const handleFilter = (f: FilterKey) => { setFilter(f); setPage(1); };

  // Summary stats
  const totalCount = MOCK_TICKETS.length;
  const activeCount = MOCK_TICKETS.filter((t) => t.status === 'active').length;
  const inactiveCount = MOCK_TICKETS.filter((t) => t.status === 'expired' || t.status === 'exhausted').length;
  const totalRevenue = MOCK_TICKETS.filter((t) => t.status !== 'refunded' && t.status !== 'cancelled')
    .reduce((sum, t) => sum + t.paidAmount, 0);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">수강권 관리</h1>
          <p className="text-base text-gray-400 mt-1">발급된 수강권을 관리하세요</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
              <Ticket size={16} className="text-blue-500" />
            </div>
            <span className="text-xs text-gray-400">전체 수강권</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalCount}<span className="text-sm font-medium text-gray-400 ml-1">건</span></p>
        </div>

        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/30">
              <TrendingUp size={16} className="text-emerald-500" />
            </div>
            <span className="text-xs text-gray-400">활성</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{activeCount}<span className="text-sm font-medium text-gray-400 ml-1">건</span></p>
        </div>

        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/30">
              <XCircle size={16} className="text-amber-500" />
            </div>
            <span className="text-xs text-gray-400">만료·소진</span>
          </div>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{inactiveCount}<span className="text-sm font-medium text-gray-400 ml-1">건</span></p>
        </div>

        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
              <CreditCard size={16} className="text-blue-500" />
            </div>
            <span className="text-xs text-gray-400">총 결제액</span>
          </div>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{formatAmount(totalRevenue)}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="구매자 또는 강좌명 검색"
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-colors"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 shrink-0">
          {FILTER_TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleFilter(key)}
              className={`min-h-[36px] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${
                filter === key
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Count label */}
      <p className="text-sm text-gray-400 mb-3">{filtered.length}건의 수강권</p>

      {/* Table */}
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">구매자</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">강좌명</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">유형</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">상태</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">사용현황</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">결제금액</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">구매일</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">만료일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Ticket size={32} className="text-gray-300 dark:text-gray-600" aria-hidden="true" />
                      <p className="text-sm text-gray-400">검색 결과가 없어요</p>
                    </div>
                  </td>
                </tr>
              ) : paginated.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  {/* Buyer */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-bold text-gray-500 dark:text-gray-400">
                        {t.buyerName.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">{t.buyerName}</span>
                    </div>
                  </td>

                  {/* Lesson title */}
                  <td className="px-5 py-3.5">
                    <p className="text-sm text-gray-800 dark:text-gray-200 max-w-[200px] truncate">{t.lessonTitle}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t.sportType}</p>
                  </td>

                  {/* Ticket type */}
                  <td className="px-5 py-3.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${ticketTypeColor[t.ticketType]}`}>
                      {ticketTypeLabel[t.ticketType]}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-5 py-3.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${ticketStatusColor[t.status]}`}>
                      {ticketStatusLabel[t.status]}
                    </span>
                  </td>

                  {/* Usage */}
                  <td className="px-5 py-3.5">
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {t.totalSessions === null
                        ? `${t.usedSessions}회 사용`
                        : `${t.usedSessions} / ${t.totalSessions}회`}
                    </p>
                    {t.totalSessions !== null && (
                      <div className="mt-1.5 h-[3px] w-20 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{ width: `${Math.min(100, (t.usedSessions / t.totalSessions) * 100)}%` }}
                        />
                      </div>
                    )}
                  </td>

                  {/* Paid amount */}
                  <td className="px-5 py-3.5">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                      {formatAmount(t.paidAmount)}
                    </span>
                  </td>

                  {/* Purchased at */}
                  <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {formatDateCompact(t.purchasedAt)}
                  </td>

                  {/* Expires at */}
                  <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {t.expiresAt ? formatDateCompact(t.expiresAt) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} / {filtered.length}건
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              aria-label="이전 페이지"
            >
              <ChevronLeft size={16} />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                className={`flex items-center justify-center w-9 h-9 rounded-xl border text-sm font-medium transition-colors ${
                  p === page
                    ? 'border-blue-500 bg-blue-500 text-white'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {p}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              aria-label="다음 페이지"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

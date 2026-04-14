'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Ticket, TrendingUp, XCircle, CreditCard, Search,
  ChevronLeft, ChevronRight, ChevronDown, MoreHorizontal,
  X, CalendarDays, RefreshCw, ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { formatAmount, formatDateCompact } from '@/lib/utils';
import { ticketTypeLabel } from '@/lib/constants';
import { useToast } from '@/components/ui/toast';
import { EmptyState } from '@/components/ui/empty-state';
import type { TicketStatus, TicketType } from '@/types/api';

// ── Mock data ────────────────────────────────────────────────────────────────

interface MockTicket {
  id: string;
  lessonId: string;
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
    id: 'tk-001', lessonId: 'ls-001', buyerName: '김민준', lessonTitle: '풋살 기초 체력 레슨',
    sportType: '풋살', ticketType: 'multi', status: 'active',
    usedSessions: 4, totalSessions: 10, paidAmount: 120000,
    purchasedAt: '2026-03-01', expiresAt: '2026-05-01',
  },
  {
    id: 'tk-002', lessonId: 'ls-002', buyerName: '이서연', lessonTitle: '배드민턴 클리닉 (초급반)',
    sportType: '배드민턴', ticketType: 'single', status: 'exhausted',
    usedSessions: 1, totalSessions: 1, paidAmount: 25000,
    purchasedAt: '2026-03-05', expiresAt: '2026-03-05',
  },
  {
    id: 'tk-003', lessonId: 'ls-003', buyerName: '박지호', lessonTitle: '농구 실전 클리닉',
    sportType: '농구', ticketType: 'unlimited', status: 'active',
    usedSessions: 7, totalSessions: null, paidAmount: 80000,
    purchasedAt: '2026-03-10', expiresAt: '2026-04-10',
  },
  {
    id: 'tk-004', lessonId: 'ls-001', buyerName: '최수아', lessonTitle: '풋살 기초 체력 레슨',
    sportType: '풋살', ticketType: 'multi', status: 'expired',
    usedSessions: 6, totalSessions: 10, paidAmount: 120000,
    purchasedAt: '2026-01-15', expiresAt: '2026-03-15',
  },
  {
    id: 'tk-005', lessonId: 'ls-004', buyerName: '정하은', lessonTitle: '테니스 입문 그룹 레슨',
    sportType: '테니스', ticketType: 'multi', status: 'active',
    usedSessions: 2, totalSessions: 8, paidAmount: 96000,
    purchasedAt: '2026-03-18', expiresAt: '2026-05-18',
  },
  {
    id: 'tk-006', lessonId: 'ls-005', buyerName: '윤재원', lessonTitle: '수영 자유형 마스터 클래스',
    sportType: '수영', ticketType: 'unlimited', status: 'refunded',
    usedSessions: 1, totalSessions: null, paidAmount: 75000,
    purchasedAt: '2026-03-20', expiresAt: '2026-04-20',
  },
  {
    id: 'tk-007', lessonId: 'ls-002', buyerName: '한예진', lessonTitle: '배드민턴 클리닉 (초급반)',
    sportType: '배드민턴', ticketType: 'single', status: 'active',
    usedSessions: 0, totalSessions: 1, paidAmount: 25000,
    purchasedAt: '2026-03-25', expiresAt: '2026-03-25',
  },
  {
    id: 'tk-008', lessonId: 'ls-003', buyerName: '오동현', lessonTitle: '농구 실전 클리닉',
    sportType: '농구', ticketType: 'multi', status: 'active',
    usedSessions: 1, totalSessions: 12, paidAmount: 144000,
    purchasedAt: '2026-03-22', expiresAt: '2026-06-22',
  },
  {
    id: 'tk-009', lessonId: 'ls-004', buyerName: '임소희', lessonTitle: '테니스 입문 그룹 레슨',
    sportType: '테니스', ticketType: 'single', status: 'exhausted',
    usedSessions: 1, totalSessions: 1, paidAmount: 18000,
    purchasedAt: '2026-03-08', expiresAt: '2026-03-08',
  },
  {
    id: 'tk-010', lessonId: 'ls-005', buyerName: '강도윤', lessonTitle: '수영 자유형 마스터 클래스',
    sportType: '수영', ticketType: 'multi', status: 'cancelled',
    usedSessions: 0, totalSessions: 8, paidAmount: 0,
    purchasedAt: '2026-03-28', expiresAt: '2026-05-28',
  },
];

// ── Status / type config ──────────────────────────────────────────────────────

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

const ALL_STATUSES: TicketStatus[] = ['active', 'expired', 'exhausted', 'refunded', 'cancelled'];

// ── Filter tabs ───────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'active' | 'expired' | 'refunded';

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'active', label: '활성' },
  { key: 'expired', label: '만료·소진' },
  { key: 'refunded', label: '환불·취소' },
];

const PAGE_SIZE = 8;

// ── Ticket Manage Modal ───────────────────────────────────────────────────────

type ModalMode = 'extend' | 'status' | 'adjust';

interface TicketManageModalProps {
  ticket: MockTicket;
  mode: ModalMode;
  onClose: () => void;
  onSave: (ticket: MockTicket, mode: ModalMode, payload: ModalPayload) => void;
}

interface ModalPayload {
  expiresAt?: string;
  status?: TicketStatus;
  statusReason?: string;
  totalSessions?: number;
  usedSessions?: number;
}

function addDays(dateStr: string | null, days: number): string {
  const base = dateStr ? new Date(dateStr) : new Date();
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

function TicketManageModal({ ticket, mode, onClose, onSave }: TicketManageModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  // extend state
  const [newExpiry, setNewExpiry] = useState<string>(ticket.expiresAt ?? new Date().toISOString().slice(0, 10));

  // status state
  const [newStatus, setNewStatus] = useState<TicketStatus>(ticket.status);
  const [statusReason, setStatusReason] = useState('');

  // adjust state
  const [adjTotal, setAdjTotal] = useState<number>(ticket.totalSessions ?? 0);
  const [adjUsed, setAdjUsed] = useState<number>(ticket.usedSessions);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Focus first element on mount
  useEffect(() => {
    firstFocusRef.current?.focus();
  }, []);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const handleSave = () => {
    const payload: ModalPayload = {};
    if (mode === 'extend') payload.expiresAt = newExpiry;
    if (mode === 'status') { payload.status = newStatus; payload.statusReason = statusReason; }
    if (mode === 'adjust') { payload.totalSessions = adjTotal; payload.usedSessions = adjUsed; }
    onSave(ticket, mode, payload);
  };

  const modalTitle = {
    extend: '만료일 연장',
    status: '상태 변경',
    adjust: '횟수 조정',
  }[mode];

  const modalCta = {
    extend: '연장',
    status: '변경',
    adjust: '조정',
  }[mode];

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={modalTitle}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-2xl"
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">{modalTitle}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{ticket.buyerName} · {ticket.lessonTitle}</p>
          </div>
          <button
            ref={firstFocusRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex items-center justify-center min-w-11 min-h-[44px] rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal body */}
        <div className="px-6 py-5 space-y-5">

          {/* Current value card */}
          <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 px-4 py-3 space-y-1.5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">현재 값</p>
            {mode === 'extend' && (
              <p className="text-sm text-gray-700 dark:text-gray-200">
                만료일: <span className="font-semibold">{ticket.expiresAt ? formatDateCompact(ticket.expiresAt) : '—'}</span>
              </p>
            )}
            {mode === 'status' && (
              <p className="text-sm text-gray-700 dark:text-gray-200">
                상태: <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${ticketStatusColor[ticket.status]}`}>{ticketStatusLabel[ticket.status]}</span>
              </p>
            )}
            {mode === 'adjust' && (
              <p className="text-sm text-gray-700 dark:text-gray-200">
                사용현황: <span className="font-semibold">{ticket.usedSessions} / {ticket.totalSessions}회</span>
              </p>
            )}
          </div>

          {/* Extend mode */}
          {mode === 'extend' && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">빠른 선택</p>
              <div className="flex gap-2">
                {[7, 30, 90].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setNewExpiry(addDays(ticket.expiresAt, d))}
                    className="flex-1 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    +{d}일
                  </button>
                ))}
              </div>
              <div>
                <label htmlFor="new-expiry" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
                  새 만료일
                </label>
                <input
                  id="new-expiry"
                  type="date"
                  value={newExpiry}
                  onChange={(e) => setNewExpiry(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
                />
              </div>
              {newExpiry && (
                <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 px-4 py-2.5">
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    변경 후 만료일: <span className="font-semibold">{formatDateCompact(newExpiry)}</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Status mode */}
          {mode === 'status' && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">새 상태 선택</p>
              <div className="space-y-2">
                {ALL_STATUSES.map((s) => (
                  <label
                    key={s}
                    className={`flex items-center gap-3 min-h-[44px] px-4 rounded-xl border cursor-pointer transition-colors ${
                      newStatus === s
                        ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ticket-status"
                      value={s}
                      checked={newStatus === s}
                      onChange={() => setNewStatus(s)}
                      className="sr-only"
                    />
                    <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      newStatus === s ? 'border-blue-500' : 'border-gray-300 dark:border-gray-500'
                    }`}>
                      {newStatus === s && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                    </div>
                    <span className={`flex-1 text-sm font-medium ${newStatus === s ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-200'}`}>
                      {ticketStatusLabel[s]}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ticketStatusColor[s]}`}>
                      {ticketStatusLabel[s]}
                    </span>
                  </label>
                ))}
              </div>
              <div>
                <label htmlFor="status-reason" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
                  변경 사유 <span className="text-gray-400 font-normal">(선택)</span>
                </label>
                <textarea
                  id="status-reason"
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="관리자 메모용 변경 사유를 입력하세요"
                  rows={3}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none transition-colors"
                />
              </div>
            </div>
          )}

          {/* Adjust mode (multi only) */}
          {mode === 'adjust' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="adj-total" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
                  전체 횟수
                </label>
                <input
                  id="adj-total"
                  type="number"
                  min={1}
                  max={999}
                  value={adjTotal}
                  onChange={(e) => setAdjTotal(Math.max(1, Number(e.target.value)))}
                  className="w-full min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
                />
              </div>
              <div>
                <label htmlFor="adj-used" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
                  사용 횟수
                </label>
                <input
                  id="adj-used"
                  type="number"
                  min={0}
                  max={adjTotal}
                  value={adjUsed}
                  onChange={(e) => setAdjUsed(Math.min(adjTotal, Math.max(0, Number(e.target.value))))}
                  className="w-full min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
                />
              </div>
              <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 px-4 py-2.5 space-y-1">
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  변경 후: <span className="font-semibold">{adjUsed} / {adjTotal}회</span> 사용
                </p>
                <div className="h-1 w-full rounded-full bg-blue-100 dark:bg-blue-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${Math.min(100, adjTotal > 0 ? (adjUsed / adjTotal) * 100 : 0)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="flex gap-2 px-6 pb-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 min-h-[44px] rounded-xl bg-blue-500 text-sm font-semibold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors"
          >
            {modalCta}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Row action dropdown ───────────────────────────────────────────────────────

interface RowActionMenuProps {
  ticket: MockTicket;
  onAction: (ticket: MockTicket, mode: ModalMode) => void;
}

function RowActionMenu({ ticket, onAction }: RowActionMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); } };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const trigger = (mode: ModalMode) => {
    setOpen(false);
    onAction(ticket, mode);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="수강권 관리"
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1 min-h-9 px-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
      >
        관리
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 z-30 min-w-[156px] rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => trigger('extend')}
            className="flex items-center gap-2.5 w-full px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <CalendarDays size={14} className="text-gray-400" aria-hidden="true" />
            만료일 연장
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => trigger('status')}
            className="flex items-center gap-2.5 w-full px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <RefreshCw size={14} className="text-gray-400" aria-hidden="true" />
            상태 변경
          </button>

          {ticket.ticketType === 'multi' && (
            <button
              type="button"
              role="menuitem"
              onClick={() => trigger('adjust')}
              className="flex items-center gap-2.5 w-full px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <MoreHorizontal size={14} className="text-gray-400" aria-hidden="true" />
              횟수 조정
            </button>
          )}

          <div className="my-1 border-t border-gray-100 dark:border-gray-700" />

          <Link
            href={`/admin/lessons/${ticket.lessonId}`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 w-full px-4 min-h-[44px] text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <ExternalLink size={14} className="text-gray-400" aria-hidden="true" />
            상세 보기
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Bulk action toolbar ───────────────────────────────────────────────────────

interface BulkToolbarProps {
  count: number;
  onExpire: () => void;
  onStatusChange: () => void;
  onClear: () => void;
}

function BulkToolbar({ count, onExpire, onStatusChange, onClear }: BulkToolbarProps) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-blue-100 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20 px-4 py-2.5 mb-3">
      <span className="text-sm font-semibold text-blue-700 dark:text-blue-300 shrink-0">
        선택된 {count}건
      </span>
      <div className="flex gap-2 ml-auto flex-wrap">
        <button
          type="button"
          onClick={onExpire}
          className="min-h-[44px] rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-gray-800 px-3 text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors whitespace-nowrap"
        >
          일괄 만료 처리
        </button>
        <button
          type="button"
          onClick={onStatusChange}
          className="min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors whitespace-nowrap"
        >
          일괄 상태 변경
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label="선택 해제"
          className="flex items-center justify-center min-h-[44px] min-w-11 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Bulk status modal ─────────────────────────────────────────────────────────

interface BulkStatusModalProps {
  count: number;
  onClose: () => void;
  onSave: (status: TicketStatus) => void;
}

function BulkStatusModal({ count, onClose, onSave }: BulkStatusModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<TicketStatus>('expired');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      role="presentation"
    >
      <div role="dialog" aria-modal="true" aria-label="일괄 상태 변경" className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">일괄 상태 변경</h2>
            <p className="text-xs text-gray-400 mt-0.5">선택된 {count}건에 적용됩니다</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex items-center justify-center min-w-11 min-h-[44px] rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-2">
          {ALL_STATUSES.map((s) => (
            <label
              key={s}
              className={`flex items-center gap-3 min-h-[44px] px-4 rounded-xl border cursor-pointer transition-colors ${
                status === s
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
              }`}
            >
              <input
                type="radio"
                name="bulk-status"
                value={s}
                checked={status === s}
                onChange={() => setStatus(s)}
                className="sr-only"
              />
              <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                status === s ? 'border-blue-500' : 'border-gray-300 dark:border-gray-500'
              }`}>
                {status === s && <div className="h-2 w-2 rounded-full bg-blue-500" />}
              </div>
              <span className={`flex-1 text-sm font-medium ${status === s ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-200'}`}>
                {ticketStatusLabel[s]}
              </span>
            </label>
          ))}
        </div>
        <div className="flex gap-2 px-6 pb-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onSave(status)}
            className="flex-1 min-h-[44px] rounded-xl bg-blue-500 text-sm font-semibold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors"
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminLessonTicketsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [page, setPage] = useState(1);

  // Checkbox selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Row-level modal
  const [modalTicket, setModalTicket] = useState<MockTicket | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>('extend');

  // Bulk status modal
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);

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

  const handleSearch = (v: string) => { setSearch(v); setPage(1); };
  const handleFilter = (f: FilterKey) => { setFilter(f); setPage(1); };

  // Checkbox logic
  const pageIds = paginated.map((t) => t.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPageSelected = pageIds.some((id) => selected.has(id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Open row action modal
  const openModal = useCallback((ticket: MockTicket, mode: ModalMode) => {
    setModalTicket(ticket);
    setModalMode(mode);
  }, []);

  const closeModal = useCallback(() => setModalTicket(null), []);

  // Handle modal save (mock)
  const handleModalSave = useCallback((_ticket: MockTicket, mode: ModalMode, _payload: ModalPayload) => {
    closeModal();
    const messages: Record<ModalMode, string> = {
      extend: '만료일이 연장되었습니다.',
      status: '상태가 변경되었습니다.',
      adjust: '횟수가 조정되었습니다.',
    };
    toast('success', messages[mode]);
  }, [closeModal, toast]);

  // Bulk expire (mock)
  const handleBulkExpire = () => {
    setSelected(new Set());
    toast('success', `${selected.size}건이 만료 처리되었습니다.`);
  };

  // Bulk status change (mock)
  const handleBulkStatusSave = (status: TicketStatus) => {
    setBulkStatusOpen(false);
    const count = selected.size;
    setSelected(new Set());
    toast('success', `${count}건의 상태가 '${ticketStatusLabel[status]}'로 변경되었습니다.`);
  };

  // Summary stats
  const totalCount = MOCK_TICKETS.length;
  const activeCount = MOCK_TICKETS.filter((t) => t.status === 'active').length;
  const inactiveCount = MOCK_TICKETS.filter((t) => t.status === 'expired' || t.status === 'exhausted').length;
  const totalRevenue = MOCK_TICKETS
    .filter((t) => t.status !== 'refunded' && t.status !== 'cancelled')
    .reduce((sum, t) => sum + t.paidAmount, 0);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">수강권 관리</h1>
          <p className="text-base text-gray-500 mt-1">발급된 수강권을 관리하세요</p>
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
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {totalCount}<span className="text-sm font-medium text-gray-400 ml-1">건</span>
          </p>
        </div>

        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/30">
              <TrendingUp size={16} className="text-emerald-500" />
            </div>
            <span className="text-xs text-gray-400">활성</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {activeCount}<span className="text-sm font-medium text-gray-400 ml-1">건</span>
          </p>
        </div>

        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/30">
              <XCircle size={16} className="text-amber-500" />
            </div>
            <span className="text-xs text-gray-400">만료·소진</span>
          </div>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {inactiveCount}<span className="text-sm font-medium text-gray-400 ml-1">건</span>
          </p>
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
              className={`min-h-9 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${
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
      <p className="text-sm text-gray-500 mb-3">{filtered.length}건의 수강권</p>

      {/* Bulk toolbar */}
      <BulkToolbar
        count={selected.size}
        onExpire={handleBulkExpire}
        onStatusChange={() => setBulkStatusOpen(true)}
        onClear={() => setSelected(new Set())}
      />

      {/* Table */}
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                {/* Checkbox col */}
                <th className="pl-4 pr-2 py-3 w-10">
                  <button
                    type="button"
                    onClick={toggleAll}
                    aria-label={allOnPageSelected ? '이 페이지 전체 선택 해제' : '이 페이지 전체 선택'}
                    className={`flex items-center justify-center w-5 h-5 rounded border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:ring-offset-1 ${
                      allOnPageSelected
                        ? 'bg-blue-500 border-blue-500'
                        : someOnPageSelected
                          ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-400'
                          : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                    }`}
                  >
                    {allOnPageSelected && (
                      <svg viewBox="0 0 10 8" className="w-2.5 h-2 fill-none stroke-white stroke-2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M1 4l2.5 2.5L9 1" />
                      </svg>
                    )}
                    {someOnPageSelected && !allOnPageSelected && (
                      <div className="w-2 h-0.5 bg-blue-500" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">구매자</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">강좌명</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">유형</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">상태</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">사용현황</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">결제금액</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">구매일</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">만료일</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <EmptyState
                      icon={Ticket}
                      title="수강권이 없어요"
                      description="검색 조건과 일치하는 수강권이 없습니다"
                      size="sm"
                    />
                  </td>
                </tr>
              ) : paginated.map((t) => {
                const isChecked = selected.has(t.id);
                return (
                  <tr
                    key={t.id}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${isChecked ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                  >
                    {/* Checkbox */}
                    <td className="pl-4 pr-2 py-3.5 w-10">
                      <button
                        type="button"
                        onClick={() => toggleOne(t.id)}
                        aria-label={isChecked ? `${t.buyerName} 선택 해제` : `${t.buyerName} 선택`}
                        className={`flex items-center justify-center w-5 h-5 rounded border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:ring-offset-1 ${
                          isChecked
                            ? 'bg-blue-500 border-blue-500'
                            : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                        }`}
                      >
                        {isChecked && (
                          <svg viewBox="0 0 10 8" className="w-2.5 h-2 fill-none stroke-white stroke-2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M1 4l2.5 2.5L9 1" />
                          </svg>
                        )}
                      </button>
                    </td>

                    {/* Buyer */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-bold text-gray-500 dark:text-gray-400">
                          {t.buyerName.charAt(0)}
                        </div>
                        <span className="text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">{t.buyerName}</span>
                      </div>
                    </td>

                    {/* Lesson title */}
                    <td className="px-4 py-3.5">
                      <p className="text-sm text-gray-800 dark:text-gray-200 max-w-[180px] truncate">{t.lessonTitle}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{t.sportType}</p>
                    </td>

                    {/* Ticket type */}
                    <td className="px-4 py-3.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${ticketTypeColor[t.ticketType]}`}>
                        {ticketTypeLabel[t.ticketType]}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${ticketStatusColor[t.status]}`}>
                        {ticketStatusLabel[t.status]}
                      </span>
                    </td>

                    {/* Usage */}
                    <td className="px-4 py-3.5">
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
                    <td className="px-4 py-3.5">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                        {formatAmount(t.paidAmount)}
                      </span>
                    </td>

                    {/* Purchased at */}
                    <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {formatDateCompact(t.purchasedAt)}
                    </td>

                    {/* Expires at */}
                    <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {t.expiresAt ? formatDateCompact(t.expiresAt) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>

                    {/* Row action */}
                    <td className="px-4 py-3.5">
                      <RowActionMenu ticket={t} onAction={openModal} />
                    </td>
                  </tr>
                );
              })}
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

      {/* Row-level manage modal */}
      {modalTicket && (
        <TicketManageModal
          ticket={modalTicket}
          mode={modalMode}
          onClose={closeModal}
          onSave={handleModalSave}
        />
      )}

      {/* Bulk status modal */}
      {bulkStatusOpen && (
        <BulkStatusModal
          count={selected.size}
          onClose={() => setBulkStatusOpen(false)}
          onSave={handleBulkStatusSave}
        />
      )}
    </div>
  );
}

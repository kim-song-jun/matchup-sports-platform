'use client';

import { useRef, useEffect, useId } from 'react';
import { X } from 'lucide-react';
import { formatEntryFee } from '@/lib/date-utils';
import type { V1AdminTournamentRegistration } from '@/types/api';

// ── Constants ─────────────────────────────────────────────────────────────

export const ELIGIBILITY_LABEL: Record<string, string> = {
  non_pro: '아마추어',
  pro: '프로',
  needs_review: '검토 필요',
};

export const GENDER_LABEL: Record<string, string> = {
  male: '남성',
  female: '여성',
};

export const PHONE_LABEL = '휴대폰';

/**
 * 교체 정책 표시 문구. `limited` 인데 횟수가 없는 레거시/비정상 데이터가 들어오면
 * 그대로 템플릿에 넣을 경우 화면에 `제한 null회` 가 노출된다(parseLineupLimits 는
 * 숫자가 아니면 null 로 내려보낸다) — 관리자에게는 깨진 값으로 보이므로 그 경우를
 * 따로 처리한다. 표시하는 모든 자리가 같은 판단을 하도록 한 곳으로 모은다.
 */
export function substitutionPolicyLabel(
  mode: 'limited' | 'rolling' | null,
  maxSubstitutions: number | null,
): string {
  if (mode === null) return '미지정';
  if (mode === 'rolling') return '무제한(롤링)';
  return typeof maxSubstitutions === 'number' ? `제한 ${maxSubstitutions}회` : '제한 (횟수 미설정)';
}

export function formatPhoneNumber(phone: string | null): string {
  if (!phone) return '미등록';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7);
  }
  if (digits.length === 10) {
    return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
  }
  return phone;
}

// f9: 결제 상태·수단 한글 라벨 (schema enum=ready|paid|failed|cancelled|refunded, my-registration-client 동일 기준)
const PAYMENT_STATUS_LABEL: Record<string, string> = {
  ready: '결제 대기',
  paid: '결제 완료',
  failed: '결제 실패',
  cancelled: '취소됨',
  refunded: '환불됨',
};

// schema enum=pg|bank_transfer only
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  pg: '카드·간편결제',
  bank_transfer: '계좌이체',
};

// AREG-04: 어드민이 취소할 수 있는 신청 상태 (draft·cancelled 제외 — BE 가드와 동일)
export const ADMIN_CANCELLABLE = new Set<string>([
  'cancel_requested',
  'awaiting_payment',
  'payment_checking',
  'paid',
  'confirmed',
  'waitlisted',
]);

// P1-2: 신청 관리 탭 상태 필터 칩 (기존 STATUS_META 라벨 매핑 재사용)
export const REGISTRATION_STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'awaiting_payment', label: '입금 대기' },
  { value: 'payment_checking', label: '입금 확인 중' },
  // 'paid'는 실사용 상태(입금 확인 완료, 확정 전)인데 칩이 없어 '전체'로만 볼 수 있었다.
  { value: 'paid', label: '결제 완료' },
  { value: 'confirmed', label: '확정' },
  { value: 'waitlisted', label: '대기' },
  { value: 'cancel_requested', label: '취소 요청' },
  { value: 'cancelled', label: '취소' },
];

// ── Status transition guards ────────────────────────────────────────────────

/** Returns next allowed statuses from the current one */
// ── Helpers ───────────────────────────────────────────────────────────────

// 로직이 date-utils formatEntryFee 와 동일해 위임 — 소비 탭들의 import 는 그대로 유지됨.
export const formatCurrency = formatEntryFee;

export function formatRegistrationPaymentSubtitle(
  payment: V1AdminTournamentRegistration['payment'],
): string | undefined {
  if (!payment) return undefined;
  const method = PAYMENT_METHOD_LABEL[payment.method] ?? payment.method;
  const status = PAYMENT_STATUS_LABEL[payment.status] ?? payment.status;
  return `${method} · ${status} · ${formatCurrency(payment.amount)}`;
}

export function isoToDatetimeLocalValue(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}`;
}

export function datetimeLocalValueToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}:00+09:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

type GenderQuotaCheck = {
  count: number;
  min: number | null;
  max: number | null;
  ok: boolean;
};

export function formatGenderQuotaError(details: unknown) {
  if (!details || typeof details !== 'object') return null;
  const quota = details as { male?: GenderQuotaCheck; female?: GenderQuotaCheck };
  const messages: string[] = [];
  for (const [label, result] of [
    ['남성', quota.male],
    ['여성', quota.female],
  ] as const) {
    if (!result || result.ok) continue;
    if (result.min !== null && result.count < result.min) {
      messages.push(`${label} 최소 ${result.min}명 필요(현재 ${result.count}명)`);
    }
    if (result.max !== null && result.count > result.max) {
      messages.push(`${label} 최대 ${result.max}명 초과(현재 ${result.count}명)`);
    }
  }
  return messages.length > 0 ? messages.join(' · ') : null;
}

// ── Shared input styles ───────────────────────────────────────────────────

/** h-[44px] unified submit button (f12) */
export const submitBtnCls = [
  'inline-flex items-center justify-center gap-1.5 h-[44px] px-4 rounded-xl',
  'whitespace-nowrap',
  'text-[13px] text-white bg-blue-500 hover:bg-blue-600',
  'transition-colors disabled:opacity-50',
  'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
].join(' ');

export const inputCls = [
  'h-[44px] px-3 text-[13px] bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)]',
  'placeholder:text-[var(--text-muted)]',
  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
  'transition-colors disabled:opacity-50 w-full',
].join(' ');

export const textareaCls = [
  'px-3 py-2.5 text-[13px] bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] resize-none',
  'placeholder:text-[var(--text-muted)]',
  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
  'transition-colors disabled:opacity-50 w-full',
].join(' ');

// ── Inline modal (reusable within this file) ──────────────────────────────

interface SimpleModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  pending?: boolean;
  children: React.ReactNode;
}

export function SimpleModal({ open, title, onClose, pending = false, children }: SimpleModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
    } else {
      const el = previousFocusRef.current;
      if (el && typeof (el as HTMLElement).focus === 'function') {
        (el as HTMLElement).focus();
      }
      previousFocusRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, pending]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusableSelectors =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelectors));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-[2px]"
      onClick={(e) => { if (e.target === e.currentTarget && !pending) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-[var(--card-surface)] rounded-2xl shadow-[var(--shadow-dropdown)] w-full max-w-[480px]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 id={titleId} className="text-sm font-bold text-[var(--text-strong)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            disabled={pending}
            aria-label="모달 닫기"
            className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-muted)] hover:bg-[var(--surface-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

// ── Tab type ──────────────────────────────────────────────────────────────

// ── Small action button ───────────────────────────────────────────────────

export function ActionButton({
  onClick,
  disabled,
  icon,
  label,
  tone,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  tone: 'blue' | 'gray' | 'red';
}) {
  const toneClass =
    tone === 'blue'
      ? 'text-[var(--blue700)] bg-[var(--blue50)] hover:bg-blue-100'
      : tone === 'red'
      ? 'text-[var(--red700)] bg-[var(--red50)] hover:bg-red-100'
      : 'text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)]';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex items-center gap-1 min-h-[44px] px-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
        'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
        'disabled:opacity-50',
        toneClass,
      ].join(' ')}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </button>
  );
}

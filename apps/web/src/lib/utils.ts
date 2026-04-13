import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// ── Class utilities ──

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Currency formatters ──

/** 금액 표시 — 0이면 '무료', 그 외 'N원' */
export function formatCurrency(n: number): string {
  return n === 0 ? '무료' : new Intl.NumberFormat('ko-KR').format(n) + '원';
}

/** 결제 금액 — 항상 'N원' (0도 '0원') */
export function formatAmount(n: number): string {
  return new Intl.NumberFormat('ko-KR').format(n) + '원';
}

// ── Date formatters ──

/** M/D (요일) */
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}/${d.getDate()} (${weekdays[d.getDay()]})`;
}

/** formatDate alias */
export const formatMatchDate = formatDate;

/** YYYY년 M월 D일 (요일) */
export function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdays[d.getDay()]})`;
}

/** YYYY.M.D (요일) */
export function formatDateDot(dateStr: string): string {
  const d = new Date(dateStr);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} (${weekdays[d.getDay()]})`;
}

/** YYYY.MM.DD (zero-padded) */
export function formatDateCompact(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getDate().toString().padStart(2, '0')}`;
}

/** M월 D일 */
export function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

/** YYYY년 M월 D일 HH:MM */
export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Converts levelMin/levelMax numeric range into a human-readable skill label. */
export function friendlyLevel(min?: number | null, max?: number | null): string {
  if (min == null || max == null) return '누구나';
  if (min <= 1 && max >= 5) return '누구나';
  if (min <= 1 && max <= 2) return '초심자';
  if (min <= 2 && max <= 3) return '초급~중급';
  if (min >= 3 && max <= 4) return '중급 이상';
  if (min >= 4) return '상급자';
  return '누구나';
}

export function getTimeBadge(dateStr: string): { text: string; color: string } | null {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return { text: '오늘', color: 'bg-red-50 text-red-500' };
  if (diff === 1) return { text: '내일', color: 'bg-blue-50 text-blue-500' };
  if (diff <= 7) return { text: '이번 주', color: 'bg-gray-100 text-gray-500' };
  return null;
}

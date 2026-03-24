import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(n: number): string {
  return n === 0 ? '무료' : new Intl.NumberFormat('ko-KR').format(n) + '원';
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}/${d.getDate()} (${weekdays[d.getDay()]})`;
}

/** Alias for formatDate — used by match pages */
export const formatMatchDate = formatDate;

export function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdays[d.getDay()]})`;
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

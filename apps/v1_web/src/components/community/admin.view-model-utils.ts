import type { AdminLoadState, AdminMetricModel, AdminTone } from './admin.types';

const knownExactRuntimeRoutes = ['/admin', '/admin/audit'] as const;

const knownRuntimeRoutePrefixes = [
  '/matches',
  '/team-matches',
  '/teams',
  '/my',
  '/notifications',
  '/search',
  '/chat',
] as const;

export function combinedState(states: readonly AdminLoadState[]): AdminLoadState {
  if (states.includes('error')) return 'error';
  if (states.includes('loading')) return 'loading';
  return 'ready';
}

export function metric(id: string, label: string, value: number, sub: string, tone: AdminTone): AdminMetricModel {
  return { id, label, value: value.toLocaleString('ko-KR'), sub, tone };
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    open: '모집 중',
    recruiting: '모집 중',
    pending: '대기',
    confirmed: '확정',
    closed: '마감',
    cancelled: '취소',
    completed: '완료',
    expired: '종료',
    matched: '매칭 완료',
  };
  return labels[status] ?? status;
}

export function isRecruitingStatus(status: string): boolean {
  return status === 'recruiting' || status === 'open';
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function serviceErrorMessage(message?: string): string | undefined {
  if (!message) return undefined;
  if (message.includes('401') || message.includes('Unauthorized')) return '로그인이 필요합니다.';
  return message;
}

export function teamMatchEditHref(teamMatchId: string): string {
  return `/team-matches/${teamMatchId}/edit`;
}

export function runtimeOperationHref(route: string | null | undefined, fallback: string): string {
  if (!route) return fallback;
  if (route.startsWith('/chat/rooms/')) return route.replace('/chat/rooms/', '/chat/');
  if (knownExactRuntimeRoutes.some((knownRoute) => route === knownRoute)) return route;
  if (knownRuntimeRoutePrefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`))) return route;
  return fallback;
}

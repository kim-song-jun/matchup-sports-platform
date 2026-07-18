const recentlyReported = new Map<string, number>();
const DEDUPE_WINDOW_MS = 10_000;

export interface ClientErrorPayload {
  message: string;
  stack?: string;
  level?: 'error' | 'warn';
  context?: Record<string, unknown>;
}

export function reportClientError({ message, stack, level = 'error', context }: ClientErrorPayload): void {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  const lastReportedAt = recentlyReported.get(message);
  if (lastReportedAt && now - lastReportedAt < DEDUPE_WINDOW_MS) return;
  recentlyReported.set(message, now);

  const body = JSON.stringify({
    message: message.slice(0, 4000),
    stack: stack?.slice(0, 4000),
    url: window.location.href,
    userAgent: window.navigator.userAgent,
    level,
    context,
  });

  fetch('/api/v1/logs/client-error', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // 리포터 자체 실패는 무한루프 방지를 위해 조용히 무시한다.
  });
}

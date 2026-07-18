const recentlyReported = new Map<string, number>();
const DEDUPE_WINDOW_MS = 10_000;

export interface ClientErrorPayload {
  message: string;
  stack?: string;
  level?: 'error' | 'warn';
  context?: Record<string, unknown>;
}

function sweepExpiredEntries(now: number): void {
  for (const [key, reportedAt] of recentlyReported) {
    if (now - reportedAt >= DEDUPE_WINDOW_MS) recentlyReported.delete(key);
  }
}

export function reportClientError({ message, stack, level = 'error', context }: ClientErrorPayload): void {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  sweepExpiredEntries(now);
  const lastReportedAt = recentlyReported.get(message);
  if (lastReportedAt && now - lastReportedAt < DEDUPE_WINDOW_MS) return;
  recentlyReported.set(message, now);

  const body = JSON.stringify({
    message: message.slice(0, 4000),
    stack: stack?.slice(0, 4000),
    // 쿼리스트링/해시는 담지 않는다 — OAuth 인가코드·CSRF state 같은 민감 값이
    // 쿼리파라미터로 들어오는 콜백 URL(예: /callback/kakao?code=...&state=...)이
    // 그대로 서버 로그에 적재되는 것을 막기 위함.
    url: window.location.pathname.slice(0, 2000),
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

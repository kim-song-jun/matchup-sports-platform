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

// message 텍스트만으로 dedupe 하면 level/stack이 다른, 실제로는 별개인 에러가 같은 문구를
// 우연히 공유할 때(예: 4xx warn 이 먼저 찍히고 뒤이어 진짜 5xx error 가 같은 문구로 도착)
// 뒤의 리포트가 조용히 눌린다 — level과 stack까지 키에 포함해 진짜 동일 에러만 dedupe한다.
function buildDedupeKey(message: string, level: 'error' | 'warn', stack?: string): string {
  return `${level}::${message}::${stack ?? ''}`;
}

export function reportClientError({ message, stack, level = 'error', context }: ClientErrorPayload): void {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  sweepExpiredEntries(now);
  const dedupeKey = buildDedupeKey(message, level, stack);
  const lastReportedAt = recentlyReported.get(dedupeKey);
  if (lastReportedAt && now - lastReportedAt < DEDUPE_WINDOW_MS) return;
  recentlyReported.set(dedupeKey, now);

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

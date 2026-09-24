export function normalizeNotificationHref(route?: string | null, type?: string | null): string {
  const normalized = (() => {
    if (!route) return type?.includes('review') ? '/my/reviews' : '/notifications';
    if (!isSafeInternalRoute(route)) return '/notifications';
    if (route.startsWith('/chat/rooms/')) return route.replace('/chat/rooms/', '/chat/');
    if (route === '/reviews' || route.startsWith('/reviews?')) return route.replace('/reviews', '/my/reviews');
    if (route.startsWith('/reviews/')) return `/my${route}`;
    if (type?.includes('review') && route === '/my') return '/my/reviews';
    return route;
  })();

  if (normalized === '/notifications') return normalized;

  // 딥링크에 이미 `from` 이 있어도(예: 기록 동의 `from=tournament`) 알림 출처로 덮어써 하나만 남긴다 —
  // append 로 두 개가 되면 get('from') 이 앞의 값을 읽어 알림으로 돌아가지 못한다.
  const url = new URL(normalized, 'https://teameet.internal');
  url.searchParams.set('from', '/notifications');
  return `${url.pathname}${url.search}${url.hash}`;
}

function isSafeInternalRoute(route: string): boolean {
  if (!route.startsWith('/') || route.startsWith('//') || route.includes('\\')) return false;

  try {
    const parsed = new URL(route, 'https://teameet.internal');
    return parsed.origin === 'https://teameet.internal' && parsed.pathname.startsWith('/');
  } catch {
    return false;
  }
}

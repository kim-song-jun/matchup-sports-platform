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

  if (normalized === '/notifications' || normalized.includes('from=notifications')) {
    return normalized;
  }

  return `${normalized}${normalized.includes('?') ? '&' : '?'}from=notifications`;
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

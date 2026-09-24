'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { bindSoftNavigator, ensureColdStartParent, installNavigationHistory } from '@/lib/navigation-history';
import { resolveRouteChrome } from '@/lib/route-chrome';
import { sanitizeRedirectPath } from '@/lib/session-storage';
import { ROOT_TAB_HREFS } from './shell';

/** 콜드스타트 부모 — 헤더 뒤로가기와 같은 규칙(`?from=` → route-chrome backHref). 루트 탭은 없다. */
export function resolveColdStartParent(pathname: string, search: string): string | null {
  if (ROOT_TAB_HREFS.includes(pathname)) return null;
  const from = sanitizeRedirectPath(new URLSearchParams(search).get('from'));
  if (from) return from;
  const resolved = resolveRouteChrome(pathname);
  const backHref = resolved?.chrome.backHref;
  if (!resolved || !backHref) return null;
  return typeof backHref === 'function' ? backHref(resolved.params) : backHref;
}

/** 루트 레이아웃 전용 부수효과 — 히스토리 추적 설치, 콜드스타트 부모 삽입. 항상 null. */
export function NavigationHistoryTracker() {
  const router = useRouter();

  useEffect(() => {
    installNavigationHistory();
    const unbind = bindSoftNavigator((url) => router.replace(url));
    ensureColdStartParent(resolveColdStartParent(window.location.pathname, window.location.search));
    return unbind;
  }, [router]);

  return null;
}

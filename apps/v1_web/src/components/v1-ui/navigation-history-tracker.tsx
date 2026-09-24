'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { detectNativeShell } from '@/lib/native-bridge';
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

/**
 * 부모를 끼울 진입인가 — 앱 셸 안이거나, 앱·알림이 붙인 출처(`?from=`)가 있을 때만.
 * 검색 결과 등 외부에서 곧장 들어온 웹 방문자는 끼우지 않는다(브라우저 뒤로가 원래 사이트로 가야 한다).
 */
export function isAppColdStartEntry(search: string): boolean {
  return detectNativeShell() !== null || sanitizeRedirectPath(new URLSearchParams(search).get('from')) !== null;
}

/** 루트 레이아웃 전용 부수효과 — 히스토리 추적 설치, 콜드스타트 부모 삽입. 항상 null. */
export function NavigationHistoryTracker() {
  const router = useRouter();

  useEffect(() => {
    installNavigationHistory();
    const unbind = bindSoftNavigator((url) => router.replace(url));
    const { pathname, search } = window.location;
    if (isAppColdStartEntry(search)) ensureColdStartParent(resolveColdStartParent(pathname, search));
    return unbind;
  }, [router]);

  return null;
}

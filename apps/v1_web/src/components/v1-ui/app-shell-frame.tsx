'use client';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AppChrome } from './shell';
import { resolveRouteChrome } from '@/lib/route-chrome';
import { useShellOverrideForRoute } from './shell-override';

/**
 * 셸의 유일한 마운트 지점. providers.tsx에서 {children} 자리에 끼운다 — 페이지 트리 전체의
 * 조상이므로 pathname이 바뀌어도(라우트 전환) 이 컴포넌트 자신은 리마운트되지 않고, 그
 * 아래 AppChrome도 함께 살아남는다. route-chrome.ts에 없는 경로는 children을 그대로
 * 통과시킨다 — 그 경로들은 원래도 AppChrome이 없었다.
 */
export function AppShellFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // usePathname()의 타입은 string(non-null)이지만, 실제로는 App Router 컨텍스트 없이
  // 렌더될 때(라우터 없는 컴포넌트 테스트가 <Providers>로 감싸는 경우 등) null을 돌려준다
  // — matchPattern이 그 null로 .split()을 호출해 죽는다(배치 3 통합 검증에서 실측:
  // route-chrome 테이블이 비어 있던 동안은 우연히 안 드러났을 뿐인 잠복 버그). 테이블에
  // 없는 라우트를 pass-through하는 것과 같은 취급 — null도 "매치 없음"으로 본다.
  const resolved = pathname ? resolveRouteChrome(pathname) : null;
  // Hooks 규칙: 조건부 return보다 위에서 항상 호출한다.
  const override = useShellOverrideForRoute(pathname);

  if (!resolved) return <>{children}</>;

  const { chrome, params } = resolved;
  return (
    <AppChrome
      title={override.title ?? chrome.title}
      activeTab={chrome.activeTab}
      // override.backHref가 테이블 값(정적 문자열이든 params 함수든)을 이긴다 — 검색
      // 파라미터에 따라 뒤로가기가 달라지는 라우트가 override로 넘긴 최종 문자열을 그대로
      // 쓰기 위함(shell-override.ts backHref 주석 참조). 나머지 5개 override 필드와 동일한
      // `??` 규칙이라 override가 undefined면 테이블 값으로 자동 폴백한다.
      backHref={override.backHref ?? (typeof chrome.backHref === 'function' ? chrome.backHref(params) : chrome.backHref)}
      showSearch={chrome.showSearch}
      showNotifications={chrome.showNotifications}
      bottomNav={chrome.bottomNav}
      topBar={chrome.topBar}
      desktopHead={override.desktopHead ?? chrome.desktopHead}
      centerTitle={chrome.centerTitle}
      titleAsHeading={chrome.titleAsHeading}
      floatingSlot={override.floatingSlot}
      topbarActions={override.topbarActions}
      hasNewNotification={override.hasNewNotification ?? false}
    >
      {children}
    </AppChrome>
  );
}

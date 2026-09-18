// apps/v1_web/src/lib/route-chrome/fragments/home.ts
// U25 — home 세그먼트. 정적 필드는 components/home/home-page.tsx:50-56의 <AppChrome> 호출
// 그대로 옮긴다(title/activeTab/showSearch). hasNewNotification·floatingSlot은 fetch/런타임
// 상태 의존(§1b floatingSlot 대상, app-shell-promotion.md §2.3)이라 home-page.tsx가
// useShellOverride로 직접 밀어넣는다 — 여기 테이블엔 넣지 않는다.
import type { RouteChromeEntry } from '../types';

export const HOME_ROUTES: RouteChromeEntry[] = [
  {
    pattern: '/home',
    chrome: {
      title: 'teameet',
      activeTab: 'home',
      showSearch: true,
    },
  },
];

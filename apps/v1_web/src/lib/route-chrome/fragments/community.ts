// apps/v1_web/src/lib/route-chrome/fragments/community.ts
// U34 — community(chat+notifications) 세그먼트, 3개 라우트.
//
// /chat: 3개 정적 필드(title/activeTab/bottomNav/backHref/showNotifications) 그대로 옮김,
// ChatListPageView엔 override가 필요 없다.
// /chat/:id: 채팅방 제목은 fetch 의존(model.title, §1.9 "fetch된 제목" 유형) — 여기 테이블엔
// 로딩 중 기본값만 두고, 실제 값은 ChatRoomPageView가 useShellOverride({title: model.title})로
// 매 렌더 밀어넣는다(community-page.tsx).
// /notifications: title이 ReactNode(안읽음 카운트 뱃지)라 정적 테이블(string)에 못 담고,
// topbarActions("모두 읽기" 버튼)도 인터랙티브 JSX라 둘 다 override 대상(§1.9 표,
// community-page.tsx:253-259 실측) — NotificationsPageView가 useShellOverride로 밀어넣는다.
import type { RouteChromeEntry } from '../types';

export const COMMUNITY_ROUTES: RouteChromeEntry[] = [
  {
    pattern: '/chat',
    chrome: { title: '채팅', activeTab: 'my', bottomNav: false, backHref: '/home', showNotifications: false },
  },
  {
    pattern: '/chat/:id',
    chrome: { title: '채팅', activeTab: 'my', bottomNav: false, backHref: '/chat', showNotifications: false },
  },
  {
    pattern: '/notifications',
    chrome: { title: '알림', activeTab: 'my', bottomNav: false, backHref: '/home', showNotifications: false },
  },
];

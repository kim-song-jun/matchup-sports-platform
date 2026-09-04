// apps/v1_web/src/lib/route-chrome/fragments/misc.ts
// U26 — events/notices/search/users 세그먼트. docs/design/app-motion-wave-plan.md §2.25~2.38.

import type { RouteChromeEntry } from '../types';

export const MISC_ROUTES: RouteChromeEntry[] = [
  { pattern: '/events', chrome: { title: '이벤트', activeTab: 'tournaments', showNotifications: true } },

  { pattern: '/notices', chrome: { title: '공지사항', activeTab: 'home', bottomNav: false, backHref: '/home' } },
  { pattern: '/notices/:id', chrome: { title: '공지사항', activeTab: 'home', bottomNav: false, backHref: '/notices' } },

  // 검색은 5개 탭 어디에도 속하지 않는다 — activeTab을 절대 넣지 않는다(app-shell-promotion.md
  // §4 R6, shell.tsx: activeTab 미지정 시 활성 탭 없음. 잘못 지정하면 엉뚱한 탭이 활성으로 보인다).
  {
    pattern: '/search',
    chrome: { title: '검색', topBar: false, showSearch: false, showNotifications: false, bottomNav: true },
  },
  {
    pattern: '/search/new',
    chrome: { title: '검색', topBar: false, showSearch: false, showNotifications: false, bottomNav: true },
  },

  { pattern: '/users/:id', chrome: { title: '프로필', activeTab: 'teams', bottomNav: false, backHref: '/teams', desktopHead: true } },
  {
    pattern: '/users/:id/card',
    chrome: {
      title: '선수 카드',
      activeTab: 'my',
      bottomNav: false,
      backHref: (p) => `/users/${p.id}`,
      desktopHead: true,
    },
  },
  // 로딩/에러 분기의 기본 제목. 닉네임이 오면 UserRecordsPageClient가
  // useShellOverride({ title })로 "OO 님의 활동 기록"으로 덮어쓴다
  // (app-shell-promotion.md §1.9 "fetch된 제목" 패턴).
  {
    pattern: '/users/:id/records',
    // /users/:id · /card 와 같이 하단 내비를 숨긴다 — 이 항목만 남아 있었다(2026-09-04 감사).
    chrome: { title: '활동 기록', activeTab: 'teams', bottomNav: false, backHref: (p) => `/users/${p.id}`, desktopHead: true },
  },
];

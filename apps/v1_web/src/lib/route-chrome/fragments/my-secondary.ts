// apps/v1_web/src/lib/route-chrome/fragments/my-secondary.ts
// U38 — my-secondary(문의/내 리그/담당 경기/담당 대회 운영/팀 컨택함/휴대폰 본인인증).
//
// 6개 파일 중 my-staff-fixtures-client.tsx 하나만 동적 제목이다 — 대회명이 fetch
// (`GET /me/tournament-staff`) 의존이라 로딩/배정없음 상태에서는 "담당 경기" 기본값을
// 쓰고, 배정을 찾으면 MyStaffFixturesPageClient가 useShellOverride로 실제 대회명으로
// 덮어쓴다(app-shell-promotion.md §1.9 "fetch된 제목" 패턴, misc.ts의
// /users/:id/records 선례와 동일 구조). 나머지 5개 파일은 전부 정적 title이다.
import type { RouteChromeEntry } from '../types';

export const MY_SECONDARY_ROUTES: RouteChromeEntry[] = [
  { pattern: '/my/inquiries', chrome: { title: '문의', activeTab: 'my', bottomNav: false, backHref: '/my', desktopHead: true } },
  {
    pattern: '/my/inquiries/new',
    chrome: { title: '문의하기', activeTab: 'my', bottomNav: false, backHref: '/my/inquiries', desktopHead: true },
  },
  {
    pattern: '/my/inquiries/:id',
    chrome: { title: '문의 상세', activeTab: 'my', bottomNav: false, backHref: '/my/inquiries', desktopHead: true },
  },

  { pattern: '/my/leagues', chrome: { title: '내 리그', activeTab: 'tournaments', backHref: '/my' } },

  {
    pattern: '/my/tournament-staff',
    chrome: { title: '담당 대회 운영', activeTab: 'my', bottomNav: false, backHref: '/my', desktopHead: true },
  },
  // 로딩/배정없음 상태의 기본 제목. 배정을 찾으면 MyStaffFixturesPageClient가
  // useShellOverride({ title })로 실제 대회명("OO 대회")으로 덮어쓴다.
  {
    pattern: '/my/tournament-staff/:tournamentId',
    chrome: { title: '담당 경기', activeTab: 'my', bottomNav: false, backHref: '/my/tournament-staff', desktopHead: true },
  },

  {
    pattern: '/my/team-contacts',
    chrome: { title: '팀 컨택함', activeTab: 'my', bottomNav: false, backHref: '/my', desktopHead: true },
  },
  {
    pattern: '/my/team-contacts/:contactId',
    chrome: { title: '컨택 상세', activeTab: 'my', bottomNav: false, backHref: '/my/team-contacts', desktopHead: true },
  },

  {
    pattern: '/my/phone-verify',
    chrome: { title: '휴대폰 본인인증', activeTab: 'my', bottomNav: false, backHref: '/my', desktopHead: true },
  },
];

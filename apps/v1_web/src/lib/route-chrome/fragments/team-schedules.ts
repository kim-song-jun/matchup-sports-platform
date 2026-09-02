// apps/v1_web/src/lib/route-chrome/fragments/team-schedules.ts
// U30 — team-schedules(teams+my 교차) 5개 라우트.
//
// components/team-schedules/team-schedules-page.tsx 하나가 두 세그먼트(teams, my)에
// 걸쳐 4개 뷰(목록/상세/폼/내일정)를 그린다(app-motion-wave-plan.md §0.4-4). 폼 뷰
// (ScheduleFormPageView)는 mode('create'|'edit')가 fetch가 아니라 **어느 라우트로
// 들어왔는지**로만 정해진다(new/page.tsx는 scheduleId 없이, edit/page.tsx는 scheduleId를
// 넘겨 호출) — 그래서 title/backHref가 "동적"처럼 보여도 override 없이 라우트 2개로
// 쪼개는 것만으로 전부 정적 테이블로 표현된다.
import type { RouteChromeEntry } from '../types';

export const TEAM_SCHEDULES_ROUTES: RouteChromeEntry[] = [
  {
    // 목록 — floatingSlot(일정 만들기 FAB)은 model.canManage(팀 상세 fetch 의존) 런타임 값이라
    // 여기 테이블엔 안 넣는다. ScheduleListPageView가 useShellOverride로 직접 밀어넣는다
    // (app-shell-promotion.md §2.3 하위웨이브 1b floatingSlot 대상 6곳 중 하나).
    pattern: '/teams/:id/schedules',
    chrome: {
      title: '팀 일정',
      activeTab: 'teams',
      bottomNav: false,
      backHref: (p) => `/teams/${p.id}`,
    },
  },
  {
    // 상세 — loading/error 분기는 제너릭 desktop head를 쓰지만, success 분기는 자기
    // `.tm-desktop-page-head`를 직접 그려 desktopHead를 꺼야 한다(§1.9 표 R3 패턴,
    // team-schedules-page.tsx:224,232 desktopHead 있음 vs :241 없음). 테이블엔 loading/error와
    // 같은 안전한 기본값(true)을 넣고, success 분기가 useShellOverride({ desktopHead: false })로
    // 덮어쓴다.
    pattern: '/teams/:id/schedules/:scheduleId',
    chrome: {
      title: '일정 상세',
      activeTab: 'teams',
      bottomNav: false,
      backHref: (p) => `/teams/${p.id}/schedules`,
      desktopHead: true,
    },
  },
  {
    // 일정 만들기 — /schedules/new. literal 세그먼트 3개(teams/schedules/new)라
    // `/teams/:id/schedules/:scheduleId`(literal 2개)보다 우선 매치된다(matcher.ts
    // literalSegmentCount 정렬).
    pattern: '/teams/:id/schedules/new',
    chrome: {
      title: '일정 만들기',
      activeTab: 'teams',
      bottomNav: false,
      backHref: (p) => `/teams/${p.id}/schedules`,
      desktopHead: true,
    },
  },
  {
    // 일정 수정 — /schedules/:scheduleId/edit. literal 세그먼트 3개(teams/schedules/edit)라
    // 상세 패턴과 세그먼트 수(5)가 같아도 더 구체적인 쪽으로 매치된다.
    pattern: '/teams/:id/schedules/:scheduleId/edit',
    chrome: {
      title: '일정 수정',
      activeTab: 'teams',
      bottomNav: false,
      backHref: (p) => `/teams/${p.id}/schedules/${p.scheduleId}`,
      desktopHead: true,
    },
  },
  {
    // 내 일정 — MySchedulePageView, /my/schedule. teams가 아니라 my 세그먼트 URL이지만
    // 파일이 하나라 유닛도 하나(§0.4-4). 완전 정적 — 분기별 props 차이 없음.
    pattern: '/my/schedule',
    chrome: {
      title: '내 일정',
      activeTab: 'my',
      bottomNav: false,
      backHref: '/my',
    },
  },
];

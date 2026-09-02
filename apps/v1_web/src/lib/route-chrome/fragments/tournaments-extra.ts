// apps/v1_web/src/lib/route-chrome/fragments/tournaments-extra.ts
// U33 — /tournaments/:id 아래 부가 화면(참가 신청/경기 기록/내 신청/선수 명단/참가팀 후기).
// 5개 파일 전부 loading/error/success 분기가 동일한 AppChrome props를 넘긴다(정적) —
// 유일한 예외는 backHref다: apply/my 두 파일은 원래 코드에서 backHref가 URL 쿼리 파라미터
// (`?team=`, `?reg=`)에 따라 두 값 중 하나로 갈렸다. 아래 값은 그 쿼리 파라미터가 없는
// 기본 진입 상태(가장 흔한 경로 — 대회 상세에서 "참가 신청" 버튼 / "내 신청" 진입)를 위한
// 것이고, `?team=`/`?reg=`가 있는 경우의 `/tournaments/:id/my`는 각 클라이언트 컴포넌트가
// useShellOverride({ backHref })로 직접 밀어넣는다(ShellOverride.backHref, shell-override.ts) —
// route-chrome은 pathname(+경로 파라미터)만 보고 검색 파라미터는 못 보므로 이 테이블 자체에
// 그 분기를 넣을 수 없다.
import type { RouteChromeEntry } from '../types';

export const TOURNAMENTS_EXTRA_ROUTES: RouteChromeEntry[] = [
  {
    pattern: '/tournaments/:id/apply',
    chrome: {
      title: '참가 신청',
      activeTab: 'tournaments',
      bottomNav: false,
      backHref: (p) => `/tournaments/${p.id}`,
      desktopHead: true,
    },
  },
  {
    pattern: '/tournaments/:id/matches/:fixtureId',
    chrome: {
      title: '경기 기록',
      activeTab: 'tournaments',
      backHref: (p) => `/tournaments/${p.id}/bracket`,
      desktopHead: true,
    },
  },
  {
    pattern: '/tournaments/:id/my',
    chrome: {
      title: '내 신청',
      activeTab: 'tournaments',
      backHref: (p) => `/tournaments/${p.id}`,
      desktopHead: true,
    },
  },
  {
    pattern: '/tournaments/:id/registrations/:registrationId/roster',
    chrome: {
      title: '선수 명단',
      activeTab: 'tournaments',
      backHref: (p) => `/tournaments/${p.id}/my`,
      desktopHead: true,
    },
  },
  {
    pattern: '/tournaments/:id/reviews',
    chrome: {
      title: '참가팀 후기',
      activeTab: 'tournaments',
      backHref: (p) => `/tournaments/${p.id}/awards`,
      desktopHead: true,
    },
  },
];

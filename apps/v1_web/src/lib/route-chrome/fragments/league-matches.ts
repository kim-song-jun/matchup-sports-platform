// apps/v1_web/src/lib/route-chrome/fragments/league-matches.ts
// U31 — 리그 4개 라우트, 전부 정적(fetch 의존 title 없음) — useShellOverride 불필요.
//
// activeTab은 4곳 전부 'tournaments' — 리그는 대회의 한 종류로 통합된 설계다
// (components/v1-ui/shell.tsx 상단 주석 근거, 하단 탭은 6→5로 합쳤고 리그는
// CompetitionKindSegment로만 진입). 임의로 별도 탭을 두지 않는다.
import type { RouteChromeEntry } from '../types';

export const LEAGUE_MATCHES_ROUTES: RouteChromeEntry[] = [
  // 목록 — 원래 셸 밖의 맨 div라 하단 내비가 없었다(app/league-matches/page.tsx 기존 주석).
  { pattern: '/league-matches', chrome: { title: '정규 리그', activeTab: 'tournaments', showNotifications: true } },
  {
    // 리그 상세(순위표) — /league-matches 목록은 이제 순수 redirect(→ /tournaments?kind=league)
    // 라 그리로 되짚어 보내지 않는다. 딥링크로 바로 들어와도 통합 목록으로 나갈 수 있게 고정.
    pattern: '/league-matches/:leagueId',
    chrome: { title: '정규 리그', activeTab: 'tournaments', backHref: '/tournaments?kind=league', desktopHead: true },
  },
  {
    pattern: '/league-matches/:leagueId/fixtures/:fixtureId',
    chrome: {
      title: '리그 경기',
      activeTab: 'tournaments',
      backHref: (p) => `/league-matches/${p.leagueId}`,
      desktopHead: true,
    },
  },
  {
    pattern: '/league-matches/:leagueId/awards',
    chrome: {
      title: '시즌 결산',
      activeTab: 'tournaments',
      backHref: (p) => `/league-matches/${p.leagueId}`,
      desktopHead: true,
    },
  },
];

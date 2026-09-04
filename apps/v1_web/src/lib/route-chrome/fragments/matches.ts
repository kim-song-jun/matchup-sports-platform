// apps/v1_web/src/lib/route-chrome/fragments/matches.ts
// U27 — matches 세그먼트. 정적 필드는 components/matches/matches-page.tsx와
// app/matches/[id]/applications/client.tsx의 <AppChrome> 호출 그대로 옮긴다.
//
// 목록 뷰(/matches)의 floatingSlot(매치 만들기 FAB)은 §1b floatingSlot 대상이라 여기 테이블엔
// 넣지 않는다 — MatchListPageView가 useShellOverride로 직접 밀어넣는다.
//
// MatchStatePageView(에러 공유 뷰, /matches·/matches/:id 두 라우트에서 재사용)의 title도
// 마찬가지로 override 대상이다(app-shell-promotion.md §1.9 "공유 에러 뷰" 절 — 여러 라우트에서
// 재사용돼도 override는 pathname 기준으로 동작하므로 문제 없음). 다만 그 절이 다루지 않은
// 실측 차이가 하나 있었다: /matches/:id에서 원래 MatchDetailPageView(성공)는 topBar=false를
// 쓰지만 MatchStatePageView(에러)는 topBar를 지정하지 않아(기본값 true) 제너릭 헤더의
// 뒤로가기에 기대고 있었다 — 정적 테이블 한 줄은 두 분기 모두에 적용되므로 topBar는
// override 대상이 아닌 이 라우트의 고정값이어야 한다. 주 소비자(상세 화면)를 기준으로
// topBar:false를 택하고, MatchStatePageView 쪽에 모바일 전용 뒤로가기를 직접 그려 넣어
// 모바일에서 내비게이션이 사라지는 회귀를 막았다(matches-page.tsx MatchStatePageView 참조).
import type { RouteChromeEntry } from '../types';

export const MATCHES_ROUTES: RouteChromeEntry[] = [
  // 목록 — matches-page.tsx:103-108(MatchListPageView). floatingSlot은 override.
  { pattern: '/matches', chrome: { title: '매치', activeTab: 'matches', topBar: false } },
  // 상세 — matches-page.tsx:277(MatchDetailPageView, 이 라우트의 주 소비자). 자체 히어로가
  // topBar/bottomNav를 모두 끄고 모바일 back·홈 버튼을 직접 그린다.
  { pattern: '/matches/:id', chrome: { title: '매치', activeTab: 'matches', bottomNav: false, topBar: false } },
  // 신청자 관리 — app/matches/[id]/applications/client.tsx:50,62,124. 3분기 전부 동일 정적 props.
  {
    pattern: '/matches/:id/applications',
    chrome: {
      title: '신청자 관리',
      activeTab: 'matches',
      bottomNav: false,
      backHref: (p) => `/matches/${p.id}`,
    },
  },
  // 매치 수정 — matches-page.tsx:486(MatchCreatePageView, edit=true 분기).
  {
    pattern: '/matches/:id/edit',
    chrome: {
      title: '매치 수정',
      activeTab: 'matches',
      bottomNav: false,
      backHref: (p) => `/matches/${p.id}`,
    },
  },
  // 매치 만들기 3단계 — matches-page.tsx:486(MatchCreatePageView, edit=false 분기).
  // 물리적으로 서로 다른 라우트 3개(app/matches/new/{sport,place-time,confirm}/page.tsx)라
  // 각각 등록한다 — 3곳 다 동일한 정적 props.
  // 2단계(매치 정보)는 /matches/new 자체다. 등록이 빠져 있으면 세그먼트 수가 같은 /matches/:id 에
  // 걸려 topBar:false 를 물려받아 모바일 상단바·뒤로가기가 사라졌다(2026-09-04 alpha 감사).
  { pattern: '/matches/new', chrome: { title: '매치 만들기', activeTab: 'matches', bottomNav: false, backHref: '/matches' } },
  { pattern: '/matches/new/sport', chrome: { title: '매치 만들기', activeTab: 'matches', bottomNav: false, backHref: '/matches' } },
  { pattern: '/matches/new/place-time', chrome: { title: '매치 만들기', activeTab: 'matches', bottomNav: false, backHref: '/matches' } },
  { pattern: '/matches/new/confirm', chrome: { title: '매치 만들기', activeTab: 'matches', bottomNav: false, backHref: '/matches' } },
];

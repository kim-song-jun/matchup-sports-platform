// apps/v1_web/src/lib/route-chrome/fragments/tournaments-core.ts
// U32 — tournaments-core: 목록/상세/일정/브래킷/최종결과/시상 6패턴.
// docs/design/app-shell-promotion.md 부록 A TOURNAMENTS_ROUTES(7패턴, list/detail/
// schedule/bracket/results/awards/campaigns)를 시드로, 실제 파일을 직접 열어 확인한
// 값으로 채웠다. campaigns는 U32 시점엔 backHref가 검색 파라미터 의존이라 제외했으나,
// ShellOverride(shell-override.ts)에 backHref 필드가 추가된 후속 유닛에서 등록했다
// (아래 마지막 엔트리 주석 참조).
import type { RouteChromeEntry } from '../types';

export const TOURNAMENTS_CORE_ROUTES: RouteChromeEntry[] = [
  { pattern: '/tournaments', chrome: { title: '대회', activeTab: 'tournaments', showNotifications: true } },
  {
    // 로딩/에러 분기의 안전한 기본값. success 분기(tournament-detail-client.tsx)가
    // useShellOverride({ title: data.title, desktopHead: false, floatingSlot: <ApplyCTA/> })로
    // 덮어쓴다(§1.9 표 "fetch된 제목" + "커스텀 데스크톱 헤더" 하위유형 결합).
    // 같은 pathname 패턴을 tournaments/[id]/not-found.tsx도 그대로 재사용한다 — not-found는
    // notFound()가 던져진 그 URL 그대로 렌더되므로 pathname이 실제 페이지와 동일하다
    // (§2.25~2.38 공통 절차 6번, 자체 AppChrome 제거). 계획 문서가 "4개"라 적은 not-found
    // 중 이 패턴을 공유하는 건 [id]/schedule/bracket/results 4개 — campaigns(맨 아래 별도
    // 패턴)는 검색 파라미터 backHref 계약 때문에 후속 유닛에서 등록했고, reviews는 U33
    // (tournaments-extra)가 자기 페이지와 함께 등록할 몫이라 이 유닛에서 건드리지 않는다.
    pattern: '/tournaments/:id',
    chrome: {
      title: '대회 상세',
      activeTab: 'tournaments',
      bottomNav: false,
      backHref: '/tournaments',
      desktopHead: true,
    },
  },
  {
    // success 분기가 useShellOverride({ title: `${제목} 경기 일정` })로 덮어씀
    // (schedule-page-client.tsx). desktopHead는 3분기 모두 동일(true)이라 override 불필요.
    // tournaments/[id]/schedule/not-found.tsx도 이 패턴을 재사용한다.
    pattern: '/tournaments/:id/schedule',
    chrome: {
      title: '경기 일정',
      activeTab: 'tournaments',
      backHref: (p) => `/tournaments/${p.id}`,
      desktopHead: true,
    },
  },
  {
    // bracket-page-client.tsx는 로딩/에러/성공 3분기 전부 동일 정적 props라 override가
    // 필요 없다. tournaments/[id]/bracket/not-found.tsx도 이 패턴을 재사용한다.
    pattern: '/tournaments/:id/bracket',
    chrome: {
      title: '순위·브래킷',
      activeTab: 'tournaments',
      backHref: (p) => `/tournaments/${p.id}`,
      desktopHead: true,
    },
  },
  {
    // results-page-client.tsx도 3분기 전부 동일 정적 props. tournaments/[id]/results/
    // not-found.tsx도 이 패턴을 재사용한다.
    pattern: '/tournaments/:id/results',
    chrome: {
      title: '최종결과',
      activeTab: 'tournaments',
      backHref: (p) => `/tournaments/${p.id}/bracket`,
      desktopHead: true,
    },
  },
  {
    // awards-page-client.tsx도 3분기 전부 동일 정적 props. U16(이미지 전환)이 이 파일에
    // 의존하므로 이 유닛이 먼저 완료돼야 한다(app-motion-wave-plan.md §0.4-5).
    pattern: '/tournaments/:id/awards',
    chrome: {
      title: '시상·리뷰',
      activeTab: 'tournaments',
      backHref: (p) => `/tournaments/${p.id}/results`,
      desktopHead: true,
    },
  },
  {
    // campaigns/[slug]/page.tsx는 ?from=events&sport=... 검색 파라미터에 따라 backHref를
    // 동적으로 계산한다(이벤트 허브에서 들어온 방문자의 뒤로가기 보존, page.test.tsx
    // "preserves a safe events filter in the campaign back link"가 계약 실측 확인).
    // 이 테이블의 backHref는 라우트 파라미터 함수만 지원하고 검색 파라미터는 못 받으므로
    // 여기 static 값은 "?from=events가 아닐 때"의 기본값(원래도 '/tournaments'였다)만
    // 담당하고, 실제 페이지는 매번 CampaignChromeBridge(campaign-chrome-bridge.tsx)의
    // useShellOverride({ backHref })로 계산된 최종 문자열을 덮어쓴다(app-shell-frame.tsx의
    // override.backHref ?? table 우선순위) — U32 시점엔 ShellOverride에 backHref 필드가
    // 없어 이 등록 자체가 불가능했다(이 fragment 상단 주석 참조).
    // not-found.tsx는 검색 파라미터가 없는 화면이라 override 없이 이 정적 값을 그대로
    // 쓴다 — title/backHref/showNotifications/desktopHead 5개 필드가 마이그레이션 전
    // not-found.tsx의 자체 AppChrome 값과 완전히 동일하므로 회귀가 없다.
    pattern: '/tournaments/campaigns/:slug',
    chrome: {
      title: '대회 캠페인',
      activeTab: 'tournaments',
      backHref: '/tournaments',
      showNotifications: false,
      desktopHead: true,
    },
  },
];

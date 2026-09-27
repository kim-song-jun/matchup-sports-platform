// apps/v1_web/src/lib/route-chrome/types.ts
// route-chrome 테이블/매처 공용 타입 — docs/design/app-shell-promotion.md §1.3 그대로 이식.

export type RouteParams = Record<string, string>;

/** pathname만으로(또는 라우트 파라미터로) 결정되는, fetch 없이 아는 값. */
export type RouteChromeConfig = {
  title: string; // ReactNode 아님 — 동적 제목은 shell-override로 (설계 문서 §1.6)
  activeTab?: import('@/components/v1-ui/shell').V1NavTab;
  backHref?: string | ((params: RouteParams) => string); // 라우트 파라미터 조합 허용
  showSearch?: boolean;
  showNotifications?: boolean;
  bottomNav?: boolean;
  topBar?: boolean;
  /**
   * 미지정이면 **제너릭 desktop head 를 그리지 않는다** — `shell.tsx` 의 기본값이 `false`
   * 다(`app-shell-frame.tsx` 가 `override.desktopHead ?? chrome.desktopHead` 로 넘기므로
   * 여기가 undefined 면 그 기본값이 적용된다). 예전 주석은 반대로 "제너릭 head 사용"이라고
   * 적혀 있었는데 코드와 어긋난 서술이었다(2026-09-01 alpha 실측으로 확인 — desktopHead 를
   * 명시하지 않은 목록 라우트들에서 헤더가 렌더되지 않았다). 설계 문서 §4 R3 참조.
   */
  desktopHead?: boolean;
  centerTitle?: boolean;
  titleAsHeading?: boolean;
  /**
   * 페이지가 모든 폭에서 보이는 자기 h1 을 그린다 — 셸은 제목을 h1 로 그리지 않는다(모양은 같다).
   * 셸의 desktop head 는 1024px 미만에서 display:none 이라, 제목을 셸에만 두면 모바일
   * 스크린리더에 h1 이 없다. 둘 다 h1 이면 크롤러가 받는 HTML 에 h1 이 두 개가 된다.
   */
  pageOwnsHeading?: boolean;
};

export type RouteChromeEntry = { pattern: string; chrome: RouteChromeConfig };

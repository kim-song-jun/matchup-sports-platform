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
};

export type RouteChromeEntry = { pattern: string; chrome: RouteChromeConfig };

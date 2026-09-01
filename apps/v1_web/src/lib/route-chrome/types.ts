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
  desktopHead?: boolean; // 기본값 = "제너릭 desktop head 사용" (설계 문서 §4 R3)
  centerTitle?: boolean;
  titleAsHeading?: boolean;
};

export type RouteChromeEntry = { pattern: string; chrome: RouteChromeConfig };

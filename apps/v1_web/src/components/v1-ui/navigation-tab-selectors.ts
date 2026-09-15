/**
 * "탭"으로 취급하는 그룹의 단일 소스.
 *
 * 전환(use-navigation-intent.ts)은 **컨테이너**로, 스크롤 복원(scroll-restoration.tsx)은
 * **항목**으로 판별한다. 두 목록을 각자 하드코딩하면 한쪽만 늘어나고 그 순간 결함이 된다 —
 * 실제로 `.tm-desktop-nav-tab` 이 스크롤 쪽에만 있고 전환 쪽에는 없어서, 데스크톱 상단 탭과
 * 화면 안 세부 탭이 전부 'push' 로 잡혀 **전환 제거 CSS 가 한 번도 발화하지 않았다**.
 *
 * 그래서 그룹을 한 곳에 적고 두 셀렉터를 거기서 파생시킨다. 새 탭 그룹은 여기 한 줄만
 * 더하면 양쪽에 동시에 반영된다 — 주석으로 "같은 집합을 유지하라"고 부탁하는 대신,
 * 갈라질 수 없게 만든다.
 */
const TAB_GROUPS = [
  /** 모바일 하단 플로팅 탭바 (shell.tsx) */
  { container: 'tm-bottom-nav', item: 'tm-bottom-tab' },
  /** 데스크톱 상단 내비 탭 (shell.tsx) */
  { container: 'tm-desktop-nav-tabs', item: 'tm-desktop-nav-tab' },
  /** 화면 안 세부 탭 — 대회 구분·매치 종류·리뷰 등 (segmented-tabs.tsx) */
  { container: 'tm-segmented-tabs', item: 'tm-segmented-tab' },
  /**
   * 어드민 사이드바 최상위 섹션 전환 (admin-shell.tsx, MOTION-2).
   * 사이드바 항목 전부가 이미 최상위 목적지다(대회 관리 상세처럼 "더 깊이 들어가는"
   * 진입은 사이드바 자체엔 없다 — 그런 진입은 그 목적지 화면 안의 리스트 행 클릭으로
   * 일어나고 이 그룹 밖이다) — 병렬 뷰 전환이지 스택이 아니므로 다른 탭 그룹과 같은
   * 원칙(C안: 탭은 페이지가 아니다, 슬라이드 없음)을 적용한다.
   */
  { container: 'tm-admin-sidebar-nav', item: 'tm-admin-sidebar-link' },
] as const;

/** 클릭한 앵커의 조상에서 찾는다 — 이 안이면 'tab' 이동이다. */
export const TAB_CONTAINER_SELECTOR = TAB_GROUPS.map((g) => `.${g.container}`).join(', ');

/** 클릭한 앵커 자신(또는 가장 가까운 항목)에서 찾는다 — 이 클래스면 스크롤을 복원한다. */
export const TAB_LINK_SELECTOR = TAB_GROUPS.map((g) => `.${g.item}`).join(', ');

'use client';
import { useLayoutEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export type ShellOverride = {
  title?: ReactNode;
  floatingSlot?: ReactNode;
  topbarActions?: ReactNode;
  hasNewNotification?: boolean;
  desktopHead?: boolean;
  // 검색 파라미터(`?from=events&sport=...`)에 따라 뒤로가기 목적지가 달라지는 라우트용.
  // route-chrome 테이블의 backHref는 라우트 파라미터 함수만 받고 검색 파라미터는 못
  // 받는다(RouteChromeConfig['backHref'], lib/route-chrome/types.ts) — 이 필드가 그
  // 간극을 메운다. 다른 override 필드와 동일하게 `??` 병합(app-shell-frame.tsx)이라
  // "명시적으로 undefined"와 "필드 자체가 없음"을 구분하지 않는다 — 즉 override로
  // 테이블의 backHref를 "뒤로가기 버튼 없음"으로 지울 수는 없다. 다른 5개 필드도 같은
  // 제약을 이미 갖고 있으므로(title을 override로 "제목 없음"으로 만들 수 없는 것과 동일)
  // 이 필드만 예외를 두지 않는다 — 필요해지면 그때 5개 필드 전체를 함께 재설계한다.
  backHref?: string;
};

type Snapshot = { pathname: string; override: ShellOverride };
const EMPTY: Snapshot = { pathname: '', override: {} };

let current: Snapshot = EMPTY;
const listeners = new Set<() => void>();

function setOverride(next: Snapshot) {
  current = next;
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function getSnapshot() { return current; }
// 서버는 요청마다 다른 값을 볼 수 없다 — 모듈 스코프 store는 같은 Node 프로세스가 처리하는
// 여러 동시 요청이 공유하므로, 여기서 실제 override를 읽으면 사용자 A의 대회명이 사용자
// B의 SSR HTML에 새는 교차 요청 오염이 생긴다. 그래서 SSR은 항상 빈 스냅숏만 보고 테이블의
// title이 첫 페인트에 쓰인다 — 이 라우트들의 실제 fetch는 오늘도 클라이언트 전용(React
// Query)이므로 승격 전/후 SSR 결과는 동일하다(회귀 아님).
function getServerSnapshot() { return EMPTY; }

/** 페이지가 커밋된 뒤, 페인트 전에 셸의 동적 제목/액션을 반영한다.
 * 렌더 도중 store 구독자(조상)를 갱신하면 React 경고와 중단된 렌더의 값 누출이 생긴다.
 * children 참조는 셸의 store 갱신으로 바뀌지 않아 페이지를 다시 렌더하지 않는다.
 */
export function useShellOverride(override: ShellOverride): void {
  const pathname = usePathname();
  useLayoutEffect(() => {
    const snapshot = { pathname, override };
    setOverride(snapshot);
    return () => {
      // 다른 페이지가 이미 게시한 값을 이전 페이지의 cleanup이 지우지 않는다.
      if (current === snapshot) setOverride(EMPTY);
    };
  });
}

/** AppShellFrame 전용 판독. pathname이 안 맞으면(=다른 라우트가 남긴 값) 빈 override로
 *  취급한다 — 별도 "리셋" effect 없이 라우트 전환 순간 자동으로 정리되는 이유. */
export function useShellOverrideForRoute(pathname: string): ShellOverride {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return snapshot.pathname === pathname ? snapshot.override : {};
}

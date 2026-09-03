'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useNavigationIntent, type NavigationIntentKind } from './use-navigation-intent';

const MAX_PENDING_MS = 150;
// ↑ VT 콜백 프로미스가 pending인 동안 브라우저는 "old" 스냅샷을 정지 화면으로 보여준다
//   (RouteProgressBar를 포함해 화면 전체가 그 순간엔 갱신되지 않는다 — app-motion-system.md §2.5).
//   그래서 데이터 로딩 완료까지 기다리지 않고, "새 template.tsx 인스턴스가 마운트됐다"
//   (=스켈레톤이든 콘텐츠든 뭔가 화면에 걸렸다) 시점에 즉시 resolve한다. 그게 이 시간보다
//   오래 걸리면(느린 디바이스·JS 파싱 지연) 타임아웃으로 강제 종료 — "정지 화면"이 150ms를
//   넘기지 않게 하는 상한이다. 값 자체는 새 토큰이 아니라 이 컨트롤러 전용 상수로 둔다 —
//   duration 토큰(tokens.css)은 "재생되는 애니메이션 길이"고 이건 "얼마나 기다릴지"라 성격이 다르다.

/**
 * 라우트 전환 시 View Transitions API를 시작/종료하는 컨트롤러.
 * `useNavigationIntent`로 push/pop/tab을 판별해 `document.startViewTransition()`을 걸고,
 * `template.tsx`가 새로 마운트되는 시점(pathname 변경 커밋)에 즉시 resolve한다 — 데이터
 * 도착까지 기다리면 "정지 화면"이 길어져 진행바까지 얼어붙는다(app-motion-system.md §2.5).
 * VT 미지원 환경(구형 Android WebView, iOS 16/17)에서는 `data-nav-kind`만 설정하고 그친다 —
 * `template.tsx`의 `.tm-page-transition-enter` CSS keyframe이 마운트 시 자동 재생된다(§2.6).
 */
export function PageTransitionController() {
  const pathname = usePathname();
  const resolveRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRender = useRef(true);

  const settlePending = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    resolveRef.current?.();
    resolveRef.current = null;
  };

  const beginTransition = (kind: NavigationIntentKind) => {
    if (typeof document === 'undefined') return;
    // 같은 pathname 안에서 검색 파라미터만 바뀌는 이동(필터 시트·칩·페이지네이션)은
    // template.tsx 가 리마운트되지 않는다 — VT 를 걸면 resolve 신호가 영영 안 와 MAX_PENDING_MS
    // 동안 old 스냅샷이 정지 화면으로 남는다(Copilot 2차). kind 만 심고 전환은 걸지 않는다.
    if (kind === 'search') {
      document.documentElement.dataset.navKind = kind;
      return;
    }
    if (typeof document.startViewTransition !== 'function') {
      // 미지원 웹뷰 — CSS 폴백이 template.tsx 마운트 시 자동 재생되므로 여기선 아무것도 안 한다.
      document.documentElement.dataset.navKind = kind;
      return;
    }
    // 직전 전환이 아직 pending이면(연타 네비게이션) 먼저 정리 — 고아 프로미스가 남으면
    // 다음 startViewTransition() 호출이 브라우저에 따라 무시되거나 대기열에 쌓인다.
    settlePending();

    document.documentElement.dataset.navKind = kind;
    document.startViewTransition(
      () =>
        new Promise<void>((resolve) => {
          resolveRef.current = resolve;
          timeoutRef.current = setTimeout(settlePending, MAX_PENDING_MS);
        })
    );
  };

  useNavigationIntent({ onIntent: beginTransition });

  // template.tsx가 새로 마운트되면(=pathname 변경이 커밋됨) pending VT를 즉시 resolve.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    settlePending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}

'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * 목록 끝에 둘 감시자(sentinel). 그 요소가 화면에 들어오면 `onReachEnd` 를 부른다.
 *
 * `scroll` 이벤트 + `getBoundingClientRect` 대신 `IntersectionObserver` 를 쓰는 이유:
 * 스크롤 핸들러는 매 프레임 레이아웃을 강제로 다시 계산하게 만들고(이 앱은 카드가
 * 20개씩 쌓인다), 이 저장소의 스크롤 컨테이너가 `window` 가 아니라 `.tm-scroll-area`
 * 라서 어느 요소에 리스너를 걸지도 화면마다 달라진다. observer 는 조상 중 실제
 * 스크롤 컨테이너를 알아서 찾는다(root: null = 가장 가까운 스크롤 조상 기준).
 */
export function useInfiniteScroll({
  enabled,
  onReachEnd,
  /** 화면 아래 이만큼 남았을 때 미리 부른다 — 바닥에 닿고 나서 부르면 빈 화면이 보인다. */
  rootMargin = '400px',
}: {
  enabled: boolean;
  onReachEnd: () => void;
  rootMargin?: string;
}) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  // 콜백은 렌더마다 새로 만들어지므로 ref 로 최신 값만 들고 간다 — 의존성에 넣으면
  // observer 가 매 렌더 해제·재생성되고, 그 사이에 교차 이벤트가 통째로 유실된다.
  const callbackRef = useRef(onReachEnd);
  callbackRef.current = onReachEnd;

  const setNode = useCallback((node: HTMLDivElement | null) => {
    nodeRef.current = node;
  }, []);

  useEffect(() => {
    const node = nodeRef.current;
    if (!enabled || node === null) return;
    if (typeof IntersectionObserver !== 'function') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) callbackRef.current();
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // `enabled` 가 바뀔 때(다음 페이지가 생겼거나 로딩이 끝났을 때) 다시 건다 —
    // 감시자가 이미 화면 안에 있는 상태에서도 재관찰하면 즉시 한 번 더 발화한다.
  }, [enabled, rootMargin]);

  return setNode;
}

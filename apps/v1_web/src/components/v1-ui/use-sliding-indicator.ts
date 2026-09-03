'use client';
import { useLayoutEffect, useState, type RefObject } from 'react';

export interface SlidingIndicatorRect {
  left: number;
  width: number;
}

/**
 * 폭이 서로 다른(가변 길이 라벨) 형제 항목들 사이에서, 활성 항목 위로 미끄러지는
 * 인디케이터의 위치를 실제 DOM 측정으로 계산하는 훅.
 *
 * 하단탭(`.tm-bottom-nav-pill-slot`, shell.tsx)과 세부탭(`.tm-segmented-thumb`,
 * segmented-tabs.tsx)은 항목 폭이 전부 같은 grid(`repeat(n, 1fr)`)라서
 * `translateX(index * 100%)` 계산만으로 충분했다 — DOM을 측정하지 않는다. 데스크톱
 * 상단 탭(`.tm-desktop-nav-tab`)은 라벨 길이가 제각각이라(홈/매치/대회/팀/마이) 그
 * 계산이 성립하지 않는다 — 실제 좌표를 읽어야 한다. 이 훅은 그 경우를 위한 것이다.
 *
 * `itemSelector`로 컨테이너의 **직계 자식** 중 항목만 골라(:scope 사용 — 인디케이터
 * 자신이 컨테이너 안에 함께 있어도 상관없이 order-independent), `activeIndex`번째
 * 요소의 `offsetLeft`/`offsetWidth`를 컨테이너 기준 좌표로 반환한다.
 *
 * `ResizeObserver`로 컨테이너 폭이 바뀔 때(창 크기 조절, 웹폰트 로드로 텍스트 폭이
 * 바뀌는 경우 등) 재측정한다. jsdom 등 `ResizeObserver` 미구현 환경에서는 최초
 * 1회 측정만 하고 조용히 넘어간다(이 저장소의 기존 관례 — tournament-bracket.tsx 등).
 */
export function useSlidingIndicatorRect(
  containerRef: RefObject<HTMLElement | null>,
  itemSelector: string,
  activeIndex: number,
): SlidingIndicatorRect | null {
  const [rect, setRect] = useState<SlidingIndicatorRect | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || activeIndex < 0) {
      setRect(null);
      return;
    }

    const measure = () => {
      const items = container.querySelectorAll<HTMLElement>(itemSelector);
      const target = items[activeIndex];
      if (!target) return;
      setRect({ left: target.offsetLeft, width: target.offsetWidth });
    };

    measure();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, itemSelector, activeIndex]);

  return rect;
}

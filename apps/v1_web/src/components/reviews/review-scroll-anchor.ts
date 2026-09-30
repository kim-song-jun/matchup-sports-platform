import { useLayoutEffect, useRef } from 'react';

/**
 * 스크롤러는 모바일에선 `.tm-scroll-area`, 데스크톱에선 문서다(같은 페이지가 폭에 따라 달라진다).
 * window 기준으로 재거나 쓰면 모바일에서 아무 일도 하지 않는다.
 */
export function findScrollContainer(from: Element): HTMLElement | null {
  for (let node = from.parentElement; node !== null; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null;
}

/**
 * 누른 행이 화면에서 제자리에 남도록 옮겨야 할 scrollTop.
 * 행 위쪽 패널이 접혀 행이 위로 밀렸다면 그만큼 되돌리고(topAfter < topBefore), 아래쪽이 접혔다면
 * 행이 움직이지 않으므로 scrollTop 을 그대로 둔다. 위로는 0 밑으로 내려가지 않는다.
 */
export function scrollTopToKeepAnchor(scrollTop: number, topBefore: number, topAfter: number): number {
  return Math.max(0, scrollTop + (topAfter - topBefore));
}

/**
 * 행을 누르는 순간의 화면 위치를 기억해 뒀다가, 펼침 상태(`trigger`)가 바뀌어 DOM 이 갱신된 직후
 * 페인트 전에 같은 위치로 되돌린다. 즉시 보정이라 `prefers-reduced-motion` 과 캡처에 영향이 없다.
 * 반환한 함수를 클릭 핸들러에서 상태를 바꾸기 **전에** 부른다.
 */
export function useKeepTappedItemInPlace(trigger: unknown): (item: HTMLElement | null) => void {
  const pending = useRef<{ item: HTMLElement; top: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = pending.current;
    pending.current = null;
    if (anchor === null || !anchor.item.isConnected) return;
    const scroller = findScrollContainer(anchor.item);
    if (scroller === null) return;
    const next = scrollTopToKeepAnchor(scroller.scrollTop, anchor.top, anchor.item.getBoundingClientRect().top);
    if (next !== scroller.scrollTop) scroller.scrollTop = next;
  }, [trigger]);

  return (item) => {
    pending.current = item === null ? null : { item, top: item.getBoundingClientRect().top };
  };
}

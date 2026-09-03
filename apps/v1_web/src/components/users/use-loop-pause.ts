'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * 무한 루프 CSS 애니메이션(광택 스윕·크레스트 숨쉬기·티어 발광 등)에 가시성 게이트를 건다.
 *
 * 대상 요소가 뷰포트를 벗어나거나(스크롤로 화면 밖) 문서 자체가 백그라운드로 가면
 * `data-loop-paused="true"` 를 세팅한다. CSS 쪽은 이 속성을 셀렉터로 삼아
 * `animation-play-state: paused` 를 건다(구체적인 규칙은 globals.css 의 선수 카드
 * 섹션 참고) — 화면에 안 보이는 동안에도 계속 페인트되며 GPU/배터리를 태우던 문제를
 * 잡는다(phase2-result.json: pcard-infinite-loop-no-visibility-gate).
 *
 * IntersectionObserver 는 요소 자신이 화면에 보이는지, `visibilitychange` 는 탭/앱이
 * 백그라운드인지를 본다 — 둘 중 하나라도 "안 보임"이면 멈춘다. 콜백 ref 를 쓰는 이유는
 * `useInfiniteScroll` 과 동일: DOM 노드가 렌더 시점에 확정되므로 effect 안에서
 * ref.current 를 읽으면 되고, 여기서는 노드가 컴포넌트 생애주기 동안 바뀌지 않으므로
 * effect 는 마운트 시 한 번만 건다.
 *
 * 1회성 진입 애니메이션(tmCardRise)은 대상이 아니다 — `animation-play-state: paused`
 * 는 이미 끝난 애니메이션에는 아무 영향을 주지 않는다(재생 중인 애니메이션에만 적용).
 */
export function useLoopPause<T extends HTMLElement>() {
  const nodeRef = useRef<T | null>(null);

  const setNode = useCallback((node: T | null) => {
    nodeRef.current = node;
  }, []);

  useEffect(() => {
    const el = nodeRef.current;
    if (!el || typeof document === 'undefined') return;

    // observer 콜백이 도착하기 전까지는 "보인다"고 가정한다 — 화면 밖 카드를 잠깐
    // 더 재생하는 쪽이, 화면 안 카드를 마운트 직후 잘못 멈추는 쪽보다 안전한 기본값이다.
    let isIntersecting = true;
    let isDocVisible = document.visibilityState !== 'hidden';

    function apply() {
      if (!isIntersecting || !isDocVisible) {
        el!.setAttribute('data-loop-paused', 'true');
      } else {
        el!.removeAttribute('data-loop-paused');
      }
    }

    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver((entries) => {
        // 여러 엔트리가 한 번에 올 수 있으므로(레이아웃 스로틀) 가장 최근 것만 본다.
        const entry = entries[entries.length - 1];
        if (entry) isIntersecting = entry.isIntersecting;
        apply();
      });
      observer.observe(el);
    }

    function onVisibilityChange() {
      isDocVisible = document.visibilityState !== 'hidden';
      apply();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return setNode;
}

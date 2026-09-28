'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { getMotionPaused, subscribeMotionPaused } from '../landing-motion-store';

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReduce(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  // Safari < 14 MediaQueryList has only the legacy addListener/removeListener.
  const query = window.matchMedia(REDUCE_QUERY) as MediaQueryList & {
    addListener?: (listener: () => void) => void;
    removeListener?: (listener: () => void) => void;
  };
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }
  query.addListener?.(onChange);
  return () => query.removeListener?.(onChange);
}

/* matchMedia 가 없으면 LandingRoot 도 모션을 켜지 않는다 — 같은 판정을 따른다. */
const getReduce = () => typeof window.matchMedia !== 'function' || window.matchMedia(REDUCE_QUERY).matches;

/**
 * 멈춤 버튼·모션 감소 설정을 함께 본 "스크롤 연출을 켜도 되나".
 * 서버와 hydration 첫 렌더는 false(최종 상태 정적 레이아웃)이고, 마운트 뒤에만 true 가 된다.
 */
export function useLandingV4MotionOn(): boolean {
  const paused = useSyncExternalStore(subscribeMotionPaused, getMotionPaused, () => true);
  const reduce = useSyncExternalStore(subscribeReduce, getReduce, () => true);
  return !paused && !reduce;
}

/** 스크롤·리사이즈를 한 프레임에 한 번으로 묶어 onFrame 을 부른다. enabled 가 false 면 아무것도 걸지 않는다. */
export function useScrollFrame(enabled: boolean, onFrame: () => void): void {
  const latest = useRef(onFrame);
  useEffect(() => {
    latest.current = onFrame;
  });
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const request = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        latest.current();
      });
    };
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    request();
    return () => {
      window.removeEventListener('scroll', request);
      window.removeEventListener('resize', request);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [enabled]);
}

/** 이 브라우저가 CSS view() 타임라인을 돌리면 JS 진행도 계산을 건너뛴다. */
export function supportsViewTimeline(): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('animation-timeline: view()');
}

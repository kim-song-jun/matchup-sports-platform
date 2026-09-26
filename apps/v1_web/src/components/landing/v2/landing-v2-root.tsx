'use client';

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { startLandingMotion } from '../landing-motion';
import { getMotionPaused, subscribeMotionPaused } from '../landing-motion-store';

/**
 * v2 랜딩 루트. 모션 컨트롤러와 "움직임 멈추기" 저장소는 A안 것을 그대로 쓰고, 루트 클래스만
 * tm-landing-v2 로 갈라 A안 CSS(.tm-landing …)의 숨김·재생 규칙이 이 페이지에 걸리지 않게 한다.
 */
export function LandingV2Root({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const paused = useSyncExternalStore(subscribeMotionPaused, getMotionPaused, () => false);

  useEffect(() => {
    if (!ref.current) return;
    return startLandingMotion(ref.current);
  }, []);

  return (
    <div ref={ref} className="tm-landing-v2" data-paused={paused ? 'true' : undefined}>
      {children}
    </div>
  );
}

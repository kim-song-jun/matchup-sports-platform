'use client';

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { startLandingMotion } from './landing-motion';
import { getMotionPaused, subscribeMotionPaused } from './landing-motion-store';

/** 랜딩 루트. 자식(섹션)은 서버 컴포넌트 그대로 두고, 모션 배선만 이 섬이 맡는다. */
export function LandingRoot({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const paused = useSyncExternalStore(subscribeMotionPaused, getMotionPaused, () => false);

  useEffect(() => {
    if (!ref.current) return;
    return startLandingMotion(ref.current);
  }, []);

  return (
    <div ref={ref} className="tm-landing" data-paused={paused ? 'true' : undefined}>
      {children}
    </div>
  );
}

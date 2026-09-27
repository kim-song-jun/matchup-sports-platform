'use client';

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { startLandingMotion, type LandingMotionOptions } from './landing-motion';
import { getMotionPaused, subscribeMotionPaused } from './landing-motion-store';

/** landing-v3.css 의 768+ 규칙과 같아야 한다 — 그 폭에서는 스크롤로 켜지는 연출 없이 완성 상태를 보여 준다. */
const V3_MOTION: LandingMotionOptions = { settleQuery: '(min-width: 768px)' };

/**
 * 랜딩 루트. 자식(섹션)은 서버 컴포넌트 그대로 두고, 모션 배선만 이 섬이 맡는다.
 * variant="v3" 는 A안 CSS 를 그대로 받으면서 tm-landing-v3 규칙을 얹는다.
 */
export function LandingRoot({ children, variant }: { children: ReactNode; variant?: 'v3' }) {
  const ref = useRef<HTMLDivElement>(null);
  const paused = useSyncExternalStore(subscribeMotionPaused, getMotionPaused, () => false);

  useEffect(() => {
    if (!ref.current) return;
    return startLandingMotion(ref.current, variant === 'v3' ? V3_MOTION : undefined);
  }, [variant]);

  return (
    <div ref={ref} className={variant === 'v3' ? 'tm-landing tm-landing-v3' : 'tm-landing'} data-paused={paused ? 'true' : undefined}>
      {children}
    </div>
  );
}

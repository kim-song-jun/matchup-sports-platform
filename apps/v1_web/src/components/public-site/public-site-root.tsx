'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { startRevealOnScroll } from '@/lib/reveal-on-scroll';

/**
 * 공개 페이지 루트. 자식은 서버 컴포넌트 그대로 두고 스크롤 등장(data-reveal) 배선만 이 섬이 맡는다.
 * 모션 감소·JS 없음이면 data-motion 이 붙지 않아 전부 최종 상태로 보인다.
 */
export function PublicSiteRoot({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return startRevealOnScroll(ref.current) ?? undefined;
  }, []);
  return <div ref={ref} className="tm-ps">{children}</div>;
}

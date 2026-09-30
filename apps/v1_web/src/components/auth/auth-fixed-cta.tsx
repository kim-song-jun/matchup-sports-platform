'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

const CTA_HEIGHT_VAR = '--tm-auth-cta-height';

/**
 * AuthFrame 하단 고정 버튼 영역. 자기 높이를 프레임에 CSS 변수로 알려 스크롤 영역이 버튼 위에서
 * 끝나게 한다 — 안내 줄이 붙어 버튼 영역이 커져도 마지막 입력칸이 그 밑에 깔리지 않는다.
 * 데스크톱에서는 CTA 가 흐름 안에 놓이므로 변수를 읽는 규칙이 없다.
 */
export function AuthFixedCta({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    const frame = node?.closest<HTMLElement>('.tm-auth-frame');
    if (!node || !frame) return undefined;

    const sync = () => {
      const height = node.offsetHeight;
      if (height > 0) frame.style.setProperty(CTA_HEIGHT_VAR, `${height}px`);
    };
    sync();
    if (typeof ResizeObserver === 'undefined') return () => frame.style.removeProperty(CTA_HEIGHT_VAR);

    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => {
      observer.disconnect();
      frame.style.removeProperty(CTA_HEIGHT_VAR);
    };
  }, []);

  return <div ref={ref} className="tm-auth-fixed-cta">{children}</div>;
}

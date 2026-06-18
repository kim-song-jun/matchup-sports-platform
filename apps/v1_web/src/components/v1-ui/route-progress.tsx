'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * 전역 상단 네비게이션 진행 바.
 * - 내부 링크 클릭 / 뒤로·앞으로(popstate) 를 캡처해 즉시 "시작"
 * - 라우트(pathname) 가 바뀌면 "완료"(100% 채운 뒤 사라짐)
 * - dev 컴파일·데이터 페칭 동안 화면이 멈춘 듯 보이는 체감을 줄여 준다.
 * 의존성 추가 없이 App Router(usePathname) + 클릭 가로채기로만 동작.
 */
export function RouteProgressBar() {
  const pathname = usePathname();
  const [progress, setProgress] = useState<{ active: boolean; width: number }>({ active: false, width: 0 });

  const activeRef = useRef(false);
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failsafeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (trickleRef.current) { clearInterval(trickleRef.current); trickleRef.current = null; }
    if (hideRef.current) { clearTimeout(hideRef.current); hideRef.current = null; }
    if (failsafeRef.current) { clearTimeout(failsafeRef.current); failsafeRef.current = null; }
  };

  const finish = () => {
    if (!activeRef.current) return;
    activeRef.current = false;
    clearTimers();
    setProgress({ active: true, width: 100 });
    hideRef.current = setTimeout(() => setProgress({ active: false, width: 0 }), 260);
  };

  const start = () => {
    if (activeRef.current) return;
    activeRef.current = true;
    clearTimers();
    setProgress({ active: true, width: 8 });
    // 90% 까지 점점 느려지며 trickle
    trickleRef.current = setInterval(() => {
      setProgress((s) => {
        if (!activeRef.current || s.width >= 90) return s;
        const next = s.width + (90 - s.width) * 0.12 + 0.5;
        return { active: true, width: Math.min(90, next) };
      });
    }, 180);
    // pathname 이 바뀌지 않는 네비게이션(쿼리만 변경 등)에서 바가 멈추지 않도록 안전장치
    failsafeRef.current = setTimeout(finish, 8000);
  };

  // 시작 트리거: 내부 링크 클릭(capture) + 뒤로/앞으로
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || anchor.getAttribute('target') === '_blank' || anchor.hasAttribute('download')) return;
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    };

    const onPopState = () => start();

    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState);
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 완료 트리거: 라우트가 실제로 바뀌면(첫 마운트 제외)
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!progress.active) return null;

  return (
    <div className="tm-route-progress" aria-hidden="true">
      <div className="tm-route-progress-bar" style={{ width: `${progress.width}%` }} />
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useNavigationIntent } from './use-navigation-intent';

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

  // 시작 트리거: 내부 링크 클릭(capture) + 뒤로/앞으로 — 캡처 로직 자체는 use-navigation-intent.ts로 추출됨.
  // kind==='tab' (하단 탭·데스크톱 상단 탭·화면 안 세부 탭)은 진행바를 켜지 않는다 — "탭 전환은
  // 동위 전환이라 전환 자체가 없다"는 원칙(globals.css data-nav-kind='tab')과 짝을 맞춘다. 세부 탭
  // 재요청의 로딩 신호는 각 페이지의 isFetching 인라인 표시가 대신한다(tournaments/page.tsx 참조).
  // 'search'(같은 pathname 의 쿼리만 변경)도 켜지 않는다 — pathname 완료 신호가 오지 않아 8초
  // failsafe 까지 바가 남고, 클라이언트 재요청이라 즉시 끝난다(Copilot 2차).
  useNavigationIntent({ onIntent: (kind) => { if (kind !== 'tab' && kind !== 'search') start(); } });

  // 언마운트 시 타이머 정리(기존 클릭/popstate 리스너 cleanup에 함께 있던 것)
  useEffect(() => {
    return () => clearTimers();
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

'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 열림 상태가 false 로 바뀐 뒤에도 잠깐 렌더를 유지해, 퇴장 애니메이션이 재생될
 * 시간을 준다. 시트·토스트가 **진입 애니메이션만 있고 닫힐 땐 즉시 사라지던**
 * 비대칭을 없애는 용도다.
 *
 *   const { mounted, closing } = useDelayedUnmount(open, 200);
 *   if (!mounted) return null;
 *   <div className={closing ? 'x x-closing' : 'x'}>
 *
 * 두 가지를 호출자가 지켜야 한다:
 *
 * 1. **duration 은 CSS 의 퇴장 애니메이션 길이와 같아야 한다.** 짧으면 애니메이션이
 *    중간에 잘리고, 길면 빈 화면이 그만큼 남는다. 값을 바꿀 땐 양쪽을 함께 바꾼다.
 * 2. **닫히는 동안 보여줄 내용을 호출자가 붙들고 있어야 한다.** open 이 false 가 될
 *    때 데이터도 함께 null 이 되는 구조(예: `notification === null` 이 곧 닫힘)라면,
 *    ref 에 마지막 값을 남겨 그걸 렌더해야 한다 — 안 그러면 애니메이션이 도는 동안
 *    빈 시트가 보인다.
 *
 * 모션을 줄이도록 설정한 기기에서는 지연을 0 으로 만든다. CSS 의
 * `animation: none` 만으로는 이 setTimeout 이 사라지지 않아, 아무것도 안 보이는
 * 지연만 남기 때문이다.
 */
export function useDelayedUnmount(open: boolean, durationMs: number) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }

    if (!mounted) return;

    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      setClosing(false);
      setMounted(false);
      return;
    }

    setClosing(true);
    timerRef.current = setTimeout(() => {
      setMounted(false);
      setClosing(false);
      timerRef.current = null;
    }, durationMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // mounted 는 의도적으로 뺀다 — 이 effect 가 mounted 를 바꾸므로 넣으면 스스로를
    // 다시 트리거한다. 닫힘 시작 판정에만 쓰는 값이라 최신값이 아니어도 안전하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, durationMs]);

  return { mounted, closing };
}

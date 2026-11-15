'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { KakaoAuthorizePath } from '@/lib/kakao-oauth';

// 카카오톡을 다녀와 결과가 없어도 이만큼 화면이 보이면 다시 누를 수 있다. 그 사이 도착하는 답이 먼저 처리될 틈이다.
const KAKAO_RETAP_LOCK_MS = 2_000;

export type KakaoRetapRelease = { reason: 'timer' } | { reason: 'pageshow'; persisted: boolean };

/**
 * 카카오 버튼이 인가를 시작한 뒤 언제 다시 눌러도 되는지를 정하는 단 하나의 규칙이다. 로그인 버튼과 계정 연결 버튼이 함께 쓴다.
 *
 * - 시간으로 푸는 것은 SDK 를 부른 길(`talk`·`sdk_account`)뿐이다. 카카오톡이 열리지 않거나 승인 없이 돌아와도 페이지는 그대로라 pageshow 가 없다.
 *   화면이 보이는 시간만 2초 세고, 가려지면 버린 뒤 다시 보일 때 처음부터 센다.
 * - 인가 주소로 직접 이동하는 길(`account_url`)은 화면이 떠나므로 시간으로 풀지 않는다. 뒤로가기로 돌아올 때(pageshow)만 푼다.
 * - pageshow 는 길과 무관하게 풀고, bfcache 복원 여부(`persisted`)를 그대로 넘긴다.
 */
export function useKakaoRetapRelease(release: (cause: KakaoRetapRelease) => void) {
  const releaseRef = useRef(release);
  const armedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    releaseRef.current = release;
  });

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      armedRef.current = false;
      releaseRef.current({ reason: 'timer' });
    }, KAKAO_RETAP_LOCK_MS);
  }, [clearTimer]);

  const arm = useCallback((path: KakaoAuthorizePath) => {
    if (path === 'account_url') return;
    armedRef.current = true;
    if (document.visibilityState !== 'hidden') startTimer();
  }, [startTimer]);

  useEffect(() => {
    const onPageShow = (event: Event) => {
      clearTimer();
      armedRef.current = false;
      releaseRef.current({ reason: 'pageshow', persisted: (event as PageTransitionEvent).persisted === true });
    };
    const onVisibilityChange = () => {
      if (!armedRef.current) return;
      if (document.visibilityState === 'visible') startTimer();
      else clearTimer();
    };
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearTimer();
      armedRef.current = false;
    };
  }, [clearTimer, startTimer]);

  return { arm };
}

import { useEffect, useState } from 'react';

/**
 * `expiresAt`(epoch ms)이 지나면 true. null 이면 만료 시각을 모르는 증명이라 만료로 보지 않는다.
 *
 * 백그라운드 탭의 타이머는 한참 늦게 돌 수 있어, 다른 앱에서 문자를 확인하고 돌아오는 순간
 * (visibilitychange·focus)에도 바로 다시 확인한다.
 */
export function useProofExpiry(expiresAt: number | null): boolean {
  // 만료를 확인한 시각을 값으로 기억해, 새 증명(다른 expiresAt)이 들어오면 별도 초기화 없이 다시 "유효"가 된다.
  const [expiredAt, setExpiredAt] = useState<number | null>(null);

  useEffect(() => {
    if (expiresAt === null) return;
    let timer: number | undefined;
    const check = () => {
      window.clearTimeout(timer);
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        setExpiredAt(expiresAt);
        return;
      }
      // 타이머가 살짝 일찍 깨는 경우를 위해 남은 시간이 있으면 다시 건다.
      timer = window.setTimeout(check, remaining);
    };
    check();
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [expiresAt]);

  return expiresAt !== null && expiredAt === expiresAt;
}

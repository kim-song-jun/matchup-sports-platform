'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useV1AuthMe } from '@/hooks/use-v1-api';
import { clearStoredV1Session, getCurrentRedirectPath, getLoginPathForRedirect, hasStoredV1Session } from '@/lib/session-storage';
import { SessionFallback } from './session-entry-gate';

export function RequireAuth({ children }: { children: ReactNode }) {
  const [hasSessionHint, setHasSessionHint] = useState<boolean | null>(null);
  const authMe = useV1AuthMe({ enabled: hasSessionHint === true, retry: false });

  useEffect(() => {
    const nextHasSessionHint = hasStoredV1Session();
    setHasSessionHint(nextHasSessionHint);
    if (!nextHasSessionHint) {
      // router.replace()는 로그인 상태에서 prefetch된 /login 인스턴스를 재사용해
      // 세션 무효화 이전 스냅샷에 멈출 수 있다(하드 네비게이션으로 우회).
      window.location.replace(getLoginPathForRedirect(getCurrentRedirectPath()));
    }
  }, []);

  useEffect(() => {
    if (hasSessionHint !== true) return;
    if (!authMe.isError) return;

    clearStoredV1Session();
    window.location.replace(getLoginPathForRedirect(getCurrentRedirectPath()));
  }, [authMe.isError, hasSessionHint]);

  if (hasSessionHint && authMe.isSuccess) return <>{children}</>;

  return <SessionFallback />;
}

'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useV1AuthMe } from '@/hooks/use-v1-api';
import { isUnauthenticatedError, retryTransientFailure } from '@/lib/api-client';
import {
  clearStoredV1Session,
  getCurrentRedirectPath,
  getLoginPathForRedirect,
  shouldProbeV1Session,
} from '@/lib/session-storage';
import { disconnectV1Socket } from '@/lib/v1-socket';
import { SessionFallback } from './session-entry-gate';
import { ErrorState } from '@/components/v1-ui/primitives';

export function RequireAuth({ children }: { children: ReactNode }) {
  const [hasSessionHint, setHasSessionHint] = useState<boolean | null>(null);
  // 401·403은 다시 물어도 답이 같으니 재시도 없이 곧장 처리하고, 일시 오류(rate limit
  // 503 등)만 몇 번 다시 시도해 스스로 복구한다 — 재시도가 없으면 서버가 잠깐 밀린 것만으로도
  // 화면 전체가 "로그인 상태를 확인하지 못했어요"로 바뀌어 인증이 풀린 것처럼 보인다.
  const authMe = useV1AuthMe({ enabled: hasSessionHint === true, retry: retryTransientFailure });

  useEffect(() => {
    const nextHasSessionHint = shouldProbeV1Session();
    setHasSessionHint(nextHasSessionHint);
    if (!nextHasSessionHint) {
      // router.replace()는 로그인 상태에서 prefetch된 /login 인스턴스를 재사용해
      // 세션 무효화 이전 스냅샷에 멈출 수 있다(하드 네비게이션으로 우회).
      window.location.replace(getLoginPathForRedirect(getCurrentRedirectPath()));
    }
  }, []);

  useEffect(() => {
    if (hasSessionHint !== true) return;
    if (!authMe.isError || authMe.isFetching || !isUnauthenticatedError(authMe.error)) return;

    clearStoredV1Session();
    disconnectV1Socket();
    window.location.replace(getLoginPathForRedirect(getCurrentRedirectPath()));
  }, [authMe.error, authMe.isError, authMe.isFetching, hasSessionHint]);

  if (hasSessionHint && authMe.isSuccess) return <>{children}</>;

  if (hasSessionHint && authMe.isError && !authMe.isFetching && !isUnauthenticatedError(authMe.error)) {
    return (
      <ErrorState
        message={'로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'}
        onRetry={() => void authMe.refetch()}
      />
    );
  }

  return <SessionFallback />;
}

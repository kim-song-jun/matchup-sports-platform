'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useV1AuthMe } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { clearStoredV1Session, getCurrentRedirectPath, getLoginPathForRedirect, hasStoredV1Session } from '@/lib/session-storage';
import { SessionFallback } from './session-entry-gate';
import { ErrorState } from '@/components/v1-ui/primitives';

export function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [hasSessionHint, setHasSessionHint] = useState<boolean | null>(null);
  const authMe = useV1AuthMe({ enabled: hasSessionHint === true, retry: false });

  useEffect(() => {
    const nextHasSessionHint = hasStoredV1Session();
    setHasSessionHint(nextHasSessionHint);
    if (!nextHasSessionHint) {
      router.replace(getLoginPathForRedirect(getCurrentRedirectPath()));
    }
  }, [router]);

  useEffect(() => {
    if (hasSessionHint !== true) return;
    if (!authMe.isError || authMe.isFetching || !isUnauthenticated(authMe.error)) return;

    clearStoredV1Session();
    router.replace(getLoginPathForRedirect(getCurrentRedirectPath()));
  }, [authMe.error, authMe.isError, authMe.isFetching, hasSessionHint, router]);

  if (hasSessionHint && authMe.isSuccess) return <>{children}</>;

  if (hasSessionHint && authMe.isError && !authMe.isFetching && !isUnauthenticated(authMe.error)) {
    return (
      <ErrorState
        message={'로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'}
        onRetry={() => void authMe.refetch()}
      />
    );
  }

  return <SessionFallback />;
}

function isUnauthenticated(error: unknown) {
  return error instanceof V1ApiError
    && (error.statusCode === 401 || error.code === 'UNAUTHENTICATED');
}

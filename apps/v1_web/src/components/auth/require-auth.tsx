'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useV1AuthMe } from '@/hooks/use-v1-api';
import {
  clearStoredV1Session,
  getCurrentRedirectPath,
  getLoginPathForRedirect,
  shouldProbeV1Session,
} from '@/lib/session-storage';
import { disconnectV1Socket } from '@/lib/v1-socket';
import { SessionFallback } from './session-entry-gate';

export function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [hasSessionHint, setHasSessionHint] = useState<boolean | null>(null);
  const authMe = useV1AuthMe({ enabled: hasSessionHint === true, retry: false });

  useEffect(() => {
    const nextHasSessionHint = shouldProbeV1Session();
    setHasSessionHint(nextHasSessionHint);
    if (!nextHasSessionHint) {
      router.replace(getLoginPathForRedirect(getCurrentRedirectPath()));
    }
  }, [router]);

  useEffect(() => {
    if (hasSessionHint !== true) return;
    if (!authMe.isError) return;

    clearStoredV1Session();
    disconnectV1Socket();
    router.replace(getLoginPathForRedirect(getCurrentRedirectPath()));
  }, [authMe.isError, hasSessionHint, router]);

  if (hasSessionHint && authMe.isSuccess) return <>{children}</>;

  return <SessionFallback />;
}

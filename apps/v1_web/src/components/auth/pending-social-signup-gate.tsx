'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useV1AuthMe } from '@/hooks/use-v1-api';
import { browserAppRoute } from '@/lib/app-route';
import {
  clearStoredV1Session,
  hasStoredV1Session,
} from '@/lib/session-storage';
import { SessionFallback } from './session-entry-gate';
import {
  getPendingSocialSignupRoute,
  isPendingSocialSignupRouteAllowed,
} from './social-signup-access';

export function PendingSocialSignupGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [hasSessionHint, setHasSessionHint] = useState<boolean | null>(null);
  const authMe = useV1AuthMe({ enabled: hasSessionHint === true, retry: false });

  useEffect(() => {
    setHasSessionHint(hasStoredV1Session());
  }, [pathname]);

  useEffect(() => {
    if (hasSessionHint !== true || !authMe.isError) return;
    clearStoredV1Session();
    setHasSessionHint(false);
  }, [authMe.isError, hasSessionHint]);

  const onboardingStatus = authMe.data?.user.onboardingStatus;
  const requiredRoute = getPendingSocialSignupRoute(onboardingStatus);
  const currentMode =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('mode');
  const routeAllowed = isPendingSocialSignupRouteAllowed(
    onboardingStatus,
    pathname,
    currentMode,
  );

  useEffect(() => {
    if (!requiredRoute || routeAllowed) return;
    if (pathname === '/terms' && requiredRoute.startsWith('/terms?')) {
      window.location.replace(browserAppRoute(requiredRoute, pathname));
      return;
    }
    router.replace(requiredRoute);
  }, [pathname, requiredRoute, routeAllowed, router]);

  if (hasSessionHint === null) return <>{children}</>;
  if (!hasSessionHint || authMe.isError) return <>{children}</>;
  if (!authMe.isSuccess) return <SessionFallback />;
  if (requiredRoute && !routeAllowed) return <SessionFallback />;

  return <>{children}</>;
}

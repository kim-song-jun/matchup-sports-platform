'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useV1AuthMe } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { browserAppRoute } from '@/lib/app-route';
import {
  clearStoredV1Session,
  hasStoredV1Session,
} from '@/lib/session-storage';
import { disconnectV1Socket } from '@/lib/v1-socket';
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
    if (hasSessionHint !== true) return;
    if (!authMe.isError || authMe.isFetching || !isUnauthenticated(authMe.error)) return;

    clearStoredV1Session();
    disconnectV1Socket();
    setHasSessionHint(false);
  }, [authMe.error, authMe.isError, authMe.isFetching, hasSessionHint]);

  const onboardingStatus = authMe.data?.user.onboardingStatus;
  const socialRequiredRoute = getPendingSocialSignupRoute(onboardingStatus);
  const termsRequired = authMe.data?.termsCompliance?.compliant === false;
  const isLoginRoute = pathname === '/login' || pathname.startsWith('/login/');
  const currentMode =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('mode');
  const renewalRoute = termsRequired && pathname !== '/terms' && !isLoginRoute
    ? `/terms?mode=renewal&redirect=${encodeURIComponent(pathname)}`
    : null;
  const requiredRoute = socialRequiredRoute ?? renewalRoute;
  const routeAllowed = socialRequiredRoute
    ? isPendingSocialSignupRouteAllowed(onboardingStatus, pathname, currentMode)
    : !renewalRoute;

  useEffect(() => {
    if (!requiredRoute || routeAllowed) return;
    if (pathname === '/terms' && requiredRoute.startsWith('/terms?')) {
      window.location.replace(browserAppRoute(requiredRoute));
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

function isUnauthenticated(error: unknown) {
  return error instanceof V1ApiError
    && (error.statusCode === 401 || error.code === 'UNAUTHENTICATED');
}

'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useV1AuthMe } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { browserAppRoute } from '@/lib/app-route';
import { emailLinkPath, EMAIL_LINK_PATH } from '@/lib/link-result';
import {
  clearStoredV1Session,
  hasStoredV1Session,
} from '@/lib/session-storage';
import { disconnectV1Socket } from '@/lib/v1-socket';
import { SessionFallback } from './session-entry-gate';
import { usePendingEmailLinkOffer } from './use-pending-email-link-offer';
import { usePendingSocialLinkResolver } from './use-pending-social-link-resolver';
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

  const confirmedAccount = hasSessionHint === true ? authMe.data : undefined;
  const socialLink = usePendingSocialLinkResolver(confirmedAccount);
  usePendingEmailLinkOffer(confirmedAccount, socialLink.routed);

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
  const emailRequired = authMe.data?.user.signupEmailLoginRequired === true;
  const emailSetupRoute = emailRequired && pathname !== EMAIL_LINK_PATH && pathname !== '/terms' && !pathname.startsWith('/my/inquiries') && !isLoginRoute
    ? emailLinkPath(onboardingStatus === 'social_profile_deferred' ? '/home' : '/onboarding/sport')
    : null;
  const requiredRoute = socialRequiredRoute ?? renewalRoute ?? emailSetupRoute;
  const routeAllowed = socialRequiredRoute
    ? isPendingSocialSignupRouteAllowed(onboardingStatus, pathname, currentMode)
    : !renewalRoute && !emailSetupRoute;

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

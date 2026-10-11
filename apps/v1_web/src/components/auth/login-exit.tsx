'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';
import { isAppBackPending, markAppInitiatedBack, previousInAppEntryUrl } from '@/lib/navigation-history';
import { AuthBackButton } from './auth-back-button';

/**
 * Leaves the login screen the way the user came in. A login screen is reached by replacing the
 * screen that needed a session, so the entry before it is the screen the user was looking at —
 * back returns there. With nothing in-app before it (first launch, relaunch) or only another
 * login step (/login/email), it goes to `fallbackHref` instead of bouncing between login screens.
 */
function useLeaveLogin(fallbackHref: string): () => void {
  const router = useRouter();
  return () => {
    if (isAppBackPending()) return;
    const previous = previousInAppEntryUrl();
    // history.length === 1: the only entry was replaced by this login screen, so the mirror's "previous" is a ghost.
    if (previous !== null && !previous.startsWith('/login') && window.history.length > 1) {
      markAppInitiatedBack();
      router.back();
      return;
    }
    router.replace(fallbackHref);
  };
}

export function LoginExitBackButton({ className, fallbackHref }: { className: string; fallbackHref: string }) {
  return <AuthBackButton className={className} label="뒤로가기" onClick={useLeaveLogin(fallbackHref)} />;
}

/** `href` is the new-tab / no-JS target and the exit fallback. */
export function LoginGuestLink({ className, href, children }: { className: string; href: string; children: ReactNode }) {
  const leave = useLeaveLogin(href);
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    leave();
  };
  return <Link className={className} href={href} onClick={onClick}>{children}</Link>;
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';
import { isAppBackPending, markAppInitiatedBack, previousPublicEntryUrl } from '@/lib/navigation-history';
import { AuthBackButton } from './auth-back-button';

/**
 * Leaves the login screen the way the user came in. A login opened with `?redirect=` replaced a screen
 * that needed a session, so the entry before it is what the user was looking at — back returns there.
 * Without `redirect` (logout, withdrawal, direct entry), or when the entry before it is itself behind
 * RequireAuth (an expired session moving between protected screens), back would bounce straight to login
 * again, so it goes to `fallbackHref` — as it does with nothing in-app before it (first launch, relaunch).
 */
function useLeaveLogin(fallbackHref: string): () => void {
  const router = useRouter();
  return () => {
    if (isAppBackPending()) return;
    const redirect = new URLSearchParams(window.location.search).get('redirect');
    const previous = previousPublicEntryUrl();
    // history.length === 1: the only entry was replaced by this login screen, so the mirror's "previous" is a ghost.
    if (
      redirect !== null && previous !== null && !previous.startsWith('/login')
      && previous.split(/[?#]/)[0] !== redirect.split(/[?#]/)[0] && window.history.length > 1
    ) {
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

'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { readBackFrom } from '@/lib/session-storage';

export function AppBackLink({
  fallbackHref,
  className,
  children,
}: {
  fallbackHref: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<Link className={className} href={fallbackHref} prefetch={true} aria-label="뒤로가기" data-nav-back="true">{children}</Link>}>
      <AppBackLinkContent fallbackHref={fallbackHref} className={className}>
        {children}
      </AppBackLinkContent>
    </Suspense>
  );
}

function AppBackLinkContent({
  fallbackHref,
  className,
  children,
}: {
  fallbackHref: string;
  className?: string;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  // 모든 셸 뒤로가기가 `?from=` 을 따른다 — 화면마다 override 를 달지 않아도 들어온 곳으로 돌아간다.
  const href = readBackFrom(searchParams.get('from')) ?? fallbackHref;

  return (
    <Link className={className} href={href} prefetch={true} aria-label="뒤로가기" data-nav-back="true">
      {children}
    </Link>
  );
}

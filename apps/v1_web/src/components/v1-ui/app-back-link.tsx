'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { sanitizeRedirectPath } from '@/lib/session-storage';

/**
 * 모든 뒤로가기(셸 상단·데스크톱 헤드·화면의 .tm-desktop-back)의 단일 경로. `?from=` 을 여기서 읽으므로
 * 화면은 fromPath 로 backHref 를 따로 계산해 넘기지 않는다 — fallbackHref 는 출처가 없을 때의 고정 목적지만.
 */
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
  const href = sanitizeRedirectPath(searchParams.get('from')) ?? fallbackHref;

  return (
    <Link className={className} href={href} prefetch={true} aria-label="뒤로가기" data-nav-back="true">
      {children}
    </Link>
  );
}

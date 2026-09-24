'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';
import { Suspense } from 'react';
import { decideBackAction, markAppInitiatedBack } from '@/lib/navigation-history';
import { sanitizeRedirectPath } from '@/lib/session-storage';

/**
 * 모든 뒤로가기(셸 상단·데스크톱 헤드·화면의 .tm-desktop-back)의 단일 경로. `?from=` 을 여기서 읽으므로
 * 화면은 fromPath 로 backHref 를 따로 계산해 넘기지 않는다 — fallbackHref 는 출처가 없을 때의 고정 목적지만.
 *
 * href 는 그대로 렌더한다(SSR·새 탭 열기·접근성). 평범한 클릭만 가로채, 목적지가 바로 앞 앱 항목이면
 * history back(스크롤 복원), 아니면 replace 로 간다 — push 하면 하드웨어 뒤로가 방금 떠난 화면으로 튄다.
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
    <Suspense fallback={<BackAnchor className={className} href={fallbackHref}>{children}</BackAnchor>}>
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
  return <BackAnchor className={className} href={href}>{children}</BackAnchor>;
}

function BackAnchor({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (decideBackAction(href) === 'back') {
      markAppInitiatedBack();
      router.back();
      return;
    }
    router.replace(href);
  };
  return (
    <Link className={className} href={href} prefetch={true} aria-label="뒤로가기" data-nav-back="true" onClick={onClick}>
      {children}
    </Link>
  );
}

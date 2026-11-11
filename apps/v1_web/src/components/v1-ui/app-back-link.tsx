'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';
import { Suspense } from 'react';
import { decideBackAction, isAppBackPending, markAppInitiatedBack } from '@/lib/navigation-history';
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
  label,
  children,
}: {
  fallbackHref: string;
  className?: string;
  /** 화면에 보이는 글자와 접근 가능한 이름을 맞출 때(기본 '뒤로가기'). */
  label?: string;
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<BackAnchor className={className} href={fallbackHref} label={label}>{children}</BackAnchor>}>
      <AppBackLinkContent fallbackHref={fallbackHref} className={className} label={label}>
        {children}
      </AppBackLinkContent>
    </Suspense>
  );
}

function AppBackLinkContent({
  fallbackHref,
  className,
  label,
  children,
}: {
  fallbackHref: string;
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  // 모든 셸 뒤로가기가 `?from=` 을 따른다 — 화면마다 override 를 달지 않아도 들어온 곳으로 돌아간다.
  const href = sanitizeRedirectPath(searchParams.get('from')) ?? fallbackHref;
  return <BackAnchor className={className} href={href} label={label}>{children}</BackAnchor>;
}

/**
 * 뒤로가기 성격의 링크 클릭 처리. 목적지가 바로 앞 앱 항목이면 history back, 아니면 replace 로 간다.
 * AppBackLink 말고 라벨·스타일이 다른 "돌아가기" 링크(예: 체험 화면의 운영 복귀)도 같은 규칙을 쓴다.
 */
export function useAppBackClick(href: string) {
  const router = useRouter();
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (isAppBackPending()) return; // 연타 — 앞 back 의 pop 이 오기 전 두 번째 back 은 한 칸 더 간다.
    if (decideBackAction(href) === 'back') {
      markAppInitiatedBack();
      router.back();
      return;
    }
    router.replace(href);
  };
}

function BackAnchor({ href, className, label, children }: { href: string; className?: string; label?: string; children: ReactNode }) {
  const onClick = useAppBackClick(href);
  return (
    <Link className={className} href={href} prefetch={true} aria-label={label ?? '뒤로가기'} data-nav-back="true" onClick={onClick}>
      {children}
    </Link>
  );
}

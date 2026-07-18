'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { trackEvent } from '@/lib/analytics';

// 랜딩 페이지(app/landing/page.tsx)는 metadata export가 필요한 Server Component라
// onClick 계측이 필요한 CTA 링크만 별도 클라이언트 컴포넌트로 분리했다.
export function LandingCtaLink({
  href,
  cta,
  className,
  children,
}: {
  href: string;
  cta: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link className={className} href={href} onClick={() => trackEvent('landing_cta_click', { cta })}>
      {children}
    </Link>
  );
}

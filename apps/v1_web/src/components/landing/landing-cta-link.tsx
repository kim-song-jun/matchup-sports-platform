'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { trackEvent } from '@/lib/analytics';

/** GA `landing_cta_click` 의 cta 값. 대시보드가 이 문자열로 집계하므로 이름을 바꾸지 않는다. */
export type LandingCtaId =
  | 'nav_login'
  | 'nav_signup'
  | 'hero_signup'
  | 'hero_browse_matches'
  | 'role_find_match'
  | 'role_browse_teams'
  | 'role_view_tournaments'
  | 'story_find_match'
  | 'story_view_tournaments'
  | 'story_view_live'
  | 'story_browse_teams'
  | 'bottom_signup'
  | 'bottom_browse_tournaments'
  | 'mobile_bar_signup'
  | 'mobile_bar_browse_matches';

/** 같은 자리의 CTA 를 안끼리 비교하려고 cta 는 공유하고 variant 로 가른다. 없으면 기존 A안(/landing). */
export type LandingVariant = 'v2';

// 랜딩 페이지(app/landing/page.tsx)는 metadata export가 필요한 Server Component라
// onClick 계측이 필요한 CTA 링크만 별도 클라이언트 컴포넌트로 분리했다.
export function LandingCtaLink({
  href,
  cta,
  variant,
  className,
  children,
}: {
  href: string;
  cta: LandingCtaId;
  variant?: LandingVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      className={className}
      href={href}
      onClick={() => trackEvent('landing_cta_click', variant ? { cta, variant } : { cta })}
    >
      {children}
    </Link>
  );
}

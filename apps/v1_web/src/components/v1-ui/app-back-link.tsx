'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';

export function AppBackLink({
  fallbackHref,
  className,
  children,
}: {
  fallbackHref: string;
  className?: string;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const href = searchParams.get('from') === 'notifications' ? '/notifications' : fallbackHref;

  return (
    <Link className={className} href={href} aria-label="뒤로가기">
      {children}
    </Link>
  );
}

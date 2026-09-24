'use client';

import { usePathname, useSearchParams } from 'next/navigation';

/** 받은 `?from=` 까지 담은 지금 화면의 URL. 다음 화면의 출처로 넘기면 여러 단계 뒤에도 처음 출처가 남는다. */
export function useCurrentHref() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  return search ? `${pathname}?${search}` : pathname;
}

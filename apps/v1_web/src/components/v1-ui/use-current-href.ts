'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/** 받은 `?from=` 과 앵커(#)까지 담은 지금 화면의 URL. 다음 화면의 출처로 넘기면 여러 단계 뒤에도 처음 출처가 남는다. */
export function useCurrentHref() {
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? '';
  // hash 는 서버가 모르는 값이라 첫 렌더엔 빼고(hydration 일치), 마운트 뒤와 hashchange 에서 채운다.
  const [hash, setHash] = useState('');
  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
    // 다른 경로로 옮겨 가면(pushState) hashchange 가 없으니 경로·쿼리가 바뀔 때도 다시 읽는다.
  }, [pathname, search]);
  // 라우터 밖(셸 없이 렌더하는 테스트 등)에선 경로를 모른다 — 출처를 싣지 않는다(app-shell-frame 과 같은 방어).
  if (!pathname) return null;
  return `${pathname}${search ? `?${search}` : ''}${hash}`;
}

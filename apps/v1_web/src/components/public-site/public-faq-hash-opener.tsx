'use client';

import { useEffect } from 'react';
import { locationHashId } from '@/lib/public-site/location-hash';

/**
 * `/faq#<id>` 딥링크로 들어오면 그 질문의 <details> 를 연다. 사파리 등은 조각 식별자로 이동해도
 * 닫힌 <details> 를 자동으로 펼치지 않는다.
 */
export function PublicFaqHashOpener() {
  useEffect(() => {
    const openFromHash = () => {
      const id = locationHashId(window.location.hash);
      if (!id) return;
      const target = document.getElementById(id);
      if (target instanceof HTMLDetailsElement) target.open = true;
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);
  return null;
}

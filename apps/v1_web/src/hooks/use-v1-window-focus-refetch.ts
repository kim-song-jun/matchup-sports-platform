'use client';

import { useEffect } from 'react';
import type { RefetchOptions } from '@tanstack/react-query';

type WindowFocusRefetchQuery = {
  isStale: boolean;
  refetch: (options: RefetchOptions) => Promise<unknown>;
};

export function useV1WindowFocusRefetch(query: WindowFocusRefetchQuery, enabled: boolean, policy: boolean | 'always') {
  const { isStale, refetch } = query;
  useEffect(() => {
    if (!enabled || !policy) return;
    // Query v5는 visibilitychange만 듣는다. visible 상태에서 창만 돌아오는 화면 복귀도 읽는다.
    const onFocus = () => {
      if (document.visibilityState === 'hidden' || (policy !== 'always' && !isStale)) return;
      // visibility 복귀와 함께 발생해도 진행 중인 같은 GET을 취소·재시작하지 않는다.
      void refetch({ cancelRefetch: false });
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [enabled, isStale, policy, refetch]);
}

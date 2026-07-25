'use client';

import { useCallback, useMemo, useState } from 'react';

/**
 * 목록에서 **아이템별 처리 중 상태**를 추적한다.
 *
 * 흔한 두 가지 오답이 있다.
 * - 전역 boolean(`mutation.isPending`): 한 건을 처리하는 동안 무관한 카드까지 전부 잠긴다.
 * - 단일 id(`useState<string | null>`): A 처리 중에 B를 시작하면 B가 A를 덮어써
 *   **아직 요청 중인 A가 다시 활성화**되고(중복 요청 가능), 먼저 끝난 쪽의 `onSettled`가
 *   남아 있는 요청의 pending까지 풀어 버린다.
 *
 * 집합으로 관리하면 두 문제가 모두 사라진다.
 *
 * ```ts
 * const pending = usePendingIds();
 * pending.start(id);
 * mutate(vars, { onSettled: () => pending.finish(id) });
 * // 렌더: pending.has(id)
 * ```
 */
export function usePendingIds() {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());

  const start = useCallback((id: string) => {
    setIds((prev) => new Set(prev).add(id));
  }, []);

  const finish = useCallback((id: string) => {
    setIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const has = useCallback((id: string) => ids.has(id), [ids]);

  return useMemo(() => ({ has, start, finish }), [has, start, finish]);
}

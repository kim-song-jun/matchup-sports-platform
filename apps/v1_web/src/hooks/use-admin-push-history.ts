'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { v1Get } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import type { AdminPushHistoryDetail, AdminPushHistoryPage } from '@/types/admin-push-history';
import type { V1AdminPushSendTarget } from '@/types/api';

export function useAdminPushHistory(target?: V1AdminPushSendTarget) {
  return useInfiniteQuery({
    queryKey: v1Keys.adminPushHistory(target),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => v1Get<AdminPushHistoryPage>('/admin/ops/push-history', { limit: 20, target, cursor: pageParam }),
    getNextPageParam: (last) => last.pageInfo.hasNextPage ? last.pageInfo.nextCursor ?? undefined : undefined,
  });
}

export function useAdminPushHistoryDetail(id: string | null) {
  return useQuery({
    queryKey: v1Keys.adminPushHistoryDetail(id),
    queryFn: () => v1Get<AdminPushHistoryDetail>(`/admin/ops/push-history/${id}`),
    enabled: id !== null,
  });
}

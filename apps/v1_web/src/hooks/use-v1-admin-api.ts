'use client';

import { useQuery } from '@tanstack/react-query';
import { v1Get } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import type { CursorPage } from '@/types/api';
import type {
  V1AdminActionLog,
  V1AdminLogFilters,
  V1AdminMe,
  V1AdminOverview,
  V1AdminStatusChangeLog,
} from '@/types/admin-api';

type QueryOptions = { readonly enabled?: boolean; readonly retry?: boolean | number };

export function useV1AdminMe(options?: QueryOptions) {
  return useQuery({
    queryKey: v1Keys.adminMe(),
    queryFn: () => v1Get<V1AdminMe>('/admin/me'),
    enabled: options?.enabled,
    retry: options?.retry,
  });
}

export function useV1AdminOverview(options?: QueryOptions) {
  return useQuery({
    queryKey: v1Keys.adminOverview(),
    queryFn: () => v1Get<V1AdminOverview>('/admin/overview'),
    enabled: options?.enabled,
    retry: options?.retry,
  });
}

export function useV1AdminActionLogs(filters?: V1AdminLogFilters, options?: QueryOptions) {
  return useQuery({
    queryKey: v1Keys.adminActionLogs(filters),
    queryFn: () => v1Get<CursorPage<V1AdminActionLog>>('/admin/action-logs', filters),
    enabled: options?.enabled,
    retry: options?.retry,
  });
}

export function useV1AdminStatusChangeLogs(filters?: V1AdminLogFilters, options?: QueryOptions) {
  return useQuery({
    queryKey: v1Keys.adminStatusChangeLogs(filters),
    queryFn: () => v1Get<CursorPage<V1AdminStatusChangeLog>>('/admin/status-change-logs', filters),
    enabled: options?.enabled,
    retry: options?.retry,
  });
}

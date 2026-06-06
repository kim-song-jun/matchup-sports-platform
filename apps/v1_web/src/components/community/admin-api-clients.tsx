'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { v1Get } from '@/lib/api-client';
import { AdminAuditPageView, AdminDashboardPageView } from './admin-page';
import { AdminStatusMutationPanel } from './admin-status-mutation-panel';
import { toAdminAuditModel, toAdminDashboardModel } from './admin.view-model';
import type { AdminLoadState } from './admin.types';

type UnknownRecord = { readonly [key: string]: unknown };

const adminKeys = {
  me: ['v1', 'admin', 'me'] as const,
  overview: ['v1', 'admin', 'overview'] as const,
  actionLogs: (limit: number) => ['v1', 'admin', 'action-logs', limit] as const,
  statusLogs: (limit: number) => ['v1', 'admin', 'status-change-logs', limit] as const,
};

export { AdminStatusMutationPanel } from './admin-status-mutation-panel';

export function AdminDashboardPageClient() {
  const authority = useAdminQuery(adminKeys.me, '/admin/me');
  const overview = useAdminQuery(adminKeys.overview, '/admin/overview');
  const logs = useAdminQuery(adminKeys.actionLogs(5), '/admin/action-logs?limit=5');
  const statusLogs = useAdminQuery(adminKeys.statusLogs(3), '/admin/status-change-logs?limit=3');
  const authorityState = queryState(authority.isPending, authority.isError);
  const model = useMemo(
    () =>
      toAdminDashboardModel({
        authority: authority.data,
        overview: overview.data,
        logs: logs.data,
        statusLogs: statusLogs.data,
        authorityState,
        overviewState: queryState(overview.isPending, overview.isError),
        logsState: queryState(logs.isPending, logs.isError),
        statusLogsState: queryState(statusLogs.isPending, statusLogs.isError),
        errorMessage: errorMessage(authority.error) ?? errorMessage(overview.error) ?? errorMessage(logs.error) ?? errorMessage(statusLogs.error),
      }),
    [authority.data, authority.error, authorityState, overview.data, overview.error, overview.isError, overview.isPending, logs.data, logs.error, logs.isError, logs.isPending, statusLogs.data, statusLogs.error, statusLogs.isError, statusLogs.isPending],
  );

  return (
    <AdminDashboardPageView
      model={model}
      statusMutationPanel={<AdminStatusMutationPanel authorityState={authorityState} canWriteStatus={model.authority.canWriteStatus} />}
      onRetry={() => {
        void authority.refetch();
        void overview.refetch();
        void logs.refetch();
        void statusLogs.refetch();
      }}
    />
  );
}

export function AdminAuditPageClient() {
  const authority = useAdminQuery(adminKeys.me, '/admin/me');
  const logs = useAdminQuery(adminKeys.actionLogs(30), '/admin/action-logs?limit=30');
  const model = useMemo(
    () =>
      toAdminAuditModel({
        authority: authority.data,
        logs: logs.data,
        nextCursor: nextCursor(logs.data),
        authorityState: queryState(authority.isPending, authority.isError),
        state: queryState(logs.isPending, logs.isError),
        errorMessage: errorMessage(authority.error) ?? errorMessage(logs.error),
      }),
    [authority.data, authority.error, authority.isError, authority.isPending, logs.data, logs.error, logs.isError, logs.isPending],
  );

  return <AdminAuditPageView model={model} onRetry={() => {
    void authority.refetch();
    void logs.refetch();
  }} />;
}

function useAdminQuery(queryKey: readonly unknown[], path: string) {
  return useQuery({
    queryKey,
    queryFn: () => v1Get<unknown>(path),
    retry: false,
  });
}

function queryState(isPending: boolean, isError: boolean): AdminLoadState {
  if (isError) return 'error';
  if (isPending) return 'loading';
  return 'ready';
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return undefined;
}

function nextCursor(value: unknown) {
  const wire = asRecord(value);
  if (!wire) return null;
  const pageInfo = asRecord(wire.pageInfo);
  return stringOrNull(wire.nextCursor) ?? stringOrNull(pageInfo?.nextCursor) ?? null;
}

function asRecord(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' ? value : null;
}

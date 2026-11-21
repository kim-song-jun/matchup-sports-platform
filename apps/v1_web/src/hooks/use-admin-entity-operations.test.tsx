import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAdminOperations, useAdminOperationsContext } from './use-admin-entity-operations';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return { client, Wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}

describe('admin entity operations HTTP contract', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads a specific member page and keeps another member history out of its cache', async () => {
    const payload = { items: [{ id: 'log', title: '상태 변경', href: null, status: 'suspended', at: null,
      description: null, actor: '운영자', reason: '확인 필요', fromStatus: 'active' }],
      pageInfo: { page: 2, pageSize: 10, total: 11, hasNext: false } };
    const requests: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      requests.push(url);
      return new Response(JSON.stringify({ status: 'success', data: payload, timestamp: new Date().toISOString() }), { status: 200 });
    }));
    const { client, Wrapper } = wrapper();
    const { result, unmount } = renderHook(() => useAdminOperations('users', 'member-1', 'history', 2), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain('/admin/users/member-1/operations/history?page=2');
    expect(result.current.data).toEqual(payload);
    expect(client.getQueryData(['v1', 'admin', 'users', 'member-2', 'operations', 'history', 2])).toBeUndefined();
    unmount(); client.clear();
  });

  it('surfaces access denial instead of a successful empty context', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'error', statusCode: 403,
      code: 'PERMISSION_DENIED', message: '운영자 권한이 필요해요.', timestamp: new Date().toISOString() }), { status: 403 })));
    const { client, Wrapper } = wrapper();
    const { result, unmount } = renderHook(() => useAdminOperationsContext('teams', 'team-1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: 'PERMISSION_DENIED', statusCode: 403 });
    expect(result.current.data).toBeUndefined();
    unmount(); client.clear();
  });
});

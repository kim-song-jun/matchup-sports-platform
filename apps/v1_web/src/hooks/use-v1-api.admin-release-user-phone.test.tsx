import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import { ADMIN_PHONE_RELEASE_MSW, adminPhoneReleaseResult } from '@/test/msw/admin-user-phone-release-handlers';
import { server } from '@/test/msw/server';
import { useV1ReleaseAdminUserPhone } from './use-v1-api';

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  // 클라이언트가 4xx 실패를 보고한다 — 이 파일이 보려는 대상이 아니라서 받아 준다.
  server.use(http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ status: 'success', data: {} })));
});
afterEach(() => server.resetHandlers());

describe('useV1ReleaseAdminUserPhone', () => {
  it('sends the reason to the release endpoint and marks the user detail and the user list stale', async () => {
    const detailKey = v1Keys.adminUser('user-1');
    const listKey = v1Keys.adminUsers({ q: 'qa' });
    const unrelatedKey = v1Keys.adminTeams();
    client.setQueryData(detailKey, { userId: 'user-1', phone: '01012345678' });
    client.setQueryData(listKey, { items: [] });
    client.setQueryData(unrelatedKey, { items: [] });

    const { result } = renderHook(() => useV1ReleaseAdminUserPhone('user-1'), { wrapper });
    result.current.mutate({ reason: '번호 재할당 확인' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(adminPhoneReleaseResult('user-1'));
    expect(client.getQueryState(detailKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(unrelatedKey)?.isInvalidated).toBe(false);
  });

  it('keeps the cached user when the server refuses, and exposes the error code', async () => {
    const detailKey = v1Keys.adminUser(ADMIN_PHONE_RELEASE_MSW.noPhoneUserId);
    client.setQueryData(detailKey, { userId: ADMIN_PHONE_RELEASE_MSW.noPhoneUserId, phone: null });

    const { result } = renderHook(() => useV1ReleaseAdminUserPhone(ADMIN_PHONE_RELEASE_MSW.noPhoneUserId), { wrapper });
    result.current.mutate({ reason: '확인' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(V1ApiError);
    expect(result.current.error).toMatchObject({ statusCode: 409, code: 'PHONE_NOT_SET' });
    expect(client.getQueryState(detailKey)?.isInvalidated).toBe(false);
  });
});

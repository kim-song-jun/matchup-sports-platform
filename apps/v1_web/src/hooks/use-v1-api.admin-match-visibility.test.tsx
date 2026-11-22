import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import { ADMIN_MATCH_VISIBILITY_MSW, adminMatchVisibilityResult } from '@/test/msw/admin-match-visibility-handlers';
import { server } from '@/test/msw/server';
import { useV1HideAdminMatch, useV1UnhideAdminMatch } from './use-v1-api';

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  server.use(http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ status: 'success', data: {} })));
});
afterEach(() => server.resetHandlers());

describe('useV1HideAdminMatch / useV1UnhideAdminMatch', () => {
  it('숨기면 상세·목록·공개 화면 캐시를 다시 불러오게 하고 다른 매치 상세는 건드리지 않는다', async () => {
    const detailKey = v1Keys.adminMatch('match-1');
    const otherDetailKey = v1Keys.adminMatch('match-2');
    const listKey = v1Keys.adminMatches({ visibility: 'hidden' });
    const publicKey = v1Keys.match('match-1');
    const unrelatedKey = v1Keys.adminTeams();
    for (const key of [detailKey, otherDetailKey, listKey, publicKey, unrelatedKey]) client.setQueryData(key, {});

    const { result } = renderHook(() => useV1HideAdminMatch('match-1'), { wrapper });
    result.current.mutate({ reason: '운영 시험용' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(adminMatchVisibilityResult('match-1', true));
    expect(client.getQueryState(detailKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(publicKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherDetailKey)?.isInvalidated).toBe(false);
    expect(client.getQueryState(unrelatedKey)?.isInvalidated).toBe(false);
  });

  it('복원은 unhide 경로로 사유를 보내고 hidden=false 를 돌려받는다', async () => {
    const { result } = renderHook(() => useV1UnhideAdminMatch('match-1'), { wrapper });
    result.current.mutate({ reason: '실제 경기였어요' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(adminMatchVisibilityResult('match-1', false));
  });

  it('서버가 거절하면 캐시를 그대로 두고 도메인 코드를 노출한다', async () => {
    const detailKey = v1Keys.adminMatch(ADMIN_MATCH_VISIBILITY_MSW.hasParticipantsMatchId);
    client.setQueryData(detailKey, {});

    const { result } = renderHook(() => useV1HideAdminMatch(ADMIN_MATCH_VISIBILITY_MSW.hasParticipantsMatchId), { wrapper });
    result.current.mutate({ reason: '정리' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(V1ApiError);
    expect(result.current.error).toMatchObject({ statusCode: 409, code: 'MATCH_HIDE_HAS_PARTICIPANTS' });
    expect(client.getQueryState(detailKey)?.isInvalidated).toBe(false);
  });
});

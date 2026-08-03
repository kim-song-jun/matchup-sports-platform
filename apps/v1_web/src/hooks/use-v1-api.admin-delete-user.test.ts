/**
 * useV1DeleteAdminUser 회귀 테스트.
 *
 * 프로덕션에서 어드민 사용자 삭제가 **매번 400** 이었다(2026-08-03, 두 번 다 실패).
 * 원인은 서버가 아니라 호출부였다 — `v1Delete(path, body, init)` 의 2번째 인자는 fetch 의
 * init 이 아니라 **body 그 자체**인데, 호출부가 `{ body: JSON.stringify(payload) }` 를
 * 넘겨서 값이 한 겹 더 감싸졌다. 서버에는 `{"body":"{\"reason\":...}"}` 가 도착했고
 * `reason` 이 없으니 DTO 검증이 400 을 냈다. 요청 바이트는 정상 도착했으므로(프록시가
 * DELETE body 를 벗긴 것이 아니다) 로그만 봐서는 원인이 드러나지 않았다.
 *
 * `body` 파라미터 타입이 `unknown` 이라 컴파일러가 잡아 주지 못한다. 그래서 **호출부가
 * v1Delete 에 무엇을 넘기는지**를 직접 못박는다 — v1Delete 자체를 검증하는 테스트는 그
 * 함수가 원래 옳았기 때문에 이 버그에서 통과해 버려 아무것도 증명하지 못한다.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, v1Delete: vi.fn().mockResolvedValue({ userId: 'user-1', status: 'deleted' }) };
});

import { v1Delete } from '@/lib/api-client';
import { useV1DeleteAdminUser } from './use-v1-api';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

describe('useV1DeleteAdminUser', () => {
  it('payload 를 v1Delete 에 그대로 넘긴다 — { body: ... } 로 감싸지 않는다', async () => {
    const { result } = renderHook(() => useV1DeleteAdminUser('user-1'), { wrapper });

    result.current.mutate({ reason: '이용약관 위반' });

    await waitFor(() => expect(v1Delete).toHaveBeenCalled());
    expect(v1Delete).toHaveBeenCalledWith('/admin/users/user-1', { reason: '이용약관 위반' });

    // 회귀 형태를 직접 배제한다: 감싸졌다면 2번째 인자에 body 키가 생긴다.
    const passed = (v1Delete as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(passed)).not.toContain('body');
  });
});

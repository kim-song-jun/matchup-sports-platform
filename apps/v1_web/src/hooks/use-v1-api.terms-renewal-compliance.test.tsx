import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { v1Keys } from '@/lib/query-keys';
import type { V1AuthMe, V1CurrentSignupTerms } from '@/types/api';
import { useV1AcceptSignupTerms } from './use-v1-api';

describe('useV1AcceptSignupTerms', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('synchronously updates the cached authMe compliance so PendingSocialSignupGate does not bounce back to /terms on the very next render', async () => {
    const acceptedResponse: V1CurrentSignupTerms = {
      context: 'signup',
      ready: true,
      items: [],
      compliance: { compliant: true, pendingRequiredDocumentIds: [], nextRoute: null },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ status: 'success', data: acceptedResponse, timestamp: new Date().toISOString() }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    // PendingSocialSignupGate 가 /terms 진입 전에 이미 읽어 둔, 재동의가 필요한 상태의
    // authMe 스냅샷을 재현한다. 이 캐시가 갱신되기 전까지는 게이트가 모든 라우트를
    // /terms?mode=renewal 로 되돌려보낸다.
    const staleAuthMe: V1AuthMe = {
      user: { id: 'user-1', email: 'user@example.com', onboardingStatus: 'completed' },
      profile: { displayName: '테스트 사용자' },
      termsCompliance: {
        compliant: false,
        pendingRequiredDocumentIds: ['doc-1'],
        nextRoute: '/terms?mode=renewal',
      },
    };
    queryClient.setQueryData(v1Keys.authMe(), staleAuthMe);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useV1AcceptSignupTerms(), { wrapper });

    await act(() => result.current.mutateAsync({ documentIds: ['doc-1'] }));

    // 이 값이 mutate 의 onSuccess 안에서 동기적으로 갱신되지 않고 invalidateQueries 의
    // 비동기 refetch 완료만 기다리면, TermsClient 가 이어서 호출하는 router.replace('/home')
    // 이 refetch 보다 먼저 실행돼 PendingSocialSignupGate 가 이 stale snapshot(compliant:false)
    // 을 읽고 사용자를 다시 /terms?mode=renewal&redirect=%2Fhome 로 튕겨낸다 — 알파에서
    // 실측된 "첫 클릭이 반응 없어 보이는" 버그의 원인이었다.
    const authMe = queryClient.getQueryData<V1AuthMe>(v1Keys.authMe());
    expect(authMe?.termsCompliance).toEqual({
      compliant: true,
      pendingRequiredDocumentIds: [],
      nextRoute: null,
    });
  });

  it('leaves the authMe cache untouched when no authMe snapshot has been fetched yet', async () => {
    const acceptedResponse: V1CurrentSignupTerms = {
      context: 'signup',
      ready: true,
      items: [],
      compliance: { compliant: true, pendingRequiredDocumentIds: [], nextRoute: null },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ status: 'success', data: acceptedResponse, timestamp: new Date().toISOString() }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useV1AcceptSignupTerms(), { wrapper });

    await act(() => result.current.mutateAsync({ documentIds: ['doc-1'] }));

    expect(queryClient.getQueryData<V1AuthMe>(v1Keys.authMe())).toBeUndefined();
  });
});

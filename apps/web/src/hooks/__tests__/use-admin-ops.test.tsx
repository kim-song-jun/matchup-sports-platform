import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api', () => {
  const mockApi = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  };
  return { api: mockApi };
});

import {
  useAdminOpsSummary,
  useRecentPushFailures,
  useAckPushFailures,
  useRetryPayout,
} from '../use-api';
import { api } from '@/lib/api';

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const mockSummary = {
  matchesInProgress: 12,
  paymentsPending: 3,
  disputesOpen: 2,
  settlementsPending: 17,
  payoutsFailed: 1,
  pushFailures5m: 4,
};

const mockPushFailures = [
  {
    id: 'wpf-1',
    endpointSuffix: 'abc123',
    userIdHash: 'a1b2c3d4',
    statusCode: 500,
    errorCode: 'InternalServerError',
    occurredAt: '2026-04-19T09:00:00.000Z',
    acknowledgedAt: null,
  },
  {
    id: 'wpf-2',
    endpointSuffix: 'def456',
    userIdHash: 'e5f6a7b8',
    statusCode: 410,
    errorCode: 'UnsubscribeExpired',
    occurredAt: '2026-04-19T09:01:00.000Z',
    acknowledgedAt: null,
  },
];

// ── useAdminOpsSummary ────────────────────────────────────────────────────────

describe('useAdminOpsSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches KPI summary from GET /admin/ops/summary', async () => {
    mockApi.get.mockResolvedValueOnce({ status: 'success', data: mockSummary });

    const { result } = renderHook(() => useAdminOpsSummary(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith('/admin/ops/summary');
    expect(result.current.data?.matchesInProgress).toBe(12);
    expect(result.current.data?.paymentsPending).toBe(3);
    expect(result.current.data?.disputesOpen).toBe(2);
    expect(result.current.data?.settlementsPending).toBe(17);
    expect(result.current.data?.payoutsFailed).toBe(1);
    expect(result.current.data?.pushFailures5m).toBe(4);
  });

  it('hook is configured with staleTime=10s and refetchInterval=30s', async () => {
    // Verify options by spying on useQuery.
    // This is the most reliable approach without fakeTimers + act issues.
    mockApi.get.mockResolvedValueOnce({ status: 'success', data: mockSummary });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useAdminOpsSummary(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Inspect the observer options from the query cache
    const cache = queryClient.getQueryCache();
    const query = cache.find({ queryKey: ['admin-ops-summary'] });
    // Options are stored per-observer — check the query's observer list
    const observers = query?.observers ?? [];
    expect(observers.length).toBeGreaterThan(0);
    const observerOptions = (observers[0] as unknown as { options: Record<string, unknown> }).options;
    expect(observerOptions.staleTime).toBe(10_000);
    expect(observerOptions.refetchInterval).toBe(30_000);
  });

  it('surfaces error message when API fails', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('Network Error'));

    const { result } = renderHook(() => useAdminOpsSummary(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('운영 요약 정보를 불러오지 못했어요');
  });
});

// ── useRecentPushFailures ─────────────────────────────────────────────────────

describe('useRecentPushFailures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches push failure logs from GET /admin/ops/recent-push-failures with default limit 20', async () => {
    mockApi.get.mockResolvedValueOnce({ status: 'success', data: mockPushFailures });

    const { result } = renderHook(() => useRecentPushFailures(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith(
      '/admin/ops/recent-push-failures',
      { params: { limit: 20 } },
    );
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].endpointSuffix).toHaveLength(6);
    expect(result.current.data?.[0].userIdHash).toHaveLength(8);
  });

  it('passes custom limit param to the endpoint', async () => {
    mockApi.get.mockResolvedValueOnce({ status: 'success', data: [] });

    const { result } = renderHook(() => useRecentPushFailures(5), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith(
      '/admin/ops/recent-push-failures',
      { params: { limit: 5 } },
    );
  });

  it('surfaces error message when API fails', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('Forbidden'));

    const { result } = renderHook(() => useRecentPushFailures(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('푸시 실패 로그를 불러오지 못했어요');
  });
});

// ── useAckPushFailures ────────────────────────────────────────────────────────

describe('useAckPushFailures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs to /admin/ops/push-failures/ack and returns acknowledged count', async () => {
    mockApi.post.mockResolvedValueOnce({ status: 'success', data: { acknowledged: 4 } });

    const { result } = renderHook(() => useAckPushFailures(), { wrapper: makeWrapper() });

    result.current.mutate({ ids: ['wpf-1', 'wpf-2'] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.post).toHaveBeenCalledWith(
      '/admin/ops/push-failures/ack',
      { ids: ['wpf-1', 'wpf-2'] },
    );
    expect(result.current.data?.acknowledged).toBe(4);
  });

  it('calls ack endpoint with empty body when no param provided', async () => {
    mockApi.post.mockResolvedValueOnce({ status: 'success', data: { acknowledged: 10 } });

    const { result } = renderHook(() => useAckPushFailures(), { wrapper: makeWrapper() });

    result.current.mutate(undefined);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.post).toHaveBeenCalledWith('/admin/ops/push-failures/ack', {});
  });

  it('surfaces error message when ack fails', async () => {
    mockApi.post.mockRejectedValueOnce(new Error('Unauthorized'));

    const { result } = renderHook(() => useAckPushFailures(), { wrapper: makeWrapper() });

    result.current.mutate(undefined);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('실패 로그 확인 처리에 실패했어요');
  });
});

// ── useRetryPayout ────────────────────────────────────────────────────────────

describe('useRetryPayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs to /admin/payouts/:id/retry and returns updated payout', async () => {
    const retried = {
      id: 'payout-1',
      batchId: 'batch-001',
      recipientId: 'user-1',
      grossAmount: 450000,
      platformFee: 45000,
      netAmount: 405000,
      status: 'cancelled',
      note: '재대기열 복원',
      failureReason: null,
      paidAt: null,
      processedAt: null,
      markedPaidByAdminId: null,
      createdAt: '2026-04-19T00:00:00.000Z',
      updatedAt: '2026-04-19T10:00:00.000Z',
    };
    mockApi.post.mockResolvedValueOnce({ status: 'success', data: retried });

    const { result } = renderHook(() => useRetryPayout(), { wrapper: makeWrapper() });

    result.current.mutate('payout-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.post).toHaveBeenCalledWith('/admin/payouts/payout-1/retry');
    expect(result.current.data?.status).toBe('cancelled');
    expect(result.current.data?.failureReason).toBeNull();
  });

  it('surfaces error when retry is rejected (e.g. payout already paid)', async () => {
    mockApi.post.mockRejectedValueOnce(new Error('PAYOUT_NOT_RETRIABLE'));

    const { result } = renderHook(() => useRetryPayout(), { wrapper: makeWrapper() });

    result.current.mutate('payout-paid');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('payout 재시도에 실패했어요');
  });
});

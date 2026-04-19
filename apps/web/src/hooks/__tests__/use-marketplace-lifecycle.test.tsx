import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { mockOrder, mockOrderShipped, mockOrderDelivered } from '@/test/fixtures/marketplace';
import { mockDispute, mockPayout, mockEligibleSettlement } from '@/test/fixtures/admin';

vi.mock('@/lib/api', () => {
  const mockApi = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
  return { api: mockApi };
});

import {
  useMyOrders,
  useOrder,
  useConfirmReceipt,
  useShipOrder,
  useDeliverOrder,
  useFileDispute,
  useAdminPayouts,
  useAdminEligibleSettlements,
  useCreatePayoutBatch,
  useMarkPayoutPaid,
  useMarkPayoutFailed,
  useResolveDispute,
  useForceReleaseOrder,
  useMyDisputes,
  useDispute,
  useSellerRespond,
  useAddDisputeMessage,
  useWithdrawDispute,
} from '../use-api';
import { api } from '@/lib/api';

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

// ── Happy path: buyer views their orders ──────────────────────────────────────

describe('useMyOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches buyer order list from GET /marketplace/orders/me', async () => {
    mockApi.get.mockResolvedValueOnce({
      status: 'success',
      data: { data: [mockOrder, mockOrderShipped], nextCursor: null, hasMore: false },
    });

    const { result } = renderHook(() => useMyOrders(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith('/marketplace/orders/me', expect.any(Object));
    // extractCursorPage returns CursorPage — verify the inner pages data
    expect(result.current.data).toBeDefined();
  });
});

// ── Happy path: view single order ────────────────────────────────────────────

describe('useOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches order detail from GET /marketplace/orders/:id', async () => {
    mockApi.get.mockResolvedValueOnce({
      status: 'success',
      data: mockOrder,
    });

    const { result } = renderHook(() => useOrder('order-1'), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith('/marketplace/orders/order-1');
    expect(result.current.data?.status).toBe('pending');
  });

  it('is disabled when id is empty string', () => {
    const { result } = renderHook(() => useOrder(''), { wrapper: makeWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApi.get).not.toHaveBeenCalled();
  });
});

// ── Happy path: seller ships order ───────────────────────────────────────────

describe('useShipOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs to /marketplace/orders/:id/ship and returns shipped order', async () => {
    mockApi.post.mockResolvedValueOnce({
      status: 'success',
      data: mockOrderShipped,
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useShipOrder(), { wrapper });

    result.current.mutate({ id: 'order-1', data: { carrier: 'CJ대한통운', trackingNumber: '123456' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.post).toHaveBeenCalledWith(
      '/marketplace/orders/order-1/ship',
      { carrier: 'CJ대한통운', trackingNumber: '123456' },
    );
    expect(result.current.data?.status).toBe('shipped');
  });
});

// ── Happy path: buyer confirms receipt → completes escrow ────────────────────

describe('useConfirmReceipt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs to /marketplace/orders/:id/confirm-receipt and returns completed order', async () => {
    mockApi.post.mockResolvedValueOnce({
      status: 'success',
      data: { ...mockOrderDelivered, status: 'completed', confirmedReceiptAt: '2024-01-15T10:00:00.000Z' },
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useConfirmReceipt(), { wrapper });

    result.current.mutate('order-3');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.post).toHaveBeenCalledWith('/marketplace/orders/order-3/confirm-receipt');
    expect(result.current.data?.status).toBe('completed');
  });
});

// ── Happy path: buyer files a dispute ────────────────────────────────────────

describe('useFileDispute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs to /marketplace/orders/:id/dispute and returns dispute record', async () => {
    mockApi.post.mockResolvedValueOnce({
      status: 'success',
      data: mockDispute,
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useFileDispute(), { wrapper });

    result.current.mutate({
      id: 'order-1',
      data: { type: 'not_as_described', description: '상품 상태가 설명과 달라요.' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.post).toHaveBeenCalledWith(
      '/marketplace/orders/order-1/dispute',
      { type: 'not_as_described', description: '상품 상태가 설명과 달라요.' },
    );
    expect(result.current.data?.status).toBe('filed');
    expect(result.current.data?.targetType).toBe('marketplace_order');
  });
});

// ── Optimistic update: add dispute message ────────────────────────────────────

describe('useAddDisputeMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('optimistically appends message before server responds', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    // Seed the dispute detail in cache
    queryClient.setQueryData(['disputes', 'dispute-1'], {
      ...mockDispute,
      events: [],
    });

    // Delay server response to verify optimistic update fires first
    mockApi.post.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                status: 'success',
                data: {
                  id: 'event-server-1',
                  disputeId: 'dispute-1',
                  actorUserId: 'user-2',
                  actorRole: 'buyer',
                  message: '추가 증거 사진 첨부합니다.',
                  attachmentUrls: [],
                  createdAt: new Date().toISOString(),
                },
              }),
            50,
          ),
        ),
    );

    const { result } = renderHook(() => useAddDisputeMessage(), { wrapper });

    act(() => {
      result.current.mutate({ id: 'dispute-1', data: { body: '추가 증거 사진 첨부합니다.' } });
    });

    // Before server responds, optimistic event should be in cache
    await waitFor(() => {
      const cached = queryClient.getQueryData<{ events?: { message: string }[] }>([
        'disputes',
        'dispute-1',
      ]);
      return (cached?.events?.length ?? 0) > 0;
    });

    const cachedMid = queryClient.getQueryData<{ events?: { id: string; message: string }[] }>([
      'disputes',
      'dispute-1',
    ]);
    expect(cachedMid?.events?.[0]?.id).toMatch(/^optimistic-/);
    expect(cachedMid?.events?.[0]?.message).toBe('추가 증거 사진 첨부합니다.');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls back optimistic update on error', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    queryClient.setQueryData(['disputes', 'dispute-1'], {
      ...mockDispute,
      events: [],
    });

    mockApi.post.mockRejectedValueOnce(new Error('서버 오류'));

    const { result } = renderHook(() => useAddDisputeMessage(), { wrapper });

    act(() => {
      result.current.mutate({ id: 'dispute-1', data: { body: '실패할 메시지' } });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = queryClient.getQueryData<{ events?: unknown[] }>(['disputes', 'dispute-1']);
    // Should roll back — events empty again
    expect(cached?.events?.length ?? 0).toBe(0);
  });
});

// ── Admin: create payout batch ────────────────────────────────────────────────

describe('useCreatePayoutBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs to /admin/payouts/batch and returns batch response', async () => {
    mockApi.post.mockResolvedValueOnce({
      status: 'success',
      data: { batchId: 'batch-uuid-001', payouts: [mockPayout], totalNet: 405000 },
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useCreatePayoutBatch(), { wrapper });

    result.current.mutate({ recipientIds: ['user-1'] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.post).toHaveBeenCalledWith('/admin/payouts/batch', { recipientIds: ['user-1'] });
    expect(result.current.data?.batchId).toBe('batch-uuid-001');
    expect(result.current.data?.totalNet).toBe(405000);
  });
});

// ── Admin: mark payout paid ───────────────────────────────────────────────────

describe('useMarkPayoutPaid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('PATCHes /admin/payouts/:id/mark-paid and returns paid payout', async () => {
    mockApi.patch.mockResolvedValueOnce({
      status: 'success',
      data: { ...mockPayout, status: 'paid', processedAt: '2024-01-16T10:00:00.000Z' },
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useMarkPayoutPaid(), { wrapper });

    result.current.mutate({ id: 'payout-1', data: { externalRef: 'BANK-TXN-001' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.patch).toHaveBeenCalledWith(
      '/admin/payouts/payout-1/mark-paid',
      { externalRef: 'BANK-TXN-001' },
    );
    expect(result.current.data?.status).toBe('paid');
  });
});

// ── Admin: resolve dispute ────────────────────────────────────────────────────

describe('useResolveDispute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('PATCHes /admin/disputes/:id/resolve with action=release', async () => {
    mockApi.patch.mockResolvedValueOnce({
      status: 'success',
      data: { ...mockDispute, status: 'resolved_release', resolvedAt: '2024-01-20T10:00:00.000Z' },
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useResolveDispute(), { wrapper });

    result.current.mutate({ id: 'dispute-1', data: { action: 'release', note: '판매자 주장 인정' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.patch).toHaveBeenCalledWith(
      '/admin/disputes/dispute-1/resolve',
      { action: 'release', note: '판매자 주장 인정' },
    );
    expect(result.current.data?.status).toBe('resolved_release');
  });
});

// ── Admin: force-release order ────────────────────────────────────────────────

describe('useForceReleaseOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs to /admin/orders/:id/force-release and returns auto_released order', async () => {
    mockApi.post.mockResolvedValueOnce({
      status: 'success',
      data: { ...mockOrder, status: 'auto_released' },
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useForceReleaseOrder(), { wrapper });

    result.current.mutate({ id: 'order-3', note: '7일 자동해제 재실행 (cron 누락)' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.post).toHaveBeenCalledWith(
      '/admin/orders/order-3/force-release',
      { note: '7일 자동해제 재실행 (cron 누락)' },
    );
    expect(result.current.data?.status).toBe('auto_released');
  });
});

// ── Admin: eligible settlements preview ──────────────────────────────────────

describe('useAdminEligibleSettlements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches eligible settlements from GET /admin/payouts/eligible', async () => {
    mockApi.get.mockResolvedValueOnce({
      status: 'success',
      data: [mockEligibleSettlement],
    });

    const { result } = renderHook(() => useAdminEligibleSettlements(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith('/admin/payouts/eligible');
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].recipientId).toBe('user-1');
    expect(result.current.data?.[0].netAmount).toBe(405000);
  });
});

// ── Dispute: seller responds ──────────────────────────────────────────────────

describe('useSellerRespond', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs to /disputes/:id/respond and transitions dispute to seller_responded', async () => {
    mockApi.post.mockResolvedValueOnce({
      status: 'success',
      data: {
        ...mockDispute,
        status: 'seller_responded',
      },
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSellerRespond(), { wrapper });

    result.current.mutate({
      id: 'dispute-1',
      data: { response: '상품은 설명대로입니다. 사진 첨부드립니다.', attachmentUrls: [] },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.post).toHaveBeenCalledWith('/disputes/dispute-1/respond', {
      response: '상품은 설명대로입니다. 사진 첨부드립니다.',
      attachmentUrls: [],
    });
    expect(result.current.data?.status).toBe('seller_responded');
  });
});

// ── Error: mark payout failed ─────────────────────────────────────────────────

describe('useMarkPayoutFailed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('PATCHes /admin/payouts/:id/mark-failed and returns failed payout', async () => {
    mockApi.patch.mockResolvedValueOnce({
      status: 'success',
      data: { ...mockPayout, status: 'failed', failureReason: '은행 계좌 오류' },
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useMarkPayoutFailed(), { wrapper });

    result.current.mutate({ id: 'payout-1', data: { reason: '은행 계좌 오류' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.patch).toHaveBeenCalledWith(
      '/admin/payouts/payout-1/mark-failed',
      { reason: '은행 계좌 오류' },
    );
    expect(result.current.data?.status).toBe('failed');
    expect(result.current.data?.failureReason).toBe('은행 계좌 오류');
  });

  it('surfaces mutation error when API returns rejected promise', async () => {
    mockApi.patch.mockRejectedValueOnce(new Error('Network Error'));

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useMarkPayoutFailed(), { wrapper });

    result.current.mutate({ id: 'payout-1', data: { reason: '테스트 오류' } });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeTruthy();
  });
});

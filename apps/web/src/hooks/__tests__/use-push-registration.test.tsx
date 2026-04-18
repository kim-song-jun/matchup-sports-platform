import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(async () => ({ status: 'success', data: { unsubscribed: true } })),
  },
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector?: (s: { isAuthenticated: boolean }) => unknown) => {
    const state = { isAuthenticated: true };
    return selector ? selector(state) : state;
  }),
}));

import { usePushRegistration, cleanupPushSubscription } from '../use-push-registration';
import { api } from '@/lib/api';

const mockApi = api as unknown as { delete: ReturnType<typeof vi.fn> };

describe('cleanupPushSubscription — unsubscribe order (race fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls api.delete BEFORE subscription.unsubscribe (success path)', async () => {
    const callOrder: string[] = [];

    mockApi.delete.mockImplementation(async () => {
      callOrder.push('api.delete');
      return { status: 'success', data: { unsubscribed: true } };
    });

    const mockSub = {
      endpoint: 'https://example.com/push/test-endpoint',
      unsubscribe: vi.fn(async () => {
        callOrder.push('subscription.unsubscribe');
      }),
    } as unknown as PushSubscription;

    await cleanupPushSubscription(mockSub);

    expect(callOrder).toEqual(['api.delete', 'subscription.unsubscribe']);
    expect(mockApi.delete).toHaveBeenCalledWith(
      '/notifications/push-unsubscribe',
      { data: { endpoint: mockSub.endpoint } },
    );
    expect(mockSub.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('calls subscription.unsubscribe even when api.delete throws', async () => {
    const callOrder: string[] = [];

    mockApi.delete.mockImplementation(async () => {
      callOrder.push('api.delete');
      throw new Error('network error');
    });

    const mockSub = {
      endpoint: 'https://example.com/push/test-endpoint',
      unsubscribe: vi.fn(async () => {
        callOrder.push('subscription.unsubscribe');
      }),
    } as unknown as PushSubscription;

    await cleanupPushSubscription(mockSub);

    // Both must be called, api.delete first (even though it throws)
    expect(callOrder).toEqual(['api.delete', 'subscription.unsubscribe']);
    expect(mockSub.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('does not throw when subscription.unsubscribe throws', async () => {
    mockApi.delete.mockResolvedValue({ status: 'success', data: { unsubscribed: true } });

    const mockSub = {
      endpoint: 'https://example.com/push/test-endpoint',
      unsubscribe: vi.fn(async () => {
        throw new Error('browser error');
      }),
    } as unknown as PushSubscription;

    await expect(cleanupPushSubscription(mockSub)).resolves.not.toThrow();
  });
});

describe('usePushRegistration — smoke test', () => {
  it('renders without errors in test environment (no ServiceWorker/PushManager)', () => {
    expect(() => renderHook(() => usePushRegistration())).not.toThrow();
  });
});

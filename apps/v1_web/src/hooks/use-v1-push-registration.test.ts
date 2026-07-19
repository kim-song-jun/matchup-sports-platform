import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', () => ({
  v1Get: vi.fn(),
  v1Post: vi.fn(),
  v1Delete: vi.fn(),
}));

vi.mock('@/lib/client-error-reporter', () => ({
  reportClientError: vi.fn(),
}));

import { v1Delete, v1Get, v1Post } from '@/lib/api-client';
import { reportClientError } from '@/lib/client-error-reporter';

const subscription = {
  endpoint: 'https://push.example/abc',
  toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }),
  unsubscribe: vi.fn().mockResolvedValue(true),
};
const pushManager = { getSubscription: vi.fn(), subscribe: vi.fn() };
const registration = { pushManager };

beforeEach(() => {
  vi.clearAllMocks();
  pushManager.getSubscription.mockResolvedValue(null);
  pushManager.subscribe.mockResolvedValue(subscription);
  Object.defineProperty(global.navigator, 'serviceWorker', {
    configurable: true,
    value: { register: vi.fn().mockResolvedValue(registration), ready: Promise.resolve(registration) },
  });
  Object.defineProperty(global, 'PushManager', {
    configurable: true,
    writable: true,
    value: class {},
  });
  Object.defineProperty(global, 'Notification', {
    configurable: true,
    writable: true,
    value: { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') },
  });
  (v1Get as ReturnType<typeof vi.fn>).mockResolvedValue({ publicKey: 'BPUBLICKEY' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useV1PushRegistration', () => {
  it('subscribes: requests permission, registers the SW, and posts the subscription', async () => {
    const { useV1PushRegistration } = await import('./use-v1-push-registration');
    const { result } = renderHook(() => useV1PushRegistration());

    await act(async () => {
      await result.current.subscribe();
    });

    expect(Notification.requestPermission).toHaveBeenCalled();
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw-push.js');
    expect(v1Post).toHaveBeenCalledWith('/notifications/push-subscribe', {
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'p', auth: 'a' },
    });
  });

  it('does not register the service worker when the server has no VAPID public key', async () => {
    (v1Get as ReturnType<typeof vi.fn>).mockResolvedValue({ publicKey: null });
    const { useV1PushRegistration } = await import('./use-v1-push-registration');
    const { result } = renderHook(() => useV1PushRegistration());

    await act(async () => {
      await result.current.subscribe();
    });

    expect(navigator.serviceWorker.register).not.toHaveBeenCalled();
    expect(v1Post).not.toHaveBeenCalled();
  });

  it('does nothing when permission is already denied', async () => {
    Object.defineProperty(global, 'Notification', {
      configurable: true,
      writable: true,
      value: { permission: 'denied', requestPermission: vi.fn() },
    });
    const { useV1PushRegistration } = await import('./use-v1-push-registration');
    const { result } = renderHook(() => useV1PushRegistration());

    await act(async () => {
      await result.current.subscribe();
    });

    expect(v1Post).not.toHaveBeenCalled();
  });

  it('unsubscribe calls the server delete before the browser unsubscribe', async () => {
    pushManager.getSubscription.mockResolvedValue(subscription);
    const { useV1PushRegistration } = await import('./use-v1-push-registration');
    const { result } = renderHook(() => useV1PushRegistration());
    await waitFor(() => expect(result.current.isSubscribed).toBe(true));

    await act(async () => {
      await result.current.unsubscribe();
    });

    expect(v1Delete).toHaveBeenCalledWith('/notifications/push-unsubscribe', { endpoint: 'https://push.example/abc' });
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });

  it('unsubscribe still unsubscribes the browser and reports the error when the server call fails', async () => {
    pushManager.getSubscription.mockResolvedValue(subscription);
    (v1Delete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));
    const { useV1PushRegistration } = await import('./use-v1-push-registration');
    const { result } = renderHook(() => useV1PushRegistration());
    await waitFor(() => expect(result.current.isSubscribed).toBe(true));

    await act(async () => {
      await result.current.unsubscribe();
    });

    expect(subscription.unsubscribe).toHaveBeenCalled();
    expect(result.current.isSubscribed).toBe(false);
    expect(reportClientError).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ flow: 'push-unsubscribe-server' }) }),
    );
  });

  it('subscribe swallows and reports a rejection instead of throwing (no unhandled rejection)', async () => {
    (v1Post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('server exploded'));
    const { useV1PushRegistration } = await import('./use-v1-push-registration');
    const { result } = renderHook(() => useV1PushRegistration());

    await act(async () => {
      await expect(result.current.subscribe()).resolves.toBeUndefined();
    });

    expect(reportClientError).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ flow: 'push-subscribe' }) }),
    );
    expect(result.current.isSubscribed).toBe(false);
  });
});

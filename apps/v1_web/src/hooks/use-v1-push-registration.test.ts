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

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

import { v1Delete, v1Get, v1Post } from '@/lib/api-client';
import { reportClientError } from '@/lib/client-error-reporter';
import { trackEvent } from '@/lib/analytics';

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
    value: {
      register: vi.fn().mockResolvedValue(registration),
      // subscribe() 는 register() 직후 활성화를 기다리므로 ready 를 계속 쓴다.
      ready: Promise.resolve(registration),
      // 상태 확인·구독 해지는 getRegistration() 을 쓴다 — ready 는 등록이 없으면
      // 영원히 미결이라 로그아웃이 멈춰 서기 때문이다(use-v1-push-registration 주석).
      getRegistration: vi.fn().mockResolvedValue(registration),
    },
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
  delete window.TeameetNative;
  vi.restoreAllMocks();
});

describe('useV1PushRegistration', () => {
  it('uses native FCM in the Android shell without invoking browser Web Push', async () => {
    window.TeameetNative = {
      postMessage: vi.fn((message) => {
        const request = JSON.parse(message) as { requestId: string; type: string };
        window.dispatchEvent(new CustomEvent('teameet:native-push-result', {
          detail: {
            requestId: request.requestId,
            permission: request.type === 'get-push-state' ? 'default' : 'granted',
            subscribed: request.type === 'request-notification-permission',
          },
        }));
      }),
    };
    const { useV1PushRegistration } = await import('./use-v1-push-registration');
    const { result } = renderHook(() => useV1PushRegistration());

    await act(async () => {
      await result.current.subscribe();
    });

    expect(window.TeameetNative.postMessage).toHaveBeenCalled();
    expect(Notification.requestPermission).not.toHaveBeenCalled();
    expect(v1Get).not.toHaveBeenCalled();
    expect(result.current.isSubscribed).toBe(true);
  });

  it('refreshes the native permission state after returning from Android settings', async () => {
    let permission: NotificationPermission = 'denied';
    window.TeameetNative = {
      postMessage: vi.fn((message) => {
        const request = JSON.parse(message) as { requestId: string; type: string };
        window.dispatchEvent(new CustomEvent('teameet:native-push-result', {
          detail: {
            requestId: request.requestId,
            permission,
            subscribed: permission === 'granted',
          },
        }));
      }),
    };
    const { useV1PushRegistration } = await import('./use-v1-push-registration');
    const { result } = renderHook(() => useV1PushRegistration());
    await waitFor(() => expect(result.current.permission).toBe('denied'));

    permission = 'granted';
    window.dispatchEvent(new Event('focus'));

    await waitFor(() => {
      expect(result.current.permission).toBe('granted');
      expect(result.current.isSubscribed).toBe(true);
    });
  });

  it('revokes the native device before logout instead of touching browser Web Push', async () => {
    const messages: string[] = [];
    window.TeameetNative = {
      postMessage: vi.fn((message) => {
        messages.push(message);
        const request = JSON.parse(message) as { requestId: string; type: string };
        window.dispatchEvent(new CustomEvent('teameet:native-push-result', {
          detail: {
            requestId: request.requestId,
            permission: 'granted',
            subscribed: request.type !== 'revoke-push-device',
          },
        }));
      }),
    };
    const { useV1PushRegistration } = await import('./use-v1-push-registration');
    const { result } = renderHook(() => useV1PushRegistration());
    await waitFor(() => expect(result.current.isSubscribed).toBe(true));

    await act(async () => {
      await result.current.unsubscribe();
    });

    expect(messages.some((message) => JSON.parse(message).type === 'revoke-push-device')).toBe(true);
    expect(navigator.serviceWorker.getRegistration).not.toHaveBeenCalled();
    expect(result.current.isSubscribed).toBe(false);
  });

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

  it('tracks push_subscribe_complete only after the server subscribe call succeeds', async () => {
    const { useV1PushRegistration } = await import('./use-v1-push-registration');
    const { result } = renderHook(() => useV1PushRegistration());

    await act(async () => {
      await result.current.subscribe();
    });

    expect(trackEvent).toHaveBeenCalledWith('push_subscribe_complete', {});
    // Ordering: the GA event must fire after v1Post resolves, not before.
    const postOrder = (v1Post as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const trackOrder = (trackEvent as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(trackOrder).toBeGreaterThan(postOrder);
  });

  it('does not track push_subscribe_complete when the server subscribe call fails', async () => {
    (v1Post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('server exploded'));
    const { useV1PushRegistration } = await import('./use-v1-push-registration');
    const { result } = renderHook(() => useV1PushRegistration());

    await act(async () => {
      await result.current.subscribe();
    });

    expect(trackEvent).not.toHaveBeenCalled();
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

  it('subscribes via the pushManager from navigator.serviceWorker.ready, not the one register() resolves to immediately', async () => {
    // Real-world bug (found via live E2E testing on first-ever subscription):
    // register() resolves as soon as the registration exists, while the worker
    // is still installing — calling pushManager.subscribe() on THAT registration
    // throws "Failed to execute 'subscribe' on 'PushManager': Subscription
    // failed - no active Service Worker". Model that exact split here: register()
    // resolves to a not-yet-active registration whose subscribe() rejects, while
    // .ready resolves (once the worker activates) to a registration that works.
    const installingRegistration = {
      pushManager: {
        subscribe: vi.fn().mockRejectedValue(
          new Error("Failed to execute 'subscribe' on 'PushManager': Subscription failed - no active Service Worker"),
        ),
      },
    };
    Object.defineProperty(global.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: vi.fn().mockResolvedValue(installingRegistration),
        ready: Promise.resolve(registration),
        getRegistration: vi.fn().mockResolvedValue(registration),
      },
    });

    const { useV1PushRegistration } = await import('./use-v1-push-registration');
    const { result } = renderHook(() => useV1PushRegistration());

    await act(async () => {
      await result.current.subscribe();
    });

    expect(installingRegistration.pushManager.subscribe).not.toHaveBeenCalled();
    expect(pushManager.subscribe).toHaveBeenCalled();
    expect(v1Post).toHaveBeenCalledWith('/notifications/push-subscribe', {
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'p', auth: 'a' },
    });
    expect(reportClientError).not.toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ flow: 'push-subscribe' }) }),
    );
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

  it('unsubscribe syncs isSubscribed to false when the browser has no active subscription', async () => {
    pushManager.getSubscription.mockResolvedValueOnce(subscription).mockResolvedValueOnce(null);
    const { useV1PushRegistration } = await import('./use-v1-push-registration');
    const { result } = renderHook(() => useV1PushRegistration());
    await waitFor(() => expect(result.current.isSubscribed).toBe(true));

    await act(async () => {
      await result.current.unsubscribe();
    });

    expect(v1Delete).not.toHaveBeenCalled();
    expect(result.current.isSubscribed).toBe(false);
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

  // 회귀: 푸시를 켠 적 없는 브라우저에는 서비스워커 등록이 아예 없다(이 앱은
  // subscribe() 안에서만 register 한다). 예전 구현은 `navigator.serviceWorker.ready`
  // 를 기다렸는데 그건 등록이 없으면 reject 가 아니라 **영원히 미결**이라, 로그아웃이
  // 이 프로미스를 기다리다 그대로 멈춰 섰다. `ready` 를 절대 결정되지 않게 두고도
  // unsubscribe() 가 끝나야 한다 — 그래야 이 테스트가 실제 버그를 잡는다.
  it('구독한 적 없는 브라우저(서비스워커 등록 없음)에서도 unsubscribe 가 멈추지 않는다', async () => {
    Object.defineProperty(global.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: vi.fn(),
        ready: new Promise(() => {}), // 등록이 없을 때의 실제 동작: 영원히 미결
        getRegistration: vi.fn().mockResolvedValue(undefined),
      },
    });
    const { useV1PushRegistration } = await import('./use-v1-push-registration');
    const { result } = renderHook(() => useV1PushRegistration());

    let settled = false;
    await act(async () => {
      await result.current.unsubscribe();
      settled = true;
    });

    expect(settled).toBe(true);
    expect(v1Delete).not.toHaveBeenCalled();
    expect(result.current.isSubscribed).toBe(false);
  });

  it('reports the initial subscription-status check failure instead of swallowing it silently', async () => {
    Object.defineProperty(global.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: vi.fn().mockResolvedValue(registration),
        ready: Promise.resolve(registration),
        // 초기 상태 확인은 이제 getRegistration() 을 탄다 — 실패 보고를 검증하려면
        // 이쪽이 거부돼야 한다(ready 를 거부시키면 이 테스트가 아무것도 안 잡는다).
        getRegistration: vi.fn().mockRejectedValue(new Error('sw registration lost')),
      },
    });
    const { useV1PushRegistration } = await import('./use-v1-push-registration');
    renderHook(() => useV1PushRegistration());

    await waitFor(() =>
      expect(reportClientError).toHaveBeenCalledWith(
        expect.objectContaining({ context: expect.objectContaining({ flow: 'push-subscription-check' }) }),
      ),
    );
  });

  it('subscribe swallows and reports a rejection instead of throwing (no unhandled rejection)', async () => {
    (v1Post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('server exploded'));
    const { useV1PushRegistration } = await import('./use-v1-push-registration');
    const { result } = renderHook(() => useV1PushRegistration());

    await act(async () => {
      await expect(result.current.subscribe()).resolves.toBe(false);
    });

    expect(reportClientError).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ flow: 'push-subscribe' }) }),
    );
    expect(result.current.isSubscribed).toBe(false);
  });

  /**
   * isPending 이 풀리지 않으면 토글이 영원히 "켜는 중…" 으로 잠긴다 — 실패 경로에서
   * 특히 위험해서(사용자는 재시도조차 못 한다) 성공/실패 양쪽을 확인한다.
   */
  it('subscribe 성공 후 isPending 이 풀린다', async () => {
    const { useV1PushRegistration } = await import('./use-v1-push-registration');
    const { result } = renderHook(() => useV1PushRegistration());

    expect(result.current.isPending).toBe(false);
    await act(async () => {
      await result.current.subscribe();
    });

    expect(result.current.isSubscribed).toBe(true);
    expect(result.current.isPending).toBe(false);
  });

  it('subscribe 가 실패해도 isPending 이 풀려 다시 시도할 수 있다', async () => {
    (v1Post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('server exploded'));
    const { useV1PushRegistration } = await import('./use-v1-push-registration');
    const { result } = renderHook(() => useV1PushRegistration());

    await act(async () => {
      await result.current.subscribe();
    });

    expect(result.current.isPending).toBe(false);
  });

  it('unsubscribe 가 실패해도 isPending 이 풀린다', async () => {
    pushManager.getSubscription.mockRejectedValue(new Error('sw gone'));
    const { useV1PushRegistration } = await import('./use-v1-push-registration');
    const { result } = renderHook(() => useV1PushRegistration());

    await act(async () => {
      await result.current.unsubscribe();
    });

    expect(result.current.isPending).toBe(false);
  });
});

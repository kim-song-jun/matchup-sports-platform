import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useV1PushRegistration } from './use-v1-push-registration';

const native = vi.hoisted(() => ({
  available: true,
  request: vi.fn(),
}));

vi.mock('@/lib/native-push', () => ({
  isNativePushAvailable: () => native.available,
  requestNativePush: native.request,
}));
vi.mock('@/lib/client-error-reporter', () => ({ reportClientError: vi.fn() }));

const getRegistration = vi.fn();

beforeEach(() => {
  native.available = true;
  native.request.mockReset().mockResolvedValue({ permission: 'granted', subscribed: true });
  getRegistration.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('useV1PushRegistration — 앱 셸', () => {
  it('켜져 있으면 마운트할 때 상태를 조회하고 focus 리스너를 건다', async () => {
    const addWindowListener = vi.spyOn(window, 'addEventListener');

    const { result } = renderHook(() => useV1PushRegistration());

    await waitFor(() => expect(result.current.isSubscribed).toBe(true));
    expect(native.request).toHaveBeenCalledWith('get-push-state');
    expect(addWindowListener).toHaveBeenCalledWith('focus', expect.any(Function));
  });

  it('enabled=false 면 상태 조회도 리스너도 걸지 않고 해지는 아무것도 하지 않는다', async () => {
    const addWindowListener = vi.spyOn(window, 'addEventListener');
    const addDocumentListener = vi.spyOn(document, 'addEventListener');

    const { result } = renderHook(() => useV1PushRegistration({ enabled: false }));
    let revoked: boolean | undefined;
    await act(async () => { revoked = await result.current.unsubscribe({ reason: 'sign-out' }); });

    expect(native.request).not.toHaveBeenCalled();
    expect(addWindowListener).not.toHaveBeenCalledWith('focus', expect.any(Function));
    expect(addDocumentListener).not.toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(revoked).toBe(false);
    expect(result.current.permission).toBe('unsupported');
  });
});

describe('useV1PushRegistration — 브라우저', () => {
  beforeEach(() => {
    native.available = false;
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', { permission: 'default' });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('켜져 있으면 마운트할 때 구독 여부를 확인한다', async () => {
    renderHook(() => useV1PushRegistration());

    await waitFor(() => expect(getRegistration).toHaveBeenCalled());
  });

  it('enabled=false 면 구독 여부를 확인하지 않는다', async () => {
    const { result } = renderHook(() => useV1PushRegistration({ enabled: false }));
    await act(async () => { await result.current.unsubscribe({ reason: 'sign-out' }); });

    expect(getRegistration).not.toHaveBeenCalled();
  });
});

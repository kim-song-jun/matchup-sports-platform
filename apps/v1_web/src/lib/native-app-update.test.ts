import { afterEach, describe, expect, it, vi } from 'vitest';
import { canCheckNativeAppUpdate, requestNativeAppUpdate } from './native-app-update';

const reply = (detail: unknown) => window.dispatchEvent(new CustomEvent('teameet:native-app-update-result', { detail }));
const current = { platform: 'android', channel: 'production', version: '0.1.3', build: '4', status: 'up-to-date' };
afterEach(() => { delete window.TeameetNative; vi.useRealTimers(); vi.restoreAllMocks(); });

describe('native binary update bridge', () => {
  it('does not classify legacy shells or ordinary browsers as update-capable', async () => {
    expect(canCheckNativeAppUpdate()).toBe(false);
    window.TeameetNative = { postMessage: vi.fn() };
    expect(canCheckNativeAppUpdate()).toBe(false);
    await expect(requestNativeAppUpdate(new AbortController().signal)).rejects.toThrow('unsupported');
  });

  it('correlates the result and sends only the known action and request id', async () => {
    window.TeameetNative = { supports: ['check-app-update'], postMessage: (raw) => {
      const request = JSON.parse(raw);
      expect(Object.keys(request).sort()).toEqual(['requestId', 'type']);
      expect(request.type).toBe('check-app-update');
      reply({ ...current, requestId: 'another-request', status: 'update-required' });
      reply({ ...current, requestId: request.requestId });
    } };
    expect((await requestNativeAppUpdate(new AbortController().signal)).status).toBe('up-to-date');
  });

  it.each([
    { platform: 'ios' }, { channel: 'preview' }, { version: 'garbage' },
    { build: 4 }, { availableBuild: -1 }, { availableVersion: 'preview' }, { status: 'success' },
  ])('rejects malformed native result %j', async (invalid) => {
    window.TeameetNative = { supports: ['check-app-update'], postMessage: (raw) => {
      reply({ ...current, ...invalid, requestId: JSON.parse(raw).requestId });
    } };
    await expect(requestNativeAppUpdate(new AbortController().signal)).rejects.toThrow('invalid-native-update-result');
  });

  it('times out rather than calling an unanswered request current; cleans listeners', async () => {
    vi.useFakeTimers();
    const remove = vi.spyOn(window, 'removeEventListener');
    window.TeameetNative = { supports: ['check-app-update'], postMessage: vi.fn() };
    const request = requestNativeAppUpdate(new AbortController().signal);
    const assertion = expect(request).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(12_000);
    await assertion;
    expect(remove).toHaveBeenCalledWith('teameet:native-app-update-result', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts an unmounted check and releases its timeout', async () => {
    vi.useFakeTimers();
    window.TeameetNative = { supports: ['check-app-update'], postMessage: vi.fn() };
    const controller = new AbortController();
    const request = requestNativeAppUpdate(controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
  });
});

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeAppUpdateGate } from './native-app-update-gate';
import { ANDROID_PLAY_STORE_URL, IOS_APP_STORE_URL } from '@/lib/app-store-links';
import { reportClientError } from '@/lib/client-error-reporter';

vi.mock('@/lib/client-error-reporter', () => ({ reportClientError: vi.fn() }));
let result: Record<string, unknown>;
let posted: ReturnType<typeof vi.fn>;

beforeAll(() => {
  // jsdom lacks the browser's top-layer dialog API; only that browser boundary is replaced.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
});
afterAll(() => {
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
beforeEach(() => {
  result = { platform: 'android', channel: 'production', version: '0.1.3', build: '4', status: 'update-required', availableBuild: 5 };
  posted = vi.fn((raw: string) => window.dispatchEvent(new CustomEvent('teameet:native-app-update-result', {
    detail: { ...result, requestId: JSON.parse(raw).requestId },
  })));
  window.TeameetNative = { supports: ['check-app-update'], postMessage: posted };
});
afterEach(() => {
  cleanup(); delete window.TeameetNative;
  Reflect.deleteProperty(window, 'webkit');
  vi.restoreAllMocks(); vi.clearAllMocks();
});

describe('mandatory store update gate', () => {
  it('blocks an old Android shell, has no dismiss action, and uses the fixed Play URL', async () => {
    let initialCancelPrevented = false;
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) {
      this.open = true;
      const cancel = new Event('cancel', { cancelable: true });
      this.dispatchEvent(cancel);
      initialCancelPrevented = cancel.defaultPrevented;
    });
    render(<NativeAppUpdateGate />);
    const dialog = await screen.findByRole('dialog');
    expect(initialCancelPrevented).toBe(true);
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByRole('link', { name: 'Google Play에서 업데이트' })).toHaveAttribute('href', ANDROID_PLAY_STORE_URL);
    expect(screen.queryByRole('button', { name: /나중|닫기|취소/ })).not.toBeInTheDocument();
    const cancel = new Event('cancel', { bubbles: false, cancelable: true });
    act(() => dialog.dispatchEvent(cancel));
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog).toHaveAttribute('open');
  });

  it('uses the iOS store only for the iOS bridge', async () => {
    Object.defineProperty(window, 'webkit', { configurable: true, value: { messageHandlers: { TeameetNative: { postMessage: vi.fn() } } } });
    result = { ...result, platform: 'ios', availableVersion: '0.1.7' };
    render(<NativeAppUpdateGate />);
    expect(await screen.findByRole('link', { name: 'App Store에서 업데이트' })).toHaveAttribute('href', IOS_APP_STORE_URL);
  });

  it.each(['up-to-date', 'unavailable'])('does not invent a block for %s', async (status) => {
    result.status = status;
    render(<NativeAppUpdateGate />);
    await waitFor(() => expect(posted).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    if (status === 'unavailable') expect(reportClientError).toHaveBeenCalled();
  });

  it('never forces an Alpha app to update from the production store', async () => {
    result.channel = 'alpha';
    result.version = '0.1.3-alpha';
    result.status = 'unavailable';
    render(<NativeAppUpdateGate />);
    await waitFor(() => expect(posted).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(reportClientError).not.toHaveBeenCalled();
  });

  it('retains a confirmed block on failure and releases it only after a current-version result', async () => {
    render(<NativeAppUpdateGate />);
    await screen.findByRole('dialog');
    result.status = 'unavailable';
    fireEvent.click(screen.getByRole('button', { name: '업데이트 다시 확인' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('버전을 확인하지 못했어요');
    expect(screen.getByRole('dialog')).toHaveAttribute('open');
    fireEvent.click(screen.getByRole('button', { name: '업데이트 다시 확인' }));
    await waitFor(() => expect(posted).toHaveBeenCalledTimes(3));
    expect(reportClientError).toHaveBeenCalledTimes(1);
    result.status = 'up-to-date';
    fireEvent.click(screen.getByRole('button', { name: '업데이트 다시 확인' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('waits for a late Android capability and removes all check listeners on unmount', async () => {
    delete window.TeameetNative;
    const { unmount } = render(<NativeAppUpdateGate />);
    expect(posted).not.toHaveBeenCalled();
    window.TeameetNative = { supports: ['check-app-update'], postMessage: posted };
    fireEvent(window, new Event('teameet:native-capabilities-ready'));
    await screen.findByRole('dialog');
    unmount();
    fireEvent(window, new Event('teameet:native-capabilities-ready'));
    fireEvent.focus(window);
    expect(posted).toHaveBeenCalledTimes(1);
  });

  it('aborts a lookup on background and immediately checks after a quick return', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    visibility.mockReturnValue('visible');
    posted.mockImplementationOnce(() => undefined);
    render(<NativeAppUpdateGate />);
    expect(posted).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    // A stale lookup's finally must not overwrite the next request's pending owner.
    visibility.mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    await screen.findByRole('dialog');
    expect(posted).toHaveBeenCalledTimes(2);
    expect(reportClientError).not.toHaveBeenCalled();
  });

  it('keeps the retry disabled while the replacement foreground check is pending', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    render(<NativeAppUpdateGate />);
    await screen.findByRole('dialog');
    posted.mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole('button', { name: '업데이트 다시 확인' }));
    visibility.mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    visibility.mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    await act(async () => { await Promise.resolve(); });
    expect(posted).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('button', { name: '버전 확인 중…' })).toBeDisabled();
    const requestId = JSON.parse(posted.mock.calls[2][0]).requestId;
    fireEvent(window, new CustomEvent('teameet:native-app-update-result', { detail: { ...result, requestId } }));
    expect(await screen.findByRole('button', { name: '업데이트 다시 확인' })).toBeEnabled();
  });
});

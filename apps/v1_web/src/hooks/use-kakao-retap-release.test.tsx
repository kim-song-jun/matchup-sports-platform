import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKakaoRetapRelease } from './use-kakao-retap-release';

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const pageshow = (persisted: boolean) => act(() => {
  window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted }));
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

describe('useKakaoRetapRelease', () => {
  it.each(['talk', 'sdk_account'] as const)('releases once, two visible seconds after arming the %s path', (path) => {
    const release = vi.fn();
    const { result } = renderHook(() => useKakaoRetapRelease(release));

    act(() => result.current.arm(path));
    advance(1_999);
    expect(release).not.toHaveBeenCalled();
    advance(1);
    expect(release).toHaveBeenCalledExactlyOnceWith({ reason: 'timer' });

    advance(60_000);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('never releases by time on the authorize URL path, which leaves the page', () => {
    const release = vi.fn();
    const { result } = renderHook(() => useKakaoRetapRelease(release));

    act(() => result.current.arm('account_url'));
    advance(60_000);
    setVisibility('hidden');
    setVisibility('visible');
    advance(60_000);

    expect(release).not.toHaveBeenCalled();
  });

  it('does not count the time the page is hidden, and restarts the two seconds when it is shown again', () => {
    const release = vi.fn();
    const { result } = renderHook(() => useKakaoRetapRelease(release));

    act(() => result.current.arm('talk'));
    advance(500);
    setVisibility('hidden');
    advance(4_500);
    expect(release).not.toHaveBeenCalled();
    setVisibility('visible');

    advance(1_999);
    expect(release).not.toHaveBeenCalled();
    advance(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('waits for the page to be visible when armed while hidden', () => {
    const release = vi.fn();
    const { result } = renderHook(() => useKakaoRetapRelease(release));

    setVisibility('hidden');
    act(() => result.current.arm('talk'));
    advance(10_000);
    expect(release).not.toHaveBeenCalled();

    setVisibility('visible');
    advance(1_999);
    expect(release).not.toHaveBeenCalled();
    advance(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('stops counting after the release, and a later arm counts again', () => {
    const release = vi.fn();
    const { result } = renderHook(() => useKakaoRetapRelease(release));

    act(() => result.current.arm('talk'));
    advance(2_000);
    setVisibility('hidden');
    setVisibility('visible');
    advance(5_000);
    expect(release).toHaveBeenCalledTimes(1);

    act(() => result.current.arm('sdk_account'));
    advance(2_000);
    expect(release).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['talk', false],
    ['talk', true],
    ['account_url', false],
    ['account_url', true],
  ] as const)('releases on pageshow for the %s path and passes persisted=%s through', (path, persisted) => {
    const release = vi.fn();
    const { result } = renderHook(() => useKakaoRetapRelease(release));

    act(() => result.current.arm(path));
    pageshow(persisted);

    expect(release).toHaveBeenCalledExactlyOnceWith({ reason: 'pageshow', persisted });
  });

  it('releases on pageshow even when nothing was armed, and drops the pending timer', () => {
    const release = vi.fn();
    const { result } = renderHook(() => useKakaoRetapRelease(release));

    pageshow(false);
    expect(release).toHaveBeenCalledExactlyOnceWith({ reason: 'pageshow', persisted: false });

    act(() => result.current.arm('talk'));
    advance(1_000);
    pageshow(true);
    advance(5_000);

    expect(release).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenLastCalledWith({ reason: 'pageshow', persisted: true });
  });

  it('calls the latest release callback, not the one from when it was armed', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(({ release }) => useKakaoRetapRelease(release), { initialProps: { release: first } });

    act(() => result.current.arm('talk'));
    rerender({ release: second });
    advance(2_000);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('leaves no timer or listener behind once unmounted', () => {
    const release = vi.fn();
    const { result, unmount } = renderHook(() => useKakaoRetapRelease(release));

    act(() => result.current.arm('talk'));
    advance(1_000);
    unmount();
    advance(10_000);
    pageshow(true);
    setVisibility('hidden');
    setVisibility('visible');
    advance(10_000);

    expect(release).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

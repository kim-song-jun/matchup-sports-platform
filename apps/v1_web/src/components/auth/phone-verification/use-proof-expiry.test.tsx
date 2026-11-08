import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProofExpiry } from './use-proof-expiry';

const T0 = new Date('2026-11-08T00:00:00.000Z').getTime();

describe('useProofExpiry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('expiresAt 이 지나는 순간 true 가 되고, 그 전에는 false 다', () => {
    const { result } = renderHook(() => useProofExpiry(T0 + 10_000));
    expect(result.current).toBe(false);

    act(() => { vi.advanceTimersByTime(9_999); });
    expect(result.current).toBe(false);

    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe(true);
  });

  it('이미 지난 시각이면 처음 그리는 순간부터 만료다', () => {
    const { result } = renderHook(() => useProofExpiry(T0 - 1));

    expect(result.current).toBe(true);
  });

  it('만료 시각을 모르면(null) 시간이 얼마나 지나도, 창으로 돌아와도 만료로 보지 않고 타이머도 걸지 않는다', () => {
    const { result } = renderHook(() => useProofExpiry(null));

    expect(vi.getTimerCount()).toBe(0);
    act(() => { vi.advanceTimersByTime(24 * 60 * 60 * 1000); });
    act(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current).toBe(false);
  });

  it('새 expiresAt 이 들어오면 만료 상태가 풀리고 새 시각 기준으로 다시 센다', () => {
    const { result, rerender } = renderHook(({ expiresAt }) => useProofExpiry(expiresAt), {
      initialProps: { expiresAt: T0 + 1_000 as number | null },
    });
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(result.current).toBe(true);

    rerender({ expiresAt: T0 + 5_000 });
    expect(result.current).toBe(false);

    act(() => { vi.advanceTimersByTime(3_999); });
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe(true);
  });

  it('증명이 사라졌다가(null) 새로 들어와도 새 시각으로 다시 유효해진다', () => {
    const { result, rerender } = renderHook(({ expiresAt }) => useProofExpiry(expiresAt), {
      initialProps: { expiresAt: T0 + 1_000 as number | null },
    });
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(result.current).toBe(true);

    rerender({ expiresAt: null });
    expect(result.current).toBe(false);
    rerender({ expiresAt: T0 + 60_000 });

    expect(result.current).toBe(false);
  });

  // 다른 앱에서 문자를 확인하는 동안 타이머가 밀리는 상황: 시계는 건너뛰었지만 타이머는 아직 울리지 않았다.
  it.each([
    ['focus', () => window.dispatchEvent(new Event('focus'))],
    ['visibilitychange', () => document.dispatchEvent(new Event('visibilitychange'))],
  ] as const)('타이머가 울리기 전이라도 %s 때 다시 확인해 만료를 알아챈다', (_name, comeBack) => {
    const { result } = renderHook(() => useProofExpiry(T0 + 60_000));
    vi.setSystemTime(T0 + 120_000);
    expect(result.current).toBe(false);

    act(() => { comeBack(); });

    expect(result.current).toBe(true);
  });

  it('아직 유효할 때 창이 여러 번 포커스를 받아도 타이머는 하나만 걸려 있고 제때 만료된다', () => {
    const { result } = renderHook(() => useProofExpiry(T0 + 60_000));
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(vi.getTimerCount()).toBe(1);
    expect(result.current).toBe(false);

    act(() => { vi.advanceTimersByTime(59_999); });
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe(true);
  });

  it('expiresAt 이 바뀌면 이전 타이머는 정리되어 하나만 남는다', () => {
    const { rerender } = renderHook(({ expiresAt }) => useProofExpiry(expiresAt), {
      initialProps: { expiresAt: T0 + 60_000 as number | null },
    });

    rerender({ expiresAt: T0 + 120_000 });

    expect(vi.getTimerCount()).toBe(1);
  });

  it('언마운트하면 타이머와 창 이벤트 감시를 모두 거둔다', () => {
    const addedOnWindow = vi.spyOn(window, 'addEventListener');
    const removedFromWindow = vi.spyOn(window, 'removeEventListener');
    const addedOnDocument = vi.spyOn(document, 'addEventListener');
    const removedFromDocument = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useProofExpiry(T0 + 60_000));
    const focusHandler = addedOnWindow.mock.calls.find(([type]) => type === 'focus')?.[1];
    const visibilityHandler = addedOnDocument.mock.calls.find(([type]) => type === 'visibilitychange')?.[1];
    expect(focusHandler).toBeTypeOf('function');
    expect(visibilityHandler).toBeTypeOf('function');

    unmount();

    expect(vi.getTimerCount()).toBe(0);
    expect(removedFromWindow).toHaveBeenCalledWith('focus', focusHandler);
    expect(removedFromDocument).toHaveBeenCalledWith('visibilitychange', visibilityHandler);
  });
});

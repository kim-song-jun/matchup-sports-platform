import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCurrentHref } from './use-current-href';

const navigation = vi.hoisted(() => ({ pathname: '/league-matches/l1' as string | null }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams('from=%2Fhome'),
}));

describe('useCurrentHref', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('받은 from 을 담은 현재 URL 을 돌려준다', () => {
    const { result } = renderHook(() => useCurrentHref());
    expect(result.current).toBe('/league-matches/l1?from=%2Fhome');
  });

  it('페이지 안 앵커로 이동하면 hash 까지 담는다', () => {
    const { result } = renderHook(() => useCurrentHref());
    act(() => {
      window.history.replaceState(null, '', '/league-matches/l1?from=%2Fhome#league-schedule');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current).toBe('/league-matches/l1?from=%2Fhome#league-schedule');
  });

  it('라우터 밖이라 경로를 모르면 출처를 싣지 않는다', () => {
    navigation.pathname = null;
    const { result } = renderHook(() => useCurrentHref());
    expect(result.current).toBeNull();
    navigation.pathname = '/league-matches/l1';
  });

  it('다른 경로로 옮겨 가면 이전 화면의 hash 를 남기지 않는다', () => {
    window.history.replaceState(null, '', '/league-matches/l1#league-schedule');
    const { result, rerender } = renderHook(() => useCurrentHref());
    expect(result.current).toBe('/league-matches/l1?from=%2Fhome#league-schedule');
    navigation.pathname = '/teams/t1';
    window.history.replaceState(null, '', '/teams/t1');
    rerender();
    expect(result.current).toBe('/teams/t1?from=%2Fhome');
    navigation.pathname = '/league-matches/l1';
  });
});

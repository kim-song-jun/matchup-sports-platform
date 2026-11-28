import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useBracketViewControls } from './use-bracket-view-controls';

describe('useBracketViewControls', () => {
  it('처음에는 아무도 정하지 않은 상태다(트레이 null · 전체 보기 · 요청 없음)', () => {
    const { result } = renderHook(() => useBracketViewControls());
    expect(result.current).toMatchObject({ trayOpen: null, unscheduledOnly: false, focusRequest: null });
  });

  it('트레이 열림과 시간 미정만 보기는 각자 바뀐다', () => {
    const { result } = renderHook(() => useBracketViewControls());
    act(() => result.current.setTrayOpen(false));
    expect(result.current.trayOpen).toBe(false);
    act(() => result.current.setUnscheduledOnly(true));
    expect(result.current).toMatchObject({ trayOpen: false, unscheduledOnly: true });
  });

  it('같은 경기를 다시 요청해도 nonce 가 늘고, 비우면 요청이 사라진다', () => {
    const { result } = renderHook(() => useBracketViewControls());
    act(() => result.current.requestFocus('f1'));
    const first = result.current.focusRequest;
    expect(first).toEqual({ fixtureId: 'f1', nonce: 1 });
    act(() => result.current.requestFocus('f1'));
    expect(result.current.focusRequest).toEqual({ fixtureId: 'f1', nonce: 2 });
    act(() => result.current.clearFocusRequest());
    expect(result.current.focusRequest).toBeNull();
    act(() => result.current.requestFocus('f2'));
    expect(result.current.focusRequest).toEqual({ fixtureId: 'f2', nonce: 1 });
  });

  it('호출 함수는 렌더가 바뀌어도 같은 참조다(효과 의존성에 안전)', () => {
    const { result } = renderHook(() => useBracketViewControls());
    const { requestFocus, clearFocusRequest } = result.current;
    act(() => result.current.setUnscheduledOnly(true));
    expect(result.current.requestFocus).toBe(requestFocus);
    expect(result.current.clearFocusRequest).toBe(clearFocusRequest);
  });
});

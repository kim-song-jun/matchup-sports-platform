import { act } from '@testing-library/react';

/**
 * jsdom 에는 레이아웃이 없다. `(min-width: Npx)` 질의만 현재 폭으로 판정하는 matchMedia 스텁이고,
 * 폭이 바뀌면 구독자에게 change 를 알린다(`useMediaQuery` 가 이 경로로 갱신된다).
 * 불가피한 브라우저 API mock(CLAUDE.md 품질 규칙 3의 예외).
 */
let currentWidth = 1280;
const listeners = new Set<() => void>();

export function installViewport(width: number): () => void {
  const original = window.matchMedia;
  currentWidth = width;
  window.matchMedia = ((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    return {
      get matches() {
        return min !== null && currentWidth >= Number(min[1]);
      },
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_type: string, callback: () => void) => listeners.add(callback),
      removeEventListener: (_type: string, callback: () => void) => listeners.delete(callback),
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
    listeners.clear();
  };
}

export function resizeViewport(width: number): void {
  currentWidth = width;
  act(() => {
    listeners.forEach((callback) => callback());
  });
}

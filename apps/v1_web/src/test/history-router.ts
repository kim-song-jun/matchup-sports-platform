/**
 * 테스트용 라우터 — Next 라우터가 하는 일 중 히스토리 부분(push/replace/back)만 jsdom 의 실제
 * window.history 로 한다. 뒤로가기 동작을 검증하려면 항목이 실제로 쌓이고 걷혀야 한다.
 */
import { vi } from 'vitest';

export function createHistoryRouter() {
  return {
    push: vi.fn((url: string) => window.history.pushState({}, '', url)),
    replace: vi.fn((url: string) => window.history.replaceState({}, '', url)),
    back: vi.fn(() => window.history.back()),
    forward: vi.fn(() => window.history.forward()),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  };
}

/** 다음 popstate 를 기다린다(jsdom 은 back/forward 를 비동기로 처리한다). */
export function nextPopState(): Promise<PopStateEvent> {
  return new Promise((resolve) => {
    window.addEventListener('popstate', (event) => resolve(event), { once: true, capture: true });
  });
}

/** 비동기 히스토리 이동이 끝날 때까지 몇 틱 기다린다. */
export async function settleHistory(ticks = 5): Promise<void> {
  for (let i = 0; i < ticks; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

export const currentPath = () => `${window.location.pathname}${window.location.search}`;

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

/**
 * Starts at `path` on the real jsdom history and records, in order, `location.assign` calls, `history.back()`
 * calls and popstate events. Browsers cancel a hard navigation when a history.back() follows it, so an overlay
 * that closes (back) and then leaves (assign) must show `back, pop` before `assign`.
 */
export function recordCloseThenNavigateOrder(path: string) {
  window.history.replaceState(null, '', path);
  const real = window.location;
  const order: string[] = [];
  vi.stubGlobal('location', {
    get pathname() { return real.pathname; },
    get search() { return real.search; },
    get hash() { return real.hash; },
    get href() { return real.href; },
    get origin() { return real.origin; },
    assign: (url: string) => { order.push(`assign ${url}`); },
  });
  const realBack = window.history.back.bind(window.history);
  const back = vi.spyOn(window.history, 'back').mockImplementation(() => {
    order.push('back');
    realBack();
  });
  const onPop = () => order.push('pop');
  window.addEventListener('popstate', onPop, { capture: true });
  return {
    order,
    restore: () => {
      back.mockRestore();
      window.removeEventListener('popstate', onPop, { capture: true });
    },
  };
}

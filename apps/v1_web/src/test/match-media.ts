import { act } from '@testing-library/react';

const MIN_WIDTH_QUERY = /^\(min-width:\s*(\d+(?:\.\d+)?)px\)$/;

interface Subscription {
  readonly query: string;
  readonly listener: EventListenerOrEventListenerObject;
}

/**
 * 폭을 가진 `window.matchMedia` 스텁 — `(min-width: Npx)` 질의만 판정하고 나머지는 false 다.
 * `setWidth` 는 일치 여부가 바뀐 질의의 `change` 리스너에게만 알린다(실제 브라우저와 같다).
 * jsdom 에는 matchMedia 가 없어 불가피한 브라우저 API 대역이다.
 */
export function installMatchMedia(initialWidth: number): { setWidth(width: number): void; restore(): void } {
  const original = window.matchMedia;
  let width = initialWidth;
  const subscriptions = new Set<Subscription>();

  const evaluate = (query: string): boolean => {
    const match = MIN_WIDTH_QUERY.exec(query.trim());
    return match ? width >= Number(match[1]) : false;
  };

  window.matchMedia = (query: string): MediaQueryList => {
    const list = {
      get matches() {
        return evaluate(query);
      },
      media: query,
      onchange: null,
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (type === 'change') subscriptions.add({ query, listener });
      },
      removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (type !== 'change') return;
        for (const subscription of subscriptions) {
          if (subscription.query === query && subscription.listener === listener) subscriptions.delete(subscription);
        }
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
    return list as unknown as MediaQueryList;
  };

  return {
    setWidth(next) {
      const before = new Map<string, boolean>();
      for (const { query } of subscriptions) before.set(query, evaluate(query));
      width = next;
      act(() => {
        for (const { query, listener } of [...subscriptions]) {
          const matches = evaluate(query);
          if (before.get(query) === matches) continue;
          const event = { matches, media: query } as MediaQueryListEvent;
          if (typeof listener === 'function') listener(event);
          else listener.handleEvent(event);
        }
      });
    },
    restore() {
      window.matchMedia = original;
    },
  };
}
